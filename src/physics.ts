import { PhysicsWorld as PhysicsWorldType, GameObject } from './types';
import RAPIER from '@dimforge/rapier3d';
import { GameConfig } from './config';

export class PhysicsWorld implements PhysicsWorldType {
  world: RAPIER.World;
  bodies: GameObject[];

  constructor(config: GameConfig) {
    // Create a physics world
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    this.bodies = [];

    // Create ground plane with configurable size
    const groundSize = config.worldSize / 2; // Divide by 2 since the size is total width
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(groundSize, 0.1, groundSize).setTranslation(0, -0.1, 0)
    this.world.createCollider(groundColliderDesc);
  }

  update(_deltaTime: number): void {
    // Step the physics simulation
    this.world.step();
    
    // Check for invalid bodies before updating
    const validBodies = this.bodies.filter(body => {
      try {
        // This will throw an error if the body has been removed but is still in our array
        body.body.translation();
        return true;
      } catch (e) {
        return false;
      }
    });
    
    // Replace our bodies array with only valid bodies
    if (validBodies.length !== this.bodies.length) {
      this.bodies.length = 0;
      this.bodies.push(...validBodies);
    }
    
    // Update all physics objects
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i];
      if (body.mesh) {
          const position = body.body.translation();
          const rotation = body.body.rotation();
          
          // Update mesh position and rotation from physics body
          body.mesh.position.set(position.x, position.y, position.z);
          body.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      }
    }
  }

  addBody(body: GameObject): void {
    this.bodies.push(body);
  }

  removeBody(body: GameObject): void {
    const index = this.bodies.indexOf(body);
    if (index !== -1) {
      this.bodies.splice(index, 1);
      this.world.removeRigidBody(body.body);
    }
  }
}


export function createObstacleBody(
  size: { width: number, height: number, depth: number }, 
  position: { x: number, y: number, z: number },
  world: RAPIER.World,
  mass: number = 0
): RAPIER.RigidBody {
  // Create appropriate rigid body based on mass
  const rigidBodyDesc = mass === 0 
    ? RAPIER.RigidBodyDesc.fixed()
    : RAPIER.RigidBodyDesc.dynamic();
  
  // Set position
  rigidBodyDesc.setTranslation(
    position.x, 
    position.y, // Don't add half height - this is now handled correctly in gameObjects.ts
    position.z
  );
  
  const body = world.createRigidBody(rigidBodyDesc);
  
  // Create collider for this body
  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    size.width / 2, 
    size.height / 2, 
    size.depth / 2
  );
  
  if (mass > 0) {
    colliderDesc.setDensity(mass / (size.width * size.height * size.depth));
  }
  
  // Increase friction and make sure there's no bounce for obstacles
  colliderDesc.setFriction(1.0);
  colliderDesc.setRestitution(0.0);
  
  // Add some contact force events for debugging if needed
  colliderDesc.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
  
  // Attach collider to body
  world.createCollider(colliderDesc, body);
  
  return body;
}