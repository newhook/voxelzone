import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { GameObject } from './types';

// Define voxel material types
export enum VoxelMaterial {
  DIRT = 0,
  GRASS = 1,
  STONE = 2,
  SAND = 3,
  WATER = 4,
  WOOD = 5,
  LEAVES = 6,
  WALL = 7,
  BRICK = 8,
  CONCRETE = 9,
  METAL = 10,
}

// Properties for each voxel type
export interface VoxelProperties {
  color: number;
  textureIndex?: number;
  transparent: boolean;
  solid: boolean; // Whether it has physics collision
  breakable: boolean; // Whether player can break it
  gravity: boolean; // Whether it falls if unsupported
  friction: number; // Physics friction
  restitution: number; // Physics bounciness
}

// Define properties for each material type
export const voxelProperties: Record<VoxelMaterial, VoxelProperties> = {
  [VoxelMaterial.DIRT]: {
    color: 0x7a5c41,
    transparent: false,
    solid: true,
    breakable: true,
    gravity: true,
    friction: 0.8,
    restitution: 0.1,
  },
  [VoxelMaterial.GRASS]: {
    color: 0x507f35,
    transparent: false,
    solid: true,
    breakable: true,
    gravity: true,
    friction: 0.8,
    restitution: 0.1,
  },
  [VoxelMaterial.STONE]: {
    color: 0x8c8c8c,
    transparent: false,
    solid: true,
    breakable: true,
    gravity: true,
    friction: 0.9,
    restitution: 0.05,
  },
  [VoxelMaterial.SAND]: {
    color: 0xdbd28a,
    transparent: false,
    solid: true,
    breakable: true,
    gravity: true,
    friction: 0.6,
    restitution: 0.1,
  },
  [VoxelMaterial.WATER]: {
    color: 0x3d85c6,
    transparent: true,
    solid: false,
    breakable: false,
    gravity: false,
    friction: 0.3,
    restitution: 0,
  },
  [VoxelMaterial.WOOD]: {
    color: 0x8b4513,
    transparent: false,
    solid: true,
    breakable: true,
    gravity: true,
    friction: 0.7,
    restitution: 0.2,
  },
  [VoxelMaterial.LEAVES]: {
    color: 0x31752f,
    transparent: true,
    solid: true,
    breakable: true,
    gravity: false,
    friction: 0.5,
    restitution: 0.1,
  },
  [VoxelMaterial.WALL]: {
    color: 0x4a4a4a,
    transparent: false,
    solid: true,
    breakable: false,
    gravity: false,
    friction: 0.9,
    restitution: 0.0,
  },
  [VoxelMaterial.BRICK]: {
    color: 0xa52a2a, // Brick red
    transparent: false,
    solid: true,
    breakable: true,
    gravity: false,
    friction: 0.85,
    restitution: 0.05,
  },
  [VoxelMaterial.CONCRETE]: {
    color: 0xc0c0c0, // Light gray
    transparent: false,
    solid: true,
    breakable: false,
    gravity: false,
    friction: 0.95,
    restitution: 0.02,
  },
  [VoxelMaterial.METAL]: {
    color: 0x808080, // Gray with metallic appearance
    transparent: false,
    solid: true,
    breakable: false,
    gravity: false,
    friction: 0.7,
    restitution: 0.3, // More bouncy than other materials
  },
};

// Define voxel dimensions
export const VOXEL_SIZE = 1.0; // 1 meter cube (Minecraft style)

// Coordinates in the voxel grid
export interface VoxelCoord {
  x: number;
  y: number;
  z: number;
}

// Represents a single voxel in the world
export interface Voxel {
  material: VoxelMaterial;
  position: VoxelCoord;
}

// Helper function to convert world coordinates to voxel grid coordinates
export function worldToVoxel(worldPos: THREE.Vector3): VoxelCoord {
  return {
    x: Math.floor(worldPos.x / VOXEL_SIZE),
    y: Math.floor(worldPos.y / VOXEL_SIZE),
    z: Math.floor(worldPos.z / VOXEL_SIZE),
  };
}

// Helper function to convert voxel grid coordinates to world coordinates
export function voxelToWorld(voxelPos: VoxelCoord): THREE.Vector3 {
  return new THREE.Vector3(
    voxelPos.x * VOXEL_SIZE,
    voxelPos.y * VOXEL_SIZE,
    voxelPos.z * VOXEL_SIZE,
  );
}

// Get position key for voxel (used for storing voxels in a map)
export function getVoxelKey(pos: VoxelCoord): string {
  return `${pos.x},${pos.y},${pos.z}`;
}

// Parse a voxel key back to coordinates
export function parseVoxelKey(key: string): VoxelCoord {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}

// Get all six neighbors of a voxel
export function getVoxelNeighbors(pos: VoxelCoord): VoxelCoord[] {
  return [
    { x: pos.x + 1, y: pos.y, z: pos.z },
    { x: pos.x - 1, y: pos.y, z: pos.z },
    { x: pos.x, y: pos.y + 1, z: pos.z },
    { x: pos.x, y: pos.y - 1, z: pos.z },
    { x: pos.x, y: pos.y, z: pos.z + 1 },
    { x: pos.x, y: pos.y, z: pos.z - 1 },
  ];
}