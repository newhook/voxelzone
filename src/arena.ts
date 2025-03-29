import { VoxelWorld } from './voxelWorld';
import { createBarrier, createBuilding, createFortress, createTree, createBush, createPond, createPineTree, createCactus, createRockFormation } from './voxelObjects';

  /**
   * Creates structured voxel landscapes with tactical elements like hiding spots,
   * dense forests, obstructions, and other interesting features
   * @param radius The radius of the circular playing field
   */
  export function createVoxelStructures(voxelWorld : VoxelWorld, radius: number): void {
    // Create a clear player starting area (safe zone)
    createSafeZone(20);
    
    // Create 4 distinct quadrants with different environments
    // createForestZone(voxelWorld, radius, 0, Math.PI/2);           // Northeast quadrant: Dense forest
    // createUrbanZone(voxelWorld, radius, Math.PI/2, Math.PI);      // Northwest quadrant: Urban area
    // createDesertZone(voxelWorld, radius, Math.PI, 3*Math.PI/2);   // Southwest quadrant: Desert with rock formations
    // createMountainZone(voxelWorld, radius, 3*Math.PI/2, 2*Math.PI); // Southeast quadrant: Rocky mountain area
    
    // Create connecting roadways between quadrants
    createRoadways(voxelWorld, radius);
    
    // Create strategic central fortress
    createFortress(voxelWorld, 0, 0);
    
    // Add tactical water features
    createWaterFeatures(voxelWorld, radius);
  }
  
  // Create a safe starting zone for the player
  function createSafeZone(radius: number): void {
    // Clear central area to ensure player has space to navigate initially
    // No need to add structures, just ensuring nothing spawns too close
  }
  
  // Create a dense forest area
  function createForestZone(voxelWorld : VoxelWorld, radius: number, startAngle: number, endAngle: number): void {
    // Create patches of dense forest with natural clearings
    const forestAreaRadius = radius * 0.9; // Stay within world bounds
    
    // Create large forest patches
    for (let patch = 0; patch < 4; patch++) {
      const patchAngle = startAngle + (endAngle - startAngle) * (0.2 + 0.6 * Math.random());
      const patchDistance = radius * (0.4 + 0.4 * Math.random());
      const patchCenterX = Math.floor(Math.cos(patchAngle) * patchDistance);
      const patchCenterZ = Math.floor(Math.sin(patchAngle) * patchDistance);
      const patchRadius = 15 + Math.random() * 10;
      
      // Create a dense cluster of trees in this patch
      const treeCount = Math.floor(patchRadius * 0.7);
      for (let i = 0; i < treeCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * patchRadius;
        const x = Math.floor(patchCenterX + Math.cos(angle) * distance);
        const z = Math.floor(patchCenterZ + Math.sin(angle) * distance);
        
        // Ensure we're in the correct quadrant
        const globalAngle = Math.atan2(z, x);
        if (globalAngle >= startAngle && globalAngle < endAngle) {
          // Mix of different tree types for variety
          if (Math.random() > 0.6) {
            createTree(voxelWorld, x, z);
          } else {
            createPineTree(voxelWorld, x, z);
          }
          
          // Add some bushes around trees for additional cover
          if (Math.random() > 0.7) {
            const bushOffset = 3 + Math.random() * 2;
            const bushAngle = Math.random() * Math.PI * 2;
            const bushX = Math.floor(x + Math.cos(bushAngle) * bushOffset);
            const bushZ = Math.floor(z + Math.sin(bushAngle) * bushOffset);
            createBush(voxelWorld, bushX, bushZ);
          }
        }
      }
      
      // Add a small pond or clearing in some patches
      if (Math.random() > 0.5) {
        createPond(voxelWorld, patchCenterX, patchCenterZ);
      }
    }
    
    // Add scattered individual trees throughout the quadrant
    for (let i = 0; i < 30; i++) {
      const angle = startAngle + Math.random() * (endAngle - startAngle);
      const distance = Math.random() * forestAreaRadius;
      const x = Math.floor(Math.cos(angle) * distance);
      const z = Math.floor(Math.sin(angle) * distance);
      
      // Skip if too close to origin (player spawn)
      const distanceFromOrigin = Math.sqrt(x * x + z * z);
      if (distanceFromOrigin < 25) continue;
      
      // Create a tree
      if (Math.random() > 0.5) {
        createTree(voxelWorld, x, z);
      } else {
        createPineTree(voxelWorld, x, z);
      }
    }
  }
  
  // Create an urban zone with buildings and barriers
  function createUrbanZone(voxelWorld : VoxelWorld, radius: number, startAngle: number, endAngle: number): void {
    const urbanRadius = radius * 0.85;
    
    // Create a city grid pattern
    const gridSize = 25; // Distance between buildings
    const centerX = Math.cos(startAngle + (endAngle - startAngle) / 2) * radius * 0.5;
    const centerZ = Math.sin(startAngle + (endAngle - startAngle) / 2) * radius * 0.5;
    
    // Create a grid of buildings
    for (let row = -3; row <= 3; row++) {
      for (let col = -3; col <= 3; col++) {
        const x = Math.floor(centerX + col * gridSize);
        const z = Math.floor(centerZ + row * gridSize);
        
        // Check if in correct quadrant
        const angle = Math.atan2(z, x);
        const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
        if (normalizedAngle >= startAngle && normalizedAngle < endAngle) {
          // Calculate distance from center
          const distanceFromOrigin = Math.sqrt(x * x + z * z);
          
          // Skip if too close to origin or outside our radius
          if (distanceFromOrigin < 30 || distanceFromOrigin > urbanRadius) continue;
          
          // Randomly decide whether to place a building or barrier
          if (Math.random() > 0.1) {
            createBuilding(voxelWorld, x, z);
            
            // Sometimes add barriers around buildings for cover
            if (Math.random() > 0.2) {
              const barrierOffset = 8;
              const barrierX = x + Math.floor((Math.random() - 0.5) * barrierOffset);
              const barrierZ = z + Math.floor((Math.random() - 0.5) * barrierOffset);
              createBarrier(voxelWorld, barrierX, barrierZ);
            }
          } else if (Math.random() > 0.3) {
            createBarrier(voxelWorld, x, z);
          }
        }
      }
    }
    
    // Create some larger "landmark" buildings
    for (let i = 0; i < 3; i++) {
      const angle = startAngle + Math.random() * (endAngle - startAngle);
      const distance = radius * 0.4 + Math.random() * radius * 0.3;
      const x = Math.floor(Math.cos(angle) * distance);
      const z = Math.floor(Math.sin(angle) * distance);
      
      // Skip if too close to origin
      const distanceFromOrigin = Math.sqrt(x * x + z * z);
      if (distanceFromOrigin < 40) continue;
      
      // Create a larger structure
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          createBuilding(voxelWorld, x + dx * 5, z + dz * 5);
        }
      }
      
      // Add some defensive barriers around the landmark
      for (let j = 0; j < 6; j++) {
        const barrierAngle = Math.random() * Math.PI * 2;
        const barrierDistance = 15 + Math.random() * 5;
        const barrierX = Math.floor(x + Math.cos(barrierAngle) * barrierDistance);
        const barrierZ = Math.floor(z + Math.sin(barrierAngle) * barrierDistance);
        createBarrier(voxelWorld, barrierX, barrierZ);
      }
    }
  }
  
  // Create a desert zone with rock formations and cacti
  function createDesertZone(voxelWorld : VoxelWorld, radius: number, startAngle: number, endAngle: number): void {
    const desertRadius = radius * 0.9;
    
    // Create rock formations
    for (let i = 0; i < 15; i++) {
      const angle = startAngle + Math.random() * (endAngle - startAngle);
      const distance = 30 + Math.random() * (desertRadius - 30);
      const x = Math.floor(Math.cos(angle) * distance);
      const z = Math.floor(Math.sin(angle) * distance);
      
      // Skip if too close to origin
      const distanceFromOrigin = Math.sqrt(x * x + z * z);
      if (distanceFromOrigin < 30) continue;
      
      // Create rock formation
      createRockFormation(voxelWorld, x, z);
      
      // Sometimes create a cluster of rocks
      if (Math.random() > 0.5) {
        for (let j = 0; j < 3; j++) {
          const clusterAngle = Math.random() * Math.PI * 2;
          const clusterDistance = 5 + Math.random() * 10;
          const rockX = Math.floor(x + Math.cos(clusterAngle) * clusterDistance);
          const rockZ = Math.floor(z + Math.sin(clusterAngle) * clusterDistance);
          
          // Check if still in desert quadrant
          const rockAngle = Math.atan2(rockZ, rockX);
          const normalizedAngle = rockAngle < 0 ? rockAngle + 2 * Math.PI : rockAngle;
          if (normalizedAngle >= startAngle && normalizedAngle < endAngle) {
            createRockFormation(voxelWorld, rockX, rockZ);
          }
        }
      }
    }
    
    // Create cacti
    for (let i = 0; i < 25; i++) {
      const angle = startAngle + Math.random() * (endAngle - startAngle);
      const distance = Math.random() * desertRadius;
      const x = Math.floor(Math.cos(angle) * distance);
      const z = Math.floor(Math.sin(angle) * distance);
      
      // Skip if too close to origin
      const distanceFromOrigin = Math.sqrt(x * x + z * z);
      if (distanceFromOrigin < 25) continue;
      
      createCactus(voxelWorld, x, z);
    }
    
    // Create a unique desert oasis feature
    const oasisAngle = startAngle + (endAngle - startAngle) * 0.5;
    const oasisDistance = radius * 0.5;
    const oasisX = Math.floor(Math.cos(oasisAngle) * oasisDistance);
    const oasisZ = Math.floor(Math.sin(oasisAngle) * oasisDistance);
    
    // Create a pond as the oasis
    createPond(voxelWorld, oasisX, oasisZ);
    
    // Surround with some palm trees (regular trees in this case) and rocks
    for (let i = 0; i < 8; i++) {
      const treeAngle = Math.random() * Math.PI * 2;
      const treeDistance = 7 + Math.random() * 8;
      const treeX = Math.floor(oasisX + Math.cos(treeAngle) * treeDistance);
      const treeZ = Math.floor(oasisZ + Math.sin(treeAngle) * treeDistance);
      
      // Plant trees around oasis
      createTree(voxelWorld, treeX, treeZ);
      
      // Add some bushes too
      if (i % 2 === 0) {
        const bushAngle = treeAngle + 0.2;
        const bushDistance = treeDistance - 2;
        const bushX = Math.floor(oasisX + Math.cos(bushAngle) * bushDistance);
        const bushZ = Math.floor(oasisZ + Math.sin(bushAngle) * bushDistance);
        createBush(voxelWorld, bushX, bushZ);
      }
    }
  }
  
  // Create a mountain zone with elevated terrain and rocks
  function createMountainZone(voxelWorld : VoxelWorld, radius: number, startAngle: number, endAngle: number): void {
    const mountainRadius = radius * 0.9;
    
    // Create central mountain range
    const rangeAngle = startAngle + (endAngle - startAngle) * 0.5;
    const rangeDistance = radius * 0.6;
    const rangeCenterX = Math.floor(Math.cos(rangeAngle) * rangeDistance);
    const rangeCenterZ = Math.floor(Math.sin(rangeAngle) * rangeDistance);
    
    // Create a line of rock formations to form a mountain ridge
    const ridgeLength = 60;
    const ridgeDirection = Math.random() * Math.PI;
    
    for (let i = -ridgeLength/2; i < ridgeLength/2; i += 5) {
      const ridgeX = rangeCenterX + Math.floor(Math.cos(ridgeDirection) * i);
      const ridgeZ = rangeCenterZ + Math.floor(Math.sin(ridgeDirection) * i);
      
      // Check if in the right quadrant
      const angle = Math.atan2(ridgeZ, ridgeX);
      const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
      if (normalizedAngle >= startAngle && normalizedAngle < endAngle) {
        // Skip if too close to origin
        const distanceFromOrigin = Math.sqrt(ridgeX * ridgeX + ridgeZ * ridgeZ);
        if (distanceFromOrigin < 30) continue;
        
        // Create rock formations
        createRockFormation(voxelWorld, ridgeX, ridgeZ);
        
        // Add nearby rocks to create a natural-looking ridge
        for (let j = 0; j < 3; j++) {
          const offsetAngle = Math.random() * Math.PI * 2;
          const offsetDistance = 3 + Math.random() * 4;
          const offsetX = Math.floor(ridgeX + Math.cos(offsetAngle) * offsetDistance);
          const offsetZ = Math.floor(ridgeZ + Math.sin(offsetAngle) * offsetDistance);
          createRockFormation(voxelWorld, offsetX, offsetZ);
        }
        
        // Occasionally add pine trees to the mountain
        if (Math.random() > 0.4) {
          const treeOffsetAngle = Math.random() * Math.PI * 2;
          const treeOffsetDistance = 6 + Math.random() * 4;
          const treeX = Math.floor(ridgeX + Math.cos(treeOffsetAngle) * treeOffsetDistance);
          const treeZ = Math.floor(ridgeZ + Math.sin(treeOffsetAngle) * treeOffsetDistance);
          createPineTree(voxelWorld, treeX, treeZ);
        }
      }
    }
    
    // Create scattered rocks throughout the zone
    for (let i = 0; i < 25; i++) {
      const angle = startAngle + Math.random() * (endAngle - startAngle);
      const distance = Math.random() * mountainRadius;
      const x = Math.floor(Math.cos(angle) * distance);
      const z = Math.floor(Math.sin(angle) * distance);
      
      // Skip if too close to origin
      const distanceFromOrigin = Math.sqrt(x * x + z * z);
      if (distanceFromOrigin < 25) continue;
      
      // Create rock or pine tree
      if (Math.random() > 0.6) {
        createRockFormation(voxelWorld, x, z);
      } else {
        createPineTree(voxelWorld, x, z);
      }
    }
    
    // Create a mountain pass - a clear path through part of the ridge
    const passPosition = Math.random() * 0.6 + 0.2; // Position along the ridge (20%-80%)
    const passIndex = Math.floor((ridgeLength * passPosition) - ridgeLength/2);
    const passSize = 15;
    
    for (let i = passIndex - passSize/2; i < passIndex + passSize/2; i += 5) {
      const passX = rangeCenterX + Math.floor(Math.cos(ridgeDirection) * i);
      const passZ = rangeCenterZ + Math.floor(Math.sin(ridgeDirection) * i);
      
      // Add barriers to mark the pass
      const perpAngle = ridgeDirection + Math.PI/2;
      const barrier1X = Math.floor(passX + Math.cos(perpAngle) * 8);
      const barrier1Z = Math.floor(passZ + Math.sin(perpAngle) * 8);
      const barrier2X = Math.floor(passX - Math.cos(perpAngle) * 8);
      const barrier2Z = Math.floor(passZ - Math.sin(perpAngle) * 8);
      
      createBarrier(voxelWorld, barrier1X, barrier1Z);
      createBarrier(voxelWorld, barrier2X, barrier2Z);
    }
  }

  // Create roadways connecting the different quadrants
  function createRoadways(voxelWorld : VoxelWorld, radius: number): void {
    // Create four main roadways from center to each quadrant
    const roadWidth = 8; // Width of the clearings for roads
    
    // Define the cardinal angles
    const angles = [
      Math.PI/4,       // Northeast
      3*Math.PI/4,     // Northwest
      5*Math.PI/4,     // Southwest
      7*Math.PI/4      // Southeast
    ];
    
    // Create each roadway
    for (const angle of angles) {
      // Create barriers to mark road edges at intervals
      for (let distance = 25; distance < radius * 0.85; distance += 20) {
        const roadCenterX = Math.floor(Math.cos(angle) * distance);
        const roadCenterZ = Math.floor(Math.sin(angle) * distance);
        
        const perpAngle = angle + Math.PI/2;
        const barrier1X = Math.floor(roadCenterX + Math.cos(perpAngle) * roadWidth/2);
        const barrier1Z = Math.floor(roadCenterZ + Math.sin(perpAngle) * roadWidth/2);
        const barrier2X = Math.floor(roadCenterX - Math.cos(perpAngle) * roadWidth/2);
        const barrier2Z = Math.floor(roadCenterZ - Math.sin(perpAngle) * roadWidth/2);
        
        createBarrier(voxelWorld, barrier1X, barrier1Z);
        createBarrier(voxelWorld, barrier2X, barrier2Z);
      }
    }
  }
  
  // Create water features throughout the map
  function createWaterFeatures(voxelWorld : VoxelWorld, radius: number): void {
    // Create a winding river through the map
    const riverPointCount = 8;
    const riverPoints: {x: number, z: number}[] = [];
    
    // Generate points for a curving river
    for (let i = 0; i < riverPointCount; i++) {
      const angle = (i / riverPointCount) * Math.PI * 2;
      // River winds through the map avoiding the center
      const distance = radius * (0.3 + 0.2 * Math.sin(angle * 3));
      
      riverPoints.push({
        x: Math.floor(Math.cos(angle) * distance),
        z: Math.floor(Math.sin(angle) * distance)
      });
    }
    
    // Close the loop
    riverPoints.push({...riverPoints[0]});
    
    // Create ponds along the river path
    for (let i = 0; i < riverPointCount; i++) {
      const point = riverPoints[i];
      const nextPoint = riverPoints[(i + 1) % riverPoints.length];
      
      // Skip if too close to origin
      const distanceFromOrigin = Math.sqrt(point.x * point.x + point.z * point.z);
      if (distanceFromOrigin < 30) continue;
      
      // Create a pond at this point
      createPond(voxelWorld, point.x, point.z);
      
      // Sometimes create additional ponds between points
      if (Math.random() > 0.5) {
        const middleX = Math.floor((point.x + nextPoint.x) / 2);
        const middleZ = Math.floor((point.z + nextPoint.z) / 2);
        
        // Check distance from origin for the midpoint too
        const midDistanceFromOrigin = Math.sqrt(middleX * middleX + middleZ * middleZ);
        if (midDistanceFromOrigin > 30) {
          createPond(voxelWorld, middleX, middleZ);
        }
      }
      
      // Add some trees and bushes along the riverbank
      for (let j = 0; j < 3; j++) {
        const bankAngle = Math.random() * Math.PI * 2;
        const bankDistance = 8 + Math.random() * 4;
        const bankX = Math.floor(point.x + Math.cos(bankAngle) * bankDistance);
        const bankZ = Math.floor(point.z + Math.sin(bankAngle) * bankDistance);
        
        // Create either a tree or bush
        if (Math.random() > 0.5) {
          createTree(voxelWorld, bankX, bankZ);
        } else {
          createBush(voxelWorld, bankX, bankZ);
        }
      }
    }
  }