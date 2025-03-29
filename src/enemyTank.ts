import * as THREE from 'three';
import { Tank } from './tank';
import { PlayState } from './playState';
import { Projectile, ProjectileSource } from './projectile';

export class EnemyTank extends Tank {
  targetPosition: THREE.Vector3 | null = null;
  detectionRange: number;
  firingRange: number;
  lastAIUpdate: number = 0;
  aiUpdateInterval: number = 500;
  patrolRadius: number = 50;  // How far the tank will patrol from its current position
  minPatrolDistance: number = 20; // Minimum distance to move for patrol
  arrivalThreshold: number = 5; // How close we need to get to consider reaching patrol point

  // New properties for line of sight mechanics
  playerLastKnownPosition: THREE.Vector3 | null = null;
  hasLineOfSight: boolean = false;
  trackingPlayer: boolean = false;

  // New properties for varied targeting
  accuracy: number = 0.8; // Base accuracy (0-1), will be randomized per tank
  maxInaccuracy: number = 0.12; // Maximum inaccuracy in radians (about 7 degrees)

  constructor(playState: PlayState, position: THREE.Vector3) {
    super(playState, position, 0xff0000); // Call base class constructor with red color

    // Enemy-specific properties
    this.speed = 100;  // Slower than player
    this.turnSpeed = 2;  // Increased from 1 to 2 to compensate for the lower base turn speed
    this.detectionRange = 500;
    this.firingRange = 30;
    this.hitpoints = 10; // Enemies have fewer hitpoints than the player

    // Randomize accuracy for each tank to create variety
    // Some tanks will be more accurate than others
    this.accuracy = 0.7 + Math.random() * 0.25; // Between 0.7 and 0.95
  }

  calculateTurnDirection(forward: THREE.Vector3, targetDirection: THREE.Vector3): number {
    const cross = new THREE.Vector3().crossVectors(forward, targetDirection);
    return Math.sign(cross.y);
  }

  handleMovement(targetPosition: THREE.Vector3, tankPosition: THREE.Vector3): void {
    // Get current forward direction
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);

    // Calculate direction to target
    const directionToTarget = new THREE.Vector3().subVectors(targetPosition, tankPosition).normalize();

    // Calculate angle to target
    const angleToTarget = forward.angleTo(directionToTarget);

    // Get turn direction (1 for left, -1 for right)
    const turnDirection = this.calculateTurnDirection(forward, directionToTarget);

