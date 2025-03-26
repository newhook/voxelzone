import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { GameObject } from './types';
import { 
  VoxelMaterial, 
  VoxelCoord, 
  voxelProperties, 
  VOXEL_SIZE, 
  Voxel, 
  getVoxelKey, 
  parseVoxelKey, 
  getVoxelNeighbors,
  worldToVoxel,
  voxelToWorld
} from './voxel';
import { createObstacleBody } from './physics';
import { GameConfig } from './config';

// Chunk size (16x16x16 voxels per chunk, like Minecraft)
const CHUNK_SIZE = 16;

export interface Chunk {
  position: { x: number, y: number, z: number }; // Chunk position in chunk coordinates
  voxels: Map<string, VoxelMaterial>; // Map of voxel positions to materials
  mesh: THREE.Group; // Mesh containing all rendered voxels
  dirty: boolean; // Whether the chunk needs to be re-rendered
  physicsObjects: Map<string, GameObject>; // Physics objects for the chunk
}

export class VoxelWorld {
  private scene: THREE.Scene;
  private chunks: Map<string, Chunk> = new Map();
  private world: RAPIER.World;
  private config: GameConfig;
  private materialMeshes: THREE.MeshStandardMaterial[] = [];
  private geometry: THREE.BoxGeometry;

  constructor(scene: THREE.Scene, world: RAPIER.World, config: GameConfig) {
    this.scene = scene;
    this.world = world;
    this.config = config;
    
    // Create geometry for voxels
    this.geometry = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
    
    // Create materials for each voxel type
    Object.values(VoxelMaterial)
      .filter(value => typeof value === 'number')
      .forEach(materialType => {
        const material = voxelProperties[materialType as VoxelMaterial];
        const meshMaterial = new THREE.MeshStandardMaterial({
          color: material.color,
          transparent: material.transparent,
          opacity: material.transparent ? 0.8 : 1.0,
          roughness: 0.7,
          metalness: 0.1
        });
        this.materialMeshes[materialType as number] = meshMaterial;
      });
  }

  // Generate a simple flat terrain with some hills
  generateTerrain(sizeInChunks: number): void {
    const noiseScale = 0.05;
    const heightScale = 10;
    
    // Generate terrain in a square around the center
    for (let cx = -sizeInChunks; cx < sizeInChunks; cx++) {
      for (let cz = -sizeInChunks; cz < sizeInChunks; cz++) {
        const chunkPos = { x: cx, y: 0, z: cz };
        const chunk = this.getOrCreateChunk(chunkPos);
        
        // Generate terrain for this chunk
        for (let x = 0; x < CHUNK_SIZE; x++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            // Calculate world position for this voxel
            const worldX = chunkPos.x * CHUNK_SIZE + x;
            const worldZ = chunkPos.z * CHUNK_SIZE + z;
            
            // Simple Perlin-like noise function for height
            const height = Math.floor(
              (Math.sin(worldX * noiseScale) + Math.cos(worldZ * noiseScale)) * heightScale / 2 + 
              heightScale / 2
            );
            
            // Create terrain columns
            for (let y = 0; y < height; y++) {
              const voxelPos: VoxelCoord = { 
                x: worldX, 
                y: y, 
                z: worldZ 
              };
              
              // Determine material type based on height
              let material: VoxelMaterial;
              if (y === height - 1 && y > 4) {
                material = VoxelMaterial.GRASS; // Top layer is grass
              } else if (y > height - 4) {
                material = VoxelMaterial.DIRT; // Next layer is dirt
              } else if (y > 2) {
                material = VoxelMaterial.STONE; // Lower layers are stone
              } else {
                material = VoxelMaterial.SAND; // Bottom is sand
              }
              
              // Set voxel in chunk
              this.setVoxel(voxelPos, material);
            }
          }
        }
        
        // Generate some trees randomly
        if (Math.random() < 0.2) {
          const treeBaseX = Math.floor(Math.random() * CHUNK_SIZE);
          const treeBaseZ = Math.floor(Math.random() * CHUNK_SIZE);
          const worldX = chunkPos.x * CHUNK_SIZE + treeBaseX;
          const worldZ = chunkPos.z * CHUNK_SIZE + treeBaseZ;
          
          // Find the surface Y position
          const surfaceY = this.findHighestVoxel(worldX, worldZ);
          if (surfaceY > 0) {
            this.generateTree({ x: worldX, y: surfaceY, z: worldZ });
          }
        }
      }
    }
    
