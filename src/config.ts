export interface GameConfig {
    worldSize: number;
    enemyCount: number;
    obstacleCount: number;
    minObstacleDistance: number;
    minEnemyDistance: number;
    wallHeight: number;
    wallThickness: number;
    // Level progression parameters
    baseEnemyCount: number;       // Starting number of enemies at level 1
    enemiesPerLevel: number;      // Additional enemies per level
    enemySpeedScale: number;      // Speed multiplier per level (e.g., 1.05 = 5% increase)
    enemyRangeScale: number;      // Range multiplier per level (e.g., 1.05 = 5% increase)
    enemyHealthScale: number;     // Health multiplier per level (e.g., 1.2 = 20% increase)
    playerHealthBonus: number;    // Health points added to player's max health per level
    playerHealAmount: number;     // Amount to heal player between levels
    // Voxel world configuration
    voxelChunkSize: number;       // Size of voxel world in chunks (total is 2*size x 2*size)
    voxelTreeDensity: number;     // Chance of tree generation per chunk (0-1)
}
export const defaultConfig: GameConfig = {
    worldSize: 500,
    enemyCount: 20,
    obstacleCount: 100,
    minObstacleDistance: 10,
    minEnemyDistance: 100,
    wallHeight: 8,
    wallThickness: 2,
    // Level progression defaults
    baseEnemyCount: 10,
    enemiesPerLevel: 5,
    enemySpeedScale: 1.05,
    enemyRangeScale: 1.05,
    enemyHealthScale: 1.2,
    playerHealthBonus: 10,
    playerHealAmount: 10,
    // Voxel world defaults
    voxelChunkSize: 4,           // 4 chunks in each direction (8x8 chunks total)
    voxelTreeDensity: 0.2        // 20% chance of tree per chunk
};