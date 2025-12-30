import type { CloudNode, Milestone } from '../types';
import { LAYOUT } from '../config/layout';

/**
 * Cache for findNeighbors results to avoid O(N) scans on every hover.
 * Invalidates when node positions change significantly.
 */
class NeighborCache {
  private cache = new Map<string, { neighbors: CloudNode[]; positions: Map<string, { x: number; y: number }> }>();
  private readonly POSITION_THRESHOLD = 20; // Invalidate if any node moved more than this

  get(nodeId: string, nodes: CloudNode[]): CloudNode[] | null {
    const cached = this.cache.get(nodeId);
    if (!cached) return null;

    // Check if positions have changed significantly
    for (const node of nodes) {
      const cachedPos = cached.positions.get(node.id);
      if (!cachedPos) return null; // New node added
      const dx = Math.abs(node.x - cachedPos.x);
      const dy = Math.abs(node.y - cachedPos.y);
      if (dx > this.POSITION_THRESHOLD || dy > this.POSITION_THRESHOLD) {
        return null; // Position changed significantly
      }
    }
    // Check if nodes were removed
    if (cached.positions.size !== nodes.length) return null;

    return cached.neighbors;
  }

  set(nodeId: string, neighbors: CloudNode[], nodes: CloudNode[]): void {
    const positions = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
      positions.set(node.id, { x: node.x, y: node.y });
    }
    this.cache.set(nodeId, { neighbors, positions });
  }

  clear(): void {
    this.cache.clear();
  }
}

const neighborCache = new NeighborCache();

export function createNodes(
  milestones: Milestone[],
  width: number,
  height: number,
  focusedNode?: CloudNode | null,
  existingNodes?: CloudNode[]
): CloudNode[] {
  const nodes: CloudNode[] = [];
  const centerX = width / 2;
  const centerY = height / 2;

  // Build a map of existing node positions for quick lookup
  const existingPositions = new Map<string, { x: number; y: number }>();
  if (existingNodes) {
    existingNodes.forEach(node => {
      existingPositions.set(node.id, { x: node.x, y: node.y });
    });
  }

  // Calculate milestone positions in a circle or grid
  const milestoneCount = milestones.length;

  milestones.forEach((milestone, i) => {
    // Use stored position if available, otherwise calculate circle position
    let mx: number, my: number;

    if (milestone.x !== undefined && milestone.y !== undefined) {
      // Use stored position from database
      mx = milestone.x;
      my = milestone.y;
    } else {
      // Fallback to circle layout for legacy data
      const angle = milestoneCount > 1
        ? (i / milestoneCount) * Math.PI * 2 - Math.PI / 2
        : 0;
      const orbitRadius = Math.min(width, height) * 0.3;

      mx = milestoneCount > 1
        ? centerX + Math.cos(angle) * orbitRadius
        : centerX;
      my = milestoneCount > 1
        ? centerY + Math.sin(angle) * orbitRadius
        : centerY;
    }

    const milestoneNode: CloudNode = {
      id: milestone.id,
      type: 'milestone',
      entity: milestone,
      x: mx,
      y: my,
      vx: 0,
      vy: 0,
      radius: LAYOUT.MILESTONE_RADIUS,
    };
    nodes.push(milestoneNode);

    // Add tasks orbiting this milestone
    const tasks = milestone.tasks || [];
    const taskCount = tasks.length;

    tasks.forEach((task, j) => {
      // Count only incomplete subtasks - completed subtasks "shrink" the parent
      const incompleteSubtaskCount = task.subtasks?.filter(st => !st.completed).length || 0;
      const taskRadius = LAYOUT.TASK_RADIUS_BASE +
        incompleteSubtaskCount * LAYOUT.TASK_RADIUS_PER_SUBTASK;

      // Use existing position if available, otherwise calculate new position
      const existingPos = existingPositions.get(task.id);
      let tx: number, ty: number;

      if (existingPos) {
        tx = existingPos.x;
        ty = existingPos.y;
      } else {
        const taskAngle = taskCount > 1
          ? (j / taskCount) * Math.PI * 2
          : 0;
        const taskOrbitRadius = LAYOUT.TASK_ORBIT_RADIUS_MIN +
          Math.random() * (LAYOUT.TASK_ORBIT_RADIUS_MAX - LAYOUT.TASK_ORBIT_RADIUS_MIN);
        tx = mx + Math.cos(taskAngle) * taskOrbitRadius;
        ty = my + Math.sin(taskAngle) * taskOrbitRadius;
      }

      const taskNode: CloudNode = {
        id: task.id,
        type: 'task',
        entity: task,
        x: tx,
        y: ty,
        vx: 0,
        vy: 0,
        radius: taskRadius,
        parentId: milestone.id,
      };
      nodes.push(taskNode);

      // Add subtasks if this task is focused OR if any of its subtasks is focused
      const isTaskFocused = focusedNode && focusedNode.id === task.id;
      const isSubtaskFocused = focusedNode && focusedNode.type === 'subtask' &&
                               task.subtasks?.some(st => st.id === focusedNode.id);
      if (isTaskFocused || isSubtaskFocused) {
        const subtasks = task.subtasks || [];
        subtasks.forEach((subtask, k) => {
          // Use existing position if available, otherwise calculate new position
          const existingSubPos = existingPositions.get(subtask.id);
          let sx: number, sy: number;

          if (existingSubPos) {
            sx = existingSubPos.x;
            sy = existingSubPos.y;
          } else {
            const subtaskAngle = (k / Math.max(subtasks.length, 1)) * Math.PI * 2;
            const subtaskOrbit = taskRadius + LAYOUT.SUBTASK_RADIUS + 20;
            sx = tx + Math.cos(subtaskAngle) * subtaskOrbit;
            sy = ty + Math.sin(subtaskAngle) * subtaskOrbit;
          }

          const subtaskNode: CloudNode = {
            id: subtask.id,
            type: 'subtask',
            entity: subtask,
            x: sx,
            y: sy,
            vx: 0,
            vy: 0,
            radius: LAYOUT.SUBTASK_RADIUS,
            parentId: task.id,
          };
          nodes.push(subtaskNode);
        });
      }
    });
  });

  return nodes;
}

