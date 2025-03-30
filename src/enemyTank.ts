import * as THREE from 'three';
import { Tank } from './tank';
import { PlayState } from './playState';
import { Projectile, ProjectileSource } from './projectile';
import { voxelToWorld } from './voxel';

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

  // Properties for obstacle avoidance
  private avoidanceDirection: THREE.Vector3 | null = null;
  private avoidanceTimer: number = 0;
  private stuckDetectionTime: number = 1000; // Time to consider tank as stuck (ms)
  private lastPosition: THREE.Vector3 = new THREE.Vector3();
  private stuckCheckInterval: number = 500; // Check if stuck every 500ms
  private lastStuckCheck: number = 0;
  private isStuck: boolean = false;
  private obstacleAvoidanceTime: number = 2000; // Time to maintain avoidance direction (ms)

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
    
    // Initialize position tracking for stuck detection
    this.lastPosition.copy(position);
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
      
      // Also move forward a little bit while turning to prevent getting stuck
      if (angleToTarget < Math.PI / 2) { // Only if we're facing somewhat toward target
        this.move(0.4); // Reduced forward thrust while turning
      }
    } else {
      // Only move forward when properly aligned - at full speed
      this.move(1);
      
      // Check if we need to apply a small correction to the angle
      if (angleToTarget > 0.02) {
        this.turn(turnDirection * 0.5); // Gentle correction
      }
    }
    
    // Wake up the physics body to ensure it responds
    this.body.wakeUp();
  }

  // Significantly improved generateNewPatrolPoint that avoids known obstacles
  // and prioritizes accessible locations
  generateNewPatrolPoint(): void {
    const currentPos = this.mesh.position;
    const maxAttempts = 16; // Increased attempt count for better results
    
    // Track all candidate points with their scores
    const candidates: Array<{
      point: THREE.Vector3;
      score: number;
      pathClearance: number;
    }> = [];
    
    // Try multiple directions to find good patrol points
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      // Use a weighted distribution - favor middle distances over extremely close or far
      // This helps avoid both getting stuck in tight spots and choosing unreachable distant points
      const distanceFactor = Math.pow(Math.random(), 0.7); // Bias toward mid-range
      const distance = this.minPatrolDistance + distanceFactor * (this.patrolRadius - this.minPatrolDistance);
      
      // Choose angle with some bias toward forward direction for more natural movement
      let angle;
      if (Math.random() > 0.3) {
        // 70% of the time, choose a point generally ahead of the tank
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
        const forwardAngle = Math.atan2(forward.x, forward.z);
        angle = forwardAngle + (Math.random() - 0.5) * Math.PI; // +/- 90 degrees
      } else {
        // 30% of the time, choose a completely random direction
        angle = Math.random() * Math.PI * 2;
      }
      
      const potentialTarget = new THREE.Vector3(
        currentPos.x + Math.sin(angle) * distance,
        0.4, // Keep Y position constant
        currentPos.z + Math.cos(angle) * distance
      );
      
      // Check if there's a clear path to this destination
      const directionToTarget = new THREE.Vector3()
        .subVectors(potentialTarget, currentPos)
        .normalize();
      
      // Perform a more detailed check for obstacles
      const pathDistance = Math.min(distance, 20); // Don't check the entire path for very long distances
      
      // If the potential target is inside a voxel or too close to an obstacle, skip it
      const targetDistToObstacle = this.checkPointClearance(potentialTarget);
      if (targetDistToObstacle < 3) {
        continue; // Skip this candidate - it's inside or too close to an obstacle
      }
      
      // Check for direct path obstruction
      const hasDirectObstacle = this.hasObstacleInDirection(directionToTarget, pathDistance);
      
      // Calculate path clearance (max distance to obstacles along path)
      const pathClearance = hasDirectObstacle ? 0 : this.getPathClearance(currentPos, potentialTarget);
      
      // Calculate a score for this candidate point
      let score = 0;
      
      // Base score is related to the distance - prefer points that aren't too close or too far
      const normalizedDistance = (distance - this.minPatrolDistance) / (this.patrolRadius - this.minPatrolDistance);
      const distanceScore = 1 - Math.abs(normalizedDistance - 0.5) * 2; // Peak at middle distances
      score += distanceScore * 20;
      
      // Higher score for points with clear paths
      score += pathClearance * 10;
      
      // Bonus for points that are in open areas (away from obstacles)
      score += targetDistToObstacle * 5;
      
      // Big penalty if there's a direct obstacle
      if (hasDirectObstacle) {
        score -= 50;
      }
      
      // Add to candidates
      candidates.push({
        point: potentialTarget,
        score: score,
        pathClearance: pathClearance
      });
    }
    
    // Sort candidates by score
    candidates.sort((a, b) => b.score - a.score);
    
    // If we have any candidates with decent paths, use the best one
    if (candidates.length > 0 && candidates[0].score > -20) {
      this.targetPosition = candidates[0].point;
      return;
    }
    
    // If all attempts fail, choose a closer destination as fallback
    // This helps the tank navigate in very cluttered environments
    const fallbackDistance = this.minPatrolDistance * 0.7;
    const fallbackAngle = Math.random() * Math.PI * 2;
    
    this.targetPosition = new THREE.Vector3(
      currentPos.x + Math.sin(fallbackAngle) * fallbackDistance,
      0.4,
      currentPos.z + Math.cos(fallbackAngle) * fallbackDistance
    );
  }
  
  // Helper method to check if a point has enough clearance (not inside obstacles)
  private checkPointClearance(point: THREE.Vector3): number {
    // Check in multiple directions from this point to find closest obstacle
    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0.7, 0, 0.7),
      new THREE.Vector3(0.7, 0, -0.7),
      new THREE.Vector3(-0.7, 0, 0.7),
      new THREE.Vector3(-0.7, 0, -0.7)
    ];
    
    // Start position for checking should be slightly above ground
    const checkPoint = point.clone().add(new THREE.Vector3(0, 0.8, 0));
    
    let minDistance = 20; // Max check distance
    
    // Check all directions
    for (const dir of directions) {
      // Check voxels
      const voxelResult = this.state.voxelWorld.raycast(checkPoint, dir, 8);
      if (voxelResult.voxel !== null) {
        const pos = voxelToWorld(voxelResult.voxel);
        const dist = checkPoint.distanceTo(pos);
        minDistance = Math.min(minDistance, dist);
      }
      
      // Check other obstacles
      const ray = new THREE.Raycaster(checkPoint, dir, 0, 8);
      
      // Get obstacle meshes
      const obstacles = this.state.terrain.filter(obj =>
        obj !== this.state.terrain[this.state.terrain.length - 1] && // Exclude ground
        obj.mesh instanceof THREE.Mesh
      );
      
      const obstacleMeshes = obstacles.map(obj => obj.mesh);
      const hits = ray.intersectObjects(obstacleMeshes, false);
      
      if (hits.length > 0) {
        minDistance = Math.min(minDistance, hits[0].distance);
      }
    }
    
    return minDistance;
  }
  
  // Helper to check path clearance by sampling points along the path
  private getPathClearance(start: THREE.Vector3, end: THREE.Vector3): number {
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const distance = start.distanceTo(end);
    
    // Sample several points along the path
    const samples = 5;
    let minClearance = Infinity;
    
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      const samplePoint = new THREE.Vector3().addVectors(
        start,
        direction.clone().multiplyScalar(distance * t)
      );
      
      // Check clearance at this point
      const clearance = this.checkPointClearance(samplePoint);
      minClearance = Math.min(minClearance, clearance);
    }
    
    return minClearance;
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

    // Check for obstacles in the path to target
    const directionToTarget = new THREE.Vector3()
      .subVectors(this.targetPosition, tankPosition)
      .normalize();
    
    // If there's an obstacle and we're not already avoiding
    if (this.hasObstacleInDirection(directionToTarget, Math.min(15, distanceToTarget)) && 
        !this.isStuck && Date.now() > this.avoidanceTimer) {
      
      // Start obstacle avoidance
      this.isStuck = true;
      this.avoidanceDirection = null;
      this.avoidanceTimer = Date.now() + this.obstacleAvoidanceTime;
      return;
    }

    // Handle normal movement to patrol point
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
    
    // Check if we're stuck every few frames
    if (currentTime - this.lastStuckCheck > this.stuckCheckInterval) {
      this.isStuck = this.checkIfStuck();
      this.lastPosition.copy(this.mesh.position);
      this.lastStuckCheck = currentTime;
      
      // If we're stuck, start avoidance behavior
      if (this.isStuck) {
        this.avoidanceDirection = null; // Force finding a new direction
        this.avoidanceTimer = currentTime + this.obstacleAvoidanceTime;
      }
    }
    
    const playerPosition = this.state.player.mesh.position;
    const tankPosition = this.mesh.position;

    // Calculate distance to player
    const distanceToPlayer = playerPosition.distanceTo(tankPosition);

    // Check if we're persistently stuck and need more drastic measures
    if (this.isPersistentlyStuck()) {
      // Try a recovery maneuver to get unstuck
      this.attemptRecoveryManeuver();
    }
    // If we're stuck, prioritize obstacle avoidance over normal behavior
    else if (this.isStuck || Date.now() < this.avoidanceTimer) {
      this.handleAvoidance();
      
      // Still update player detection and line of sight
      this.hasLineOfSight = distanceToPlayer < this.detectionRange ? 
        this.checkLineOfSight(playerPosition, tankPosition) : false;
      
      if (this.hasLineOfSight) {
        this.playerLastKnownPosition = playerPosition.clone();
        this.trackingPlayer = true;
      }
    }
    // Normal behavior when not avoiding obstacles
    else {
      // Check if player is within detection range
      if (distanceToPlayer < this.detectionRange) {
        // Check if we have line of sight to the player
        this.hasLineOfSight = this.checkLineOfSight(playerPosition, tankPosition);

        if (this.hasLineOfSight) {
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
            // Check if path to last known position is blocked
            if (this.isPathToPlayerBlocked()) {
              // Path is blocked, activate avoidance behavior
              this.isStuck = true;
              this.avoidanceDirection = null;
              this.avoidanceTimer = Date.now() + this.obstacleAvoidanceTime;
              this.handleAvoidance();
            } else {
              // Move to last known position
              this.handleMovement(this.playerLastKnownPosition, tankPosition);
            }
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

  // Enhanced method to check if the tank is stuck by comparing current position with last recorded position
  private checkIfStuck(): boolean {
    const currentPos = this.mesh.position;
    const distanceMoved = currentPos.distanceTo(this.lastPosition);
    
    // If we've barely moved since last check, we might be stuck
    // Also check if we're trying to move - a stationary tank shouldn't be considered stuck
    const isMoving = this.body.linvel().x !== 0 || this.body.linvel().z !== 0;
    return isMoving && distanceMoved < 0.5;
  }
  
  // Enhanced method to find the best direction to avoid obstacles
  private findAvoidanceDirection(): THREE.Vector3 {
    const currentForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
    const tankPosition = this.mesh.position;
    
    // If we're tracking a player, try to find a path that eventually leads back to the player
    let targetPosition = null;
    if (this.trackingPlayer && this.playerLastKnownPosition) {
      targetPosition = this.playerLastKnownPosition;
    } else if (this.targetPosition) {
      targetPosition = this.targetPosition;
    }
    
    // If we have a target, try to find a way around obstacles toward it
    if (targetPosition) {
      // Cast rays at various angles to find the clearest path
      // Use finer-grained angle increments for more accurate path finding
      const angleIncrement = Math.PI / 16; // 11.25 degrees between rays for finer detection
      const maxAngle = Math.PI * 1.5; // Check a wider 270 degrees to consider more options
      
      // Track best direction and its score
      let bestDirection = null;
      let bestScore = -Infinity;
      
      // Check multiple angles on each side
      for (let angle = -maxAngle/2; angle <= maxAngle/2; angle += angleIncrement) {
        // Create a rotation for this test angle
        const testEuler = new THREE.Euler(0, angle, 0);
        const testDirection = currentForward.clone().applyEuler(testEuler);
        
        // Cast ray to see how far we can go in this direction
        const distance = this.getDistanceToObstacle(testDirection);
        
        // Get angle between this ray and direction to target
        const dirToTarget = new THREE.Vector3().subVectors(targetPosition, tankPosition).normalize();
        const angleToTarget = testDirection.angleTo(dirToTarget);
        
        // Score this direction based on distance and alignment with target direction
        // Prefer directions with more clearance and generally toward the target
        // Increased weight on distance to prioritize open paths
        const alignmentFactor = 1 - (angleToTarget / Math.PI); // 1 = perfect alignment, 0 = opposite direction
        
        // Calculate base score with higher emphasis on distance
        let score = distance * (0.7 + 0.3 * alignmentFactor);
        
        // Bonus for directions that are very open (have clear paths)
        if (distance > 15) {
          score *= 1.5;
        }
        
        // Slight penalty for directions that are completely opposite to target
        // to prevent ping-ponging behavior
        if (angleToTarget > Math.PI * 0.75) {
          score *= 0.8;
        }
        
        // Update best direction if this one is better
        if (score > bestScore) {
          bestScore = score;
          bestDirection = testDirection;
        }
      }
      
      // If we found a good direction, use it
      if (bestDirection) {
        return bestDirection;
      }
    }
    
    // Fallback with improved variation and more options
    // Try several directions and use raycasting to find a clear path
    const directions = [
      new THREE.Euler(0, Math.PI/8, 0),     // 22.5° right
      new THREE.Euler(0, -Math.PI/8, 0),    // 22.5° left
      new THREE.Euler(0, Math.PI/4, 0),     // 45° right
      new THREE.Euler(0, -Math.PI/4, 0),    // 45° left
      new THREE.Euler(0, Math.PI/3, 0),     // 60° right
      new THREE.Euler(0, -Math.PI/3, 0),    // 60° left
      new THREE.Euler(0, Math.PI/2, 0),     // 90° right
      new THREE.Euler(0, -Math.PI/2, 0),    // 90° left
      new THREE.Euler(0, 2*Math.PI/3, 0),   // 120° right
      new THREE.Euler(0, -2*Math.PI/3, 0),  // 120° left
      new THREE.Euler(0, 3*Math.PI/4, 0),   // 135° right
      new THREE.Euler(0, -3*Math.PI/4, 0),  // 135° left
      new THREE.Euler(0, Math.PI, 0)        // 180° (turn around)
    ];
    
    // Shuffle directions for randomness
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }
    
    // Track the best direction based on distance to obstacle
    let bestDirection = null;
    let maxDistance = 0;
    
    // Find the direction with the greatest clearance
    for (const direction of directions) {
      const testDirection = currentForward.clone().applyEuler(direction);
      
      // Get distance to obstacle in this direction
      const distance = this.getDistanceToObstacle(testDirection);
      
      // If this is the clearest path so far, remember it
      if (distance > maxDistance) {
        maxDistance = distance;
        bestDirection = testDirection;
        
        // If we found a very clear path, use it immediately
        if (distance > 15) {
          return testDirection;
        }
      }
    }
    
    // Return the best direction we found, or random if all are blocked
    if (bestDirection && maxDistance > 2) {
      return bestDirection;
    } else {
      // Complete blockage - choose a random direction as last resort
      const randomIndex = Math.floor(Math.random() * directions.length);
      return currentForward.clone().applyEuler(directions[randomIndex]);
    }
  }
  
  // Enhanced method to get distance to nearest obstacle in a direction
  private getDistanceToObstacle(direction: THREE.Vector3): number {
    // Start position for rays is slightly above tank center to avoid hitting self
    const tankPosition = this.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    const maxDistance = 25; // Increased max distance check to see further ahead
    
    // Create a "cone" of rays to better detect obstacles near the path
    // Main ray in center plus additional rays spread out by small angles
    const rays = [
      { direction: direction.clone(), weight: 1.0 },  // Center ray with full weight
    ];
    
    // Add rays with slight offsets to detect obstacles that might be just off-center
    // This helps prevent the tank from grazing the corners of obstacles
    const spreadAngle = Math.PI / 24; // 7.5 degree spread
    
    // Create 4 additional rays at slight angles from the main direction
    for (let i = 0; i < 4; i++) {
      // Alternate between left/right and increasing angles
      const angle = ((i % 2) === 0 ? 1 : -1) * spreadAngle * (Math.floor(i/2) + 1);
      const euler = new THREE.Euler(0, angle, 0);
      const offsetDir = direction.clone().applyEuler(euler).normalize();
      
      // Add ray with reduced weight based on how far from center it is
      rays.push({
        direction: offsetDir,
        weight: 0.7 - (Math.floor(i/2) * 0.2) // Weight decreases with angle
      });
    }
    
    // Track minimum weighted distance across all rays
    let minWeightedDistance = maxDistance;
    
    // Process each ray to find obstacles
    for (const ray of rays) {
      let rayDistance = maxDistance;
      
      // Check voxels first
      const voxelResult = this.state.voxelWorld.raycast(
        tankPosition, 
        ray.direction,
        maxDistance
      );
      
      if (voxelResult.voxel !== null) {
        const pos = voxelToWorld(voxelResult.voxel);
        // Calculate distance to hit point
        rayDistance = Math.min(rayDistance, tankPosition.distanceTo(pos));
      }
      
      // Then check terrain objects
      const raycaster = new THREE.Raycaster(
        tankPosition,
        ray.direction,
        0,
        maxDistance
      );
      
      // Get terrain objects for collision check
      const obstacles = this.state.terrain.filter(obj =>
        obj !== this.state.terrain[this.state.terrain.length - 1] && // Exclude ground
        obj.mesh instanceof THREE.Mesh
      );
      
      // Also check enemy tanks to avoid collisions with other tanks
      const otherTanks = this.state.enemies.filter(tank => tank !== this);
      const tankMeshes = otherTanks.map(tank => tank.mesh);
      
      // Combine all obstacle meshes
      const obstacleMeshes = [...obstacles.map(obj => obj.mesh), ...tankMeshes];
      
      // Perform raycast against all obstacles
      const hits = raycaster.intersectObjects(obstacleMeshes, false);
      
      if (hits.length > 0) {
        rayDistance = Math.min(rayDistance, hits[0].distance);
      }
      
      // Apply weight and track minimum weighted distance
      const weightedDistance = rayDistance * ray.weight;
      if (weightedDistance < minWeightedDistance) {
        minWeightedDistance = weightedDistance;
      }
    }
    
    // Return the minimum weighted distance across all rays
    // Adjust for weights to normalize the result
    return minWeightedDistance / 0.7; // Normalize by the minimum weight
  }
  
  // Enhanced method to handle obstacle avoidance movement
  private handleAvoidance(): void {
    const currentTime = Date.now();
    
    // If still stuck for too long, try more drastic measures
    if (this.isStuck && (currentTime - this.lastStuckCheck > this.stuckDetectionTime * 2)) {
      // Attempt the recovery maneuver (back up and turn)
      this.attemptRecoveryManeuver();
      return;
    }
    
    // If no avoidance direction is set, find a new one
    if (!this.avoidanceDirection) {
      this.avoidanceDirection = this.findAvoidanceDirection();
      this.avoidanceTimer = currentTime + this.obstacleAvoidanceTime;
    }
    // If timer expired, check if we need a new direction
    else if (currentTime > this.avoidanceTimer) {
      // Check if we're still making progress
      if (this.isStuck) {
        // We're still stuck - try a different direction
        this.avoidanceDirection = this.findAvoidanceDirection();
        // Extend avoidance time to give more time for this new direction
        this.avoidanceTimer = currentTime + this.obstacleAvoidanceTime;
      } else {
        // We're making progress, consider ending avoidance if path is clear
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
        const clearPath = this.getDistanceToObstacle(forward) > 10;
        
        // If path ahead is clear, we can exit avoidance mode
        if (clearPath) {
          this.isStuck = false;
          this.avoidanceDirection = null;
          return;
        } else {
          // Path still not clear, continue with current direction
          this.avoidanceTimer = currentTime + this.obstacleAvoidanceTime / 2;
        }
      }
    }
    
    // Make sure we have a valid avoidance direction
    if (!this.avoidanceDirection) {
      this.avoidanceDirection = this.findAvoidanceDirection();
      this.avoidanceTimer = currentTime + this.obstacleAvoidanceTime;
    }
    
    // Get current forward direction
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
    
    // Calculate turn direction to reach avoidance direction
    const turnDirection = this.calculateTurnDirection(forward, this.avoidanceDirection);
    
    // Calculate angle to the avoidance direction
    const angleToTarget = forward.angleTo(this.avoidanceDirection);
    
    // Adaptive movement based on angle to target and distance to obstacles
    if (Math.abs(angleToTarget) > 0.2) {
      // Sharper turn needed - turn faster with reduced forward motion
      this.turn(turnDirection * 1.5); // Increased turn force for faster rotation
      
      // Only move forward if somewhat facing the target direction and path is clear
      if (angleToTarget < Math.PI / 2) {
        // Check if there's an obstacle directly ahead
        const forwardDistance = this.getDistanceToObstacle(forward);
        
        if (forwardDistance > 2.0) {
          // Path is clear enough to move slowly while turning
          this.move(0.2);
        } else if (forwardDistance < 1.0) {
          // Too close to an obstacle, back up slightly
          this.move(-0.3);
        }
      }
    } else {
      // Mostly aligned with target direction
      
      // Check if clear path ahead
      const forwardDistance = this.getDistanceToObstacle(forward);
      
      if (forwardDistance > 5.0) {
        // Clear path, move at full speed
        this.move(1.0);
        
        // Small course corrections if not perfectly aligned
        if (angleToTarget > 0.05) {
          this.turn(turnDirection * 0.7);
        }
      } else if (forwardDistance > 2.0) {
        // Obstacle ahead but not immediate, slow down and turn more aggressively
        this.move(0.5);
        this.turn(turnDirection * 1.2);
      } else {
        // Very close to obstacle, almost stop and turn sharply
        this.move(0.1);
        this.turn(turnDirection * 2.0);
      }
    }
    
    // Ensure the physics body responds to our commands
    this.body.wakeUp();
  }

  // Check if we're making progress toward the target
  private checkProgressToTarget(targetPosition: THREE.Vector3): boolean {
    // If we don't have a previous position recorded, we can't check progress
    if (!this.lastPosition) return true;
    
    const currentPos = this.mesh.position;
    const prevDistance = this.lastPosition.distanceTo(targetPosition);
    const currentDistance = currentPos.distanceTo(targetPosition);
    
    // We're making progress if we're getting closer to the target
    return currentDistance < prevDistance;
  }
  
  // Enhanced persistent stuck detection with better tracking
  private isPersistentlyStuck(): boolean {
    // Basic stuck check - been stuck for a long time
    const basicCheck = this.isStuck && Date.now() - this.lastStuckCheck > this.stuckDetectionTime * 2;
    
    // Check physics velocity - if we're applying force but barely moving, we're likely stuck
    const velocity = this.body.linvel();
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    const isAttemptingToMove = Math.abs(velocity.x) > 0.1 || Math.abs(velocity.z) > 0.1;
    const lowSpeed = speed < 2.0;
    
    // Get current forward direction
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
    
    // Check if we have an obstacle directly in front or behind
    const forwardObstacle = this.hasObstacleInDirection(forward, 2);
    const backwardObstacle = this.hasObstacleInDirection(forward.clone().multiplyScalar(-1), 2);
    
    // We're persistently stuck if:
    // 1. We've been marked as stuck for a while, OR
    // 2. We're trying to move but have very low speed and obstacles on multiple sides
    return basicCheck || (isAttemptingToMove && lowSpeed && forwardObstacle && backwardObstacle);
  }
  
  // Generate a path with waypoints to navigate around obstacles
  private generatePathAround(obstacle: THREE.Vector3, targetPosition: THREE.Vector3): THREE.Vector3 {
    const tankPosition = this.mesh.position;
    
    // Calculate a point that's perpendicular to the direct path
    const directPath = new THREE.Vector3().subVectors(targetPosition, tankPosition);
    const perpDirection = new THREE.Vector3(-directPath.z, 0, directPath.x).normalize();
    
    // Randomize which side to go around (left or right)
    if (Math.random() > 0.5) {
      perpDirection.multiplyScalar(-1);
    }
    
    // Create an intermediate waypoint
    const distanceToObstacle = tankPosition.distanceTo(obstacle);
    const waypoint = tankPosition.clone().add(
      perpDirection.multiplyScalar(distanceToObstacle * 1.5)
    );
    
    // Ensure waypoint has proper y-value
    waypoint.y = 0.4;
    
    return waypoint;
  }

  // Check if path to player is blocked and needs navigation
  private isPathToPlayerBlocked(): boolean {
    if (!this.trackingPlayer || !this.playerLastKnownPosition) {
      return false; // Not tracking player, so no path to check
    }
    
    const tankPosition = this.mesh.position;
    const playerPosition = this.playerLastKnownPosition;
    
    // Get direction to player
    const directionToPlayer = new THREE.Vector3()
      .subVectors(playerPosition, tankPosition)
      .normalize();
    
    // Get distance to player
    const distanceToPlayer = tankPosition.distanceTo(playerPosition);
    
    // Check for obstacles in the direct path
    return this.hasObstacleInDirection(directionToPlayer, distanceToPlayer);
  }

  // Check if there's an obstacle in a specific direction
  private hasObstacleInDirection(direction: THREE.Vector3, distance: number): boolean {
    const tankPosition = this.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    
    // Use raycasting to check for obstacles
    // First check voxels
    const voxelResult = this.state.voxelWorld.raycast(
      tankPosition, 
      direction,
      distance
    );
    
    if (voxelResult.voxel !== null) {
      return true; // Obstacle found in voxel world
    }
    
    // Then check terrain objects
    const ray = new THREE.Raycaster(
      tankPosition,
      direction,
      0,
      distance
    );
    
    // Get terrain objects for collision check
    const obstacles = this.state.terrain.filter(obj =>
      obj !== this.state.terrain[this.state.terrain.length - 1] && // Exclude ground
      obj.mesh instanceof THREE.Mesh
    );
    
    // Also check enemy tanks to avoid collisions with other tanks
    const otherTanks = this.state.enemies.filter(tank => tank !== this);
    const tankMeshes = otherTanks.map(tank => tank.mesh);
    
    // Combine all obstacle meshes
    const obstacleMeshes = [...obstacles.map(obj => obj.mesh), ...tankMeshes];
    
    // Perform raycast against all obstacles
    const hits = ray.intersectObjects(obstacleMeshes, false);
    
    return hits.length > 0;
  }

  // Enhanced recovery maneuver for when the tank is persistently stuck
  private attemptRecoveryManeuver(): void {
    const currentTime = Date.now();
    
    // Get the current forward direction
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
    
    // First, back up more aggressively to escape the obstacle
    this.move(-1.0);
    
    // Calculate optimal turn direction based on obstacle positions
    // Try to turn away from nearby obstacles
    let optimalTurnDirection = 0;
    
    // Check left and right to see which side has more clearance
    const leftDir = forward.clone().applyEuler(new THREE.Euler(0, Math.PI/4, 0));
    const rightDir = forward.clone().applyEuler(new THREE.Euler(0, -Math.PI/4, 0));
    
    const leftDistance = this.getDistanceToObstacle(leftDir);
    const rightDistance = this.getDistanceToObstacle(rightDir);
    
    // Turn toward the direction with more space
    if (leftDistance > rightDistance) {
      optimalTurnDirection = 1; // Turn left (positive direction)
    } else {
      optimalTurnDirection = -1; // Turn right (negative direction)
    }
    
    // Apply a stronger turn impulse to break free
    this.turn(optimalTurnDirection * 3);
    
    // Increase tank physics wake-up
    this.body.wakeUp();
    
    // Increase the linear damping temporarily to prevent bouncing/sliding
    const currentDamping = this.body.linDamping();
    this.body.setLinDamping(currentDamping * 2);
    
    // Apply a sudden impulse to "kick" the tank free if it's truly stuck
    const kickDirection = new THREE.Vector3(
      (Math.random() - 0.5) * 2, // Random X direction
      0,
      (Math.random() - 0.5) * 2  // Random Z direction
    ).normalize();
    
    // Apply the impulse to the physics body
    this.body.applyImpulse(
      { 
        x: kickDirection.x * this.speed * 1.5, 
        y: 0.1, // Small upward component can help clear low obstacles
        z: kickDirection.z * this.speed * 1.5
      },
      true
    );
    
    // Reset the avoidance state completely
    this.avoidanceDirection = null;
    this.avoidanceTimer = currentTime + this.obstacleAvoidanceTime * 1.5; // Extended time
    
    // Generate a completely new patrol target if we were patrolling
    if (!this.trackingPlayer && this.targetPosition) {
      this.targetPosition = null; // Will force generating a new patrol point
    }
    
    // Schedule restoring normal linear damping
    setTimeout(() => {
      this.body.setLinDamping(currentDamping);
    }, 500);
  }
}