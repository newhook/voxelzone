import { VoxelMaterial } from './voxel';
import { VoxelWorld } from './voxelWorld';

/**
 * Creates a voxel building at the specified position
 */
export function createBuilding(voxelWorld: VoxelWorld, x: number, z: number): void {
    const groundY = voxelWorld.findSurfaceHeight(x, z);

    // Random building dimensions
    const width = 3 + Math.floor(Math.random() * 4);
    const depth = 3 + Math.floor(Math.random() * 4);
    const height = 3 + Math.floor(Math.random() * 5);

    // Choose a building material
    const materials = [VoxelMaterial.BRICK, VoxelMaterial.CONCRETE, VoxelMaterial.METAL];
    const material = materials[Math.floor(Math.random() * materials.length)];

    // Create the building structure

    // Create walls
    for (let dx = 0; dx < width; dx++) {
        for (let dz = 0; dz < depth; dz++) {
            for (let dy = 0; dy < height; dy++) {
                // Only create voxels for the outer walls
                if (dx === 0 || dx === width - 1 || dz === 0 || dz === depth - 1 || dy === 0 || dy === height - 1) {
                    voxelWorld.setVoxel({
                        x: x + dx,
                        y: groundY + dy,
                        z: z + dz
                    }, material);
                }
            }
        }
    }

    // Randomly add a door
    const doorSide = Math.floor(Math.random() * 4);
    let doorX, doorZ;

    switch (doorSide) {
        case 0: // North wall
            doorX = x + Math.floor(width / 2);
            doorZ = z;
            break;
        case 1: // East wall
            doorX = x + width - 1;
            doorZ = z + Math.floor(depth / 2);
            break;
        case 2: // South wall
            doorX = x + Math.floor(width / 2);
            doorZ = z + depth - 1;
            break;
        case 3: // West wall
            doorX = x;
            doorZ = z + Math.floor(depth / 2);
            break;
    }

    // Create a door (empty space)
    if (doorX !== undefined && doorZ !== undefined) {
        voxelWorld.setVoxel({ x: doorX, y: groundY, z: doorZ }, undefined);
        voxelWorld.setVoxel({ x: doorX, y: groundY + 1, z: doorZ }, undefined);
    }

    // Add windows (randomly)
    const windowCount = Math.floor(Math.random() * 4) + 1;

    for (let i = 0; i < windowCount; i++) {
        // Choose a random wall
        const windowSide = Math.floor(Math.random() * 4);
        let windowX, windowZ;

        switch (windowSide) {
            case 0: // North
                windowX = x + 1 + Math.floor(Math.random() * (width - 2));
                windowZ = z;
                break;
            case 1: // East
                windowX = x + width - 1;
                windowZ = z + 1 + Math.floor(Math.random() * (depth - 2));
                break;
            case 2: // South
                windowX = x + 1 + Math.floor(Math.random() * (width - 2));
                windowZ = z + depth - 1;
                break;
            case 3: // West
                windowX = x;
                windowZ = z + 1 + Math.floor(Math.random() * (depth - 2));
                break;
        }

        if (windowX !== undefined && windowZ !== undefined) {
            // Window height is usually in the middle of the wall
            const windowY = groundY + Math.floor(height / 2);
            voxelWorld.setVoxel({ x: windowX, y: windowY, z: windowZ }, undefined);
        }
    }
}

/**
 * Creates a barrier/barricade at the specified position
 */
export function createBarrier(voxelWorld: VoxelWorld, x: number, z: number): void {
    // Randomly choose between several barrier types
    const barrierType = Math.floor(Math.random() * 4);
    const groundY = voxelWorld.findSurfaceHeight(x, z);

    switch (barrierType) {
        case 0: // Sandbag wall
            createSandbagWall(voxelWorld, x, groundY, z);
            break;
        case 1: // Concrete barriers
            createConcreteBarriers(voxelWorld, x, groundY, z);
            break;
        case 2: // Metal barricade
            createMetalBarricade(voxelWorld, x, groundY, z);
            break;
        case 3: // Wooden fence
            createWoodenFence(voxelWorld, x, groundY, z);
            break;
    }
}

