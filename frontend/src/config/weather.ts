// Weather/sunlight system constants from design brief
export const WEATHER = {
  // Sun brightness formula: sunBrightness = clamp(0.2 + 0.6*M - 0.4*L, 0, 1)
  // M = momentum (recent completion velocity)
  // L = outstanding importance load
  SUN_BASE: 0.2,
  SUN_MOMENTUM_FACTOR: 0.6,
  SUN_LOAD_FACTOR: 0.4,

  // Completion rate window
  COMPLETION_WINDOW_HOURS: 48,

  // Storm thresholds
  NEGLECT_THRESHOLD_HOURS: 72,
  STORM_WOBBLE_AMPLITUDE: 3,

  // Sky gradient colors
  SKY_COLORS: {
    bright: ['#87CEEB', '#E0F7FF'],  // Clear day
    normal: ['#4A90D9', '#87CEEB'],   // Normal
    stormy: ['#2C3E50', '#5D6D7E'],   // Neglected/stormy
  },
} as const;