// Track drag state for physics interactions
interface DragState {
  nodeId: string | null;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
}

const dragState: DragState = {
  nodeId: null,
  x: 0,
  y: 0,
  prevX: 0,
  prevY: 0,
  vx: 0,
  vy: 0,
};

// Call this when starting a drag
export function startDragPhysics(nodeId: string, x: number, y: number): void {
  dragState.nodeId = nodeId;
  dragState.x = x;
  dragState.y = y;
  dragState.prevX = x;
  dragState.prevY = y;
  dragState.vx = 0;
  dragState.vy = 0;
}

// Call this during drag to update position and calculate velocity
export function updateDragPhysics(x: number, y: number): void {
  if (!dragState.nodeId) return;

  dragState.prevX = dragState.x;
  dragState.prevY = dragState.y;
  dragState.x = x;
  dragState.y = y;

  // Calculate drag velocity
  dragState.vx = (x - dragState.prevX) * 0.8 + dragState.vx * 0.2;
  dragState.vy = (y - dragState.prevY) * 0.8 + dragState.vy * 0.2;
}

// Call this when ending a drag
export function endDragPhysics(): { vx: number; vy: number } {
  const velocity = { vx: dragState.vx, vy: dragState.vy };
  dragState.nodeId = null;
  dragState.vx = 0;
  dragState.vy = 0;
  return velocity;
}

// Reusable nodeMap to avoid allocating new Map on each frame
const nodeMap = new Map<string, CloudNode>();

/**
 * Apply physics forces to all nodes and return max velocity for idle detection
 * PERF: Returns maxVelocity so caller can determine if physics has settled
 * PERF: When isDragging=true, only calculates physics for nearby nodes (O(N) vs O(N²))
 *
 * @param focusedSubtreeIds - Set of node IDs in the focused subtree. Layout engine is authoritative
 *                           for these nodes - physics will not touch them.
 */
