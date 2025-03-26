import { VoxelMaterial } from './voxel';
import { VoxelWorld } from './voxelWorld';

/**
 * Creates a voxel building at the specified position
 */
export function createBuilding(voxelWorld: VoxelWorld, x: number, y: number, z: number): void {
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
                        y: y + dy + 1, // +1 to start above ground level
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
        voxelWorld.setVoxel({ x: doorX, y: y + 1, z: doorZ }, undefined);
        voxelWorld.setVoxel({ x: doorX, y: y + 2, z: doorZ }, undefined);
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
            const windowY = y + Math.floor(height / 2);
            voxelWorld.setVoxel({ x: windowX, y: windowY, z: windowZ }, undefined);
        }
    }
}

/**
 * Creates a barrier/barricade at the specified position
 */
export function createBarrier(voxelWorld: VoxelWorld, x: number, y: number, z: number): void {
    // Randomly choose between several barrier types
    const barrierType = Math.floor(Math.random() * 4);

    switch (barrierType) {
        case 0: // Sandbag wall
            createSandbagWall(voxelWorld, x, y, z);
            break;
        case 1: // Concrete barriers
            createConcreteBarriers(voxelWorld, x, y, z);
            break;
        case 2: // Metal barricade
            createMetalBarricade(voxelWorld, x, y, z);
            break;
        case 3: // Wooden fence
            createWoodenFence(voxelWorld, x, y, z);
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
                voxelWorld.setVoxel({ x: x + i, y: y + h + 1, z }, VoxelMaterial.SAND);
            } else {
                voxelWorld.setVoxel({ x, y: y + h + 1, z: z + i }, VoxelMaterial.SAND);
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
                voxelWorld.setVoxel({ x: x + i, y: y + 1, z }, VoxelMaterial.CONCRETE);
                voxelWorld.setVoxel({ x: x + i, y: y + 2, z }, VoxelMaterial.CONCRETE);
            } else {
                voxelWorld.setVoxel({ x, y: y + 1, z: z + i }, VoxelMaterial.CONCRETE);
                voxelWorld.setVoxel({ x, y: y + 2, z: z + i }, VoxelMaterial.CONCRETE);
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
            voxelWorld.setVoxel({ x: x + i, y: y + 1, z }, VoxelMaterial.METAL);
            // Add vertical supports every few blocks
            if (i % 2 === 0) {
                voxelWorld.setVoxel({ x: x + i, y: y + 2, z }, VoxelMaterial.METAL);
                voxelWorld.setVoxel({ x: x + i, y: y + 3, z }, VoxelMaterial.METAL);
            }
        } else {
            voxelWorld.setVoxel({ x, y: y + 1, z: z + i }, VoxelMaterial.METAL);
            // Add vertical supports every few blocks
            if (i % 2 === 0) {
                voxelWorld.setVoxel({ x, y: y + 2, z: z + i }, VoxelMaterial.METAL);
                voxelWorld.setVoxel({ x, y: y + 3, z: z + i }, VoxelMaterial.METAL);
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
                voxelWorld.setVoxel({ x: x + i, y: y + 1, z }, VoxelMaterial.WOOD);
                voxelWorld.setVoxel({ x: x + i, y: y + 2, z }, VoxelMaterial.WOOD);
            }
            // Horizontal beam
            voxelWorld.setVoxel({ x: x + i, y: y + 2, z }, VoxelMaterial.WOOD);
        } else {
            // Fence posts
            if (i % 2 === 0) {
                voxelWorld.setVoxel({ x, y: y + 1, z: z + i }, VoxelMaterial.WOOD);
                voxelWorld.setVoxel({ x, y: y + 2, z: z + i }, VoxelMaterial.WOOD);
            }
            // Horizontal beam
            voxelWorld.setVoxel({ x, y: y + 2, z: z + i }, VoxelMaterial.WOOD);
        }
    }
}

/**
 * Creates a central fortress structure
 */
export function createFortress(voxelWorld: VoxelWorld, x: number, y: number, z: number): void {
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
                        y: y + dy + 1,
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
                        y: y + dy + 1,
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
                        y: y + towerHeight + 1,
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
                voxelWorld.setVoxel({ x: entranceX, y: y + dy, z: entranceZ }, undefined);
                voxelWorld.setVoxel({ x: entranceX + 1, y: y + dy, z: entranceZ }, undefined);
            }
            break;

        case 1: // East wall
            entranceX = x + Math.floor(size / 2);
            entranceZ = z;

            // Create opening
            for (let dy = 1; dy <= 3; dy++) {
                voxelWorld.setVoxel({ x: entranceX, y: y + dy, z: entranceZ }, undefined);
                voxelWorld.setVoxel({ x: entranceX, y: y + dy, z: entranceZ + 1 }, undefined);
            }
            break;

        case 2: // South wall
            entranceX = x;
            entranceZ = z + Math.floor(size / 2);

            // Create opening
            for (let dy = 1; dy <= 3; dy++) {
                voxelWorld.setVoxel({ x: entranceX, y: y + dy, z: entranceZ }, undefined);
                voxelWorld.setVoxel({ x: entranceX + 1, y: y + dy, z: entranceZ }, undefined);
            }
            break;

        case 3: // West wall
            entranceX = x - Math.floor(size / 2);
            entranceZ = z;

            // Create opening
            for (let dy = 1; dy <= 3; dy++) {
                voxelWorld.setVoxel({ x: entranceX, y: y + dy, z: entranceZ }, undefined);
                voxelWorld.setVoxel({ x: entranceX, y: y + dy, z: entranceZ + 1 }, undefined);
            }
            break;
    }

    // Create central building
    const innerSize = 5;
    const innerX = x - Math.floor(innerSize / 2);
    const innerZ = z - Math.floor(innerSize / 2);

    for (let dx = 0; dx < innerSize; dx++) {
        for (let dz = 0; dz < innerSize; dz++) {
            if (dx === 0 || dx === innerSize - 1 || dz === 0 || dz === innerSize - 1) {
                for (let dy = 0; dy < 4; dy++) {
                    voxelWorld.setVoxel({
                        x: innerX + dx,
                        y: y + dy + 1,
                        z: innerZ + dz
                    }, VoxelMaterial.BRICK);
                }
            }
        }
    }

    // Add roof to central building
    for (let dx = -1; dx <= innerSize; dx++) {
        for (let dz = -1; dz <= innerSize; dz++) {
            voxelWorld.setVoxel({
                x: innerX + dx,
                y: y + 5,
                z: innerZ + dz
            }, VoxelMaterial.METAL);
        }
    }

    // Add a door to the central building
    const innerEntranceX = innerX + Math.floor(innerSize / 2);
    const innerEntranceZ = innerZ;

    voxelWorld.setVoxel({ x: innerEntranceX, y: y + 1, z: innerEntranceZ }, undefined);
    voxelWorld.setVoxel({ x: innerEntranceX, y: y + 2, z: innerEntranceZ }, undefined);
}