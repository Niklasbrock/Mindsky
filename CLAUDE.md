# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mindsky** is a local-first productivity system for ADHD/ASD cognitive patterns. Tasks appear as animated clouds in a dynamic sky - completing work clears clouds and reveals sunlight. The system uses emotional/atmospheric feedback instead of numeric metrics.

**Core Philosophy**: Emotion over numbers. Calm, minimal UI. Playful but structured. Reduce overwhelm.

---

## Development Commands

```bash
# Frontend (React + Vite + Pixi.js)
cd frontend
npm run dev      # Start dev server (port 5173)
npm run build    # TypeScript + production build
npm run lint     # ESLint

# Backend (Express + Prisma + SQLite)
cd backend
npm run dev      # Start with hot reload (port 3001)
npm run build    # TypeScript compilation
npm run db:push  # Push schema changes to SQLite
```

---

## Architecture

### Dual View System

The app provides **two complementary views**:

1. **Sky Canvas View** (`SkyCanvas.tsx`) - Atmospheric WebGL view with cloud physics
2. **Side List View** (`SideListView/`) - Traditional hierarchical list (toggleable panel)

Both views share the same data and sync in real-time. Users can switch between views based on cognitive load.

### Dual Rendering System

The app uses **two rendering layers**:

1. **Pixi.js Canvas** (`SkyCanvas.tsx`) - WebGL rendering for clouds, physics, animations
2. **React DOM** - Modals, forms, settings, side list (overlays on canvas)

**Critical**: `Cloud.ts` is a **Pixi.js Container class**, NOT a React component. It manages:
- Puff-based cloud morphing (circles composited into cloud shapes)
- Focus mode content (rendered INSIDE the cloud)
- Particle dissolve animations
- Visual states (hover, drag, danger, complete)

### Data Model

```
Milestone (large clouds, radius: 80px)
  └─> Task (orbits at 120-160px, radius: 45px+)
      └─> Subtask (appears only in task focus mode, radius: 20px)
```

All entities have: `id`, `title`, `description?`, `importance`, `dueDate?`, `completed` (tasks/subtasks only)

### State Flow

```
App.tsx (focus state, modal state)
  └─> SkyCanvas.tsx (camera, physics loop, interactions)
      └─> Cloud.ts instances (individual cloud rendering)
          └─> physics.ts (force calculations, node management)
```

---

## Focus Mode Architecture

Focus is a **camera zoom INTO the cloud**, not an abstract panel.

**Entry Flow**:
1. User clicks cloud → `App.tsx` sets `focusedNode`
2. `SkyCanvas` zooms camera and locks focused cloud position
3. Cloud morphs via puff expansion to fit content
4. Children spawn in circular ring around focused node
5. Physics disabled for focused subtree (layout-driven)

**Key Concepts**:
- `focusLayoutPositionsRef` - Authoritative position map for focused subtree
- `refreshFocusLayout()` - Recalculates child positions on CRUD
- Two morph profiles: "focused" (large) vs "child" (compact blob)

---

## Cloud Puff System

Clouds are drawn from arrays of `Puff` objects (x, y, radius). On focus:

```typescript
// Puff generation uses seeded RNG for determinism
const seed = createMorphSeed(nodeId, mode, requiredW, requiredH);
const rng = new SeededRandom(seed);

// Variance ranges for organic look:
// Ring puffs: 0.70 + rng.next() * 0.60 (60% spread)
// Interior puffs: 0.60 + rng.next() * 0.80 (80% spread)
// Corner anchors at 45° for content coverage
```

**Key `computeMorphPuffs()` parameters**:
- `margin = 25` - Content padding
- `ringDistFactor = 0.55` - Ring puff distance from center
- `puffRadiusBase = parentCoverageR * 0.25` - Base size

---

## Physics System (`physics.ts`)

Force-directed layout with:
- **Repulsion**: Clouds push each other apart
- **Parent attraction**: Tasks pulled toward milestones
- **Orbit stiffness**: Children maintain distance from parent
- **Damping**: `0.92` velocity decay per frame

**In focus mode**: Physics SKIPPED for focused subtree. Positions come from `focusLayoutPositionsRef`.

Key function: `applyForces(nodes, focusedNodeId, inFocusMode)`

---

## Side List View

A toggleable panel that slides in from the right, providing a structured hierarchical view of all entities.