export function applyForces(
  nodes: CloudNode[],
  focusedNodeId?: string | null,
  inFocusMode?: boolean,
  focusedSubtreeIds?: Set<string>
): number {
  let maxVelocity = 0; // PERF: Track for idle detection
  const isDragging = dragState.nodeId !== null;

  // Build a map of nodes by ID for quick parent lookup (reuse existing map)
  nodeMap.clear();
  nodes.forEach(node => nodeMap.set(node.id, node));

  // Find the focused node to check if we need to lock its parent
  const focusedNode = focusedNodeId ? nodeMap.get(focusedNodeId) : null;
  const parentOfFocusedSubtask = focusedNode?.type === 'subtask' && focusedNode.parentId
    ? focusedNode.parentId
    : null;

  for (let i = 0; i < nodes.length; i++) {
    const nodeA = nodes[i];
    const isDragged = nodeA.id === dragState.nodeId;

    // Skip position updates for dragged node but still calculate forces on others
    if (isDragged) {
      // Update node position to match drag position
      nodeA.x = dragState.x;
      nodeA.y = dragState.y;
      nodeA.vx = 0;
      nodeA.vy = 0;
      continue;
    }

    // CRITICAL: Skip physics entirely for nodes in the focused subtree
    // Layout engine is authoritative for these positions - prevents race conditions
    if (focusedSubtreeIds?.has(nodeA.id)) {
      nodeA.vx = 0;
      nodeA.vy = 0;
      continue;
    }

    const isFocused = nodeA.id === focusedNodeId;
    const isChildOfFocused = focusedNode && nodeA.parentId === focusedNode.id;
    const isParentOfFocusedSubtask = parentOfFocusedSubtask && nodeA.id === parentOfFocusedSubtask;

    // In focus mode: background nodes get heavy damping for smooth settling
    if (inFocusMode) {
      // Skip focused node entirely (position locked by layout engine)
      if (isFocused || isParentOfFocusedSubtask) {
        continue;
      }
      // Skip children of focused node entirely (positions enforced by layout engine)
      if (isChildOfFocused) {
        continue;
      }
      // Background nodes - apply heavy damping instead of hard freeze for smooth settling
      // This prevents jank when exiting focus mode
      nodeA.vx *= 0.85;
      nodeA.vy *= 0.85;
      continue;
    } else {
      // Normal mode: focused nodes are locked, milestones stay in place
      if (isFocused || isParentOfFocusedSubtask) {
        nodeA.vx = 0;
        nodeA.vy = 0;
        continue;
      }

      // Lock milestones in place (they stay where the user puts them)
      if (nodeA.type === 'milestone') {
        nodeA.vx = 0;
        nodeA.vy = 0;
        continue;
      }
    }

    // Parent-child gravitational attraction (only for tasks, subtasks are gentler)
    // Skip gravity in focus mode to allow free movement of children
    if (nodeA.parentId && !inFocusMode) {
      const parent = nodeMap.get(nodeA.parentId);
      if (parent) {
        const dx = parent.x - nodeA.x;
        const dy = parent.y - nodeA.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
          // Determine ideal orbit radius based on node type
          const idealOrbit = nodeA.type === 'subtask'
            ? LAYOUT.SUBTASK_ORBIT_RADIUS
            : (LAYOUT.TASK_ORBIT_RADIUS_MIN + LAYOUT.TASK_ORBIT_RADIUS_MAX) / 2;

          // Calculate distance from ideal orbit
          const orbitDiff = dist - idealOrbit;

          // Normalize direction
          const nx = dx / dist;
          const ny = dy / dist;

          // Subtasks have much weaker attraction - they shouldn't push parents around
          const typeMultiplier = nodeA.type === 'subtask' ? 0.3 : 1;

          // Apply attraction toward parent (stronger when far from ideal orbit)
          const attractionForce = orbitDiff * LAYOUT.ORBIT_STIFFNESS * typeMultiplier;

          // Also apply a general pull toward parent to keep things grouped
          const gravityForce = LAYOUT.PARENT_ATTRACTION_STRENGTH * typeMultiplier;

          // Combined force toward/away from parent based on orbit position
          nodeA.vx += nx * (attractionForce + gravityForce);
          nodeA.vy += ny * (attractionForce + gravityForce);
        }
      }
    }
    // Milestones have no attraction - they stay where the user puts them

    // Repulsion between nodes (optimized with early exits and squared distance)
    // PERF: When dragging, skip repulsion checks for nodes far from the drag point
    // This reduces O(N²) to O(N) during drag operations
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeB = nodes[j];

      // PERF: During drag, only calculate repulsion for nodes near the drag point
      if (isDragging) {
        const nodeANearDrag = Math.abs(nodeA.x - dragState.x) < LAYOUT.DRAG_PUSH_RADIUS * 1.5 &&
                              Math.abs(nodeA.y - dragState.y) < LAYOUT.DRAG_PUSH_RADIUS * 1.5;
        const nodeBNearDrag = Math.abs(nodeB.x - dragState.x) < LAYOUT.DRAG_PUSH_RADIUS * 1.5 &&
                              Math.abs(nodeB.y - dragState.y) < LAYOUT.DRAG_PUSH_RADIUS * 1.5;
        // Skip if neither node is near the drag point
        if (!nodeANearDrag && !nodeBNearDrag) continue;
      }

      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;

      // Early exit: skip if definitely too far (cheap check before expensive sqrt)
      const maxDist = nodeA.radius + nodeB.radius + 150;
      if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;

      // Use squared distance to avoid sqrt when possible
      const distSq = dx * dx + dy * dy;
      const minDist = nodeA.radius + nodeB.radius + 20;
      const minDistSq = minDist * minDist;

      if (distSq < minDistSq && distSq > 0) {
        // Only calculate sqrt when we actually need to apply force
        const dist = Math.sqrt(distSq);
        const otherIsDragged = nodeB.id === dragState.nodeId;

        // Stronger repulsion when one node is being dragged
        const dragMultiplier = (isDragged || otherIsDragged) ? 3 : 1;
        const force = (minDist - dist) / dist * LAYOUT.REPULSION_STRENGTH * 0.01 * dragMultiplier;
        const fx = dx * force;
        const fy = dy * force;

        if (!isDragged) {
          nodeA.vx -= fx;
          nodeA.vy -= fy;
        }
        if (!otherIsDragged) {
          nodeB.vx += fx;
          nodeB.vy += fy;
        }
      }
    }

    // Push force from dragged cloud
    if (dragState.nodeId) {
      const dx = nodeA.x - dragState.x;
      const dy = nodeA.y - dragState.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < LAYOUT.DRAG_PUSH_RADIUS && dist > 0) {
        // Inverse distance push - stronger when closer
        const pushStrength = (1 - dist / LAYOUT.DRAG_PUSH_RADIUS) * LAYOUT.DRAG_PUSH_STRENGTH;
        const normalizedDx = dx / dist;
        const normalizedDy = dy / dist;

        // Push away from drag position
        nodeA.vx += normalizedDx * pushStrength;
        nodeA.vy += normalizedDy * pushStrength;

        // Transfer some drag velocity to nearby clouds (creates "wake" effect)
        nodeA.vx += dragState.vx * LAYOUT.DRAG_VELOCITY_TRANSFER * (1 - dist / LAYOUT.DRAG_PUSH_RADIUS);
        nodeA.vy += dragState.vy * LAYOUT.DRAG_VELOCITY_TRANSFER * (1 - dist / LAYOUT.DRAG_PUSH_RADIUS);
      }
    }

    // Add subtle jitter only when moving (to escape local minima)
    // Only for tasks and subtasks, not milestones
    const currentSpeed = Math.sqrt(nodeA.vx * nodeA.vx + nodeA.vy * nodeA.vy);
    if (currentSpeed > 0.1) {  // Only jitter if already moving
      const jitter = 0.05;
      nodeA.vx += (Math.random() - 0.5) * jitter;
      nodeA.vy += (Math.random() - 0.5) * jitter;
    }

    // Cap velocity to prevent chaos
    const speed = Math.sqrt(nodeA.vx * nodeA.vx + nodeA.vy * nodeA.vy);
    if (speed > LAYOUT.MAX_VELOCITY) {
      nodeA.vx = (nodeA.vx / speed) * LAYOUT.MAX_VELOCITY;
      nodeA.vy = (nodeA.vy / speed) * LAYOUT.MAX_VELOCITY;
    }
    // PERF: Track max velocity for idle detection
    maxVelocity = Math.max(maxVelocity, speed);

    // Apply velocity with damping
    nodeA.x += nodeA.vx;
    nodeA.y += nodeA.vy;
    nodeA.vx *= LAYOUT.DAMPING;
    nodeA.vy *= LAYOUT.DAMPING;

    // Boundary constraints removed - tasks can now follow milestones anywhere
  }

  return maxVelocity;
}