    // Render all chunks
    this.renderAllChunks();
  }
  
  // Find the highest voxel at the given X,Z position
  private findHighestVoxel(x: number, z: number): number {
    let y = 64; // Search from a high position down
    while (y >= 0) {
      const voxelPos: VoxelCoord = { x, y, z };
      const voxel = this.getVoxel(voxelPos);
      if (voxel !== undefined) {
        return y + 1; // Return one above the found voxel
      }
      y--;
    }
    return 0; // Default ground level
  }
  
  // Generate a simple tree
  private generateTree(base: VoxelCoord): void {
    const treeHeight = 4 + Math.floor(Math.random() * 3); // 4-6 blocks high
    
    // Create trunk
    for (let y = 0; y < treeHeight; y++) {
      this.setVoxel({ x: base.x, y: base.y + y, z: base.z }, VoxelMaterial.WOOD);
    }
    
    // Create leaves
    const leavesRadius = 2;
    for (let x = -leavesRadius; x <= leavesRadius; x++) {
      for (let y = -1; y <= 2; y++) {
        for (let z = -leavesRadius; z <= leavesRadius; z++) {
          // Skip the trunk
          if (x === 0 && z === 0 && y < 2) continue;
          
          // Make leaves blob-shaped by checking distance from center
          const distSq = x * x + y * y * 2 + z * z;
          if (distSq <= leavesRadius * leavesRadius) {
            const leafPos: VoxelCoord = {
              x: base.x + x,
              y: base.y + treeHeight - 1 + y,
              z: base.z + z
            };
            this.setVoxel(leafPos, VoxelMaterial.LEAVES);
          }
        }
      }
    }
  }

  // Get or create a chunk at the specified position
  getOrCreateChunk(position: { x: number, y: number, z: number }): Chunk {
    const key = `${position.x},${position.y},${position.z}`;
    if (!this.chunks.has(key)) {
      // Create a new chunk
      const chunkMesh = new THREE.Group();
      chunkMesh.position.set(
        position.x * CHUNK_SIZE * VOXEL_SIZE,
        position.y * CHUNK_SIZE * VOXEL_SIZE,
        position.z * CHUNK_SIZE * VOXEL_SIZE
      );
      this.scene.add(chunkMesh);
      
      this.chunks.set(key, {
        position,
        voxels: new Map<string, VoxelMaterial>(),
        mesh: chunkMesh,
        dirty: false,
        physicsObjects: new Map<string, GameObject>()
      });
    }
    
    return this.chunks.get(key)!;
  }

  // Get chunk that contains the voxel position
  getChunkForVoxel(voxelPos: VoxelCoord): Chunk {
    const chunkX = Math.floor(voxelPos.x / CHUNK_SIZE);
    const chunkY = Math.floor(voxelPos.y / CHUNK_SIZE);
    const chunkZ = Math.floor(voxelPos.z / CHUNK_SIZE);
    
    return this.getOrCreateChunk({ x: chunkX, y: chunkY, z: chunkZ });
  }

  // Convert voxel position to local chunk position
  voxelToChunkLocal(voxelPos: VoxelCoord): VoxelCoord {
    return {
      x: ((voxelPos.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
      y: ((voxelPos.y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
      z: ((voxelPos.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    };
  }

  // Set a voxel in the world
  setVoxel(voxelPos: VoxelCoord, material: VoxelMaterial | undefined): void {
    const chunk = this.getChunkForVoxel(voxelPos);
    const localPos = this.voxelToChunkLocal(voxelPos);
    const key = getVoxelKey(localPos);
    
    // If material is undefined, remove the voxel
    if (material === undefined) {
      chunk.voxels.delete(key);
      
      // Remove physics body if it exists
      if (chunk.physicsObjects.has(key)) {
        const gameObj = chunk.physicsObjects.get(key)!;
        this.world.removeRigidBody(gameObj.body);
        chunk.physicsObjects.delete(key);
      }
    } else {
      chunk.voxels.set(key, material);
    }
    
    // Mark the chunk and neighboring chunks as dirty for re-rendering
    chunk.dirty = true;
    
    // Mark neighboring chunks as dirty if the voxel is on the edge
    if (localPos.x === 0 || localPos.x === CHUNK_SIZE - 1 ||
        localPos.y === 0 || localPos.y === CHUNK_SIZE - 1 ||
        localPos.z === 0 || localPos.z === CHUNK_SIZE - 1) {
      this.markNeighborChunksDirty(voxelPos);
    }
  }

  // Get a voxel from the world
  getVoxel(voxelPos: VoxelCoord): VoxelMaterial | undefined {
    const chunk = this.getChunkForVoxel(voxelPos);
    const localPos = this.voxelToChunkLocal(voxelPos);
    const key = getVoxelKey(localPos);
    
    return chunk.voxels.get(key);
  }

  // Mark neighboring chunks as dirty for re-rendering
  markNeighborChunksDirty(voxelPos: VoxelCoord): void {
    const neighbors = getVoxelNeighbors(voxelPos);
    
    for (const neighbor of neighbors) {
      const chunk = this.getChunkForVoxel(neighbor);
      chunk.dirty = true;
    }
  }

  // Render a chunk
  renderChunk(chunk: Chunk): void {
    // Remove existing mesh children
    while (chunk.mesh.children.length > 0) {
      chunk.mesh.remove(chunk.mesh.children[0]);
    }
    
    // Clear existing physics objects
    for (const gameObj of chunk.physicsObjects.values()) {
      this.world.removeRigidBody(gameObj.body);
    }
    chunk.physicsObjects.clear();
    
    // Group voxels by material for better rendering performance
    const voxelsByMaterial: Map<VoxelMaterial, VoxelCoord[]> = new Map();
    
    // Collect visible faces for each voxel
    for (const [keyStr, material] of chunk.voxels.entries()) {
      const localPos = parseVoxelKey(keyStr);
      
      // Check if voxel needs rendering (i.e., has any exposed face)
      if (this.shouldRenderVoxel(localPos, chunk)) {
        if (!voxelsByMaterial.has(material)) {
          voxelsByMaterial.set(material, []);
        }
        voxelsByMaterial.get(material)!.push(localPos);
      }
    }
    
    // Create instanced mesh for each material type
    for (const [material, positions] of voxelsByMaterial.entries()) {
      if (positions.length === 0) continue;
      
      // Create instanced mesh
      const instancedMesh = new THREE.InstancedMesh(
        this.geometry, 
        this.materialMeshes[material],
        positions.length
      );
      
      // Create matrix for each voxel
      const matrix = new THREE.Matrix4();
      positions.forEach((localPos, i) => {
        matrix.setPosition(
          localPos.x * VOXEL_SIZE, 
          localPos.y * VOXEL_SIZE, 
          localPos.z * VOXEL_SIZE
        );
        instancedMesh.setMatrixAt(i, matrix);
        
        // Create physics body for this voxel if it's solid
        const voxelProps = voxelProperties[material];
        if (voxelProps.solid) {
          const worldPos = voxelToWorld({
            x: chunk.position.x * CHUNK_SIZE + localPos.x,
            y: chunk.position.y * CHUNK_SIZE + localPos.y,
            z: chunk.position.z * CHUNK_SIZE + localPos.z
          });
          
          // Create physics body
          const body = createObstacleBody(
            { width: VOXEL_SIZE, height: VOXEL_SIZE, depth: VOXEL_SIZE },
            { x: worldPos.x, y: worldPos.y, z: worldPos.z },
            this.world,
            0, // Static body
          );
          
          // Store physics body
          const gameObj: GameObject = {
            mesh: null as any, // We don't need a reference to the mesh
            body,
            update: () => {} // No updates needed
          };

          const keyStr = `${localPos.x},${localPos.y},${localPos.z}`;
          chunk.physicsObjects.set(keyStr, gameObj);
        }
      });
      
      // Add instanced mesh to chunk
      chunk.mesh.add(instancedMesh);
    }
    
    chunk.dirty = false;
  }
  
  // Check if a voxel needs rendering (has at least one exposed face)
  private shouldRenderVoxel(localPos: VoxelCoord, chunk: Chunk): boolean {
    // Get absolute voxel position in world
    const worldPos: VoxelCoord = {
      x: chunk.position.x * CHUNK_SIZE + localPos.x,
      y: chunk.position.y * CHUNK_SIZE + localPos.y,
      z: chunk.position.z * CHUNK_SIZE + localPos.z
    };
    
    // Check all six neighboring positions
    const neighbors = getVoxelNeighbors(worldPos);
    
    for (const neighbor of neighbors) {
      const neighborVoxel = this.getVoxel(neighbor);
      
      // If neighbor is empty or transparent, this face should be rendered
      if (neighborVoxel === undefined || voxelProperties[neighborVoxel].transparent) {
        return true;
      }
    }
    
    // All neighboring positions are occupied by solid voxels, no need to render
    return false;
  }

  // Render all dirty chunks
  renderAllChunks(): void {
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) {
        this.renderChunk(chunk);
      }
    }
  }

  // Update function to be called every frame
  update(deltaTime: number): void {
    // Render dirty chunks
    this.renderAllChunks();
    
    // Apply gravity to voxels if needed
    // (Optional) Simulate falling sand, water flow, etc.
  }

  // Raycast to find the voxel at the given ray
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number = 100): { 
    voxel: VoxelCoord | null,
    normal: VoxelCoord | null
  } {
    // Implementation of voxel raycasting algorithm
    origin = origin.clone();
    direction = direction.clone().normalize();
    
    // Convert to voxel coordinates
    const startVoxel = worldToVoxel(origin);
    
    // Setup ray stepping variables
    let stepX = Math.sign(direction.x);
    let stepY = Math.sign(direction.y);
    let stepZ = Math.sign(direction.z);
    
    // Avoid division by zero
    const tDeltaX = stepX !== 0 ? Math.abs(1 / direction.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / direction.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / direction.z) : Infinity;
    
    // Calculate distance to first voxel boundary
    const voxelBounds = new THREE.Vector3(
      stepX > 0 ? (startVoxel.x + 1) * VOXEL_SIZE : startVoxel.x * VOXEL_SIZE,
      stepY > 0 ? (startVoxel.y + 1) * VOXEL_SIZE : startVoxel.y * VOXEL_SIZE,
      stepZ > 0 ? (startVoxel.z + 1) * VOXEL_SIZE : startVoxel.z * VOXEL_SIZE
    );
    
    let tMaxX = tDeltaX === Infinity ? Infinity : Math.abs((voxelBounds.x - origin.x) / direction.x);
    let tMaxY = tDeltaY === Infinity ? Infinity : Math.abs((voxelBounds.y - origin.y) / direction.y);
    let tMaxZ = tDeltaZ === Infinity ? Infinity : Math.abs((voxelBounds.z - origin.z) / direction.z);
    
    // Current voxel position
    let currentVoxel = {...startVoxel};
    
    // Last voxel face normal
    let normal: VoxelCoord | null = null;
    
    // Maximum steps to prevent infinite loops
    const maxSteps = Math.ceil(maxDistance / VOXEL_SIZE) * 3;
    
    for (let i = 0; i < maxSteps; i++) {
      // Check if the current voxel is occupied
      const voxel = this.getVoxel(currentVoxel);
      if (voxel !== undefined && voxelProperties[voxel].solid) {
        return { voxel: {...currentVoxel}, normal };
      }
      
      // Step to the next voxel
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        tMaxX += tDeltaX;
        currentVoxel.x += stepX;
        normal = { x: -stepX, y: 0, z: 0 };
      } else if (tMaxY < tMaxZ) {
        tMaxY += tDeltaY;
        currentVoxel.y += stepY;
        normal = { x: 0, y: -stepY, z: 0 };
      } else {
        tMaxZ += tDeltaZ;
        currentVoxel.z += stepZ;
        normal = { x: 0, y: 0, z: -stepZ };
      }
    }
    
    // No voxel found
    return { voxel: null, normal: null };
  }

  // Place a voxel in the world
  placeVoxel(position: THREE.Vector3, normal: THREE.Vector3, material: VoxelMaterial): boolean {
    // Convert world position to voxel coordinates
    const targetPos = worldToVoxel(position);
    
    // Calculate placement position using normal
    const placePos: VoxelCoord = {
      x: targetPos.x + Math.round(normal.x),
      y: targetPos.y + Math.round(normal.y),
      z: targetPos.z + Math.round(normal.z)
    };
    
    // Check if the position is valid (not occupied)
    if (this.getVoxel(placePos) === undefined) {
      this.setVoxel(placePos, material);
      return true;
    }
    
    return false;
  }

  // Remove a voxel from the world
  removeVoxel(position: THREE.Vector3): boolean {
    // Convert world position to voxel coordinates
    const targetPos = worldToVoxel(position);
    
    // Check if there's a voxel at this position
    if (this.getVoxel(targetPos) !== undefined) {
      this.setVoxel(targetPos, undefined);
      return true;
    }
    
    return false;
  }

  // Find the highest voxel at the given X,Z position - make public so voxel objects can use it
  findSurfaceHeight(x: number, z: number): number {
    let y = 64; // Search from a high position down
    while (y >= 0) {
      const voxelPos: VoxelCoord = { x, y, z };
      const voxel = this.getVoxel(voxelPos);
      if (voxel !== undefined) {
        return y + 1; // Return one above the found voxel
      }
      y--;
    }
    return 0; // Default ground level if no terrain found
  }
}