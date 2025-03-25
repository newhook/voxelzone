import * as THREE from 'three';
import { InputState } from './types';

export class FlyCamera {
  camera: THREE.PerspectiveCamera;
  moveSpeed: number;
  lookSpeed: number;
  enabled: boolean;
  
  // Store initial state
  initialPosition: THREE.Vector3;
  initialQuaternion: THREE.Quaternion;
  
  // Euler angles for rotation tracking
  pitch: number = 0;
  yaw: number = 0;
  
  // For mouse control
  mouseSensitivity: number;
  
  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.moveSpeed = 0.5;
    this.lookSpeed = 0.1;
    this.enabled = false;
    
    // Store initial position and rotation
    this.initialPosition = camera.position.clone();
    this.initialQuaternion = camera.quaternion.clone();
    
    // Mouse controls
    this.mouseSensitivity = 0.002;
    
    // Setup mouse event listeners
    this.setupMouseControls();
  }
  
  setupMouseControls(): void {
    // Pointer lock change event
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === document.body) {
        // Pointer is locked, fly camera is active
        this.enabled = true;
      } else if (this.enabled) {
        // Pointer is unlocked but the camera was enabled - we're exiting fly mode
        this.disable();
      }
    });
    
    // Mouse move event
    document.addEventListener('mousemove', (event) => {
      if (!this.enabled) return;
      
      // Calculate mouse movement
      const deltaX = event.movementX || 0;
      const deltaY = event.movementY || 0;
      
      // Update yaw (horizontal rotation) and pitch (vertical rotation)
      this.yaw -= deltaX * this.mouseSensitivity;
      this.pitch -= deltaY * this.mouseSensitivity;
      
      // Limit pitch to avoid flipping
      this.pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.pitch));
      
      // Apply rotation using quaternions to avoid gimbal lock
      const quaternion = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      this.camera.quaternion.copy(quaternion);
    });
  }
  
  enable(): void {
    if (!this.enabled) {
      // Store current camera state before entering fly mode
      this.initialPosition.copy(this.camera.position);
      this.initialQuaternion.copy(this.camera.quaternion);
      
      // Extract initial orientation angles
      const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.pitch = euler.x;
      this.yaw = euler.y;
      
      // Request pointer lock
      document.body.requestPointerLock = document.body.requestPointerLock ||
                                         (document.body as any).mozRequestPointerLock ||
                                         (document.body as any).webkitRequestPointerLock;
      document.body.requestPointerLock();
    }
  }
  
  disable(): void {
    if (this.enabled) {
      this.enabled = false;
      
      // Exit pointer lock
      document.exitPointerLock = document.exitPointerLock ||
                               (document as any).mozExitPointerLock ||
                               (document as any).webkitExitPointerLock;
      document.exitPointerLock();
    }
  }
  
  toggle(): void {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }
  
  update(input: InputState, deltaTime: number): void {
    if (!this.enabled) return;
    
    // Convert camera's local directions to world space using quaternions
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);
    
    // Apply movement based on input
    const movementSpeed = this.moveSpeed * deltaTime * 60; // Scale by deltaTime for consistent movement
    
    if (input.forward) {
      this.camera.position.addScaledVector(forward, movementSpeed);
    }
    if (input.backward) {
      this.camera.position.addScaledVector(forward, -movementSpeed);
    }
    if (input.right) {
      this.camera.position.addScaledVector(right, movementSpeed);
    }
    if (input.left) {
      this.camera.position.addScaledVector(right, -movementSpeed);
    }
    
    // Additional controls for vertical movement
    if (input.fire) { // Use spacebar to move up
      this.camera.position.addScaledVector(up, movementSpeed);
    }
  }
  
  // Method to reset camera to its original position when leaving fly mode
  resetToTankCamera(): void {
    this.camera.position.copy(this.initialPosition);
    this.camera.quaternion.copy(this.initialQuaternion);
  }
}