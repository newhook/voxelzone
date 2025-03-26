import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { GameObject } from './types';
import { PlayState } from './playState';
import { VoxelCoord, voxelProperties } from './voxel';

export enum ProjectileSource {
  PLAYER,
  ENEMY
}

export class Projectile implements GameObject {
  state: PlayState
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  source: ProjectileSource;
  
  constructor(
    playState: PlayState,
    position: THREE.Vector3,
    direction: THREE.Vector3,
    initialVelocity: THREE.Vector3,
    source: ProjectileSource = ProjectileSource.PLAYER
  ) {
    this.state = playState;
    this.source = source;
    
    // Create projectile mesh with bright, glowing material
    const projectileGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const projectileMaterial = new THREE.MeshStandardMaterial({
      color: source === ProjectileSource.PLAYER ? 0xffff00 : 0xff0000,
      wireframe: false,
      emissive: source === ProjectileSource.PLAYER ? 0xffff00 : 0xff0000,
      emissiveIntensity: 1.0
    });
    
    this.mesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
    this.mesh.position.copy(position);
    
    // Add a point light to the projectile to make it glow
    const projectileLight = new THREE.PointLight(
      source === ProjectileSource.PLAYER ? 0xffff00 : 0xff0000, 
      2, 
      10
    );
    projectileLight.position.set(0, 0, 0);
    this.mesh.add(projectileLight);
    
    // Create projectile physics body
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.0) // No drag on projectiles
      .setAngularDamping(0.0); // No angular drag
      
    const physicsWorld = this.state.physicsWorld
    this.body = physicsWorld.world.createRigidBody(rigidBodyDesc);
    
    // Create collider (slightly smaller than visual size for better gameplay)
    const colliderDesc = RAPIER.ColliderDesc.ball(0.4)
      .setDensity(1.0)
      .setRestitution(0.5)
      .setFriction(0.0);
      
    physicsWorld.world.createCollider(colliderDesc, this.body);
    
    // Link mesh to physics body
    this.body.userData = { mesh: this.mesh };
    
    // Apply velocity in the direction of the turret
    const projectileSpeed = 150; // Increased projectile speed for more impactful shots
    const velocity = direction.multiplyScalar(projectileSpeed).add(initialVelocity);
    this.body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    this.body.wakeUp();
    
    // Add to scene
    this.state.scene.add(this.mesh);
    
    // Add a trail effect
    this.addProjectileTrail();
    