/**
 * Creates a sandbag wall
 */
export function createSandbagWall(voxelWorld: VoxelWorld, x: number, y: number, z: number): void {
    const length = 3 + Math.floor(Math.random() * 5);
    const direction = Math.random() > 0.5 ? 'x' : 'z';

    for (let i = 0; i < length; i++) {
        for (let h = 0; h < 2; h++) { // 2 sandbags high
            if (direction === 'x') {
                voxelWorld.setVoxel({ x: x + i, y: y + h, z }, VoxelMaterial.SAND);
            } else {
                voxelWorld.setVoxel({ x, y: y + h, z: z + i }, VoxelMaterial.SAND);
            }
        }
    }
}

/**
 * Creates concrete barriers
 */
export function createConcreteBarriers(voxelWorld: VoxelWorld, x: number, y: number, z: number): void {
    const length = 3 + Math.floor(Math.random() * 5);
    const direction = Math.random() > 0.5 ? 'x' : 'z';

    for (let i = 0; i < length; i++) {
        if (Math.random() > 0.2) { // 80% chance to place a barrier (creates gaps)
            if (direction === 'x') {
                voxelWorld.setVoxel({ x: x + i, y: y , z }, VoxelMaterial.CONCRETE);
                voxelWorld.setVoxel({ x: x + i, y: y + 1, z }, VoxelMaterial.CONCRETE);
            } else {
                voxelWorld.setVoxel({ x, y: y , z: z + i }, VoxelMaterial.CONCRETE);
                voxelWorld.setVoxel({ x, y: y + 1, z: z + i }, VoxelMaterial.CONCRETE);
            }
        }
    }
}

/**
 * Creates a metal barricade
 */
export function createMetalBarricade(voxelWorld: VoxelWorld, x: number, y: number, z: number): void {
    const length = 3 + Math.floor(Math.random() * 4);
    const direction = Math.random() > 0.5 ? 'x' : 'z';

    for (let i = 0; i < length; i++) {
        if (direction === 'x') {
            voxelWorld.setVoxel({ x: x + i, y: y, z }, VoxelMaterial.METAL);
            // Add vertical supports every few blocks
            if (i % 2 === 0) {
                voxelWorld.setVoxel({ x: x + i, y: y + 1, z }, VoxelMaterial.METAL);
                voxelWorld.setVoxel({ x: x + i, y: y + 2, z }, VoxelMaterial.METAL);
            }
        } else {
            voxelWorld.setVoxel({ x, y: y , z: z + i }, VoxelMaterial.METAL);
            // Add vertical supports every few blocks
            if (i % 2 === 0) {
                voxelWorld.setVoxel({ x, y: y + 1, z: z + i }, VoxelMaterial.METAL);
                voxelWorld.setVoxel({ x, y: y + 2, z: z + i }, VoxelMaterial.METAL);
            }
        }
    }
}

/**
 * Creates a wooden fence
 */
export function createWoodenFence(voxelWorld: VoxelWorld, x: number, y: number, z: number): void {
    const length = 4 + Math.floor(Math.random() * 6);
    const direction = Math.random() > 0.5 ? 'x' : 'z';

    for (let i = 0; i < length; i++) {
        if (direction === 'x') {
            // Fence posts
            if (i % 2 === 0) {
                voxelWorld.setVoxel({ x: x + i, y: y , z }, VoxelMaterial.WOOD);
                voxelWorld.setVoxel({ x: x + i, y: y + 1, z }, VoxelMaterial.WOOD);
            }
            // Horizontal beam
            voxelWorld.setVoxel({ x: x + i, y: y + 1, z }, VoxelMaterial.WOOD);
        } else {
            // Fence posts
            if (i % 2 === 0) {
                voxelWorld.setVoxel({ x, y: y , z: z + i }, VoxelMaterial.WOOD);
                voxelWorld.setVoxel({ x, y: y + 1, z: z + i }, VoxelMaterial.WOOD);
            }
            // Horizontal beam
            voxelWorld.setVoxel({ x, y: y + 1, z: z + i }, VoxelMaterial.WOOD);
        }
    }
}

