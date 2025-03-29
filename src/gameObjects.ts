import * as THREE from 'three';
import { GameObject } from './types';
import { createObstacleBody } from './physics';
import RAPIER from '@dimforge/rapier3d';

// Create terrain blocks (obstacles)
export function createTerrain(positions: THREE.Vector3[], world: RAPIER.World): GameObject[] {
  const terrain: GameObject[] = [];
  
  // Colors for terrain blocks (more vibrant for solid material)
  /*
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
      update: (delta: number) => {} // Static objects don't need updates
    };
    
    terrain.push(terrainBlock);
  });
  */
  
  return terrain;
}

// Create the game world circular boundary wall
export function createBoundaryWalls(radius: number, wallHeight: number, wallThickness: number, world: RAPIER.World): GameObject[] {
  const walls: GameObject[] = [];
  
  // Materials
  const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x555555, 
    wireframe: false,
    metalness: 0.2,
    roughness: 0.8
  });
  
  // Create a circular wall using segments
  const segmentCount = 32; // Higher number means smoother circle
  const angleStep = (Math.PI * 2) / segmentCount;
  
  for (let i = 0; i < segmentCount; i++) {
    const angle = i * angleStep;
    const nextAngle = (i + 1) * angleStep;
    
    // Calculate the center angle for this segment
    const centerAngle = (angle + nextAngle) / 2;
    
    // Calculate position for the wall segment using the center angle
    const posX = Math.cos(centerAngle) * radius;
    const posZ = Math.sin(centerAngle) * radius;
    
    // Calculate chord length (straight-line distance between segment endpoints)
    const chordLength = 2 * radius * Math.sin(angleStep / 2);
    
    // Get the wall rotation angle - make it tangent to the circle
    const wallRotation = Math.atan2(posX, posZ) + Math.PI / 2;
    
    // Calculate quaternion for the rotation
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), wallRotation);
    
    // Create visual mesh
    const geometry = new THREE.BoxGeometry(wallThickness, wallHeight, chordLength);
    const mesh = new THREE.Mesh(geometry, wallMaterial);
    
    // Position the mesh
    mesh.position.set(posX, wallHeight / 2, posZ);
    mesh.rotation.y = wallRotation;
    
    // Create static physics body
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
    rigidBodyDesc.setTranslation(posX, wallHeight / 2, posZ);
    const body = world.createRigidBody(rigidBodyDesc);
    
    // Set rotation on the rigid body
    body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    
    // Create collider with the correct dimensions
    // Note: Rapier uses half-extents for cuboid colliders
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      wallThickness / 2,  // half width
      wallHeight / 2,     // half height
      chordLength / 2     // half depth
    );
    
    // Set physics properties
    colliderDesc.setFriction(1.0);
    colliderDesc.setRestitution(0.0);
    
    // Create the collider attached to the rigid body
    world.createCollider(colliderDesc, body);
    
    // Create wall object
    const wallObject: GameObject = {
      mesh,
      body,
      update: (delta: number) => {}
    };
    
    walls.push(wallObject);
  }
  
  return walls;
}

// Create circular ground plane
export function createGround(size: number): GameObject {
  const radius = size / 2;
  
  // Create a circular disc geometry
  const segments = 64; // Higher number means smoother circle
  const geometry = new THREE.CircleGeometry(radius, segments);
  
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
  
  // Add circular grid helper
  addCircularGrid(mesh, radius);
  
  // Ground doesn't need a physics body as it's already created in the physics world
  // But we need to satisfy the GameObject interface with a placeholder
  const body = null as unknown as RAPIER.RigidBody;
  
  return {
    mesh,
    body,
    update: (delta: number) => {} // Ground doesn't need updates
  };
}

// Add a circular grid to the ground
function addCircularGrid(parentMesh: THREE.Mesh, radius: number): void {
  const material = new THREE.LineBasicMaterial({ color: 0x444444 });
  
  // Create concentric circles
  const circleCount = 10;
  for (let i = 1; i <= circleCount; i++) {
    const circleRadius = (radius * i) / circleCount;
    
    // Create points for the circle
    const segments = 64;
    const points = [];
    for (let j = 0; j <= segments; j++) {
      const angle = (j / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(angle) * circleRadius,
         0, // Will be transformed to match ground plane's rotation
        Math.sin(angle) * circleRadius
      ));
    }
    
    const circleGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const circle = new THREE.Line(circleGeometry, material);
    
    // Apply the same rotation as the parent mesh
    circle.rotation.x = -Math.PI / 2; // Match the ground plane rotation
    
    // Lift slightly to avoid z-fighting
    circle.position.y = 0.01;
    
    parentMesh.add(circle);
  }
  
  // Create radial lines
  const radialCount = 16;
  const angleStep = (Math.PI * 2) / radialCount;
  
  for (let i = 0; i < radialCount; i++) {
    const angle = i * angleStep;
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
    ]);
    
    const line = new THREE.Line(lineGeometry, material);
    
    // Apply the same rotation as the parent mesh
    line.rotation.x = -Math.PI / 2; // Match the ground plane rotation
    
    // Lift slightly to avoid z-fighting
    line.position.y = 0.01;
    
    parentMesh.add(line);
  }
}