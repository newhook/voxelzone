import { Vehicle } from './types';
import { SoundManager } from './soundManager';
import * as THREE from 'three';

export class Radar {
    private element!: HTMLElement; // Using definite assignment assertion
    private maxDistance: number = 200;
    private radarRadius: number = 100;
    private trackedEnemies: Map<Vehicle, HTMLElement> = new Map(); // Track enemies and their corresponding blip elements
    private soundManager?: SoundManager;

    constructor() {
        // Check if radar already exists before creating a new one
        const existingRadar = document.getElementById('radar');
        if (existingRadar) {
            this.element = existingRadar as HTMLElement;
        } else {
            this.setupRadarElement();
        }
        this.setupStyles();
    }

    // Set sound manager reference
    setSoundManager(soundManager: SoundManager): void {
        this.soundManager = soundManager;
    }

    private setupRadarElement() {
        // Create radar container
        this.element = document.createElement('div');
        this.element.id = 'radar';

        // Add player indicator
        const playerIndicator = document.createElement('div');
        playerIndicator.className = 'player-indicator';
        this.element.appendChild(playerIndicator);

        // Add sweep line
        const sweepLine = document.createElement('div');
        sweepLine.className = 'radar-sweep';
        this.element.appendChild(sweepLine);

        // Add to document
        document.body.appendChild(this.element);
    }

    private setupStyles() {
        // Create style element if it doesn't exist
        let style = document.getElementById('radar-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'radar-styles';
            document.head.appendChild(style);
        }

        // Add radar styles
        style.textContent = `
            #radar {
                position: absolute;
                bottom: 20px;
                right: 20px;
                width: 200px;
                height: 200px;
                background-color: rgba(0, 0, 0, 0.5);
                border: 2px solid #00ff00;
                border-radius: 50%;
                overflow: hidden;
            }
            .radar-sweep {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 50%;
                height: 2px;
                background-color: #00ff00;
                transform-origin: left center;
                animation: radar-sweep 4s infinite linear;
            }
            .radar-blip {
                position: absolute;
                width: 8px;
                height: 8px;
                background-color: #ff0000;
                border-radius: 50%;
                transform: translate(-50%, -50%);
                box-shadow: 0 0 4px 2px rgba(255, 0, 0, 0.5);
            }
            .player-indicator {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 10px;
                height: 10px;
                background-color: #00ff00;
                border-radius: 50%;
                transform: translate(-50%, -50%);
                box-shadow: 0 0 4px 2px rgba(0, 255, 0, 0.5);
            }
            @keyframes radar-sweep {
                from {
                    transform: rotate(0deg);
                }
                to {
                    transform: rotate(360deg);
                }
            }
        `;
    }

    hide() : void {
        this.element.style.display = 'none';

        // Clear all tracked enemies when hiding the radar
        this.clearAllBlips();
        this.trackedEnemies.clear();
    }

    show() : void {
        this.element.style.display = 'block';
    }

    update(player: Vehicle, enemies: Vehicle[]) {
        // Get player position
        const playerPos = player.mesh.position;
        
        // Track which enemies are now visible
        const currentlyVisibleEnemies = new Set<Vehicle>();
        let newEnemiesDetected = false;
        
        // Add or update blips for each enemy in range
        enemies.forEach(enemy => {
            // Calculate relative position in world coordinates
            const relativeX = enemy.mesh.position.x - playerPos.x;
            const relativeZ = enemy.mesh.position.z - playerPos.z;
            
            // Calculate distance
            const distance = Math.sqrt(relativeX * relativeX + relativeZ * relativeZ);
            
            // Skip enemies that are beyond the max distance
            if (distance > this.maxDistance) {
                // If this enemy was previously tracked, we need to remove it
                if (this.trackedEnemies.has(enemy)) {
                    const blip = this.trackedEnemies.get(enemy)!;
                    blip.remove();
                    this.trackedEnemies.delete(enemy);
                }
                return;
            }
            
            // Mark this enemy as currently visible
            currentlyVisibleEnemies.add(enemy);
            
            // Check if this enemy is already being tracked
            if (!this.trackedEnemies.has(enemy)) {
                // This is a new enemy in radar range
                newEnemiesDetected = true;
                
                // Create blip element
                const blip = document.createElement('div');
                blip.className = 'radar-blip';
                this.element.appendChild(blip);
                
                // Add to tracked enemies
                this.trackedEnemies.set(enemy, blip);
            }
            
            // Get the blip element (either existing or newly created)
            const blip = this.trackedEnemies.get(enemy)!;
            
            // Get player's rotation quaternion
            const playerQuat = player.mesh.quaternion;
            
            // Create a vector representing the direction to the enemy in XZ plane
            const worldDirectionToEnemy = new THREE.Vector3(relativeX, 0, relativeZ);
            
            // Convert world direction to player-local direction by applying inverse of player rotation
            const inversePlayerQuat = playerQuat.clone().invert();
            const localDirectionToEnemy = worldDirectionToEnemy.clone().applyQuaternion(inversePlayerQuat);
            
            // Extract the X and Z components for 2D radar display
            const localX = localDirectionToEnemy.x;
            const localZ = localDirectionToEnemy.z;
            
            // Scale distance for radar (using the original world distance)
            const scaledDistance = distance * (this.radarRadius / this.maxDistance);
            
            // Calculate 2D distance and angle in local space
            const localDistance2D = Math.sqrt(localX * localX + localZ * localZ);
            if (localDistance2D === 0) return; // Avoid division by zero
            
            const normalizedX = localX / localDistance2D;
            const normalizedZ = localZ / localDistance2D;
            
            // Calculate radar position
            // Forward is top of radar (negative Z in local tank space)
            // Right is right side of radar (positive X in local tank space)
            // NOTE: We need to negate the X coordinate to correct left-right swapping
            const radarX = this.radarRadius - normalizedX * scaledDistance;
            const radarY = this.radarRadius - normalizedZ * scaledDistance;
            
            blip.style.left = `${radarX}px`;
            blip.style.top = `${radarY}px`;
            
            // Update distance-based opacity
            const opacity = 1 - (distance / this.maxDistance);
            blip.style.opacity = Math.max(0.3, opacity).toString();
        });
        
        // Remove blips for enemies that are no longer visible
        this.trackedEnemies.forEach((blip, enemy) => {
            if (!currentlyVisibleEnemies.has(enemy)) {
                blip.remove();
                this.trackedEnemies.delete(enemy);
            }
        });
        
        // Play radar ping sound only when new enemies are detected
        if (newEnemiesDetected && this.soundManager) {
            this.soundManager.playRadarPing();
        }
    }
    
    private clearAllBlips(): void {
        this.trackedEnemies.forEach((blip) => {
            blip.remove();
        });
    }
}