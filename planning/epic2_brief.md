Here’s a tight brief for **Epic 2 — Timeline Core**.

# Goal

Have a **non-destructive, pure** timeline model and editing ops that let you place, trim, and delete clips—clean JSON only. This unlocks Preview and Export without UI rewrites.

# Why this matters (first principles)

* **Timeline = data, not pixels.** If the model is solid, UI is just a view and Export is just evaluation.
* **Purity ⇒ testability.** Pure functions mean easy unit tests and safe undo/redo later.

# Scope (MVP - Tonight's Deadline!)

* One **video track** (add overlay track in Epic 4/7).
* **Core ops**: **place**, **trim in/out**, **delete**.
* **UI**: Visual timeline, draggable playhead, click to select, trim handles on selected clip.
* Selection model (single selection), **Backspace** to delete.

# Out of scope (defer to post-MVP)

* Move clips after placement (trim instead), split at playhead, snap logic, transitions, effects, PiP, audio tracks, ripple-edit, grouping, undo/redo, keyboard shortcuts beyond Delete.


## Data model (TS)

```ts
export type Ms = number;

export type Clip = {
  id: string;
  assetPath: string;  // ⚠️ CHANGED: path to source asset (matches Map key)
  inMs: Ms;           // source in (where in the asset this clip starts)
  outMs: Ms;          // source out (where in the asset this clip ends, exclusive)
  startMs: Ms;        // timeline position (when this clip begins on the timeline)
};

export type Track = { id: string; clips: Clip[] }; // clips non-overlapping & sorted by startMs
export type TimelineState = { track: Track; playheadMs: Ms };
```

**Invariants**

* `0 ≤ inMs < outMs`, `duration = outMs - inMs > 0`
* No overlap on the same track.
* `clips` sorted by `startMs`.

**Key Concept Clarification**
* **Trim** changes `inMs/outMs` (duration) ⚠️ **UPDATED:** Also changes `startMs` when trimming left edge (see Implementation Notes)
* **Move** (deferred) keeps duration fixed but changes `startMs` (timeline position)
* For MVP: clips are **immovable after placement** - use trim to adjust instead

---

## Pure operations (MVP subset)

```ts
// Core operations needed for MVP
export function placeClip(s: TimelineState, asset: Asset): TimelineState; // ⚠️ Simplified signature
export function trimIn(s: TimelineState, clipId: string, newInMs: Ms): TimelineState;
export function trimOut(s: TimelineState, clipId: string, newOutMs: Ms): TimelineState;
export function deleteClip(s: TimelineState, clipId: string): TimelineState;

// Query/utility functions
export function getClipAt(s: TimelineState, timelineT: Ms): { clip: Clip; localMs: Ms } | null;
export function validate(s: TimelineState): string[]; // returns invariant violations (empty = OK)

// Deferred to post-MVP
// export function moveClip(s: TimelineState, clipId: string, newStartMs: Ms): TimelineState;
// export function splitAt(s: TimelineState, clipId: string, atLocalMs: Ms): TimelineState;
// export function snapTime(t: Ms, s: TimelineState, gridMs = 100, epsilon = 8): Ms;
```

**Behavior notes**

* `placeClip`: 
  - Places clip at **current playhead position** by default
  - Initial `inMs = 0`, `outMs = asset.durationMs` (full asset)
  - If conflict with existing clip, place at **end of timeline**
  - Returns new state with clip added
  
* `trimIn/trimOut`: 
  - Adjust source in/out points ⚠️ **UPDATED:** `trimIn` also adjusts `startMs` (see Implementation Notes)
  - If resulting `duration = outMs - inMs ≤ 0` → reject (return original state)
  - Clamp to asset boundaries: `0 ≤ newInMs < outMs ≤ asset.durationMs`
  - **Collision detection:** Prevents overlaps with neighbor clips
  
* `deleteClip`: Remove clip from track; other clips unaffected (no ripple)

