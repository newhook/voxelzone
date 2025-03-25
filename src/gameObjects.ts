import * as THREE from 'three';
import { GameObject } from './types';
import { createObstacleBody } from './physics';
import RAPIER from '@dimforge/rapier3d';

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