    // Set up auto-destruction after 5 seconds
    setTimeout(() => this.destroy(), 5000);
  }
  
  // Add a trail effect to the projectile
  private addProjectileTrail() {
    const trailLength = 10; // Number of trail segments
    const trailColor = this.source === ProjectileSource.PLAYER ? 0xffff00 : 0xff0000;
    
    // Create trail points
    const points = [];
    for (let i = 0; i < trailLength; i++) {
      points.push(this.mesh.position.clone());
    }
    
    // Create trail geometry and material
    const trailGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const trailMaterial = new THREE.LineBasicMaterial({ 
      color: trailColor,
      transparent: true,
      opacity: 0.7
    });
    
    // Create the trail line
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    this.state.scene.add(trail);
    
    // Update trail position every frame
    const updateTrail = () => {
      if (!this.mesh.parent) {
        // If projectile is destroyed, remove trail
        if (trail.parent) {
          this.state.scene.remove(trail);
        }
        return;
      }
      
      // Update trail points
      const positions = trail.geometry.attributes.position.array as Float32Array;
      
      // Shift all points down
      for (let i = trailLength - 1; i > 0; i--) {
        positions[i * 3] = positions[(i - 1) * 3];
        positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
        positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
      }
      
      // Set first point to current position
      positions[0] = this.mesh.position.x;
      positions[1] = this.mesh.position.y;
      positions[2] = this.mesh.position.z;
      
      // Mark geometry as needing update
      trail.geometry.attributes.position.needsUpdate = true;
      
      // Continue updating
      requestAnimationFrame(updateTrail);
    };
    
    // Start updating trail
    updateTrail();
  }
  
  destroy(): void {
    const scene = this.state.scene;
    if (scene && this.mesh.parent) {
      scene.remove(this.mesh);
    }
    
    this.state.physicsWorld.removeBody(this);
    
    // Look for this projectile in the PlayState's projectiles array
    const index = this.state.projectiles.indexOf(this);
    if (index !== -1) {
      this.state.projectiles.splice(index, 1);
    }
  }
  
  update(): void {
    // Check if the projectile is still active
    if (!this.body || !this.mesh) return;

    // Get current projectile position from the physics body
    const projectilePos = this.body.translation();
    const projectileVector = new THREE.Vector3(projectilePos.x, projectilePos.y, projectilePos.z);

    // Check if projectile hit a voxel
    const rayResult = this.state.voxelWorld.raycast(
      projectileVector,
      // Use projectile's velocity as direction for the ray
      new THREE.Vector3(
        this.body.linvel().x, 
        this.body.linvel().y, 
        this.body.linvel().z
      ).normalize(),
      0.5 // Short distance check
    );

    // If we hit a voxel, destroy the projectile and the voxel
    if (rayResult.voxel) {
      // Create explosion effect
      this.createExplosionEffect(projectileVector);

      // Destroy voxels in a small radius
      this.destroyVoxelsInRadius(rayResult.voxel, 1.5);

      // Destroy the projectile
      this.destroy();
    }
  }

  private createExplosionEffect(position: THREE.Vector3): void {
    // Create particles for explosion
    const particleCount = 10;
    
    for (let i = 0; i < particleCount; i++) {
      const size = 0.2 + Math.random() * 0.3;
      const geometry = new THREE.SphereGeometry(size, 8, 8);
      const material = new THREE.MeshBasicMaterial({
        color: this.source === ProjectileSource.PLAYER ? 0xffff00 : 0xff0000,
        transparent: true,
        opacity: 0.7
      });
      
      const particle = new THREE.Mesh(geometry, material);
      particle.position.copy(position);
      
      // Add particle to scene
      this.state.scene.add(particle);
      
      // Random direction
      const direction = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize();
      
      // Animate the particle
      const startTime = Date.now();
      const duration = 300 + Math.random() * 200;
      const speed = 5 + Math.random() * 5;
      
      const animateParticle = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress >= 1) {
          this.state.scene.remove(particle);
          return;
        }
        
        // Move outward
        particle.position.add(direction.clone().multiplyScalar(speed * 0.016)); // Roughly time-based movement
        
        // Fade out
        material.opacity = 0.7 * (1 - progress);
        
        requestAnimationFrame(animateParticle);
      };
      
      animateParticle();
    }
    
    // Play explosion sound if available
    if (this.state.gameStateManager && this.state.gameStateManager.soundManager) {
      this.state.gameStateManager.soundManager.playHit();
    }
  }

  private destroyVoxelsInRadius(center: VoxelCoord, radius: number): void {
    for (let x = -Math.ceil(radius); x <= Math.ceil(radius); x++) {
      for (let y = -Math.ceil(radius); y <= Math.ceil(radius); y++) {
        for (let z = -Math.ceil(radius); z <= Math.ceil(radius); z++) {
          const checkPos = {
            x: center.x + x,
            y: center.y + y,
            z: center.z + z
          };
          
          // Check if position is within explosion radius
          const distance = Math.sqrt(x * x + y * y + z * z);
          if (distance <= radius) {
            // Get the voxel at this position
            const voxel = this.state.voxelWorld.getVoxel(checkPos);
            
            // Only destroy the voxel if it exists and is breakable
            if (voxel !== undefined && voxelProperties[voxel].breakable) {
              this.state.voxelWorld.setVoxel(checkPos, undefined);
            }
          }
        }
      }
    }
  }
}