    // First rotate to face the target
    if (Math.abs(angleToTarget) > 0.1) {
      // Turn either 1 or -1 based on which direction is shorter
      this.turn(turnDirection);
    } else {
      // Only move forward when properly aligned
      this.move(1);
    }
  }

  generateNewPatrolPoint(): void {
    const currentPos = this.mesh.position;
    const angle = Math.random() * Math.PI * 2;
    const distance = this.minPatrolDistance + Math.random() * (this.patrolRadius - this.minPatrolDistance);

    this.targetPosition = new THREE.Vector3(
      currentPos.x + Math.sin(angle) * distance,
      0.4, // Keep Y position constant
      currentPos.z + Math.cos(angle) * distance
    );
  }

  handlePatrol(): void {
    if (!this.targetPosition) {
      this.generateNewPatrolPoint();
      return;
    }

    const tankPosition = this.mesh.position;
    const distanceToTarget = tankPosition.distanceTo(this.targetPosition);

    // If we've reached the target, generate a new one
    if (distanceToTarget < this.arrivalThreshold) {
      this.generateNewPatrolPoint();
      return;
    }

    // Handle movement to patrol point
    this.handleMovement(this.targetPosition, tankPosition);
  }

  // Check if player is in line of sight (front 180 degrees and no obstacles)
  checkLineOfSight(playerPosition: THREE.Vector3, tankPosition: THREE.Vector3): boolean {
    // Get current forward direction
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);

    // Calculate direction to player
    const directionToPlayer = new THREE.Vector3().subVectors(playerPosition, tankPosition).normalize();

    // Calculate angle to player
    const angleToPlayer = forward.angleTo(directionToPlayer);

    // Check if player is in front 180 degrees (PI/2 on each side)
    if (angleToPlayer > Math.PI / 2) {
      return false; // Player is behind the tank
    }

    // Check for obstacles using raycasting
    const distanceToPlayer = tankPosition.distanceTo(playerPosition);
    
    // First, check voxel collisions using the voxel world raycast function
    // Slightly raise origin to simulate "eyes" position
    const tankEyePosition = tankPosition.clone().add(new THREE.Vector3(0, 0.8, 0));
    
    // Add a tiny offset to ensure we're not starting inside a voxel
    // and cast the ray directly toward the player's position
    const raycastDirection = new THREE.Vector3().subVectors(
      // Target player's center mass rather than feet position
      playerPosition.clone().add(new THREE.Vector3(0, 0.8, 0)),
      tankEyePosition
    ).normalize();
    
    const voxelRaycastResult = this.state.voxelWorld.raycast(
      tankEyePosition, 
      raycastDirection,
      distanceToPlayer
    );
    
    // If we hit a voxel before reaching the player, line of sight is blocked
    if (voxelRaycastResult.voxel !== null) {
      // Debug point - we're hitting a voxel
      return false;
    }
    
    // If no voxels are blocking, perform standard THREE.js raycasting for other objects
    const ray = new THREE.Raycaster(
      tankEyePosition,
      raycastDirection,
      0,
      distanceToPlayer
    );

    // Get all obstacles (terrain objects) to check for collisions
    const obstacles = this.state.terrain.filter(obj =>
      // Exclude the ground itself from obstacle checks
      obj !== this.state.terrain[this.state.terrain.length - 1] &&
      obj.mesh instanceof THREE.Mesh
    );

    // Convert obstacles to meshes for raycasting
    const obstacleMeshes = obstacles.map(obj => obj.mesh);

    // Perform raycast
    const intersections = ray.intersectObjects(obstacleMeshes, false);

    // If there are intersections, the line of sight is blocked
    return intersections.length === 0;
  }

  update(delta: number): void {
    super.update(delta);

    const currentTime = Date.now();
    const timeSinceLastUpdate = currentTime - this.lastAIUpdate;

    const playerPosition = this.state.player.mesh.position;
    const tankPosition = this.mesh.position;

    // Calculate distance to player
    const distanceToPlayer = playerPosition.distanceTo(tankPosition);

    // Check if player is within detection range
    if (distanceToPlayer < this.detectionRange) {
      // Check if we have line of sight to the player
      this.hasLineOfSight = this.checkLineOfSight(playerPosition, tankPosition);

      if (this.hasLineOfSight) {
        // console.log("Player in line of sight");
        // We can see the player, update the last known position
        this.playerLastKnownPosition = playerPosition.clone();
        this.trackingPlayer = true;

        // Engage with player directly
        this.handleMovement(playerPosition, tankPosition);
      } else if (this.trackingPlayer && this.playerLastKnownPosition) {
        // We've lost sight but were tracking - move to last known position
        const distanceToLastKnown = tankPosition.distanceTo(this.playerLastKnownPosition);

        if (distanceToLastKnown < this.arrivalThreshold) {
          // We've reached the last known position but player isn't visible
          // Resume patrol behavior
          this.trackingPlayer = false;
          this.playerLastKnownPosition = null;
          this.targetPosition = null; // Will generate new patrol point
          this.handlePatrol();
        } else {
          // Move to last known position
          this.handleMovement(this.playerLastKnownPosition, tankPosition);
        }
      } else {
        // Player in range but not visible and not tracking - continue patrol
        this.handlePatrol();
      }
    } else {
      // Player out of detection range - reset tracking and patrol
      if (this.trackingPlayer) {
        this.trackingPlayer = false;
        this.playerLastKnownPosition = null;
        this.targetPosition = null; // Will generate new patrol point
      }

      // Continue standard patrol behavior
      this.handlePatrol();
    }

    // Update AI behavior at fixed intervals
    if (timeSinceLastUpdate >= this.aiUpdateInterval) {
      // Only check to fire if we have line of sight to the player
      if (this.hasLineOfSight) {
        this.checkAndFireAtPlayer();
      }

      this.lastAIUpdate = currentTime;
    }
  }

  checkAndFireAtPlayer(): void {
    const playerPosition = this.state.player.mesh.position;
    const tankPosition = this.mesh.position;

    const distanceToPlayer = playerPosition.distanceTo(tankPosition);

    if (distanceToPlayer < this.firingRange) {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
      const directionToPlayer = new THREE.Vector3()
        .subVectors(playerPosition, tankPosition)
        .normalize();

      const angleToPlayer = forward.angleTo(directionToPlayer);

      if (Math.abs(angleToPlayer) < Math.PI / 8) {
        this.fire();
      }
    }
  }

  // Override the fire method to add inaccuracy
  fire(): void {
    if (!this.canFire) return;

    // Calculate the cannon tip position in world space
    const cannonWorldPosition = new THREE.Vector3();
    this.cannonMesh.getWorldPosition(cannonWorldPosition);

    // Calculate forward direction based on turret's rotation
    const forward = new THREE.Vector3(0, 0, 1);
    const turretWorldQuaternion = new THREE.Quaternion();
    this.turretContainer.getWorldQuaternion(turretWorldQuaternion);
    forward.applyQuaternion(turretWorldQuaternion);
    forward.normalize();

    // Only add inaccuracy to enemy tanks (not the player)
    // Calculate distance-based accuracy reduction
    const playerPosition = this.state.player.mesh.position;
    const distanceToPlayer = cannonWorldPosition.distanceTo(playerPosition);
    const normalizedDistance = Math.min(distanceToPlayer / this.firingRange, 1);

    // As distance increases, accuracy decreases
    const distanceFactor = 1 - (normalizedDistance * 0.5);
    const effectiveAccuracy = this.accuracy * distanceFactor;

    // Calculate inaccuracy in radians
    const inaccuracy = (1 - effectiveAccuracy) * this.maxInaccuracy;

    // Add random deviation to firing direction
    const deviation = new THREE.Euler(
      (Math.random() - 0.5) * inaccuracy,  // Pitch
      (Math.random() - 0.5) * inaccuracy,  // Yaw
      0                                    // No roll
    );

    // Apply deviation to forward direction
    forward.applyEuler(deviation);

    // Position the projectile at the tip of the cannon
    const cannonTip = cannonWorldPosition.clone().add(forward.clone().multiplyScalar(1.5));

    // Get tank's current velocity to add to projectile
    const tankVel = this.body.linvel();
    const initialVelocity = new THREE.Vector3(tankVel.x, tankVel.y, tankVel.z);

    // Create new projectile using the Projectile class with modified direction
    const projectile = new Projectile(
      this.state,
      cannonTip,
      forward.clone(),
      initialVelocity,
      ProjectileSource.ENEMY
    );

    // Add to physics world
    this.state.physicsWorld.addBody(projectile);

    // Add projectile to PlayState's projectiles array
    this.state.projectiles.push(projectile);

    // Set cooldown
    this.canFire = false;
    this.lastFired = Date.now();
    setTimeout(() => {
      this.canFire = true;
    }, 500); // 500ms cooldown between shots
  }

  // Override takeDamage to add visual feedback specific to enemy tanks
  takeDamage(amount: number = 10): boolean {
    const isAlive = super.takeDamage(amount);

    // If the tank is destroyed, show more dramatic effects
    if (!isAlive) {
      // Create smoke particles for a damaged tank
      this.createDamageEffect();
    }

    return isAlive;
  }

  private createDamageEffect(): void {
    // Create smoke particles at the tank position
    const particleCount = 15;
    const tankPosition = this.mesh.position.clone();

    for (let i = 0; i < particleCount; i++) {
      const size = 0.3 + Math.random() * 0.4;
      const geometry = new THREE.SphereGeometry(size, 8, 8);
      const material = new THREE.MeshBasicMaterial({
        color: 0x333333,
        transparent: true,
        opacity: 0.7
      });

      const particle = new THREE.Mesh(geometry, material);
      particle.position.set(
        tankPosition.x + (Math.random() * 2 - 1),
        tankPosition.y + Math.random() * 2,
        tankPosition.z + (Math.random() * 2 - 1)
      );

      // Add particle to scene
      this.state.scene.add(particle);

      // Animate the smoke particle
      const startTime = Date.now();
      const duration = 1000 + Math.random() * 1000;

      // Create upward drift motion
      const drift = new THREE.Vector3(
        Math.random() * 0.5 - 0.25,
        Math.random() * 0.5 + 0.5, // Mostly upward
        Math.random() * 0.5 - 0.25
      );

      const animateParticle = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;

        if (progress >= 1) {
          this.state.scene.remove(particle);
          return;
        }

        // Drift upward and expand slightly
        particle.position.add(drift.clone().multiplyScalar(0.03));
        particle.scale.multiplyScalar(1.01);

        // Fade out
        material.opacity = 0.7 * (1 - progress);

        requestAnimationFrame(animateParticle);
      };

      animateParticle();
    }
  }
}