import { InputState } from './types';

// Handle keyboard input
export function setupInputHandlers(): InputState {
  const input: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    fire: false,
    toggleFlyCamera: false,
    wireframeToggle: false,
    turretLeft: false,
    turretRight: false
  };
  
  // Key down handler
  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case 'KeyR':
        input.wireframeToggle = !input.wireframeToggle;
        break;
      case 'KeyW':
          input.forward = true;
        break;
      case 'ArrowUp':
        input.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        input.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        input.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        input.right = true;
        break;
      case 'KeyQ':
        input.turretLeft = true;
        break;
      case 'KeyE':
        input.turretRight = true;
        break;
      case 'Space':
        input.fire = true;
        break;
      case 'KeyF':
        // Toggle fly camera on keydown, not continuous press
        input.toggleFlyCamera = !input.toggleFlyCamera;
        break;
    }
  };
  
  // Key up handler
  const handleKeyUp = (event: KeyboardEvent) => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        input.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        input.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        input.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        input.right = false;
        break;
      case 'KeyQ':
        input.turretLeft = false;
        break;
      case 'KeyE':
        input.turretRight = false;
        break;
      case 'Space':
        input.fire = false;
        break;
      // We don't reset toggleFlyCamera on keyup as it's a toggle state
    }
  };

  // Mouse button handlers
  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 0) { // Left mouse button
      input.fire = true;
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button === 0) { // Left mouse button
      input.fire = false;
    }
  };
  
  // Add event listeners
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mouseup', handleMouseUp);
  
  return input;
}
