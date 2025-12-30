// Layout constants from design brief
export const LAYOUT = {
  // Physics model
  TASK_ORBIT_RADIUS_MIN: 120,
  TASK_ORBIT_RADIUS_MAX: 160,

  // Cloud sizes (base radius in pixels)
  MILESTONE_RADIUS: 80,
  TASK_RADIUS_BASE: 45,
  TASK_RADIUS_PER_SUBTASK: 5,
  SUBTASK_RADIUS: 20,

  // Force-directed layout
  REPULSION_STRENGTH: 150,
  DAMPING: 0.92,

  // Drag interaction physics
  DRAG_PUSH_RADIUS: 50,      // How far the drag effect reaches
  DRAG_PUSH_STRENGTH: 4,      // How strongly clouds are pushed
  DRAG_VELOCITY_TRANSFER: 0.3, // How much drag velocity transfers to nearby clouds

  // Bounce physics
  BOUNCE_ELASTICITY: 0.6,     // Bounciness off boundaries
  MAX_VELOCITY: 5,           // Cap velocity to prevent chaos

  // Parent-child attraction (gravity)
  PARENT_ATTRACTION_STRENGTH: 0.01,  // How strongly children are pulled toward parents (reduced from 0.02)
  ORBIT_STIFFNESS: 0.005,            // How strongly children try to maintain orbit distance (reduced from 0.01)
  SUBTASK_ORBIT_RADIUS: 60,          // Ideal orbit radius for subtasks around tasks

  // Release momentum
  RELEASE_VELOCITY_MULTIPLIER: 3,    // How much drag velocity transfers on release (skoot factor)

  // Canvas padding
  PADDING: 50,
} as const;
