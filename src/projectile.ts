import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { GameObject } from './types';
import { PlayState } from './playState';

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
      color: 0xffff00,
      wireframe: false,
      emissive: 0xffff00,
      emissiveIntensity: 0.8
    });
    this.mesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
    this.mesh.position.copy(position);

    // Add a point light to the projectile to make it glow
    const projectileLight = new THREE.PointLight(0xffff00, 1, 10);
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
    const projectileSpeed = 100; // Fast projectile speed
    const velocity = direction.multiplyScalar(projectileSpeed).add(initialVelocity);
    this.body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    this.body.wakeUp();

    // Add to scene
    this.state.scene.add(this.mesh);

    // Set up auto-destruction after 5 seconds
    setTimeout(() => this.destroy(), 5000);
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
    // Physics world handles updates
  }
}