// Validation constants for import/export and entity limits
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

// Metrics calculation constants from design brief
export const METRICS = {
  // Sun brightness formula: sunBrightness = clamp(SUN_BASE + SUN_MOMENTUM_FACTOR*M - SUN_LOAD_FACTOR*L, 0, 1)
  SUN_BASE: 0.2,
  SUN_MOMENTUM_FACTOR: 0.6,
  SUN_LOAD_FACTOR: 0.4,

  // Time windows (in hours)
  COMPLETION_WINDOW_HOURS: 48,
  NEGLECT_THRESHOLD_HOURS: 72,

  // Normalization factors
  MAX_MOMENTUM_COMPLETIONS: 10, // 10 completions = max momentum
  MAX_LOAD_IMPORTANCE: 50, // 50 importance = max load
} as const;
