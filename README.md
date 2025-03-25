# Battlezone

A modern remake of the classic Atari Battlezone arcade game, built with Three.js and TypeScript.

## Description

Battlezone is a first-person tank combat game where players navigate a virtual battlefield, destroying enemy tanks while avoiding their attacks. This remake preserves the original's vector graphics aesthetic while adding modern rendering techniques and gameplay improvements.

## Features

- First-person tank combat gameplay
- Vector-style graphics reminiscent of the original arcade classic
- Enemy AI tanks
- Radar system for tracking enemies
- Physics-based projectiles
- Multiple game states (marquee, gameplay)
- Original sound effects and music

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

## Project Structure

- `src/main.ts` - Entry point for the application
- `src/gameStates.ts` - Game state management system
- `src/marqueeState.ts` - Attract mode / title screen
- `src/playState.ts` - Main gameplay state
- `src/tank.ts` - Base tank class
- `src/playerTank.ts` - Player-controlled tank
- `src/enemyTank.ts` - AI-controlled enemy tanks
- `src/projectile.ts` - Projectile/bullet implementation
- `src/radar.ts` - In-game radar system
- `src/types.ts` - Type definitions

## Controls

[Add control information here]

## License

This project is licensed under the ISC License - see the LICENSE file for details.

## Acknowledgments

- Original Battlezone game created by Atari in 1980
- Inspired by the vector graphics style of early arcade games