**Key Features**:
- Hierarchical display: Milestones → Tasks → Subtasks
- Filtering: Tags, completed items, sorting (due date, importance, alphabetical, creation)
- Drag-and-drop: Reorder within same parent, reassign to different parent
- Drag-from-plus: Create entities by dragging + button onto list items
- Night mode: Syncs with sky canvas night mode setting
- Responsive: Full-screen on mobile, resizable panel on desktop

**Components**:
- `SideListView.tsx` - Main panel with forwardRef for drag-to-create support
- `ListItem.tsx` - Recursive item with collapse/expand, checkboxes, drag-drop
- `ListHeader.tsx` - Filter controls (tags, completed, sort)
- `SideListToggle.tsx` - Toggle button positioned above + button
- `useListFilters.ts` - Filter/sort state management hook

**Important**: Uses `data-entity-type` and `data-entity-id` attributes for hit testing during drag-from-plus creation.

---

## Key Interaction Patterns

### Sky Canvas View

| Action | Result |
|--------|--------|
| Click cloud | Enter focus mode |
| Click sky / ESC | Exit focus mode |
| Right-click / long-press | Edit modal |
| Drag cloud | Elastic stretch, nearby repel |
| Drop on valid target | Reassign entity |
| Drag to bottom edge | Delete zone (red glow) |
| Drag to top edge | Complete zone (green glow) |
| Double-click sky | Create milestone |
| Drag + button to cloud | Create task/subtask based on target |

### Side List View

| Action | Result |
|--------|--------|
| Click item | Select/highlight |
| Checkbox click | Toggle complete/incomplete |
| Right-click item | Edit modal |
| Drag item before/after | Reorder within same parent |
| Drag item onto parent | Reassign to new parent |
| Drag + button to item | Create task/subtask based on target |
| Collapse chevron | Expand/collapse children |
| ESC key | Close list view |

---

## API Routes

```
GET  /sky                     - Full sky data with nested entities (ordered by order field)
POST /milestones              - Create milestone
POST /milestones/:id/tasks    - Create task under milestone
POST /tasks/:id/subtasks      - Create subtask under task
POST /tasks/:id/complete      - Complete task (triggers dissolve)
POST /subtasks/:id/complete   - Complete subtask
POST /tasks/:id/reassign      - Move task to different milestone
POST /subtasks/:id/promote    - Convert subtask to task
POST /tasks/reorder           - Reorder task within milestone (before/after)
POST /subtasks/reorder        - Reorder subtask within task (before/after)
POST /sky/import              - Import sky data (milestones, tasks, subtasks)
```

**Note**: Tasks and subtasks have an `order` field for manual reordering in the list view.

---

## Config Files

| File | Purpose |
|------|---------|
| `config/animation.ts` | Timings, zoom levels, fade alpha |
| `config/layout.ts` | Radii, physics constants, orbit distances |
| `config/constants.ts` | Interaction thresholds, cloud settings |

---

## Common Pitfalls

### Sky Canvas
1. **Never use ellipses for morphed clouds** - Always use puff expansion
2. **Clear containers before re-layout** - Call `removeChildren()` then recreate text
3. **Use SeededRandom for puffs** - `Math.random()` causes visual jitter on re-render
4. **Check `inFocusMode` in physics** - Focused subtree positions are layout-driven
5. **Update `requiredCoverageR`** - Call `computeMorphPuffs()` when content changes
6. **Checkbox isolation** - Use `isCheckboxEventTarget()` to prevent drag/focus on checkbox clicks
7. **Store drop target before clearing** - In drag handlers, save `currentDropTargetRef.current` to local variable before calling `updateDropTargetHighlights(null, 0, 0)`

### Side List View
1. **Maintain night mode consistency** - All subcomponents must accept and use `nightMode` prop
2. **Hit testing with data attributes** - Use `data-entity-type` and `data-entity-id` for drag-from-plus detection
3. **Reorder vs reassign validation** - Check parent IDs match for reorder, validate entity type compatibility for reassign

---

## Testing Focus Changes

1. Milestone focus with multiple tasks - ring should be visible, content readable
2. Task focus with subtasks - children cohesive, not "satellite-like"
3. Nested focus (milestone → task) - verify subtasks appear correctly
4. Exit/re-enter focus - children reset to circular positions
5. CRUD during focus - layout should refresh, not break