/**
 * Creates a central fortress structure
 */
export function createFortress(voxelWorld: VoxelWorld, x: number, z: number): void {
    const groundY = voxelWorld.findSurfaceHeight(x, z);
    // Main fortress parameters
    const size = 10;
    const wallHeight = 6;

    // Create the outer walls
    for (let dx = 0; dx < size; dx++) {
        for (let dz = 0; dz < size; dz++) {
            // Only place voxels on the perimeter
            if (dx === 0 || dx === size - 1 || dz === 0 || dz === size - 1) {
                for (let dy = 0; dy < wallHeight; dy++) {
                    voxelWorld.setVoxel({
                        x: x + dx - Math.floor(size / 2),
                        y: groundY + dy,
                        z: z + dz - Math.floor(size / 2)
                    }, VoxelMaterial.STONE);
                }
            }
        }
    }

    // Create towers at each corner
    const towerHeight = wallHeight + 2;
    const corners = [
        { dx: 0, dz: 0 },
        { dx: 0, dz: size - 1 },
        { dx: size - 1, dz: 0 },
        { dx: size - 1, dz: size - 1 }
    ];

    corners.forEach(corner => {
        for (let dy = 0; dy < towerHeight; dy++) {
            // 2x2 tower at each corner
            for (let tx = 0; tx < 2; tx++) {
                for (let tz = 0; tz < 2; tz++) {
                    voxelWorld.setVoxel({
                        x: x + corner.dx + (corner.dx === 0 ? -tx : tx) - Math.floor(size / 2),
                        y: groundY + dy,
                        z: z + corner.dz + (corner.dz === 0 ? -tz : tz) - Math.floor(size / 2)
                    }, VoxelMaterial.STONE);
                }
            }
        }

        // Add battlements on top of towers
        for (let tx = -1; tx <= 2; tx++) {
            for (let tz = -1; tz <= 2; tz++) {
                if ((tx === -1 || tx === 2) || (tz === -1 || tz === 2)) {
                    if ((tx === -1 || tx === 2) && (tz === -1 || tz === 2)) {
                        // Skip diagonal corners
                        continue;
                    }

                    voxelWorld.setVoxel({
                        x: x + corner.dx + (corner.dx === 0 ? tx : tx) - Math.floor(size / 2),
                        y: groundY + towerHeight,
                        z: z + corner.dz + (corner.dz === 0 ? tz : tz) - Math.floor(size / 2)
                    }, VoxelMaterial.STONE);
                }
            }
        }
    });

    // Create entrance (gate)
    const entranceSide = Math.floor(Math.random() * 4);
    let entranceX, entranceZ;

    switch (entranceSide) {
        case 0: // North wall
            entranceX = x;
            entranceZ = z - Math.floor(size / 2);

            // Create opening
            for (let dy = 1; dy <= 3; dy++) {
                voxelWorld.setVoxel({ x: entranceX, y: groundY + dy, z: entranceZ }, undefined);
                voxelWorld.setVoxel({ x: entranceX + 1, y: groundY + dy, z: entranceZ }, undefined);
            }
            break;

        case 1: // East wall
            entranceX = x + Math.floor(size / 2);
            entranceZ = z;

            // Create opening
            for (let dy = 1; dy <= 3; dy++) {
                voxelWorld.setVoxel({ x: entranceX, y: groundY + dy, z: entranceZ }, undefined);
                voxelWorld.setVoxel({ x: entranceX, y: groundY + dy, z: entranceZ + 1 }, undefined);
            }
            break;

        case 2: // South wall
            entranceX = x;
            entranceZ = z + Math.floor(size / 2);

            // Create opening
            for (let dy = 1; dy <= 3; dy++) {
                voxelWorld.setVoxel({ x: entranceX, y: groundY + dy, z: entranceZ }, undefined);
                voxelWorld.setVoxel({ x: entranceX + 1, y: groundY + dy, z: entranceZ }, undefined);
            }
            break;

        case 3: // West wall
            entranceX = x - Math.floor(size / 2);
            entranceZ = z;

            // Create opening
            for (let dy = 1; dy <= 3; dy++) {
                voxelWorld.setVoxel({ x: entranceX, y: groundY + dy, z: entranceZ }, undefined);
                voxelWorld.setVoxel({ x: entranceX, y: groundY + dy, z: entranceZ + 1 }, undefined);
            }
            break;
    }
}

