import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';

export interface GameObject {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  update?: (delta: number) => void;
}

export interface Vehicle extends GameObject {
  speed: number;
  turnSpeed: number;
  move: (direction: number) => void;
  turn: (direction: number) => void;
  fire: () => void;
  takeDamage(amount: number): boolean;
  rotateTurret: (direction: number) => void;
  canFire: boolean;
  lastFired: number;
}

export interface GameState {
  player: import('./tank').Tank;
  enemies: Vehicle[];
  terrain: GameObject[];
  projectiles: GameObject[];
  score: number;
  gameOver: boolean;
  isMarqueeMode: boolean;
}

// Global declarations for access across modules
declare global {
  interface Window {
    gameState: GameState | undefined;
    physicsWorld: PhysicsWorld;
    gameStateManager: any; // Add this line
  }
}

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
  wireframeToggle: boolean;
  debugPhysicsToggle: boolean;
  turretLeft: boolean;  // For Q key
  turretRight: boolean; // For E key
  mouseX: number;       // For mouse position X
  mouseDeltaX: number;  // For mouse movement delta X
}

export interface PhysicsWorld {
  world: RAPIER.World;
  bodies: GameObject[];
  update: (deltaTime: number) => void;
  addBody: (body: GameObject) => void;
  removeBody: (body: GameObject) => void;
  registerCollisionHandler: (body: GameObject, handler: (other: GameObject) => void) => void;
  unregisterCollisionHandler: (body: GameObject) => void;
}
