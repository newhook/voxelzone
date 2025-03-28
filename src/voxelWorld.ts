import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { GameObject } from './types';
import { PhysicsWorld } from './physics';
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
  private physicsWorld: PhysicsWorld;
  private config: GameConfig;
  private materialMeshes: THREE.MeshStandardMaterial[] = [];
  private geometry: THREE.BoxGeometry;

  constructor(scene: THREE.Scene, physicsWorld: PhysicsWorld, config: GameConfig) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.world = physicsWorld.world;
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

  // Create a voxel in the world - this handles both fixed and non-fixed voxels based on material properties
  setVoxel(voxelPos: VoxelCoord, material: VoxelMaterial | undefined): void {
    const chunk = this.getChunkForVoxel(voxelPos);
    const localPos = this.voxelToChunkLocal(voxelPos);
    const key = getVoxelKey(localPos);

    // Check if we're removing a voxel
    const isRemoving = material === undefined && chunk.voxels.has(key);

    // If material is undefined, remove the voxel
    if (material === undefined) {
      chunk.voxels.delete(key);

      // Remove physics body if it exists
      if (chunk.physicsObjects.has(key)) {
        const gameObj = chunk.physicsObjects.get(key)!;
        this.physicsWorld.removeBody(gameObj);
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

    // Check for unsupported voxels if we removed a voxel
    if (isRemoving) {
      // console.trace();
      // console.log("Checking for unsupported voxels...");
      // Regular handling for other materials
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
    // Remove existing mesh children
    while (chunk.mesh.children.length > 0) {
      chunk.mesh.remove(chunk.mesh.children[0]);
    }

    // Clear existing physics objects
    for (const gameObj of chunk.physicsObjects.values()) {
      this.physicsWorld.removeBody(gameObj);
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

          // Create appropriate rigid body type based on fixed property
          let rigidBodyDesc;
          if (voxelProps.fixed) {
            // Use fixed rigid body for voxels marked as fixed
            rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
          } else {
            // Use static body for normal voxels
            rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
          }
          rigidBodyDesc = rigidBodyDesc.setTranslation(worldPos.x, worldPos.y, worldPos.z);

          const body = this.physicsWorld.world.createRigidBody(rigidBodyDesc);

          // Create the collider
          const colliderDesc = RAPIER.ColliderDesc.cuboid(
            VOXEL_SIZE / 2,
            VOXEL_SIZE / 2,
            VOXEL_SIZE / 2
          );

          // Set physical properties based on voxel type
          if (voxelProps.fixed) {
            // Fixed bodies have high friction, no bounce, and higher density
            colliderDesc.setFriction(1.0);
            colliderDesc.setRestitution(0.0);
            colliderDesc.setDensity(10.0);
          } else {
            // Normal bodies use their material properties
            colliderDesc.setFriction(voxelProps.friction);
            colliderDesc.setRestitution(voxelProps.restitution);
          }

          // Create the collider
          this.physicsWorld.world.createCollider(colliderDesc, body);

          // Store physics body
          const gameObj: GameObject = {
            mesh: null as any, // We don't need a reference to the mesh
            body,
            update: () => { } // No updates needed
          };

          // Register the voxel with physics world to enable proper collision tracking
          this.physicsWorld.addBody(gameObj);

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

  // Update function to be called every frame
  update(deltaTime: number): void {
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) {
        this.renderChunk(chunk);
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
        const physicsObj = this.createDynamicVoxelBody(pos, material);
        this.physicsWorld.addBody(physicsObj);
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
        const physicsObj = this.createDynamicVoxelBody(pos, material);
        this.physicsWorld.addBody(physicsObj);
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
    this.scene.add(mesh);

    // Create the game object
    const gameObj: GameObject = {
      mesh,
      body,
      update: () => {
        // Update mesh position based on physics body
        const position = body.translation();
        mesh.position.set(position.x, position.y, position.z);

        // Update mesh rotation based on physics body
        const rotation = body.rotation();
        mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

        // Remove if fallen too far (cleanup)
        if (position.y < -20) {
          this.scene.remove(mesh);
          this.physicsWorld.removeBody(gameObj);
          return false; // Signal that this object should be removed
        }

        return true;
      }
    };

    return gameObj;
  }
}
