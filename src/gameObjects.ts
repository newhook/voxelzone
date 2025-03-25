import * as THREE from 'three';
import { GameObject } from './types';
import { createObstacleBody } from './physics';
import RAPIER from '@dimforge/rapier3d';

// Create terrain blocks (obstacles)
export function createTerrain(positions: THREE.Vector3[], world: RAPIER.World): GameObject[] {
  const terrain: GameObject[] = [];
  
  // Colors for terrain blocks (more vibrant for solid material)
  const colors = [0x3355ff, 0x33cc33, 0x9933cc, 0xff9900, 0x00cccc];
  
  positions.forEach(position => {
    // Random size for each obstacle
    const size = 3 + Math.random() * 8; // Between 3 and 11 units
    
    // Random shape - either box or cylinder
    let geometry, body;
    let height: number;
    const shapeType = Math.random() > 0.7 ? 'cylinder' : 'box';
    
    if (shapeType === 'box') {
      // Box with slightly random proportions
      const width = size * (0.8 + Math.random() * 0.4);
      height = size * (0.8 + Math.random() * 0.4);
      const depth = size * (0.8 + Math.random() * 0.4);
      
      geometry = new THREE.BoxGeometry(width, height, depth);
      
      // Create the box collider
      body = createObstacleBody(
        { width, height, depth },
        // Position the obstacle so its bottom is at ground level (y=0)
        { x: position.x, y: height / 2, z: position.z },
        world,
        0 // Zero mass for static obstacle
      );
    } else {
      // Cylinder
      const radius = size / 2;
      height = size * (0.8 + Math.random() * 0.4);
      geometry = new THREE.CylinderGeometry(radius, radius, height, 16); // Increased segments for smoother look
      
      // For cylinders, use a cylinder collider (approximated as a box for now)
      body = createObstacleBody(
        { width: radius * 2, height: height, depth: radius * 2 },
        // Position the obstacle so its bottom is at ground level (y=0)
        { x: position.x, y: height / 2, z: position.z },
        world,
        0 // Zero mass for static obstacle
      );
    }
    
    // Random rotation for variety - only for visual mesh, not physics
    const rotation = Math.random() * Math.PI * 2;
    
    // Random color from the palette
    const color = colors[Math.floor(Math.random() * colors.length)];
    const material = new THREE.MeshStandardMaterial({ 
      color: color, 
      wireframe: false, 
      metalness: 0.3,
      roughness: 0.7
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position the visual mesh to match the physics body position
    // We set the physics body's y to height/2 above, so we need to do the same here
    mesh.position.set(position.x, height / 2, position.z);
    mesh.rotation.y = rotation;
    
    // Link the mesh to the physics body for debugging
    if (body) {
      body.userData = { mesh }; 
    }
    
    // Create terrain object
    const terrainBlock: GameObject = {
      mesh,
      body,
      update: () => {} // Static objects don't need updates
    };
    
    terrain.push(terrainBlock);
  });
  
  return terrain;
}

// Create the game world boundary walls
export function createBoundaryWalls(size: number, wallHeight: number, wallThickness: number, world: RAPIER.World): GameObject[] {
  const walls: GameObject[] = [];
  
  // Materials
  const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x555555, 
    wireframe: false,
    metalness: 0.2,
    roughness: 0.8
  });
  
  // Create four walls around the play area
  const wallPositions = [
    { pos: new THREE.Vector3(0, 0, size + wallThickness / 2), size: new THREE.Vector3(size * 2 + wallThickness * 2, wallHeight, wallThickness) }, // North wall
    { pos: new THREE.Vector3(0, 0, -size - wallThickness / 2), size: new THREE.Vector3(size * 2 + wallThickness * 2, wallHeight, wallThickness) }, // South wall
    { pos: new THREE.Vector3(size + wallThickness / 2, 0, 0), size: new THREE.Vector3(wallThickness, wallHeight, size * 2) }, // East wall
    { pos: new THREE.Vector3(-size - wallThickness / 2, 0, 0), size: new THREE.Vector3(wallThickness, wallHeight, size * 2) }  // West wall
  ];
  
  wallPositions.forEach(wall => {
    // Create visual mesh
    const geometry = new THREE.BoxGeometry(wall.size.x, wall.size.y, wall.size.z);
    const mesh = new THREE.Mesh(geometry, wallMaterial);
    mesh.position.copy(wall.pos);
    
    // Create physics body
    const body = createObstacleBody(
      { width: wall.size.x, height: wall.size.y, depth: wall.size.z },
      { x: wall.pos.x, y: wall.pos.y, z: wall.pos.z },
      world,
    );
    
    // Create wall object
    const wallObject: GameObject = {
      mesh,
      body,
      update: () => {} // Static objects don't need updates
    };
    
    walls.push(wallObject);
  });
  
  return walls;
}

// Create ground plane
export function createGround(size: number): GameObject {
  // Create a more detailed plane for the large terrain
  const geometry = new THREE.PlaneGeometry(size, size, 128, 128);
  
  // Create a grid pattern for the ground
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x222222,
    wireframe: false,
    metalness: 0.1,
    roughness: 0.9,
    side: THREE.DoubleSide
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2; // Rotate to lie flat on XZ plane
  mesh.position.y = 0;
  
  // Add a grid helper to help with spatial awareness
  const gridHelper = new THREE.GridHelper(size, 50, 0x444444, 0x333333);
  gridHelper.position.y = 0.01; // Slightly above ground to avoid z-fighting
  gridHelper.rotation.x = -Math.PI / 2; // Rotate to lie flat on XZ plane
  mesh.add(gridHelper);
  
  // Ground doesn't need a physics body as it's already created in the physics world
  // But we need to satisfy the GameObject interface with a placeholder
  const body = null as unknown as RAPIER.RigidBody;
  
  return {
    mesh,
    body,
    update: () => {} // Ground doesn't need updates
  };
}