// Touch padding for mobile - increases hit area
const TOUCH_PADDING = 15;

export function findNodeAt(nodes: CloudNode[], x: number, y: number, useExtraHitArea = false): CloudNode | null {
  // Check in reverse order (top-most first)
  const padding = useExtraHitArea ? TOUCH_PADDING : 0;

  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const dx = x - node.x;
    const dy = y - node.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= node.radius + padding) {
      return node;
    }
  }
  return null;
}

export function findNeighbors(nodes: CloudNode[], targetNode: CloudNode): CloudNode[] {
  // Check cache first
  const cached = neighborCache.get(targetNode.id, nodes);
  if (cached) return cached;

  // Compute neighbors
  const neighbors = nodes.filter(node => {
    if (node.id === targetNode.id) return false;

    // Same parent = neighbor
    if (node.parentId === targetNode.parentId && node.parentId) return true;

    // Parent/child relationship = neighbor
    if (node.id === targetNode.parentId || node.parentId === targetNode.id) return true;

    // Close proximity = neighbor
    const dx = node.x - targetNode.x;
    const dy = node.y - targetNode.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const threshold = targetNode.radius + node.radius + 50;

    return dist < threshold;
  });

  // Cache for future lookups
  neighborCache.set(targetNode.id, neighbors, nodes);

  return neighbors;
}

/**
 * Clear the neighbor cache. Call this when nodes are added/removed.
 */
export function clearNeighborCache(): void {
  neighborCache.clear();
}
