# Voxelzone

A modern remake of the classic Atari tank combat game, built with Three.js, TypeScript, and Rapier physics.

![Voxelzone Game Screenshot](https://placeholder-for-screenshot.png)

## Overview

Voxelzone is a first-person tank combat game where players navigate through a diverse voxel battlefield, destroying enemy tanks while avoiding their attacks. The game features an immersive 3D environment with four distinct zones: forest, urban, desert, and mountain, each offering unique tactical challenges.

## Features

- **Immersive 3D Voxel Environment**: Navigate through forests, urban landscapes, mountains, and deserts
- **Advanced Enemy AI**: Tanks that patrol, chase, and strategically attack with obstacle avoidance
- **Physics-Based Gameplay**: Realistic physics for tanks and projectiles using Rapier physics engine
- **Dynamic Line-of-Sight**: Enemies can only detect you when they have line of sight
- **Radar System**: Track enemy positions with the onboard radar
- **Combat Effects**: Visual effects for projectiles, hits, and tank destruction
- **Power-ups System**: Collect health, ammo, speed, and rotation boosts throughout the battlefield
- **Arcade Experience**: Complete with attract mode, game states, and classic sound effects

## Getting Started

### Prerequisites

- Node.js (recommended version 16+)
- npm or yarn

### Installation

1. Clone this repository
2. Install dependencies:
```bash
npm install
# or
yarn
```

### Development

Start the development server:
```bash
npm run dev
# or
yarn dev
```

This will start a local development server at http://localhost:5173 (or another port if 5173 is in use).

### Building for Production

Build the project for production:
```bash
npm run build
# or
yarn build
```

The built files will be in the `dist` directory.

## Controls

- **W/S** - Move forward/backward
- **A/D** - Turn tank left/right
- **Mouse Movement** - Aim turret
- **Left Mouse Button** - Fire
- **Space** - Start game (on title screen)
- **P** - Pause game
- **ESC** - Return to title screen

## Gameplay Tips

- Use terrain and obstacles for cover from enemy fire
- Enemy tanks are equipped with different accuracy levels and attack patterns
- Listen for audio cues that indicate when an enemy has spotted you
- Check your radar frequently to plan your approach
- Use hit-and-run tactics against multiple enemies
- Remember that enemies lose track of you if you break line of sight
- Collect power-ups to gain temporary advantages or replenish resources
- Different power-ups are color-coded: red (health), orange (ammo), cyan (speed), and yellow (rotation)

## Environment

The game world is divided into four distinct quadrants:

1. **Forest Zone**: Dense clusters of trees provide cover but limit visibility
2. **Urban Zone**: Buildings and barriers create maze-like paths with strategic choke points
3. **Desert Zone**: Open areas with scattered rock formations and cacti
4. **Mountain Zone**: Elevated terrain with narrow passages and ambush points

## Project Structure

- `src/main.ts` - Entry point for the application
- `src/gameStates.ts` - Game state management system
- `src/marqueeState.ts` - Attract mode / title screen
- `src/playState.ts` - Main gameplay state
- `src/tank.ts` - Base tank class with shared functionality
- `src/playerTank.ts` - Player-controlled tank implementation
- `src/enemyTank.ts` - AI-controlled enemy tanks with patrol and pursuit behavior
- `src/projectile.ts` - Physics-based projectile implementation
- `src/radar.ts` - In-game radar system for enemy detection
- `src/voxelWorld.ts` - Voxel-based world management
- `src/arena.ts` - Environment generation with different zones
- `src/voxelObjects.ts` - Definitions for voxel-based environment objects
- `src/physics.ts` - Physics system integration with Rapier
- `src/powerup.ts` - Power-up items with different effects and behaviors
- `src/types.ts` - Type definitions for game entities

## Development Roadmap

- [ ] Additional enemy tank types with varied behaviors
- [x] Power-ups and tank upgrades
- [ ] Multiplayer support
- [ ] Level progression with increasing difficulty
- [ ] Additional environments and weather effects
- [ ] Mobile/touch controls support

## License

This project is licensed under the ISC License - see the LICENSE file for details.

## Acknowledgments

- Inspired by classic arcade tank combat games
- Built with [Three.js](https://threejs.org/) for 3D rendering
- Physics powered by [Rapier](https://rapier.rs/)
- Developed with TypeScript and Vite