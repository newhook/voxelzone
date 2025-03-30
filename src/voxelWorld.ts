import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { GameObject } from './types';
import { PhysicsWorld } from './physics';
import { PlayState } from './playState';
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
import { GameConfig } from './config';

// Chunk size (16x16x16 voxels per chunk, like Minecraft)
const CHUNK_SIZE = 16;

export interface PhysicsChunk {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  material: VoxelMaterial;
}

export interface Chunk {
  position: { x: number, y: number, z: number }; // Chunk position in chunk coordinates
  voxels: Map<string, VoxelMaterial>; // Map of voxel positions to materials
  mesh: THREE.Group; // Mesh containing all rendered voxels
  dirty: boolean; // Whether the chunk needs to be re-rendered
  physicsChunks: Map<string, GameObject>; // Physics objects for consolidated voxels
  needsPhysicsUpdate: boolean; // Flag to indicate physics needs updating
}

export class VoxelWorld {
  private state: PlayState;
  private scene: THREE.Scene;
  private chunks: Map<string, Chunk> = new Map();
  private physicsWorld: PhysicsWorld;
  private config: GameConfig;
  private materialMeshes: THREE.MeshStandardMaterial[] = [];
  private geometry: THREE.BoxGeometry;

  constructor(playState: PlayState, scene: THREE.Scene, physicsWorld: PhysicsWorld, config: GameConfig) {
    this.state = playState;
    this.scene = scene;
    this.physicsWorld = physicsWorld;
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

  // Add this method to the VoxelWorld class
  // This replaces the individual physics creation in the renderChunk method
  private updateChunkPhysics(chunk: Chunk): void {
    // Remove existing physics objects
    for (const gameObj of chunk.physicsChunks.values()) {
      this.physicsWorld.removeBody(gameObj);
    }
    chunk.physicsChunks.clear();

    // Generate optimized physics bodies using greedy meshing approach
    const physicsChunks = this.generatePhysicsChunks(chunk);

    // Create physics bodies for each consolidated chunk
    for (const [chunkId, physicsChunk] of physicsChunks) {
      const material = physicsChunk.material;
      const voxelProps = voxelProperties[material];

      if (!voxelProps.solid) continue;

      // Calculate dimensions of the consolidated chunk
      const sizeX = (physicsChunk.maxX - physicsChunk.minX + 1) * VOXEL_SIZE;
      const sizeY = (physicsChunk.maxY - physicsChunk.minY + 1) * VOXEL_SIZE;
      const sizeZ = (physicsChunk.maxZ - physicsChunk.minZ + 1) * VOXEL_SIZE;

      // Calculate the center position of the consolidated chunk
      const centerX = chunk.position.x * CHUNK_SIZE * VOXEL_SIZE +
        (physicsChunk.minX + (physicsChunk.maxX - physicsChunk.minX) / 2) * VOXEL_SIZE;
      const centerY = chunk.position.y * CHUNK_SIZE * VOXEL_SIZE +
        (physicsChunk.minY + (physicsChunk.maxY - physicsChunk.minY) / 2) * VOXEL_SIZE;
      const centerZ = chunk.position.z * CHUNK_SIZE * VOXEL_SIZE +
        (physicsChunk.minZ + (physicsChunk.maxZ - physicsChunk.minZ) / 2) * VOXEL_SIZE;

      // Create fixed rigid body for the consolidated chunk
      const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(centerX, centerY, centerZ);
      const body = this.physicsWorld.world.createRigidBody(rigidBodyDesc);

      // Create cuboid collider with the appropriate size
      const colliderDesc = RAPIER.ColliderDesc.cuboid(
        sizeX / 2,
        sizeY / 2,
        sizeZ / 2
      );

      // Set physics properties
      colliderDesc.setFriction(voxelProps.friction);
      colliderDesc.setRestitution(voxelProps.restitution);
      colliderDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED);
      colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

      // Create the collider
      this.physicsWorld.world.createCollider(colliderDesc, body);

      // Create game object
      const gameObj: GameObject = {
        mesh: null as any,
        body,
        update: () => { } // No updates needed for fixed bodies
      };

      // Register the consolidated voxel chunk
      this.physicsWorld.addBody(gameObj);
      chunk.physicsChunks.set(chunkId, gameObj);
    }

    chunk.needsPhysicsUpdate = false;
  }

