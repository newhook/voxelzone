import * as THREE from 'three';
import { Vehicle, GameObject, InputState } from './types';
import { PhysicsWorld } from './physics';
import { PlayerTank } from './playerTank';
import { EnemyTank } from './enemyTank';
import { createTerrain, createGround, createBoundaryWalls } from './gameObjects';
import { FlyCamera } from './flyCamera';
import { IGameState } from './gameStates';
import { Radar } from './radar';
import { GameStateManager } from './gameStateManager';
import { GameConfig, defaultConfig } from './config';
import { Projectile, ProjectileSource } from './projectile';

export class PlayState implements IGameState {
    private gameStateManager: GameStateManager;
    scene: THREE.Scene;
    physicsWorld: PhysicsWorld;
    private camera: THREE.PerspectiveCamera;
    player!: PlayerTank; // Using definite assignment assertion
    enemies: Vehicle[] = [];
    terrain: GameObject[] = [];
    projectiles: GameObject[] = [];
    score: number = 0;
    gameOver: boolean = false;
    flyCamera: FlyCamera;
    radar: Radar;
    prevWireframeState: boolean = false;
    input?: InputState;
    config: GameConfig;
    
    // Level progression properties
    currentLevel: number = 1;
    baseEnemyCount: number = 10;
    enemiesDefeated: number = 0;
    levelComplete: boolean = false;

    // Add a property to track visible enemies for radar
    private previousEnemyCount: number = 0;

