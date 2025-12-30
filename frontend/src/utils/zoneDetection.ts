import { INTERACTION } from '../config/constants';

const { DELETE_ZONE_SIZE, ZONE_FADE_START } = INTERACTION;

/**
 * Check if position is in complete zone (TOP edge only)
 */
export function isInCompleteZone(
  _x: number,
  y: number,
  _width: number,
  _height: number
): boolean {
  return y < DELETE_ZONE_SIZE;
}

/**
 * Check if position is in delete zone (LEFT, RIGHT, BOTTOM edges - NOT top)
 */
export function isInDeleteZone(
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  // Top edge is complete zone, not delete zone
  if (y < DELETE_ZONE_SIZE) return false;
  // Left, right, or bottom edges are delete zones
  return x < DELETE_ZONE_SIZE || x > width - DELETE_ZONE_SIZE ||
         y > height - DELETE_ZONE_SIZE;
}

/**
 * Calculate complete zone intensity (0-1) based on proximity to TOP edge
 * Returns 0 when far from zone, 1 when fully in zone
 */
export function calculateCompleteZoneIntensity(
  _x: number,
  y: number,
  _width: number,
  _height: number
): number {
  const distToTop = y;
  if (distToTop > ZONE_FADE_START) return 0;
  if (distToTop <= DELETE_ZONE_SIZE) return 1;
  return 1 - (distToTop - DELETE_ZONE_SIZE) / (ZONE_FADE_START - DELETE_ZONE_SIZE);
}

/**
 * Calculate delete zone intensity (0-1) based on proximity to edge (excluding top)
 * Returns 0 when far from zone, 1 when fully in zone
 */
export function calculateDeleteZoneIntensity(
  x: number,
  y: number,
  width: number,
  height: number
): number {
  // Calculate distance to each edge (excluding top - that's complete zone)
  const distToLeft = x;
  const distToRight = width - x;
  const distToBottom = height - y;

  // Find minimum distance to delete zone edges (not top)
  const minDist = Math.min(distToLeft, distToRight, distToBottom);

  // Start showing effect at ZONE_FADE_START from edge, full intensity at DELETE_ZONE_SIZE
  if (minDist > ZONE_FADE_START) return 0;
  if (minDist <= DELETE_ZONE_SIZE) return 1;

  // Linear interpolation between ZONE_FADE_START and DELETE_ZONE_SIZE
  return 1 - (minDist - DELETE_ZONE_SIZE) / (ZONE_FADE_START - DELETE_ZONE_SIZE);
}

/**
 * Combined zone detection result
 */
export interface ZoneState {
  inCompleteZone: boolean;
  inDeleteZone: boolean;
  completeIntensity: number;
  deleteIntensity: number;
}

/**
 * Get complete zone state for a position
 */
export function getZoneState(
  x: number,
  y: number,
  width: number,
  height: number
): ZoneState {
  return {
    inCompleteZone: isInCompleteZone(x, y, width, height),
    inDeleteZone: isInDeleteZone(x, y, width, height),
    completeIntensity: calculateCompleteZoneIntensity(x, y, width, height),
    deleteIntensity: calculateDeleteZoneIntensity(x, y, width, height),
  };
}