  // Implement a modified greedy meshing algorithm for physics consolidation
  private generatePhysicsChunks(chunk: Chunk): Map<string, PhysicsChunk> {
    const result = new Map<string, PhysicsChunk>();
    const visited = new Set<string>();

    // Helper to check if a voxel should be included in physics
    const shouldIncludeInPhysics = (localPos: VoxelCoord): boolean => {
      const key = getVoxelKey(localPos);
      if (visited.has(key)) return false;

      const material = chunk.voxels.get(key);
      return material !== undefined && voxelProperties[material].solid;
    };

    // Check all voxels in the chunk
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const currentPos = { x, y, z };
          const key = getVoxelKey(currentPos);

          if (visited.has(key)) continue;

          const material = chunk.voxels.get(key);
          if (material === undefined || !voxelProperties[material].solid) {
            visited.add(key);
            continue;
          }

          // Start of a new chunk, find its maximum extent
          const physicsChunk: PhysicsChunk = {
            minX: x,
            minY: y,
            minZ: z,
            maxX: x,
            maxY: y,
            maxZ: z,
            material
          };

          // Try to expand along the X axis first
          while (physicsChunk.maxX + 1 < CHUNK_SIZE) {
            const nextPos = {
              x: physicsChunk.maxX + 1,
              y,
              z
            };
            const nextKey = getVoxelKey(nextPos);
            const nextMaterial = chunk.voxels.get(nextKey);

            if (nextMaterial !== material || !shouldIncludeInPhysics(nextPos)) {
              break;
            }

            physicsChunk.maxX++;
            visited.add(nextKey);
          }

          // Then try to expand along the Z axis
          let canExpandZ = true;
          while (canExpandZ && physicsChunk.maxZ + 1 < CHUNK_SIZE) {
            // Check if entire row can be added
            for (let checkX = physicsChunk.minX; checkX <= physicsChunk.maxX; checkX++) {
              const nextPos = {
                x: checkX,
                y,
                z: physicsChunk.maxZ + 1
              };
              const nextKey = getVoxelKey(nextPos);
              const nextMaterial = chunk.voxels.get(nextKey);

              if (nextMaterial !== material || !shouldIncludeInPhysics(nextPos)) {
                canExpandZ = false;
                break;
              }
            }

            if (canExpandZ) {
              physicsChunk.maxZ++;
              // Mark all voxels in this row as visited
              for (let checkX = physicsChunk.minX; checkX <= physicsChunk.maxX; checkX++) {
                const nextPos = {
                  x: checkX,
                  y,
                  z: physicsChunk.maxZ
                };
                visited.add(getVoxelKey(nextPos));
              }
            }
          }

          // Finally try to expand along the Y axis
          let canExpandY = true;
          while (canExpandY && physicsChunk.maxY + 1 < CHUNK_SIZE) {
            // Check if entire layer can be added
            for (let checkZ = physicsChunk.minZ; checkZ <= physicsChunk.maxZ; checkZ++) {
              for (let checkX = physicsChunk.minX; checkX <= physicsChunk.maxX; checkX++) {
                const nextPos = {
                  x: checkX,
                  y: physicsChunk.maxY + 1,
                  z: checkZ
                };
                const nextKey = getVoxelKey(nextPos);
                const nextMaterial = chunk.voxels.get(nextKey);

                if (nextMaterial !== material || !shouldIncludeInPhysics(nextPos)) {
                  canExpandY = false;
                  break;
                }
              }
              if (!canExpandY) break;
            }

            if (canExpandY) {
              physicsChunk.maxY++;
              // Mark all voxels in this layer as visited
              for (let checkZ = physicsChunk.minZ; checkZ <= physicsChunk.maxZ; checkZ++) {
                for (let checkX = physicsChunk.minX; checkX <= physicsChunk.maxX; checkX++) {
                  const nextPos = {
                    x: checkX,
                    y: physicsChunk.maxY,
                    z: checkZ
                  };
                  visited.add(getVoxelKey(nextPos));
                }
              }
            }
          }

          // Add the consolidated physics chunk
          const chunkId = `${physicsChunk.minX},${physicsChunk.minY},${physicsChunk.minZ}-${physicsChunk.maxX},${physicsChunk.maxY},${physicsChunk.maxZ}`;
          result.set(chunkId, physicsChunk);

          // Mark current voxel as visited
          visited.add(key);
        }
      }
    }

    return result;
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
        physicsChunks: new Map<string, GameObject>(),
        needsPhysicsUpdate: false
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

  // Create a voxel in the world based on material properties
  setVoxel(voxelPos: VoxelCoord, material: VoxelMaterial | undefined): void {
    const chunk = this.getChunkForVoxel(voxelPos);
    const localPos = this.voxelToChunkLocal(voxelPos);
    const key = getVoxelKey(localPos);

    // Check if we're removing a voxel
    const isRemoving = material === undefined && chunk.voxels.has(key);

    // If material is undefined, remove the voxel
    if (material === undefined) {
      chunk.voxels.delete(key);
    } else {
      chunk.voxels.set(key, material);
    }

    // Mark the chunk as dirty for re-rendering
    chunk.dirty = true;

    // Mark physics needs updating
    chunk.needsPhysicsUpdate = true;

    // Mark neighboring chunks as dirty if the voxel is on the edge
    if (localPos.x === 0 || localPos.x === CHUNK_SIZE - 1 ||
      localPos.y === 0 || localPos.y === CHUNK_SIZE - 1 ||
      localPos.z === 0 || localPos.z === CHUNK_SIZE - 1) {
      this.markNeighborChunksDirty(voxelPos);
    }

    // Check for unsupported voxels if we removed a voxel
    if (isRemoving) {
      setTimeout(() => {
        this.checkUnsupportedVoxels(voxelPos, 3);
      }, 50);
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
    // console.log("Rendering chunk at", chunk.position);
    // Remove existing mesh children
    while (chunk.mesh.children.length > 0) {
      chunk.mesh.remove(chunk.mesh.children[0]);
    }

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
      });

      // Add instanced mesh to chunk
      chunk.mesh.add(instancedMesh);
    }

    // Update physics if needed
    if (chunk.needsPhysicsUpdate) {
      this.updateChunkPhysics(chunk);
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

  // Update function to be called every frame
  update(deltaTime: number): void {
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) {
        this.renderChunk(chunk);
      }
      if (chunk.needsPhysicsUpdate) {
        this.updateChunkPhysics(chunk);
      }
    }
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
    let currentVoxel = { ...startVoxel };

    // Last voxel face normal
    let normal: VoxelCoord | null = null;

    // Maximum steps to prevent infinite loops
    const maxSteps = Math.ceil(maxDistance / VOXEL_SIZE) * 3;

    for (let i = 0; i < maxSteps; i++) {
      // Check if the current voxel is occupied
      const voxel = this.getVoxel(currentVoxel);
      if (voxel !== undefined && voxelProperties[voxel].solid) {
        return { voxel: { ...currentVoxel }, normal };
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

  // Check for unsupported voxels in a region
  private checkUnsupportedVoxels(center: VoxelCoord, radius: number): void {
    // Track voxels that need to be processed for physics
    const voxelsToCheck: Array<{ pos: VoxelCoord, material: VoxelMaterial }> = [];
    const processedVoxels = new Set<string>();

    // First, let's quickly check if the center voxel is a tree trunk (wood)
    const isTrunkRemoval = this.getAdjacentWoodCount(center) > 0;

    // Increase radius for tree structures to ensure we catch the entire tree
    const checkRadius = isTrunkRemoval ? 10 : radius;

    // First pass: collect all wood blocks that might need checking
    for (let x = -checkRadius; x <= checkRadius; x++) {
      for (let y = 0; y <= checkRadius * 2; y++) { // Check more upward (trees are tall)
        for (let z = -checkRadius; z <= checkRadius; z++) {
          const checkPos = {
            x: center.x + x,
            y: center.y + y,
            z: center.z + z
          };

          // Skip if we've already processed this voxel
          const key = getVoxelKey(checkPos);
          if (processedVoxels.has(key)) continue;

          // Get the voxel material
          const material = this.getVoxel(checkPos);
          if (material === undefined) continue;

          // First collect all wood blocks that might be unsupported
          if (material === VoxelMaterial.WOOD) {
            voxelsToCheck.push({ pos: checkPos, material });
            processedVoxels.add(key);
          }
        }
      }
    }

    // Process all wood blocks first
    for (const { pos, material } of voxelsToCheck) {
      // Check if this wood block has a support chain to the ground
      if (!this.hasWoodSupportChain(pos)) {
        // No support chain - convert to a physical object
        this.setVoxel(pos, undefined);
        this.state.addDebris(this.createDynamicVoxelBody(pos, material));
      }
    }

    // Clear the arrays for the second pass
    voxelsToCheck.length = 0;
    processedVoxels.clear();

    // Second pass: collect all non-wood blocks (leaves, etc.) that might need checking
    for (let x = -checkRadius; x <= checkRadius; x++) {
      for (let y = 0; y <= checkRadius * 2; y++) {
        for (let z = -checkRadius; z <= checkRadius; z++) {
          const checkPos = {
            x: center.x + x,
            y: center.y + y,
            z: center.z + z
          };

          // Skip if we've already processed this voxel
          const key = getVoxelKey(checkPos);
          if (processedVoxels.has(key)) continue;

          // Get the voxel material
          const material = this.getVoxel(checkPos);
          if (material === undefined) continue;

          // Skip wood, we've already processed those
          if (material === VoxelMaterial.WOOD) continue;

          // Only care about voxels that can be affected by gravity
          if (material !== VoxelMaterial.LEAVES) {
            if (!voxelProperties[material].gravity) continue;
          }

          voxelsToCheck.push({ pos: checkPos, material });
          processedVoxels.add(key);
        }
      }
    }

    // Process all non-wood blocks now that wood blocks have been processed
    for (const { pos, material } of voxelsToCheck) {
      if (!this.hasSupport(pos)) {
        // Voxel has no support - convert to a physical object
        this.setVoxel(pos, undefined);
        this.state.addDebris(this.createDynamicVoxelBody(pos, material));
      }
    }
  }

  // Count the number of adjacent wood blocks to determine if we're breaking a tree trunk
  private getAdjacentWoodCount(pos: VoxelCoord): number {
    let count = 0;
    for (const neighbor of getVoxelNeighbors(pos)) {
      if (this.getVoxel(neighbor) === VoxelMaterial.WOOD) {
        count++;
      }
    }

    return count;
  }

  // Check if a wood block has a continuous chain of support to the ground
  private hasWoodSupportChain(startPos: VoxelCoord): boolean {
    // Track visited positions to avoid loops
    const visited = new Set<string>();
    const queue: VoxelCoord[] = [startPos];

    while (queue.length > 0) {
      const currentPos = queue.shift()!;
      const key = getVoxelKey(currentPos);

      if (visited.has(key)) continue;
      visited.add(key);

      // We reached ground level - the chain is supported
      if (currentPos.y === 0) {
        return true;
      }

      // Check below first (vertical support is primary)
      const belowPos = { x: currentPos.x, y: currentPos.y - 1, z: currentPos.z };
      const belowMaterial = this.getVoxel(belowPos);

      // If there's a solid block below, it's potentially supported
      if (belowMaterial !== undefined) {
        const belowKey = getVoxelKey(belowPos);
        if (!visited.has(belowKey)) {
          queue.push(belowPos);
          continue; // Continue with BFS
        }
      }

      // No support directly below, check for horizontal supports for wood only
      if (this.getVoxel(currentPos) === VoxelMaterial.WOOD) {
        // Check all four horizontal directions for wood supports
        const horizontalNeighbors = [
          { x: currentPos.x + 1, y: currentPos.y, z: currentPos.z },
          { x: currentPos.x - 1, y: currentPos.y, z: currentPos.z },
          { x: currentPos.x, y: currentPos.y, z: currentPos.z + 1 },
          { x: currentPos.x, y: currentPos.y, z: currentPos.z - 1 }
        ];

        for (const neighbor of horizontalNeighbors) {
          const neighborMaterial = this.getVoxel(neighbor);
          if (neighborMaterial === VoxelMaterial.WOOD) {
            const neighborKey = getVoxelKey(neighbor);
            if (!visited.has(neighborKey)) {
              queue.push(neighbor);
            }
          }
        }
      }
    }

    // No path to ground or other support found
    return false;
  }

  // Check if a voxel has support underneath or to the sides
  private hasSupport(voxelPos: VoxelCoord): boolean {
    // Check if there's a voxel directly underneath
    const belowPos: VoxelCoord = { x: voxelPos.x, y: voxelPos.y - 1, z: voxelPos.z };
    const belowVoxel = this.getVoxel(belowPos);

    // If there's a voxel below, it's supported
    if (belowVoxel !== undefined) {
      return true;
    }

    // Ground level always counts as supported
    if (voxelPos.y === 0) {
      return true;
    }

    // For wood blocks in trees, we need to check if they're part of the tree trunk
    // If they're not directly on top of another wood block, they should fall
    const material = this.getVoxel(voxelPos);

    if (material === VoxelMaterial.WOOD) {
      // For wood blocks, they need to have support directly underneath
      // Otherwise, this is a disconnected wood block (like the top of a tree)
      return false;
    }

    // For leaves, check horizontal connections
    if (material === VoxelMaterial.LEAVES) {
      // Check all six neighboring positions
      const neighbors = getVoxelNeighbors(voxelPos);

      for (const neighbor of neighbors) {
        const neighborMaterial = this.getVoxel(neighbor);

        // If there's a wood block next to this leaf, consider it supported
        if (neighborMaterial === VoxelMaterial.WOOD) {
          return true;
        }

        // Check if it's connected to another leaf that might be supported
        if (neighborMaterial === VoxelMaterial.LEAVES) {
          // Use a breadth-first search to find if any connected leaf has support
          if (this.hasLeafClusterSupport(voxelPos)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  // Use breadth-first search to find if a cluster of leaves has any support
  private hasLeafClusterSupport(startPos: VoxelCoord): boolean {
    const visited = new Set<string>();
    const queue: VoxelCoord[] = [startPos];

    // Limit search to prevent infinite loops for very large trees
    const maxSearchSize = 100;

    while (queue.length > 0 && visited.size < maxSearchSize) {
      const current = queue.shift()!;
      const key = getVoxelKey(current);

      if (visited.has(key)) continue;
      visited.add(key);

      // Check if this leaf has support from below
      const belowPos: VoxelCoord = { x: current.x, y: current.y - 1, z: current.z };
      const belowMaterial = this.getVoxel(belowPos);

      // If there's something directly below, check if it's supporting
      if (belowMaterial !== undefined) {
        // If it's a wood block, check if it has a support chain to the ground
        if (belowMaterial === VoxelMaterial.WOOD) {
          if (this.hasWoodSupportChain(belowPos)) {
            return true; // Found support from a supported wood block
          }
        }
        // If it's another material (like ground), it's supporting
        else if (belowMaterial !== VoxelMaterial.LEAVES) {
          return true;
        }
      }

      // Add all neighboring leaves/wood to the queue
      const neighbors = getVoxelNeighbors(current);
      for (const neighbor of neighbors) {
        const neighborMaterial = this.getVoxel(neighbor);

        // If there's a wood block, check if it's actually supported
        if (neighborMaterial === VoxelMaterial.WOOD) {
          if (this.hasWoodSupportChain(neighbor)) {
            return true; // Found support from a supported wood block
          }
        }

        // If it's another leaf, add to the queue to check later
        if (neighborMaterial === VoxelMaterial.LEAVES) {
          const neighborKey = getVoxelKey(neighbor);
          if (!visited.has(neighborKey)) {
            queue.push(neighbor);
          }
        }
      }
    }

    // No support found in the cluster
    return false;
  }

  // Create a dynamic physics body for a voxel
  private createDynamicVoxelBody(voxelPos: VoxelCoord, material: VoxelMaterial): GameObject {
    const worldPos = voxelToWorld(voxelPos);

    // Create a dynamic rigid body
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(worldPos.x, worldPos.y, worldPos.z);

    const body = this.physicsWorld.world.createRigidBody(rigidBodyDesc);

    // Create the collider
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      VOXEL_SIZE / 2,
      VOXEL_SIZE / 2,
      VOXEL_SIZE / 2
    );

    // Set physical properties based on the material
    const voxelProps = voxelProperties[material];
    colliderDesc.setFriction(voxelProps.friction);
    colliderDesc.setRestitution(voxelProps.restitution);
    colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.physicsWorld.world.createCollider(colliderDesc, body);

    // Create a simple mesh for the falling voxel
    const geometry = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
    const meshMaterial = new THREE.MeshStandardMaterial({
      color: voxelProps.color,
      transparent: voxelProps.transparent,
      opacity: voxelProps.transparent ? 0.8 : 1.0,
      roughness: 0.7,
      metalness: 0.1
    });

    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.position.copy(worldPos);

    let fadeOut = false;
    let fadeStartTime: number;
    const fadeOutDuration = 1000; // 1 second fade
    const initialOpacity = meshMaterial.opacity;

    // Create the game object
    const gameObj: GameObject = {
      mesh,
      body,
      update: () => {
        // Remove if fallen too far (cleanup)
        if (body.translation().y < -20) {
          this.state.removeDebris(gameObj);
          return false; // Signal that this object should be removed
        }

        if (fadeOut) {
          // Fade out and remove the voxel after a delay
          const elapsed = Date.now() - fadeStartTime;
          const progress = Math.min(elapsed / fadeOutDuration, 1);

          // Update opacity
          meshMaterial.opacity = initialOpacity * (1 - progress);

          // When fade completes
          if (progress >= 1) {
            this.state.removeDebris(gameObj);
            return false;
          }
        }
        return true;
      }
    };

    if (Math.random() < 0.9) {
      setTimeout(() => {
        fadeOut = true;
        fadeStartTime = Date.now();
      }, Math.random() * 1000 + 1000);
    }

    return gameObj;
  }
}
