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
  assetId: string;
  inMs: Ms;        // source in (where in the asset this clip starts)
  outMs: Ms;       // source out (where in the asset this clip ends, exclusive)
  startMs: Ms;     // timeline position (when this clip begins on the timeline)
};

export type Track = { id: string; clips: Clip[] }; // clips non-overlapping & sorted by startMs
export type TimelineState = { track: Track; playheadMs: Ms };
```

**Invariants**

* `0 ≤ inMs < outMs`, `duration = outMs - inMs > 0`
* No overlap on the same track.
* `clips` sorted by `startMs`.

**Key Concept Clarification**
* **Trim** changes `inMs/outMs` (duration) but keeps `startMs` fixed (clip stays in same timeline position)
* **Move** (deferred) keeps duration fixed but changes `startMs` (timeline position)
* For MVP: clips are **immovable after placement** - use trim to adjust instead

---

## Pure operations (MVP subset)

```ts
// Core operations needed for MVP
export function placeClip(s: TimelineState, assetId: string, asset: Asset): TimelineState;
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
  - Adjust source in/out points; `startMs` stays fixed (clip doesn't move on timeline)
  - If resulting `duration = outMs - inMs ≤ 0` → reject (return original state)
  - Clamp to asset boundaries: `0 ≤ newInMs < outMs ≤ asset.durationMs`
  
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
* **Trim:** Drag left handle → `inMs` updates, duration changes, clip stays at same timeline position
* **Trim:** Drag right handle → `outMs` updates, duration changes
* **Trim bounds:** Cannot trim beyond asset boundaries or invert (inMs ≥ outMs)
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

**Model (1 hour)**
* [ ] `types.ts`: Add `Clip`, `Track`, `TimelineState` types
* [ ] `timeline.ts`: Pure functions - `placeClip`, `trimIn`, `trimOut`, `deleteClip`, `getClipAt`, `validate`
* [ ] Quick manual tests in console

**UI Components (2-3 hours)**
* [ ] `Timeline.tsx`: Main timeline container with time ruler
* [ ] `TimelineClip.tsx`: Clip rectangle with thumbnail + trim handles
* [ ] `Playhead.tsx`: Draggable red line
* [ ] Integrate into `App.tsx`

**Interactions (1-2 hours)**
* [ ] Click asset in MediaPanel → "Add to Timeline" button
* [ ] Drag playhead to scrub
* [ ] Click clip to select (show trim handles)
* [ ] Drag trim handles to adjust in/out
* [ ] Press Backspace to delete selected clip

**Testing (30 min)**
* [ ] Add 3 clips, verify no overlaps
* [ ] Trim both handles, verify duration updates
* [ ] Delete clip, verify others unaffected
* [ ] `getClipAt` works at various timeline positions

**Total estimate: 4-6 hours**

**Deferred to post-MVP:**
* [ ] Snap logic, split at playhead, move clips, keyboard shortcuts, undo/redo

---

## Ready to implement?

This MVP scope gets you a **working timeline** for preview and export. Simplified from original brief to meet tonight's deadline.