* `getClipAt`: 
  - Returns `{clip, localMs}` where `localMs = inMs + (timelineT - startMs)`
  - Returns `null` if no clip at that timeline position
  - Critical for preview: this tells us which frame to show
  
* All ops return **new state** (immutability)

---

## UI affordances (MVP)

### Components
* `Timeline.tsx` - main timeline container with time ruler
* `TimelineClip.tsx` - individual clip with trim handles
* `Playhead.tsx` - draggable playhead indicator

### Interactions
* **Add to timeline:** Click asset in MediaPanel → "Add to Timeline" button (or double-click)
  - Places at playhead position (or end of timeline if conflict)
  
* **Playhead:** Drag red playhead line to scrub through timeline
  - Updates `timelineState.playheadMs`
  
* **Selection:** Click clip to select (highlight border)
  - Shows trim handles on left/right edges
  
* **Trim handles:** Drag left/right edges of selected clip
  - Left handle: updates `inMs` (changes where clip starts in source)
  - Right handle: updates `outMs` (changes where clip ends in source)
  - Visual feedback: show current duration while dragging
  
* **Delete:** Press `Backspace` or `Delete` key when clip selected
  - Removes clip from timeline

### Visual Design
* Timeline grid: show time markers every second
* Clips: render as rectangles with thumbnail, asset name, duration
* Selected clip: blue border + visible trim handles
* Playhead: red vertical line, draggable
* Empty timeline: "Drag clips here" placeholder

**Deferred to post-MVP:**
* Drag-move clips, split (S key), snap-to-grid, keyboard shortcuts beyond Delete

---

## Acceptance tests (MVP)

* **Place clips:** Add 3 clips to timeline → all appear, no overlaps, sorted by position
* **Trim:** Drag left handle → `inMs` AND `startMs` update, duration changes, RIGHT edge stays anchored ⚠️ CHANGED
* **Trim:** Drag right handle → `outMs` updates, duration changes, LEFT edge stays anchored
* **Trim bounds:** Cannot trim beyond asset boundaries, invert (inMs ≥ outMs), or into neighbor clips
* **Delete:** Press Backspace on selected clip → clip removed, others unaffected
* **Playhead:** Drag playhead → position updates, shows correct time
* **getClipAt:** Returns correct `(clip, localMs)` for any timeline position
  - Before first clip → null
  - During clip → correct clip + local time
  - Gap between clips → null
  - After last clip → null
* **validate():** Returns `[]` for normal timeline; detects overlaps/inversions if forced

**Post-MVP tests (deferred):**
* Move clips, split at playhead, snap-to-grid, keyboard shortcuts

---

## Edge cases to guard (MVP)

* **Trim to zero/negative duration:** If `newInMs ≥ outMs` or `newOutMs ≤ inMs` → reject (return original state)
* **Trim beyond asset bounds:** Clamp to `[0, asset.durationMs]`
* **Place with conflict:** If playhead position overlaps existing clip → place at end of timeline instead
* **Floating point drift:** Store **integers (ms)** only, no floats
* **Empty timeline:** Show placeholder "Add clips to timeline" message
* **No selection + Delete key:** No-op (nothing to delete)

**Post-MVP edge cases (deferred):**
* Move near neighbors (clamping), split at clip boundaries, snap epsilon handling

---

## Performance notes

* Keep `clips` sorted; after each op, **binary-search** neighbors to check overlap.
* For large N, maintain an interval index; for MVP, linear scan is fine (<100 clips).

---

## Intuition (how to think about it)

* The timeline is a **list of non-overlapping intervals** that reference assets. All editing is **interval math**.
* The playhead → `(clip, localMs)` mapping is your **preview interpreter**.
* Export later reads the same JSON and compiles it with FFmpeg—no extra state needed.

---

## Optional (tiny undo/redo now, or later)

* Keep a ring buffer of prior `TimelineState` snapshots (e.g., last 50).

  * `undo()` pops; `redo()` re-applies.
  * Costs are small since state is JSON.

---

## Hand-off to next epics

