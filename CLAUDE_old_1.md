# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mindsky** is a local-first productivity system designed for ADHD/ASD cognitive patterns. It externalizes mental landscapes into a dynamic sky of living clouds where milestones, tasks, and subtasks appear as animated cloud forms. Completing work clears clouds and reveals sunlight, providing emotional feedback rather than numeric metrics.

**Core Philosophy**: Emotion over numbers. Calm, minimal, liquid UI. Playful but structured interaction. Reduce overwhelm and encourage engagement.

---

## Development Commands

### Frontend (React + TypeScript + Vite + Pixi.js)
```bash
cd frontend
npm run dev      # Start Vite dev server
npm run build    # TypeScript compilation + production build
npm run preview  # Preview production build
npm run lint     # ESLint
```

### Backend (Node.js + Express + Prisma + SQLite)
```bash
cd backend
npm run dev        # Start dev server with hot reload (tsx watch)
npm run build      # TypeScript compilation
npm start          # Run compiled production server

# Database
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database (dev)
npm run db:migrate   # Run migrations (production)
```

---

## Architecture Overview

### Monorepo Structure
- **`frontend/`** - React SPA with Pixi.js canvas rendering
- **`backend/`** - Express API server with SQLite database
- **`design_brief.pdf`** - product specification, continually updated (READ THIS FIRST)

### Data Model (3-level hierarchy)
```
Milestone (large clouds)
  └─> Task (orbits milestone at 160-220px)
      └─> Subtask (appears only in task focus mode)
```

### Key Architectural Concepts

#### 1. **Dual Rendering System**
- **Pixi.js Canvas (`SkyCanvas.tsx`)**: High-performance cloud rendering, physics, interactions
- **React DOM**: Modals, forms, settings panel (overlays on top of canvas)

**Cloud.ts** is a Pixi.js `Container` class, NOT a React component. It manages:
- Puff-based cloud morphing (multiple circles composited into cloud shape)
- Focus mode content display (rendered INSIDE the cloud)
- Particle dissolve animations
- Hover/drag/drop visual feedback

#### 2. **Focus Mode Architecture**
Focus is implemented as **camera zoom INTO the cloud**, not abstract panels.

**Focus State Flow**:
1. User clicks cloud → `App.tsx` sets `focusedNode` state
2. `SkyCanvas.tsx` zooms camera to cloud position
3. Cloud morphs from circular puffs → expanded shape to fit content
4. Child nodes spawn in circular ring around focused node
5. Physics disables gravity for children (free movement allowed)

**Critical**: Clouds morph using **puff expansion**, never ellipses. Two morph profiles exist:
- **Profile A (Focused)**: Larger, dramatic expansion with more puffs
- **Profile B (Child-of-focused)**: Tight cohesive blob, smaller puffs

#### 3. **Physics System (`physics.ts`)**
Force-directed layout with:
- Milestone-task gravitational attraction (disabled in focus mode)
- Inter-cloud repulsion (soft boundaries)
- Drag elasticity (stretch effect during drag)
- Anchor snapping (eases back to anchor on release unless reassigned)

**Key Function**: `applyForces(nodes, focusedNodeId, inFocusMode)` - main physics tick

#### 4. **Entity Reassignment via Drag**
Drag task onto milestone → task reassigns to that milestone
Handled in `SkyCanvas.tsx` via:
- `findDropTarget()` - detects valid drop targets
- `updateDropTargetHighlights()` - visual glow feedback
- `onCloudReassign` callback - triggers API update

---

## Critical Implementation Patterns

### Working with Cloud Morphing

**Problem**: Child clouds in focus mode can become "satellite-like" if morph parameters are wrong.

**Solution**: Always use separate morph profiles for focused vs child nodes:
```typescript
// In computeMorphPuffs()
const mode = this.isChildOfFocusedNode ? "child" : "focused";

// Profile B (child) must have:
// - Fixed puff count (not area-based)
// - Higher interior ratio (>= 60%)
// - Tight ring distance factor (<= 0.60)
// - Minimal noise (<= 0.03)
// - Smaller puff radius max
```

### Puff Sizing for Natural Cloud Look

**Problem**: Uniform puff sizes create artificial "flower" patterns instead of organic clouds.

**Solution**: Use wide variance ranges with seeded RNG for determinism:
```typescript
// Ring puffs: 60% variance (0.70 to 1.30)
const pr = puffRadiusBase * (0.70 + rng.next() * 0.60);

// Interior puffs: 80% variance (0.60 to 1.40)
const interiorR = puffRadiusBase * (0.60 + rng.next() * 0.80);

// Corner anchor puffs at 45° angles guarantee content coverage
const cornerAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
```

**Key parameters for focused clouds** (in `computeMorphPuffs()`):
- `margin = 25` - Content padding around text
- `ringDistFactor = 0.55` - Puffs at 55% of coverage radius
- `puffRadiusBase = parentCoverageR * 0.25` - Larger base for overlap

### Deterministic Rendering with SeededRandom

**Problem**: Math.random() causes clouds to change appearance on re-render.

