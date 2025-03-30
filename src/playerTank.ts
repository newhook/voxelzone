import * as THREE from 'three';
import { Tank } from './tank';
import { PlayState } from './playState';

export class PlayerTank extends Tank {
  private healthFlashTimeout: number | null = null;
  public maxProjectiles: number = 50; // Default max projectiles
  public currentProjectiles: number = 50; // Start with max projectiles
  private originalSpeed: number;
  private originalTurnSpeed: number;

  constructor(playState : PlayState,  position: THREE.Vector3 = new THREE.Vector3(0, 0.4, 0)) {
    super(playState, position, 0x00ff00); // Call base class constructor with green color
    
    // Override base speeds for player-specific values
    this.speed = 125; 
    this.turnSpeed = 1.5;
    this.hitpoints = 15; // Player starts with 15 hitpoints
    this.maxHitpoints = 15; // Initial max hitpoints
    
    // Store original values for reverting powerups later
    this.originalSpeed = this.speed;
    this.originalTurnSpeed = this.turnSpeed;
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
  
  // New method to heal the player
  heal(amount: number): void {
    this.hitpoints = Math.min(this.hitpoints + amount, this.maxHitpoints);
    
    // Flash the tank green to indicate healing
    if (this.healthFlashTimeout) {
      clearTimeout(this.healthFlashTimeout);
    }
    
    // Store original color and turn tank green momentarily
    const originalColor = (this.mesh.material as THREE.MeshStandardMaterial).color.clone();
    (this.mesh.material as THREE.MeshStandardMaterial).color.set(0x00ff00);
    
    this.healthFlashTimeout = window.setTimeout(() => {
      (this.mesh.material as THREE.MeshStandardMaterial).color.copy(originalColor);
      this.healthFlashTimeout = null;
    }, 300);
  }
  
  // Add projectiles to the player's ammo count
  addProjectiles(count: number): void {
    this.currentProjectiles = Math.min(this.currentProjectiles + count, this.maxProjectiles);
  }
  
  // Override the fire method to use ammo count
  fire(): void {
    if (!this.canFire || this.currentProjectiles <= 0) return;
    
    // Deduct a projectile
    this.currentProjectiles--;
    
    // Continue with normal firing logic from Tank class
    super.fire();
  }
  
  // Apply a speed boost and return a function to revert it
  applySpeedBoost(multiplier: number): () => void {
    const previousSpeed = this.speed;
    this.speed = this.originalSpeed * multiplier;
    
    // Return a function that will revert the speed
    return () => {
      this.speed = previousSpeed;
    };
  }
  
  // Apply a turn speed boost and return a function to revert it
  applyTurnBoost(multiplier: number): () => void {
    const previousTurnSpeed = this.turnSpeed;
    this.turnSpeed = this.originalTurnSpeed * multiplier;
    
    // Return a function that will revert the turn speed
    return () => {
      this.turnSpeed = previousTurnSpeed;
    };
  }
}