// Interaction and UI constants
// These are values that were previously hardcoded in components

export const INTERACTION = {
  // Zone detection (pixels from edge)
  DELETE_ZONE_SIZE: 80,
  ZONE_FADE_START: 150, // Distance at which zone intensity starts fading in

  // Long press for mobile right-click equivalent
  LONG_PRESS_DURATION_MS: 500,

  // Touch interaction padding
  TOUCH_PADDING: 15,
} as const;

export const CLOUD = {
  // Spawn animation
  SPAWN_DURATION_MS: 400,

  // Redraw optimization threshold (minimum level change to trigger redraw)
  REDRAW_THRESHOLD: 0.05,

  // Animation interpolation speeds
  POSITION_LERP_SPEED: 0.2,
  SCALE_LERP_SPEED: 0.15,
  EXPAND_LERP_SPEED: 0.1,

  // Easing function magic number (for easeOutBack)
  EASE_OUT_BACK_OVERSHOOT: 1.70158,
} as const;

export const VALIDATION = {
  // Entity limits for import
  MAX_MILESTONES: 1000,
  MAX_TASKS_PER_MILESTONE: 500,
  MAX_SUBTASKS_PER_TASK: 100,

  // Importance range
  IMPORTANCE_MIN: 1,
  IMPORTANCE_MAX: 5,
  IMPORTANCE_DEFAULT: 3,
} as const;
