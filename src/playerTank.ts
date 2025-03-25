import * as THREE from 'three';
import { Tank } from './tank';
import { PlayState } from './playState';

export class PlayerTank extends Tank {
  private healthFlashTimeout: number | null = null;

  constructor(playState : PlayState,  position: THREE.Vector3 = new THREE.Vector3(0, 0.4, 0)) {
    super(playState, position, 0x00ff00); // Call base class constructor with green color
    
    // Override base speeds for player-specific values
    this.speed = 125; 
    this.turnSpeed = 1.5;
    this.hitpoints = 15; // Player starts with 15 hitpoints
    this.maxHitpoints = 15; // Initial max hitpoints
  }

  // Override takeDamage to add player-specific visual feedback
  takeDamage(amount: number = 10): boolean {
    const isAlive = super.takeDamage(amount);
    
    // Flash the tank body with more intensity for player
    if (this.healthFlashTimeout) {
      clearTimeout(this.healthFlashTimeout);
    }

    // Turn the entire tank red for a moment
    const originalColor = (this.mesh.material as THREE.MeshStandardMaterial).color.clone();
    (this.mesh.material as THREE.MeshStandardMaterial).color.set(0xff0000);
    
    this.healthFlashTimeout = window.setTimeout(() => {
      (this.mesh.material as THREE.MeshStandardMaterial).color.copy(originalColor);
      this.healthFlashTimeout = null;
    }, 300);

    return isAlive;
  }
}