/**
 * Creates a tree at the specified position
 */
export function createTree(voxelWorld: VoxelWorld, x: number, z: number): void {
    // Find proper ground height
    const groundY = voxelWorld.findSurfaceHeight(x, z);
    
    // Randomize tree height
    const trunkHeight = 4 + Math.floor(Math.random() * 3);
    const leafRadius = 2 + Math.floor(Math.random() * 2);
    
    // Create trunk
    for (let dy = 0; dy < trunkHeight; dy++) {
        voxelWorld.setVoxel({
            x,
            y: groundY + dy,
            z
        }, VoxelMaterial.WOOD);
    }
    
    // Create leaves in a roughly spherical shape
    for (let dx = -leafRadius; dx <= leafRadius; dx++) {
        for (let dy = -1; dy <= leafRadius + 1; dy++) {
            for (let dz = -leafRadius; dz <= leafRadius; dz++) {
                // Create a spherical-ish shape by checking distance from center
                const distanceSquared = dx * dx + dy * dy + dz * dz;
                if (distanceSquared <= leafRadius * leafRadius + 1) {
                    // Place leaf block
                    voxelWorld.setVoxel({
                        x: x + dx,
                        y: groundY + trunkHeight + dy,
                        z: z + dz
                    }, VoxelMaterial.LEAVES);
                }
            }
        }
    }
    
    // Ensure trunk can still be seen by removing some leaves in the center
    voxelWorld.setVoxel({
        x,
        y: groundY + trunkHeight,
        z
    }, VoxelMaterial.WOOD);
}

/**
 * Creates a pine tree (conical) at the specified position
 */
export function createPineTree(voxelWorld: VoxelWorld, x: number, z: number): void {
    // Find proper ground height
    const groundY = voxelWorld.findSurfaceHeight(x, z);
    
    // Randomize tree height
    const trunkHeight = 5 + Math.floor(Math.random() * 4);
    const baseLeafRadius = 3;
    
    // Create trunk
    for (let dy = 0; dy < trunkHeight; dy++) {
        voxelWorld.setVoxel({
            x,
            y: groundY + dy,
            z
        }, VoxelMaterial.WOOD);
    }
    
    // Create a conical leaf arrangement
    for (let dy = 0; dy < trunkHeight - 1; dy++) {
        // Leaves get smaller as we go up (conical shape)
        const layerRadius = Math.max(1, Math.floor(baseLeafRadius * (1 - dy / trunkHeight)));
        
        // Only place leaves on the upper two-thirds of the tree
        if (dy > trunkHeight / 3) {
            for (let dx = -layerRadius; dx <= layerRadius; dx++) {
                for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                    // Create a circular cross-section by checking distance from center
                    const distanceSquared = dx * dx + dz * dz;
                    if (distanceSquared <= layerRadius * layerRadius) {
                        voxelWorld.setVoxel({
                            x: x + dx,
                            y: groundY + trunkHeight - dy,
                            z: z + dz
                        }, VoxelMaterial.LEAVES);
                    }
                }
            }
        }
    }
    
    // Add the top of the tree (a single leaf block)
    voxelWorld.setVoxel({
        x,
        y: groundY + trunkHeight + 1,
        z
    }, VoxelMaterial.LEAVES);
}

/**
 * Creates a bush at the specified position
 */
