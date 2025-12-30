/**
 * Color utility functions for cloud rendering
 */

/**
 * Blend two hex colors together by a ratio
 * @param color1 Starting color (hex number)
 * @param color2 Target color (hex number)
 * @param ratio Blend ratio (0 = color1, 1 = color2)
 * @returns Blended color as hex number
 */
export function blendColors(color1: number, color2: number, ratio: number): number {
  // Extract RGB components
  const r1 = (color1 >> 16) & 0xFF;
  const g1 = (color1 >> 8) & 0xFF;
  const b1 = color1 & 0xFF;

  const r2 = (color2 >> 16) & 0xFF;
  const g2 = (color2 >> 8) & 0xFF;
  const b2 = color2 & 0xFF;

  // Blend
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);

  // Recombine
  return (r << 16) | (g << 8) | b;
}

/**
 * Named colors used for cloud states
 */
export const CLOUD_COLORS = {
  // Drop target highlight
  HIGHLIGHT_BLUE: 0x4fc3f7,

  // Danger/delete zone
  DANGER_RED: 0xef4444,
  DANGER_HIGHLIGHT: 0xffcccc,

  // Complete zone
  COMPLETE_GREEN: 0x4ade80,
  COMPLETE_WHITE: 0xffffff,

  // Neglect state (storm gray from design brief)
  NEGLECT_GRAY: 0x5D6D7E,
} as const;
