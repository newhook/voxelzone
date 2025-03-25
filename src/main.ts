import * as THREE from 'three';
import { GameStateManager } from './gameStateManager';

let gameStateManager: GameStateManager;

async function init() {
  console.log('Init function starting');
  const loadingElement = document.getElementById('loading');

  // Create renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 1);

  const clock = new THREE.Clock();
  document.body.appendChild(renderer.domElement);

  // Hide instructions initially
  const instructions = document.getElementById('instructions');
  if (instructions) {
    instructions.style.display = 'none';
  }

  // Initialize game state manager
  gameStateManager = new GameStateManager();

  // Make gameStateManager accessible globally
  (window as any).gameStateManager = gameStateManager;

  // Hide the loading element
  if (loadingElement) {
    loadingElement.style.display = 'none';
  }

  // FPS counter variables
  let frameCount = 0;
  let lastTime = performance.now();
  const fpsElement = document.getElementById('fps');

  // Update FPS counter
  function updateFPS() {
    frameCount++;

    const currentTime = performance.now();
    const elapsedTime = currentTime - lastTime;

    // Update FPS display once per second
    if (elapsedTime >= 1000) {
      const fps = Math.round((frameCount * 1000) / elapsedTime);
      if (fpsElement) {
        fpsElement.textContent = `FPS: ${fps}`;
      }

      // Reset values
      frameCount = 0;
      lastTime = currentTime;
    }
  }

  // Set up animation loop
  function animate() {
    requestAnimationFrame(animate);

    // Update FPS counter
    updateFPS();

    // Get elapsed time since last frame
    const deltaTime = clock.getDelta();

    // Update game state
    gameStateManager.update(deltaTime);
    gameStateManager.render(renderer);
  }

  // Start the animation loop
  animate();

  // Handle window resize
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// Immediately invoke the initialization function regardless of DOMContentLoaded
console.log("Attempting to initialize immediately");
init().catch((error) => {
  console.error('Unhandled error during initialization:', error);
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.textContent = `Error: ${error.message}. Please reload the page.`;
    loadingElement.style.color = 'red';
  }
});