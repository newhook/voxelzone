import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { GameObject } from './types';
import { PlayState } from './playState';
import { PlayerTank } from './playerTank';

// Define powerup types
export enum PowerupType {
  HEALTH = 'health',
  AMMO = 'ammo',
  SPEED = 'speed',
  ROTATION = 'rotation'
}

// PowerupEffect interface for tracking active effects
export interface PowerupEffect {
  type: PowerupType;
  startTime: number;
  duration: number; // in milliseconds, 0 for instant effects
  endTime: number;
  revertFunction?: () => void;
}

export class Powerup implements GameObject {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  state: PlayState;
  type: PowerupType;
  rotationSpeed: number = 1.5;
  bobSpeed: number = 1;
  bobHeight: number = 0.3;
  initialY: number;
  spawnTime: number;
  
  constructor(
    playState: PlayState,
    position: THREE.Vector3,
    type: PowerupType
  ) {
    this.state = playState;
    this.type = type;
    this.initialY = position.y;
    this.spawnTime = Date.now();
    
    // Create a basic geometric shape based on powerup type
    const geometry = this.getGeometryForType(type);
    const material = new THREE.MeshStandardMaterial({
      color: this.getColorForType(type),
      emissive: this.getColorForType(type),
      emissiveIntensity: 0.3,
      metalness: 0.7,
      roughness: 0.3
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    
    // Create physics body
    const physicsWorld = this.state.physicsWorld;
    
    // Create rigid body for powerup
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.7)
      .setAngularDamping(0.7);
    
    this.body = physicsWorld.world.createRigidBody(rigidBodyDesc);
    
    // Create collider as a sensor (no physical collision, just detection)
    const colliderDesc = RAPIER.ColliderDesc.ball(0.7)
      .setDensity(1.0)
      .setSensor(true);
    
    physicsWorld.world.createCollider(colliderDesc, this.body);
    
    // Link mesh to physics body
    this.body.userData = { mesh: this.mesh };
    
    // Register collision handler
    this.state.physicsWorld.registerCollisionHandler(this, (other) => {
      this.handleCollision(other);
    });
  }
  
  private getGeometryForType(type: PowerupType): THREE.BufferGeometry {
    switch (type) {
      case PowerupType.HEALTH:
        return new THREE.TetrahedronGeometry(0.7, 1);
      case PowerupType.AMMO:
        return new THREE.OctahedronGeometry(0.6, 1);
      case PowerupType.SPEED:
        return new THREE.ConeGeometry(0.5, 1.2, 8);
      case PowerupType.ROTATION:
        return new THREE.TorusGeometry(0.5, 0.2, 8, 16);
      default:
        return new THREE.SphereGeometry(0.6, 8, 8);
    }
  }
  
  private getColorForType(type: PowerupType): number {
    switch (type) {
      case PowerupType.HEALTH:
        return 0xff0000; // Red for health
      case PowerupType.AMMO:
        return 0xffaa00; // Orange for ammo
      case PowerupType.SPEED:
        return 0x00ffff; // Cyan for speed
      case PowerupType.ROTATION:
        return 0xffff00; // Yellow for rotation
      default:
        return 0xffffff; // White default
    }
  }
  
  update(delta: number): void {
    if (!this.body || !this.mesh) return;
    
    // Make the powerup rotate
    this.mesh.rotation.y += this.rotationSpeed * delta;
    
    // Add a bobbing effect
    const elapsedTime = (Date.now() - this.spawnTime) / 1000; // in seconds
    const bobOffset = Math.sin(elapsedTime * this.bobSpeed) * this.bobHeight;
    
    // Update the mesh position with bobbing
    const pos = this.body.translation();
    this.mesh.position.set(pos.x, this.initialY + bobOffset, pos.z);
    
    // Keep physics body at initial Y but update X and Z from physics
    this.body.setTranslation({
      x: pos.x,
      y: this.initialY,
      z: pos.z
    }, true);
  }
  
  private handleCollision(other: GameObject): void {
    // Check if the colliding object is the player
    if (other instanceof PlayerTank) {
      this.applyEffect(other);
      this.destroy();
    }
  }
  
  private applyEffect(player: PlayerTank): void {
    switch (this.type) {
      case PowerupType.HEALTH:
        // Heal player by 10 hitpoints, up to their max
        player.heal(10);
        this.state.showPowerupNotification("Health +10", this.getColorForType(this.type));
        break;
        
      case PowerupType.AMMO:
        // Add 10 projectiles
        player.addProjectiles(10);
        this.state.showPowerupNotification("Ammo +10", this.getColorForType(this.type));
        break;
        
      case PowerupType.SPEED:
        // 50% speed boost for 30 seconds
        this.state.addPowerupEffect({
          type: PowerupType.SPEED,
          startTime: Date.now(),
          duration: 30000, // 30 seconds
          endTime: Date.now() + 30000,
          revertFunction: player.applySpeedBoost(1.5) // returns revert function
        });
        this.state.showPowerupNotification("Speed +50% (30s)", this.getColorForType(this.type));
        break;
        
      case PowerupType.ROTATION:
        // 50% rotation speed boost for 30 seconds
        this.state.addPowerupEffect({
          type: PowerupType.ROTATION,
          startTime: Date.now(),
          duration: 30000, // 30 seconds
          endTime: Date.now() + 30000,
          revertFunction: player.applyTurnBoost(1.5) // returns revert function
        });
        this.state.showPowerupNotification("Rotation +50% (30s)", this.getColorForType(this.type));
        break;
    }
    
    // Play powerup sound
    const soundManager = this.state.gameStateManager.initSoundManager();
    soundManager.playPowerup();
  }
  
  destroy(): void {
    // Unregister collision handler
    this.state.physicsWorld.unregisterCollisionHandler(this);
    
    // Remove from scene
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    
    // Remove from physics world
    this.state.physicsWorld.removeBody(this);
    
    // Remove from powerups array
    this.state.removePowerup(this);
  }
}