export function createBush(voxelWorld: VoxelWorld, x: number, z: number): void {
    // Find proper ground height
    const groundY = voxelWorld.findSurfaceHeight(x, z);
    
    // Random bush size
    const radius = 1 + Math.floor(Math.random() * 2);
    
    // Create a roughly spherical bush
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = 0; dy <= radius; dy++) {
            for (let dz = -radius; dz <= radius; dz++) {
                // Spherical shape
                const distanceSquared = dx * dx + dy * dy + dz * dz;
                if (distanceSquared <= radius * radius) {
                    // Random gaps to make it look less uniform
                    if (Math.random() > 0.3) {
                        voxelWorld.setVoxel({
                            x: x + dx,
                            y: groundY + dy,
                            z: z + dz
                        }, VoxelMaterial.LEAVES);
                    }
                }
            }
        }
    }
}

/**
 * Creates a rock formation at the specified position
 */
export function createRockFormation(voxelWorld: VoxelWorld, x: number, z: number): void {
    // Find proper ground height
    const groundY = voxelWorld.findSurfaceHeight(x, z);
    
    // Random rock size
    const size = 1 + Math.floor(Math.random() * 3);
    
    // Create a roughly rounded rock formation
    for (let dx = -size; dx <= size; dx++) {
        for (let dy = 0; dy <= size; dy++) {
            for (let dz = -size; dz <= size; dz++) {
                // Make a rounded shape by checking distance from center
                const distanceSquared = dx * dx + dy * dy + dz * dz;
                if (distanceSquared <= size * size + 1) {
                    // Add some randomness to make it look more natural
                    if (Math.random() > 0.2) {
                        voxelWorld.setVoxel({
                            x: x + dx,
                            y: groundY + dy,
                            z: z + dz
                        }, VoxelMaterial.STONE);
                    }
                }
            }
        }
    }
}

/**
 * Creates a cactus at the specified position
 */
export function createCactus(voxelWorld: VoxelWorld, x: number, z: number): void {
    // Find proper ground height
    const groundY = voxelWorld.findSurfaceHeight(x, z);
    
    // Create the main stem
    const height = 3 + Math.floor(Math.random() * 3);
    
    for (let dy = 0; dy < height; dy++) {
        voxelWorld.setVoxel({
            x,
            y: groundY + dy,
            z
        }, VoxelMaterial.GRASS); // Using green material for cactus
    }
    
    // Maybe add a branch or two
    if (Math.random() > 0.4) {
        const branchHeight = 1 + Math.floor(Math.random() * (height - 2));
        const branchDirection = Math.floor(Math.random() * 4);
        let branchX = x;
        let branchZ = z;
        
        switch (branchDirection) {
            case 0: branchX += 1; break;
            case 1: branchX -= 1; break;
            case 2: branchZ += 1; break;
            case 3: branchZ -= 1; break;
        }
        
        // Create the branch
        for (let dy = 0; dy < 2; dy++) {
            voxelWorld.setVoxel({
                x: branchX,
                y: groundY + branchHeight + dy,
                z: branchZ
            }, VoxelMaterial.GRASS);
        }
    }
}

/**
 * Creates a small pond of water at the specified position
 */
export function createPond(voxelWorld: VoxelWorld, x: number, z: number): void {
    // Find proper ground height
    const groundY = voxelWorld.findSurfaceHeight(x, z);
    
    // Create a small pond with random shape
    const radius = 2 + Math.floor(Math.random() * 3);
    
    // Dig out the pond and fill with water
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            // Create a somewhat circular pond
            const distanceSquared = dx * dx + dz * dz;
            if (distanceSquared <= radius * radius) {
                // Clear existing blocks and place water
                voxelWorld.setVoxel({
                    x: x + dx,
                    y: groundY,
                    z: z + dz
                }, undefined);
                
                voxelWorld.setVoxel({
                    x: x + dx,
                    y: groundY - 1,
                    z: z + dz
                }, VoxelMaterial.WATER);
                
                // Add sand around the edges
                if (distanceSquared > (radius - 1) * (radius - 1)) {
                    voxelWorld.setVoxel({
                        x: x + dx,
                        y: groundY,
                        z: z + dz
                    }, VoxelMaterial.SAND);
                }
            }
        }
    }
}