**Solution**: Use `SeededRandom` class with `createMorphSeed()`:
```typescript
// Seed combines node ID + mode + size for stability
const seed = createMorphSeed(this.node.id, mode, requiredW, requiredH);
const rng = new SeededRandom(seed);

// All random values from rng.next() are now deterministic
const variance = rng.next(); // Same value every time for same inputs
```

### Working with Focus Content

**Text duplication bug**: Always clear containers before re-layout:
```typescript
// CORRECT pattern in layoutFocusedContent()
if (!this.focusContentContainer) {
  this.focusContentContainer = new Container();
  this.addChild(this.focusContentContainer);
}

// Clear before recreating
this.focusContentContainer.removeChildren();
this.focusTitleText = null;
// ... null all text references

// Then recreate fresh
this.focusTitleText = new Text({ ... });
```

**Never** conditionally skip creation after clearing - always recreate all elements.

### Orbit Radius Calculations

When entering focus mode, orbit radius MUST account for morphed sizes:
```typescript
// Get morphed coverage radii
const parentCoverageR = parentCloud.coverageR;
const maxChildR = max(children.map(c => childCloud.coverageR));

// Calculate orbit
const ORBIT_GAP = 50;
const orbitR = parentCoverageR + ORBIT_GAP + maxChildR;

// Density guard (prevent overlap on ring)
const minArc = maxChildR * 2 + 30;
const orbitR_byArc = (childCount * minArc) / (2π);
const finalOrbitR = max(orbitR, orbitR_byArc);
```

---

## Design Brief Compliance

**Always reference `design_brief.pdf`** for product decisions. Key rules:

### Focus Mode Specifications
- Focus view occupies ~80% of viewport
- Background slightly darkened, fully frozen
- Focused cloud locked in position
- Children in circular arrangement
- Clicking sky exits focus
- ESC key exits focus
- Nested focus supported (milestone → task → subtasks)

### Interaction Rules
- Hover only scales (no magnetic pull)
- Hover shows [Done/Total] progress
- Dragging stretches cloud elastically
- Long-press equals right-click
- No multi-selection exists
- Double-click sky creates milestone
- All editing via right-click modal (NO inline editing)

### Completion Behavior
- Binary completion only (no partial states)
- Completed tasks dissolve (300-400ms)
- Completed milestones dissolve (500-700ms)
- Dissolves use particle effects + sound cues

### Visual Feedback
- Sun brightness reflects momentum + outstanding importance
- Neglected clusters darken, roughen edges, wobble
- Completed children turn green immediately
- Drop targets glow blue subtly

---

## Common Pitfalls

1. **Don't break cloud aesthetic**: Morphed clouds must remain cohesive blobs, not ellipses or satellite structures
2. **Respect focus mode physics**: Gravity disabled for children in focus, but repulsion still applies
3. **Handle null references**: Always null-check text objects before setting properties
4. **Update coverage radius**: Call `computeMorphPuffs()` whenever content changes to update `coverageR`
5. **Preserve positions**: Child positions persist during focus session, reset only on re-entry

---

## File Organization

### Frontend Critical Files
- **`App.tsx`** - Root component, focus state management
- **`components/SkyCanvas.tsx`** - Main canvas, focus camera, physics loop
- **`components/Cloud.ts`** - Cloud rendering class (Pixi.js Container)
- **`services/physics.ts`** - Force-directed layout engine
- **`types/index.ts`** - Core TypeScript interfaces
- **`config/layout.ts`** - Layout constants (radii, spacing)

### Backend Critical Files
- **`index.ts`** - Express server setup
- **`routes/*.ts`** - RESTful endpoints (milestones, tasks, subtasks, sky)
- **`services/entityService.ts`** - Business logic
- **`prisma/schema.prisma`** - Database schema

---

## Testing Focus Mode Changes

When modifying focus mode, always test:
1. **Milestone focus with 5 tasks** - tasks form clean ring, readable content
2. **Task focus with 4 subtasks** - subtasks cohesive, no overlap/"white pile"
3. **Nested focus** - milestone → task → verify subtasks appear
4. **Exit focus** - ESC key, click sky background
5. **Re-enter focus** - children reset to circular positions
6. **Long descriptions** - verify ellipsis truncation, no overflow
7. **Completion** - checkbox interaction, green tint on complete

---

## Debugging Tips

### Cloud rendering issues
- Check `computeMorphPuffs()` mode selection
- Verify `coverageR` is being set correctly
- Inspect `currentPuffs` array in update loop

### Focus mode glitches
- Check `focusedNode` state in App.tsx
- Verify camera zoom in SkyCanvas animation loop
- Ensure `inFocusMode` parameter passed to physics

### Null reference errors
- Always recreate text objects after `removeChildren()`
- Never skip element creation conditionally after clearing

### Physics behaving oddly
- Check `inFocusMode` flag in `applyForces()`
- Verify `focusedNodeId` propagation
- Inspect velocity values in console

---

## Tech Stack Summary

**Frontend**: React 18, TypeScript, Vite, Pixi.js 8.5, Tailwind CSS
**Backend**: Node.js, Express, Prisma, SQLite
**Key Libraries**: Pixi.js for WebGL canvas rendering, force-directed physics from scratch
**Deployment**: Multi-container Docker (localhost only, autosave enabled)