* **Preview (Epic 3):** uses `getClipAt(t)`; sets `<video>.currentTime = localMs`.
* **Export (Epic 4):** flattens ordered clips into segment cuts from `in/out` and `startMs`.

---

## Implementation checklist (MVP - Tonight!)

**Model (1 hour)** ✅
* [x] `types.ts`: Add `Clip`, `Track`, `TimelineState` types
* [x] `timelineOperations.ts`: Pure functions - `placeClip`, `trimIn`, `trimOut`, `deleteClip`, `getClipAt`, `validate`
* [x] Quick manual tests in console

**UI Components (2-3 hours)** ✅
* [x] `Timeline.tsx`: Main timeline container with time ruler
* [x] `TimelineClip.tsx`: Clip rectangle with thumbnail + trim handles (with Pointer Events)
* [x] `Playhead.tsx`: Draggable red line
* [x] Integrate into `App.tsx`

**Interactions (1-2 hours)** ✅
* [x] Click asset in MediaPanel → "Add to Timeline" button
* [x] Drag playhead to scrub
* [x] Click clip to select (show trim handles)
* [x] Drag trim handles to adjust in/out (with edge scrolling)
* [x] Press Backspace to delete selected clip

**Testing (30 min)** ✅
* [x] Add 3 clips, verify no overlaps
* [x] Trim both handles, verify duration updates
* [x] Delete clip, verify others unaffected
* [x] `getClipAt` works at various timeline positions
* [x] Collision detection prevents overlaps
* [x] Edge scrolling works smoothly

**Total estimate: 4-6 hours**

**Deferred to post-MVP:**
* [ ] Snap logic, split at playhead, move clips, keyboard shortcuts, undo/redo

---

---

## ✅ IMPLEMENTATION NOTES (Completed)

### Deviations from Original Brief

**1. Data Model Changes**
- **Changed:** `Clip.assetId` → `Clip.assetPath`
- **Reason:** Assets Map is keyed by `path` (for deduplication), not `id`. Using `assetPath` makes lookups consistent.

**2. Trim Behavior Enhancement** ⚠️ MAJOR CHANGE
- **Original:** `startMs` stays fixed when trimming (clip position doesn't move)
- **Implemented:** Edge you drag follows your mouse (industry standard UX)
  - Left handle: right edge stays anchored, left edge + startMs both change
  - Right handle: left edge stays anchored, right edge changes
- **Reason:** Original behavior was confusing - both handles seemed to do the same thing. New behavior matches Premiere/Final Cut/DaVinci.
- **Tradeoff:** Required collision detection to prevent overlaps when left edge moves

**3. Collision Detection Added**
- **Added:** Checks for neighbor overlaps during trim operations
- Left trim: prevents moving into previous clip or before timeline start
- Right trim: prevents extending into next clip
- **Not in original brief:** Required due to trim behavior change

**4. UX Enhancements**
- **Pointer Events API:** Used `setPointerCapture()` instead of mouse events for better drag tracking
- **Edge scrolling:** Timeline auto-scrolls when dragging trim handles near viewport edges (50px threshold)
- **Button hover states:** Added `.timeline-button` class with proper hover styling
- **Debouncing:** Only update trim when change >10ms to reduce jank

**5. Implementation Details**
- **File naming:** `timelineOperations.ts` instead of `timeline.ts` (avoid case-sensitivity conflict with `Timeline.tsx` on macOS)
- **placeClip signature:** Takes `placeClip(state, asset)` instead of `placeClip(state, assetId, asset)` - simpler, asset already contains path

### What Worked Well
- Pure functions made testing/debugging easy
- Immutable state updates prevented bugs
- Pointer capture solved mouse escape issues
- Edge scrolling made trimming feel professional

### Known Limitations (Acceptable for MVP)
- No undo/redo (deferred to later)
- No snap-to-grid (deferred to later)
- Single track only (multi-track in Epic 4/7)
- Can't move clips after placement (trim-only workflow)

---


**STATUS: ✅ COMPLETED** - All MVP scope delivered with UX enhancements.