    constructor(gameStateManager: GameStateManager) {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        // Setup game state with configuration
        this.config = {
            ...defaultConfig,
        };

        this.gameStateManager = gameStateManager;
        this.physicsWorld = new PhysicsWorld(this.config);
        this.initializeGameObjects(this.config);

        // Set up camera with increased far plane and narrower FOV for first person view
        this.camera = new THREE.PerspectiveCamera(
            60, // Reduced FOV for more realistic first person view
            window.innerWidth / window.innerHeight,
            0.1,
            2000
        );
        // Initial position will be adjusted by updateCamera, these are just starting values
        this.camera.position.set(0, 1.5, 0);
        this.camera.lookAt(0, 1.5, 10);

        this.flyCamera = new FlyCamera(this.camera);
        this.radar = new Radar();
        // Set sound manager in radar
        const soundManager = this.gameStateManager.initSoundManager();
        this.radar.setSoundManager(soundManager);
        this.radar.hide()

        this.createOrientationGuide(this.scene);

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 2.0); // Doubled from 1.0
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); // Increased from 1.0
        directionalLight.position.set(10, 20, 10);
        this.scene.add(directionalLight);

        // Add a distant point light to simulate moonlight
        const moonLight = new THREE.PointLight(0x7777ff, 1.0, 1000); // Doubled from 0.5
        moonLight.position.set(-150, 300, -150);
        this.scene.add(moonLight);

        // Add camera mode indicator to the UI
        const cameraMode = document.createElement('div');
        cameraMode.id = 'camera-mode';
        cameraMode.textContent = 'CAMERA: TANK MODE';
        cameraMode.style.position = 'absolute';
        cameraMode.style.top = '60px';
        cameraMode.style.left = '10px';
        cameraMode.style.color = '#00ff00';
        cameraMode.style.fontFamily = 'monospace';
        cameraMode.style.fontSize = '20px';
        cameraMode.style.opacity = '0';
        cameraMode.style.transition = 'opacity 0.5s ease-in-out';
        document.body.appendChild(cameraMode);

        // Add coordinate display
        const coordDisplay = document.createElement('div');
        coordDisplay.id = 'coordinates';
        coordDisplay.style.position = 'absolute';
        coordDisplay.style.top = '100px';
        coordDisplay.style.left = '10px';
        coordDisplay.style.color = '#00ff00';
        coordDisplay.style.fontFamily = 'monospace';
        coordDisplay.style.fontSize = '16px';
        coordDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        coordDisplay.style.padding = '5px';
        coordDisplay.style.border = '1px solid #00ff00';
        document.body.appendChild(coordDisplay);

        // Update the coordinate display in the animation loop
        setInterval(() => {
            const position = this.flyCamera.enabled ? this.camera.position : this.player.mesh.position;
            coordDisplay.innerHTML = `Position:<br>X: ${position.x.toFixed(2)}<br>Y: ${position.y.toFixed(2)}<br>Z: ${position.z.toFixed(2)}`;
        }, 100); // Update 10 times per second

        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        });
    }

    private initializeGameObjects(config: GameConfig): void {
        // Create player tank
        this.player = new PlayerTank(this);
        this.scene.add(this.player.mesh);
        this.physicsWorld.addBody(this.player);

        // Create terrain before spawning enemies so we can check for obstacle collisions
        const halfWorldSize = config.worldSize / 2 - 20;
        
        // Create terrain
        const terrainPositions: THREE.Vector3[] = [];
        for (let i = 0; i < config.obstacleCount; i++) {
            let x = 0, z = 0;
            do {
                x = (Math.random() * (halfWorldSize * 2)) - halfWorldSize;
                z = (Math.random() * (halfWorldSize * 2)) - halfWorldSize;
            } while (Math.sqrt(x * x + z * z) < config.minObstacleDistance);
            terrainPositions.push(new THREE.Vector3(x, 0, z));
        }

        const terrain = createTerrain(terrainPositions, this.physicsWorld.world);
        terrain.forEach(obj => {
            this.scene.add(obj.mesh);
            if (obj.body) {
                this.physicsWorld.addBody(obj);
            }
        });

        // Create boundary walls
        const walls = createBoundaryWalls(halfWorldSize, config.wallHeight, config.wallThickness, this.physicsWorld.world);
        walls.forEach(wall => {
            this.scene.add(wall.mesh);
            this.physicsWorld.addBody(wall);
        });

        // Create ground
        const ground = createGround(config.worldSize);
        this.scene.add(ground.mesh);

        this.terrain = [...terrain, ...walls, ground];
        
        // Create base number of enemies for first level after terrain is set up
        // This ensures we can check for obstacle collisions
        for (let i = 0; i < config.baseEnemyCount; i++) {
            let position: THREE.Vector3;
            let attempts = 0;
            const maxAttempts = 100; // Prevent infinite loops
            
            // Try to find a valid spawn position
            do {
                let x = (Math.random() * (halfWorldSize * 2)) - halfWorldSize;
                let z = (Math.random() * (halfWorldSize * 2)) - halfWorldSize;
                position = new THREE.Vector3(x, 0.4, z);
                attempts++;
            } while (!this.isValidSpawnPosition(position) && attempts < maxAttempts);
            
            // If we couldn't find a valid position after max attempts, skip this enemy
            if (attempts >= maxAttempts) {
                console.warn(`Could not find valid spawn position for enemy ${i} after ${maxAttempts} attempts`);
                continue;
            }

            const enemy = new EnemyTank(this, position);
            this.enemies.push(enemy);
            this.scene.add(enemy.mesh);
            this.physicsWorld.addBody(enemy);
        }
    }

    handleInput(input: InputState): void {
        const soundManager = this.gameStateManager.initSoundManager();
        // Only process tank movement controls if not in fly mode
        if (!input.toggleFlyCamera) {
            if (input.forward) {
                this.player.move(1);
                soundManager.startMovementNoise();
            } else {
                soundManager.stopMovementNoise();
            }
            if (input.backward) {
                this.player.move(-1);
            }
            if (input.left) {
                this.player.turn(1);
            }
            if (input.right) {
                this.player.turn(-1);
            }
            
            // Use mouse movement for turret rotation instead of keys
            if (input.mouseDeltaX !== 0) {
                // Convert mouse movement to rotation amount with a sensitivity factor
                const sensitivity = 0.01;
                const rotationAmount = -input.mouseDeltaX * sensitivity;
                this.player.rotateTurret(rotationAmount);
                
                // Reset the delta after using it to prevent continuous rotation
                input.mouseDeltaX = 0;
            }
            
            // Keep keyboard controls as fallback
            if (input.turretLeft) {
                this.player.rotateTurret(1);
            }
            if (input.turretRight) {
                this.player.rotateTurret(-1);
            }
            
            if (input.fire) {
                this.player.fire();
                soundManager.playPlayerShoot();
            }
        }

        // Check if wireframe toggle has been pressed
        if (input.wireframeToggle !== this.prevWireframeState) {
            this.toggleWireframeMode(this.scene, input.wireframeToggle);
            this.prevWireframeState = input.wireframeToggle;
        }
    }

    render(renderer: THREE.WebGLRenderer): void {
        renderer.render(this.scene, this.camera);
        // Render orientation guide if it exists and game has started
        if (this.scene.userData.orientationGuide) {
            const { scene: guideScene, camera: guideCamera } = this.scene.userData.orientationGuide;

            // Update orientation guide to match main camera's rotation
            // This keeps the guide aligned with your current view direction
            const guideHelper = guideScene.children[0] as THREE.AxesHelper;
            if (guideHelper) {
                guideHelper.quaternion.copy(this.camera.quaternion);
            }

            // Set up the viewport for the guide in the bottom-right corner
            const guideSize = Math.min(150, window.innerWidth / 5);
            renderer.setViewport(
                window.innerWidth - guideSize - 10,
                window.innerHeight - guideSize - 10,
                guideSize,
                guideSize
            );
            renderer.setScissor(
                window.innerWidth - guideSize - 10,
                window.innerHeight - guideSize - 10,
                guideSize,
                guideSize
            );
            renderer.setScissorTest(true);

            // Clear depth buffer to ensure guide renders on top
            renderer.clearDepth();

            // Render the guide
            renderer.render(guideScene, guideCamera);

            // Reset viewport and scissor test
            renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
            renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
            renderer.setScissorTest(false);
        }
    }

    update(deltaTime: number): void {
        if (this.gameOver) return;

        this.handleInput(this.input!);

        this.physicsWorld.update(deltaTime);

        // Update player and enemies
        if (this.player.update) {
            this.player.update();
        }

        this.enemies.forEach(enemy => {
            if (enemy.update) {
                enemy.update();
            }
        });

        // Update projectiles
        this.updateProjectiles();

        if (this.flyCamera.enabled) {
            this.flyCamera.update(this.input, deltaTime);
        } else {
            this.updateCamera();
        }
        
        // Update radar and play ping sound only when new enemies appear
        this.radar.update(this.player, this.enemies);
        
        this.previousEnemyCount = this.enemies.length;

        // Check for level completion
        if (!this.levelComplete && this.enemies.length === 0) {
            this.levelComplete = true;
            this.showLevelComplete();
        }
    }

    private toggleWireframeMode(scene: THREE.Scene, isWireframe: boolean) {
        // Create a notification about wireframe mode
        const wireframeNotification = document.createElement('div');
        wireframeNotification.style.position = 'absolute';
        wireframeNotification.style.top = '140px';
        wireframeNotification.style.left = '10px';
        wireframeNotification.style.color = '#00ff00';
        wireframeNotification.style.fontFamily = 'monospace';
        wireframeNotification.style.fontSize = '16px';
        wireframeNotification.style.padding = '5px';
        wireframeNotification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        wireframeNotification.style.border = '1px solid #00ff00';
        wireframeNotification.style.transition = 'opacity 0.5s ease-in-out';
        wireframeNotification.style.opacity = '1';
        wireframeNotification.textContent = isWireframe ? 'WIREFRAME MODE: ON' : 'WIREFRAME MODE: OFF';

        document.body.appendChild(wireframeNotification);

        // Fade out after 2 seconds
        setTimeout(() => {
            wireframeNotification.style.opacity = '0';
            // Remove from DOM after fade out
            setTimeout(() => {
                document.body.removeChild(wireframeNotification);
            }, 500);
        }, 2000);

        // Process the scene to toggle wireframe for all materials
        scene.traverse((object) => {
            if (object instanceof THREE.Mesh && object.material) {
                // Handle array of materials
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => {
                        if (material instanceof THREE.MeshStandardMaterial ||
                            material instanceof THREE.MeshBasicMaterial ||
                            material instanceof THREE.MeshPhongMaterial) {
                            material.wireframe = isWireframe;
                        }
                    });
                }
                // Handle single material
                else if (object.material instanceof THREE.MeshStandardMaterial ||
                    object.material instanceof THREE.MeshBasicMaterial ||
                    object.material instanceof THREE.MeshPhongMaterial) {
                    object.material.wireframe = isWireframe;
                }
            }
        });
    }

    // Update the camera to follow the player in first person view
    private updateCamera() {
        // Get the turret container safely using the getter method
        const turretContainer = this.player.getTurretContainer();
        if (!turretContainer) return;

        // Position camera under the cannon
        const cameraOffset = new THREE.Vector3(0, 1.25, 0); // Slightly below turret height

        // Apply tank's position and rotation
        this.camera.position.copy(this.player.mesh.position).add(cameraOffset);

        // Create forward direction based on tank and turret rotation
        const forward = new THREE.Vector3(0, 0, 1);
        const combinedRotation = new THREE.Quaternion()
            .multiplyQuaternions(this.player.mesh.quaternion, turretContainer.quaternion);
        forward.applyQuaternion(combinedRotation);

        // Look in the direction the turret is facing
        const lookAtPoint = this.camera.position.clone().add(forward.multiplyScalar(10));
        this.camera.lookAt(lookAtPoint);
    }

    private updateProjectiles(): void {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            if (!projectile.body || !projectile.mesh) continue;

            const projectilePos = projectile.body.translation();
            const distanceFromOrigin = Math.sqrt(
                projectilePos.x * projectilePos.x +
                projectilePos.y * projectilePos.y +
                projectilePos.z * projectilePos.z
            );

            if (distanceFromOrigin > 1000) {
                this.removeProjectile(i);
                continue;
            }

            this.checkProjectileCollisions(i, projectile);
        }
    }

    private checkProjectileCollisions(projectileIndex: number, projectile: GameObject): void {
        // Skip if this is not a proper Projectile instance
        if (!(projectile instanceof Projectile)) return;
        
        const projectilePos = projectile.body.translation();
    
        // Check for enemy collisions if it's a player projectile
        if (projectile.source === ProjectileSource.PLAYER) {
          for (let j = this.enemies.length - 1; j >= 0; j--) {
            const enemy = this.enemies[j];
            if (!enemy.body || !enemy.mesh) continue;
    
            const enemyPos = enemy.body.translation();
            const distance = Math.sqrt(
              Math.pow(projectilePos.x - enemyPos.x, 2) +
              Math.pow(projectilePos.y - enemyPos.y, 2) +
              Math.pow(projectilePos.z - enemyPos.z, 2)
            );
    
            if (distance < 2) {
              this.handleEnemyHit(j, enemyPos);
              this.removeProjectile(projectileIndex);
              break;
            }
          }
        } 
        // Check for player collision if it's an enemy projectile
        else if (projectile.source === ProjectileSource.ENEMY) {
          if (!this.player.body || !this.player.mesh) return;
          
          const playerPos = this.player.body.translation();
          const distance = Math.sqrt(
            Math.pow(projectilePos.x - playerPos.x, 2) +
            Math.pow(projectilePos.y - playerPos.y, 2) +
            Math.pow(projectilePos.z - playerPos.z, 2)
          );
          
          if (distance < 2) {
            this.handlePlayerHit();
            this.removeProjectile(projectileIndex);
          }
        }
      }

    private handleEnemyHit(enemyIndex: number, enemyPos: { x: number, y: number, z: number }): void {
        const enemy = this.enemies[enemyIndex];

        const soundManager = this.gameStateManager.initSoundManager();
        // Apply damage and check if enemy is destroyed
        const isAlive = enemy.takeDamage(10);
        
        // Create hit explosion effect
        this.createExplosion(enemyPos);

        soundManager.playHit();

        // Only remove the enemy if it's destroyed
        if (!isAlive) {
          // Remove the enemy from scene
          if (enemy.mesh.parent) {
            enemy.mesh.parent.remove(enemy.mesh);
          }
          
          // Remove from physics world
          if (enemy.body) {
            this.physicsWorld.removeBody(enemy);
          }
          
          // Remove from array
          this.enemies.splice(enemyIndex, 1);
          
          // Add score points for a destroyed enemy
          this.score += 100;
          this.updateScoreDisplay();
        }
      }

    private removeProjectile(index: number): void {
        const projectile = this.projectiles[index];
        if (projectile.mesh.parent) {
            projectile.mesh.parent.remove(projectile.mesh);
        }
        if (projectile.body) {
            // Pass the entire projectile object as it implements GameObject
            this.physicsWorld.removeBody(projectile);
        }
        this.projectiles.splice(index, 1);
    }

    private createExplosion(position: { x: number, y: number, z: number }): void {
        const particleCount = 20;

        for (let i = 0; i < particleCount; i++) {
            const size = 0.2 + Math.random() * 0.3;
            const geometry = new THREE.SphereGeometry(size, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: Math.random() > 0.5 ? 0xff5500 : 0xffaa00,
                transparent: true,
                opacity: 1.0
            });

            const particle = new THREE.Mesh(geometry, material);
            particle.position.set(position.x, position.y, position.z);

            const velocity = new THREE.Vector3(
                Math.random() * 10 - 5,
                Math.random() * 10,
                Math.random() * 10 - 5
            );

            this.scene.add(particle);

            const startTime = Date.now();
            const duration = 500 + Math.random() * 500;

            const animateParticle = () => {
                const elapsed = Date.now() - startTime;
                const progress = elapsed / duration;

                if (progress >= 1) {
                    this.scene.remove(particle);
                    return;
                }

                particle.position.x += velocity.x * 0.02;
                particle.position.y += velocity.y * 0.02 - 0.1 * progress;
                particle.position.z += velocity.z * 0.02;
                material.opacity = 1 - progress;

                requestAnimationFrame(animateParticle);
            };

            animateParticle();
        }
    }

    private updateScoreDisplay(): void {
        const scoreElement = document.getElementById('score');
        if (scoreElement) {
            scoreElement.textContent = `SCORE: ${this.score}`;
        }
    }

    private handlePlayerHit(): void {
        // Flash the player tank to indicate damage and check if destroyed
        const isAlive = this.player.takeDamage(10);
        const soundManager = this.gameStateManager.initSoundManager();
        
        // Create explosion effect at the player's position
        const playerPos = this.player.body.translation();
        this.createExplosion({x: playerPos.x, y: playerPos.y, z: playerPos.z});
        
        // Display health info
        this.showHealthNotification();
        
        soundManager.playHit();
        
        // Check if player is destroyed
        if (!isAlive) {
          this.triggerGameOver();
          return;
        }
        
        // Show hit notification
        const hitNotification = document.createElement('div');
        hitNotification.style.position = 'absolute';
        hitNotification.style.top = '50%';
        hitNotification.style.left = '50%';
        hitNotification.style.transform = 'translate(-50%, -50%)';
        hitNotification.style.color = '#ff0000';
        hitNotification.style.fontFamily = 'monospace';
        hitNotification.style.fontSize = '36px';
        hitNotification.style.padding = '10px';
        hitNotification.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        hitNotification.style.border = '2px solid #ff0000';
        hitNotification.style.transition = 'opacity 0.5s ease-in-out';
        hitNotification.style.opacity = '1';
        hitNotification.style.pointerEvents = 'none'; // Make sure it doesn't block interaction
        hitNotification.style.zIndex = '1000';
        hitNotification.textContent = 'HIT!';
        hitNotification.className = 'game-feedback';
        
        document.body.appendChild(hitNotification);
        
        // Fade out after a short time
        setTimeout(() => {
          hitNotification.style.opacity = '0';
          setTimeout(() => {
            if (hitNotification.parentNode) {
              document.body.removeChild(hitNotification);
            }
          }, 500);
        }, 1000);
        
        // Apply a shake effect to the camera
        this.applyCameraShake();
      }

      private showHealthNotification(): void {
        // Create or update health display
        let healthDisplay = document.getElementById('health-display');
        
        if (!healthDisplay) {
          healthDisplay = document.createElement('div');
          healthDisplay.id = 'health-display';
          healthDisplay.style.position = 'absolute';
          healthDisplay.style.top = '60px';
          healthDisplay.style.right = '20px';
          healthDisplay.style.color = '#00ff00';
          healthDisplay.style.fontFamily = 'monospace';
          healthDisplay.style.fontSize = '20px';
          healthDisplay.style.padding = '5px';
          healthDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
          healthDisplay.style.border = '1px solid #00ff00';
          healthDisplay.style.textAlign = 'center'; // Center the text
          healthDisplay.style.width = '150px'; // Set a fixed width to match the health bar
          
          // Create the health text container
          const healthText = document.createElement('div');
          healthText.id = 'health-text';
          healthText.textContent = `HEALTH: ${Math.max(0, this.player.hitpoints)}/${this.player.maxHitpoints}`;
          healthDisplay.appendChild(healthText);
          
          // Create a container for the health bar
          const healthBarContainer = document.createElement('div');
          healthBarContainer.style.width = '100%'; // Use full width of the parent
          healthBarContainer.style.height = '15px';
          healthBarContainer.style.border = '1px solid #00ff00';
          healthBarContainer.style.marginTop = '5px';
          healthBarContainer.style.position = 'relative';
          
          // Create the health bar itself
          const healthBar = document.createElement('div');
          healthBar.id = 'health-bar';
          healthBar.style.height = '100%';
          healthBar.style.width = '100%';
          healthBar.style.backgroundColor = '#00ff00';
          healthBar.style.transition = 'width 0.3s, background-color 0.3s';
          
          healthBarContainer.appendChild(healthBar);
          healthDisplay.appendChild(healthBarContainer);
          document.body.appendChild(healthDisplay);
        }
        
        // Set color based on health percentage
        const healthPercentage = this.player.hitpoints / this.player.maxHitpoints;
        let healthColor = '#00ff00'; // Green
        
        if (healthPercentage < 0.3) {
          healthColor = '#ff0000'; // Red for critical health
        } else if (healthPercentage < 0.6) {
          healthColor = '#ffff00'; // Yellow for moderate health
        }
        
        healthDisplay.style.color = healthColor;
        healthDisplay.style.borderColor = healthColor;
        
        // Update the health bar
        const healthBar = document.getElementById('health-bar');
        if (healthBar) {
          healthBar.style.width = `${Math.max(0, healthPercentage * 100)}%`;
          healthBar.style.backgroundColor = healthColor;
        }
        
        // Update the health text
        const healthText = document.getElementById('health-text');
        if (healthText) {
          healthText.textContent = `HEALTH: ${Math.max(0, this.player.hitpoints)}/${this.player.maxHitpoints}`;
        }
      }

    private applyCameraShake(): void {
        // Skip shake if in fly camera mode
        if (this.flyCamera.enabled) return;
        
        // Store original camera position
        const originalPosition = this.camera.position.clone();
        
        // Shake parameters
        const shakeIntensity = 0.2;
        const shakeDuration = 500; // ms
        const startTime = Date.now();
        
        // Shake animation function
        const shakeCamera = () => {
          const elapsed = Date.now() - startTime;
          const progress = elapsed / shakeDuration;
          
          if (progress < 1) {
            // Calculate shake offset with decreasing intensity over time
            const intensity = shakeIntensity * (1 - progress);
            const shakeOffset = new THREE.Vector3(
              (Math.random() - 0.5) * 2 * intensity,
              (Math.random() - 0.5) * 2 * intensity,
              (Math.random() - 0.5) * 2 * intensity
            );
            
            // Apply shake offset from original position
            this.camera.position.copy(originalPosition).add(shakeOffset);
            
            // Continue shaking
            requestAnimationFrame(shakeCamera);
          } else {
            // Restore original position
            this.camera.position.copy(originalPosition);
          }
        };
        
        // Start shake animation
        shakeCamera();
      }

    onEnter(): void {
        // Show gameplay UI elements
        const scoreElement = document.getElementById('score');
        const fpsElement = document.getElementById('fps');
        const instructionsElement = document.getElementById('instructions');

        if (scoreElement) scoreElement.style.opacity = '1';
        if (fpsElement) fpsElement.style.opacity = '1';
        if (instructionsElement) {
            instructionsElement.style.display = 'block';
            instructionsElement.style.opacity = '1';
        }

        this.input = this.setupInputHandlers();
        this.radar.show();
        
        // Initialize health display
        this.showHealthNotification();

        const instructions = document.getElementById('instructions');
        if (instructions) {
            instructions.style.opacity = '1';
            // Fade out instructions after 5 seconds
            setTimeout(() => {
                instructions.style.opacity = '0';
            }, 5000);
        }
    }

    onExit(): void {
        // Hide UI elements
        const scoreElement = document.getElementById('score');
        const fpsElement = document.getElementById('fps');
        const instructionsElement = document.getElementById('instructions');
        const coordDisplay = document.getElementById('coordinates');
        const healthDisplay = document.getElementById('health-display');
        
        if (fpsElement) fpsElement.style.opacity = '0';
        if (scoreElement) scoreElement.style.opacity = '0';
        if (instructionsElement) instructionsElement.style.opacity = '0';
        if (coordDisplay) coordDisplay.style.opacity = '0';
        if (healthDisplay) {
            healthDisplay.style.opacity = '0';
            setTimeout(() => {
                if (healthDisplay.parentNode) healthDisplay.parentNode.removeChild(healthDisplay);
            }, 500);
        }
        
        // Hide and reset the radar
        this.radar.hide();
        
        // Handle any cleanup of game visuals
        // Remove any on-screen feedback elements
        const feedbackElements = document.querySelectorAll('.game-feedback');
        feedbackElements.forEach(element => element.remove());
    }
    
    setupInputHandlers(): InputState {
        const input: InputState = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            fire: false,
            toggleFlyCamera: false,
            wireframeToggle: false,
            turretLeft: false,
            turretRight: false,
            mouseX: 0,
            mouseDeltaX: 0
        };
        
        // Key down handler
        const handleKeyDown = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'KeyR':
                    input.wireframeToggle = !input.wireframeToggle;
                    break;
                case 'KeyW':
                    input.forward = true;
                    break;
                case 'ArrowUp':
                    input.forward = true;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    input.backward = true;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    input.left = true;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    input.right = true;
                    break;
                case 'KeyQ':
                    input.turretLeft = true;
                    break;
                case 'KeyE':
                    input.turretRight = true;
                    break;
                case 'Space':
                    input.fire = true;
                    break;
                case 'KeyF':
                    // Toggle fly camera on keydown, not continuous press
                    input.toggleFlyCamera = !input.toggleFlyCamera;
                    break;
            }
        };
        
        // Key up handler
        const handleKeyUp = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'KeyW':
                case 'ArrowUp':
                    input.forward = false;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    input.backward = false;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    input.left = false;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    input.right = false;
                    break;
                case 'KeyQ':
                    input.turretLeft = false;
                    break;
                case 'KeyE':
                    input.turretRight = false;
                    break;
                case 'Space':
                    input.fire = false;
                    break;
                // We don't reset toggleFlyCamera on keyup as it's a toggle state
            }
        };
        
        // Mouse button handlers
        const handleMouseDown = (event: MouseEvent) => {
            if (event.button === 0) { // Left mouse button
                input.fire = true;
            }
        };
        
        const handleMouseUp = (event: MouseEvent) => {
            if (event.button === 0) { // Left mouse button
                input.fire = false;
            }
        };

        // Mouse movement handler
        const handleMouseMove = (event: MouseEvent) => {
            // Calculate delta X (how much the mouse moved horizontally since last frame)
            const deltaX = event.movementX || 0;
            input.mouseDeltaX = deltaX;
            input.mouseX = event.clientX;
        };
        
        // Add event listeners
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('mousemove', handleMouseMove);
        
        return input;
    }

    // Creates a small orientation guide that stays in the corner of the screen
    createOrientationGuide(scene: THREE.Scene): void {
        // Create a separate scene for the orientation guide
        const guideScene = new THREE.Scene();

        // Add axes to the guide
        const axesHelper = new THREE.AxesHelper(10);
        guideScene.add(axesHelper);

        // Add labels
        const createGuideLabel = (text: string, position: THREE.Vector3, color: string) => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 32;

            const context = canvas.getContext('2d');
            if (context) {
                context.fillStyle = 'rgba(0, 0, 0, 0.5)';
                context.fillRect(0, 0, canvas.width, canvas.height);

                context.font = 'bold 20px Arial';
                context.fillStyle = color;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(text, canvas.width / 2, canvas.height / 2);
            }

            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(material);

            sprite.position.copy(position);
            sprite.scale.set(2, 1, 1);

            guideScene.add(sprite);
            return sprite;
        };

        // Add axis labels for the guide
        createGuideLabel('X', new THREE.Vector3(12, 0, 0), '#ff0000');
        createGuideLabel('Y', new THREE.Vector3(0, 12, 0), '#00ff00');
        createGuideLabel('Z', new THREE.Vector3(0, 0, 12), '#0000ff');

        // Create camera for the guide
        const guideCamera = new THREE.PerspectiveCamera(50, 1, 1, 1000);
        guideCamera.position.set(15, 15, 15);
        guideCamera.lookAt(0, 0, 0);

        // Add the guide elements to the main scene
        scene.userData.orientationGuide = {
            scene: guideScene,
            camera: guideCamera
        };
    }

    private triggerGameOver(): void {
        // Set game over state
        this.gameOver = true;
        
        // Create game over screen
        const gameOverScreen = document.createElement('div');
        gameOverScreen.id = 'game-over-screen';
        gameOverScreen.style.position = 'absolute';
        gameOverScreen.style.top = '0';
        gameOverScreen.style.left = '0';
        gameOverScreen.style.width = '100%';
        gameOverScreen.style.height = '100%';
        gameOverScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        gameOverScreen.style.color = '#ff0000';
        gameOverScreen.style.fontFamily = 'monospace';
        gameOverScreen.style.fontSize = '48px';
        gameOverScreen.style.display = 'flex';
        gameOverScreen.style.flexDirection = 'column';
        gameOverScreen.style.justifyContent = 'center';
        gameOverScreen.style.alignItems = 'center';
        gameOverScreen.style.zIndex = '2000';
        gameOverScreen.style.cursor = 'pointer';
        gameOverScreen.innerHTML = `
          <div>GAME OVER</div>
          <div style="font-size: 24px; margin-top: 20px; color: #00ff00;">Final Score: ${this.score}</div>
          <div style="font-size: 20px; margin-top: 40px; color: #ffffff;">Click anywhere to continue</div>
        `;
        
        document.body.appendChild(gameOverScreen);
        
        // Add click event listener to return to marquee screen
        const handleClick = () => {
          // Remove this event listener
          gameOverScreen.removeEventListener('click', handleClick);
          document.removeEventListener('keydown', handleKeydown);
          
          // Fade out game over screen
          gameOverScreen.style.transition = 'opacity 1s ease-out';
          gameOverScreen.style.opacity = '0';
          
          // Remove the game over screen after fade out
          setTimeout(() => {
            if (gameOverScreen.parentNode) {
              gameOverScreen.parentNode.removeChild(gameOverScreen);
            }
            
            // Switch to marquee state
            this.gameStateManager.switchToMarquee();
          }, 1000);
        };
        
        // Also allow pressing any key to continue
        const handleKeydown = () => {
          handleClick();
        };
        
        // Add event listeners after a short delay to prevent accidental clicks
        setTimeout(() => {
          gameOverScreen.addEventListener('click', handleClick);
          document.addEventListener('keydown', handleKeydown);
        }, 1000);
      }

      private showLevelComplete(): void {
        // Create level complete screen
        const levelCompleteScreen = document.createElement('div');
        levelCompleteScreen.id = 'level-complete-screen';
        levelCompleteScreen.style.position = 'absolute';
        levelCompleteScreen.style.top = '0';
        levelCompleteScreen.style.left = '0';
        levelCompleteScreen.style.width = '100%';
        levelCompleteScreen.style.height = '100%';
        levelCompleteScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        levelCompleteScreen.style.color = '#00ff00';
        levelCompleteScreen.style.fontFamily = 'monospace';
        levelCompleteScreen.style.fontSize = '48px';
        levelCompleteScreen.style.display = 'flex';
        levelCompleteScreen.style.flexDirection = 'column';
        levelCompleteScreen.style.justifyContent = 'center';
        levelCompleteScreen.style.alignItems = 'center';
        levelCompleteScreen.style.zIndex = '2000';
        levelCompleteScreen.style.cursor = 'pointer';
        levelCompleteScreen.innerHTML = `
          <div>LEVEL ${this.currentLevel} COMPLETE!</div>
          <div style="font-size: 24px; margin-top: 20px;">Score: ${this.score}</div>
          <div style="font-size: 20px; margin-top: 40px;">Click anywhere to continue to Level ${this.currentLevel + 1}</div>
        `;
        
        document.body.appendChild(levelCompleteScreen);
        
        // Add click event listener to progress to the next level
        const handleClick = () => {
          // Remove event listeners
          levelCompleteScreen.removeEventListener('click', handleClick);
          document.removeEventListener('keydown', handleKeydown);
          
          // Fade out level complete screen
          levelCompleteScreen.style.transition = 'opacity 1s ease-out';
          levelCompleteScreen.style.opacity = '0';
          
          // Remove the screen after fade out and start next level
          setTimeout(() => {
            if (levelCompleteScreen.parentNode) {
              levelCompleteScreen.parentNode.removeChild(levelCompleteScreen);
            }
            
            // Start the next level
            this.startNextLevel();
          }, 1000);
        };
        
        // Also allow pressing any key to continue
        const handleKeydown = () => {
          handleClick();
        };
        
        // Add event listeners after a short delay to prevent accidental clicks
        setTimeout(() => {
          levelCompleteScreen.addEventListener('click', handleClick);
          document.addEventListener('keydown', handleKeydown);
        }, 1000);
      }
    
      private startNextLevel(): void {
        // Increment level
        this.currentLevel++;
        
        // Reset level completion flag
        this.levelComplete = false;
        
        // Increase player max hitpoints and heal
        const newMaxHitpoints = 15 + (this.currentLevel - 1) * this.config.playerHealthBonus;
        this.player.maxHitpoints = newMaxHitpoints;
        this.player.hitpoints = Math.min(this.player.hitpoints + this.config.playerHealAmount, newMaxHitpoints);
        
        // Calculate scaled parameters for enemies based on level
        const levelScaling = {
          count: this.config.baseEnemyCount + (this.currentLevel - 1) * this.config.enemiesPerLevel,
          speedMultiplier: 1 + (this.currentLevel - 1) * (this.config.enemySpeedScale - 1),
          rangeMultiplier: 1 + (this.currentLevel - 1) * (this.config.enemyRangeScale - 1),
          hitpointsMultiplier: 1 + (this.currentLevel - 1) * (this.config.enemyHealthScale - 1)
        };
        
        // Spawn new enemies with scaled parameters
        this.spawnEnemiesForLevel(levelScaling);
        
        // Update UI
        this.showHealthNotification();
        this.showLevelNotification();
      }
    
      private spawnEnemiesForLevel(scaling: { 
        count: number,
        speedMultiplier: number,
        rangeMultiplier: number,
        hitpointsMultiplier: number
      }): void {
        // Clear any remaining enemies (shouldn't be any, but just in case)
        this.enemies.forEach(enemy => {
          if (enemy.mesh.parent) {
            enemy.mesh.parent.remove(enemy.mesh);
          }
          if (enemy.body) {
            this.physicsWorld.removeBody(enemy);
          }
        });
        this.enemies = [];
        
        // Get world bounds from config
        const halfWorldSize = this.config.worldSize / 2 - 20;
        
        // Create new scaled enemies
        for (let i = 0; i < scaling.count; i++) {
          // Try to find a valid spawn position
          let position: THREE.Vector3;
          let attempts = 0;
          const maxAttempts = 100; // Prevent infinite loops
          
          do {
            let x = (Math.random() * (halfWorldSize * 2)) - halfWorldSize;
            let z = (Math.random() * (halfWorldSize * 2)) - halfWorldSize;
            position = new THREE.Vector3(x, 0.4, z);
            attempts++;
            
            // Break the loop if we've tried too many times to avoid freezing the game
            if (attempts >= maxAttempts) {
              console.warn(`Could not find valid spawn position for enemy ${i} after ${maxAttempts} attempts`);
              break;
            }
          } while (!this.isValidSpawnPosition(position));
          
          // Skip this enemy if we couldn't find a valid position
          if (attempts >= maxAttempts) {
            continue;
          }
          
          // Create enemy tank at the position
          const enemy = new EnemyTank(this, position);
          
          // Apply level scaling to enemy properties
          enemy.speed *= scaling.speedMultiplier;
          enemy.detectionRange *= scaling.rangeMultiplier;
          enemy.firingRange *= scaling.rangeMultiplier;
          enemy.hitpoints = Math.floor(10 * scaling.hitpointsMultiplier);
          
          // Add to arrays and scene
          this.enemies.push(enemy);
          this.scene.add(enemy.mesh);
          this.physicsWorld.addBody(enemy);
        }
      }
    
      private showLevelNotification(): void {
        // Create level notification
        const levelNotification = document.createElement('div');
        levelNotification.style.position = 'absolute';
        levelNotification.style.top = '50%';
        levelNotification.style.left = '50%';
        levelNotification.style.transform = 'translate(-50%, -50%)';
        levelNotification.style.color = '#00ff00';
        levelNotification.style.fontFamily = 'monospace';
        levelNotification.style.fontSize = '36px';
        levelNotification.style.padding = '20px';
        levelNotification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        levelNotification.style.border = '2px solid #00ff00';
        levelNotification.style.transition = 'opacity 1s ease-in-out';
        levelNotification.style.opacity = '1';
        levelNotification.style.textAlign = 'center';
        levelNotification.style.zIndex = '1000';
        levelNotification.innerHTML = `
          <div>LEVEL ${this.currentLevel}</div>
          <div style="font-size: 20px; margin-top: 10px;">Enemies: ${this.enemies.length}</div>
        `;
        
        document.body.appendChild(levelNotification);
        
        // Fade out after a few seconds
        setTimeout(() => {
          levelNotification.style.opacity = '0';
          setTimeout(() => {
            if (levelNotification.parentNode) {
              document.body.removeChild(levelNotification);
            }
          }, 1000);
        }, 3000);
      }

      // Helper method to check if a position is valid for spawning an enemy
      private isValidSpawnPosition(position: THREE.Vector3): boolean {
        // Check distance from player (minimum 100 units/meters)
        const distanceToPlayer = position.distanceTo(this.player.mesh.position);
        if (distanceToPlayer < 100) {
          return false;
        }
        
        // Check collision with obstacles
        for (const obstacle of this.terrain) {
          // Skip ground and non-collidable objects
          if (!obstacle.body || obstacle === this.terrain[this.terrain.length - 1]) {
            continue;
          }
          
          const obstaclePos = obstacle.body.translation();
          const obstacleSize = 5; // Approximate size of obstacles
          
          // Simple bounding box collision check
          const distance = Math.sqrt(
            Math.pow(position.x - obstaclePos.x, 2) +
            Math.pow(position.z - obstaclePos.z, 2)
          );
          
          if (distance < obstacleSize + 3) { // Adding 3 units buffer
            return false; // Too close to an obstacle
          }
        }
        
        return true;
      }
}