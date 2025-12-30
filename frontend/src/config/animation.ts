// Animation constants from design brief
export const ANIMATION = {
  // Hover effects
  HOVER_SCALE_MAIN: 1.15,
  HOVER_SCALE_NEIGHBOR: 1.05,

  // Dissolve animations
  DISSOLVE_TASK_MS: 350,      // 300-400ms range
  DISSOLVE_MILESTONE_MS: 600, // 500-700ms range

  // Focus/zoom transitions
  FOCUS_ZOOM_MS: 400,         // 350-450ms range
  UNFOCUS_MS: 300,

  // Zoom levels
  ZOOM_MILESTONE: 1.6,
  ZOOM_TASK: 2.0,

  // Blur/fade for non-focused clouds
  BLUR_PX: 7,                 // 5-10px range
  FADE_ALPHA: 0.2,            // More transparent for better focus contrast

  // Easing
  EASING: 'cubic-bezier(0.4, 0, 0.2, 1)', // cubic ease-in-out

  // Dissolve particles
  PARTICLE_COUNT: 12,         // Number of particles per dissolve
  PARTICLE_SIZE_MIN: 3,       // Min particle radius
  PARTICLE_SIZE_MAX: 8,       // Max particle radius
  PARTICLE_SPEED: 2,          // Base particle speed
  PARTICLE_LIFETIME_MS: 500,  // How long particles live

  // Overview auto-fit
  OVERVIEW_PADDING: 100,      // Padding around milestones in overview
  OVERVIEW_MAX_ZOOM: 1.2,     // Don't zoom in too much in overview
  OVERVIEW_MIN_ZOOM: 0.4,     // Don't zoom out too much
} as const;
