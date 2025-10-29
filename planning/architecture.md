# ClipForge Architecture

**Status:** Epics 0-3 Complete (Platform, Media Intake, Timeline Core, Preview Engine)

## Overview

ClipForge is a non-destructive video editor built with Tauri (Rust backend) + React (TypeScript frontend). The architecture follows a **compiler-interpreter pattern**: the timeline is pure JSON transformations (the IR), preview is an interpreter, and export will be a compiler.

**Core Principle:** Timeline state is the single source of truth. All operations are pure functions that transform state immutably. The preview engine interprets this state in real-time.

---

## Technology Stack

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- HTML5 `<video>` for preview playback

**Backend:**
- Rust + Tauri 2.0
- FFmpeg/FFprobe (media probing & thumbnail generation)
- IPC via Tauri commands

**Storage:**
- Assets: In-memory Map<string, Asset> (by absolute path)
- Timeline: In-memory TimelineState object
- Future: Project files will be `.clipforge.json` with relative paths

---

## Data Model

All types defined in `src/types.ts`:

### Asset
Represents an imported media file with metadata.
```typescript
{
  id: string;           // UUID
  path: string;         // Absolute path (de-dupe key)
  name: string;         // Display name
  durationMs: number;   // Total asset duration
  width: number;
  height: number;
  fps?: number;
  sizeBytes?: number;
  thumbPath?: string;   // Path to generated thumbnail
}
```

### Clip
A reference to a segment of an Asset placed on the timeline.
```typescript
{
  id: string;          // UUID
  assetPath: string;   // References Asset.path
  inMs: number;        // Source in-point (where in asset)
  outMs: number;       // Source out-point (exclusive)
  startMs: number;     // Timeline position (when clip starts)
}
```

**Key insight:** `inMs/outMs` are source coordinates (which part of the asset), `startMs` is timeline coordinate (when it plays).

### TimelineState
The application's central state.
```typescript
{
  track: {
    id: string;
    clips: Clip[];     // Non-overlapping, sorted by startMs
  };
  playheadMs: number;  // Current timeline position
}
```

**Invariants** (enforced by `timelineOperations.ts`):
- Clips must not overlap
- Clips must be sorted by `startMs`
- `clip.inMs < clip.outMs` (positive duration)
- All Ms values are non-negative

---

## Architecture Layers

### Layer 1: Backend (Rust/Tauri)

**Location:** `src-tauri/src/lib.rs`

**Commands exposed via IPC:**

1. **`open_dialog() → String[]`**
   - Opens native file picker for MP4/MOV files
   - Returns array of absolute paths

2. **`probe_media(path: string) → MediaMetadata`**
   - Shells out to `ffprobe` with JSON output
   - Extracts duration, dimensions, fps, size
   - Returns structured metadata or ErrorEnvelope

3. **`make_thumbnail(path: string, durationMs: number) → string`**
   - Generates thumbnail at 10% of duration (500ms-5s range)
   - Uses `ffmpeg -ss <time> -frames:v 1`
   - Caches in `AppData/thumbnails/<md5-hash>.jpg`
   - Returns absolute path to thumbnail

**Error Handling:**
```typescript
{
  code: string;      // Machine-readable (e.g., "FFPROBE_ERROR")
  message: string;   // Human-readable error
  hint: string;      // Actionable suggestion
}
```

All commands are async and run on Tauri's async runtime (Tokio).

---

### Layer 2: Pure Timeline Core

**Location:** `src/timelineOperations.ts`

Pure functions for non-destructive editing. No side effects, no IPC.

**Operations:**

1. **`placeClip(state, asset) → TimelineState`**
   - Creates clip at playhead (or end if overlap would occur)
   - Clip initially spans full asset (inMs=0, outMs=asset.durationMs)

2. **`trimIn(state, clipId, newInMs) → TimelineState`**
   - Adjusts source in-point (trims start of clip content)
   - Validates: newInMs < clip.outMs

3. **`trimOut(state, clipId, newOutMs) → TimelineState`**
   - Adjusts source out-point (trims end of clip content)
   - Validates: newOutMs > clip.inMs

4. **`deleteClip(state, clipId) → TimelineState`**
   - Removes clip (no ripple delete yet)

5. **`getClipAt(state, timelineMs) → {clip, localMs} | null`**
   - **Critical for preview:** Maps timeline time → (clip, local time within asset)
   - Iterates clips to find which contains `timelineMs`
   - Returns `localMs = clip.inMs + (timelineMs - clip.startMs)`

6. **`validate(state) → string[]`**
   - Checks all invariants
   - Returns empty array if valid, error messages otherwise

**Design:** All functions return new state objects. Original state is never mutated.

---

### Layer 3: React Components

**Location:** `src/`

#### App.tsx (Root)
- **Owns state:** `assets` (Map), `timelineState`, `selectedClipId`, `playing`
- **Coordinates:** Media intake → Timeline operations → Preview updates
- **Keyboard handling:** Delete/Backspace removes selected clip

#### MediaPanel.tsx
- **Purpose:** Asset library + import UI
- **Features:**
  - Drag-and-drop (with `onDrop` handler)
  - File picker button (invokes `open_dialog`)
  - Parallel probing (concurrency limit: 3)
  - Thumbnail generation (optional, concurrent)
  - Asset list with metadata display
  - Double-click or "Add to Timeline" button → `onAddToTimeline`
- **Key flow:**
  ```
  Drop files → Filter paths → Probe (parallel) → 
  Generate thumbnails (parallel) → Update assets Map
  ```

#### Timeline.tsx
- **Purpose:** Visual timeline editor with ruler
- **Features:**
  - Time ruler with tick marks (1s, 5s, 10s adaptive)
  - Renders TimelineClip components for each clip
  - Playhead visualization
  - Click to seek (updates `playheadMs`)
  - Zoom controls (pixels-per-second scaling)
- **Layout:** CSS Grid for ruler + tracks

#### TimelineClip.tsx
- **Purpose:** Visual clip representation + trim handles
- **Features:**
  - Positioned by `startMs`, width by `(outMs - inMs)`
  - Thumbnail background (if available)
  - Left/right trim handles
  - Draggable handles call `trimIn`/`trimOut` operations
  - Click to select (highlights border)
  - Shows clip name + duration overlay

#### PreviewPlayer.tsx
- **Purpose:** Real-time video playback of timeline
- **Architecture:** HTML5 `<video>` element + React effects
- **Key Effects:**
  1. **Clip loading:** When clip changes (ID or trim points), reload video source
  2. **Seeking:** When paused and `localMs` changes, seek video
  3. **Playback sync:** During play, monitor video `timeupdate` events
  4. **Boundary detection:** When video reaches `clip.outMs`, trigger `onClipEnded`

**Playback Strategy:**
- Video element plays the full asset file
- Seek to `localMs` (calculated by `getClipAt`)
- Monitor `currentTime` and stop/transition at clip boundaries
- No buffering/concatenation (happens in export phase)

**Controls:**
- Play/pause button
- Timeline position display
- Space bar for play/pause

#### Playhead.tsx
- **Purpose:** Draggable playhead indicator
- **Features:**
  - Vertical line overlay on timeline
  - Drag to scrub (updates playheadMs)
  - Follows playback when playing

---

## Data Flow Examples

### 1. Import Workflow
```
User drops files
  → MediaPanel.handleDrop
  → Filter duplicates (by path)
  → For each new file:
      invoke("probe_media", {path})
        → Rust: ffprobe → MediaMetadata
      invoke("make_thumbnail", {path, durationMs})
        → Rust: ffmpeg → thumbnail path
  → Create Asset objects
  → Update assets Map
  → Re-render MediaPanel list
```

### 2. Add to Timeline
```
User clicks "Add to Timeline" (or double-clicks asset)
  → App.handleAddToTimeline
  → placeClip(timelineState, asset)
      → Creates Clip at playheadMs (or end if overlap)
      → Returns new TimelineState
  → setTimelineState(newState)
  → Timeline re-renders with new clip
  → Auto-select new clip
```

### 3. Preview Playback
```
User clicks Play
  → setPlaying(true)
  → PreviewPlayer receives playing=true
  → Effect: video.play()
  → Video fires 'timeupdate' events (~10 Hz throttle)
      → onTimeUpdate(videoTimeMs)
      → App.handleVideoTimeUpdate
          → currentClip = getClipAt(timelineState, playheadMs)
          → timelinePos = clip.startMs + (videoTimeMs - clip.inMs)
          → setTimelineState({...prev, playheadMs: timelinePos})
      → Playhead moves along timeline
  → Video reaches clip.outMs
      → PreviewPlayer fires onClipEnded
      → App.handleClipEnded
          → Look for next clip
          → If exists: move playhead, continue playing
          → If not: stop playback
```

### 4. Trim Operation
```
User drags right trim handle
  → TimelineClip.handleTrimOutDrag
  → On drag: calculate new outMs from mouse position
  → On drag end: 
      const newState = trimOut(state, clipId, newOutMs)
      onStateChange(newState)
  → Timeline re-renders with updated clip width
  → PreviewPlayer detects trim change (useEffect on clip.outMs)
      → Reloads video source
      → Seeks to current localMs
```

---

## Critical Interactions

### Playhead-Video Synchronization
**Challenge:** Keep timeline playhead in sync with video element during playback.

**Solution:**
1. Video element is the timing authority (uses RAF internally)
2. Throttle `timeupdate` events to ~10 Hz to avoid render thrashing
3. Map video time → timeline time via `getClipAt` inverse calculation
4. When crossing clip boundaries, PreviewPlayer detects via boundary check

### Trim Handle Interaction
**Challenge:** Responsive trim while maintaining state purity.

**Solution:**
1. TimelineClip tracks local drag state (visual feedback)
2. On mouse up, commit via timeline operation
3. PreviewPlayer reloads when clip identity changes (id + inMs + outMs)

### Asset Path as Key
**Why:** Prevents duplicate imports of same file.
- Assets stored in Map keyed by absolute path
- Clips reference assets via `assetPath` string
- On rehydration from project file, paths will be resolved relative to project dir

---

## State Management Pattern

**Current:** React `useState` in App.tsx (sufficient for MVP)

**Characteristics:**
- Top-down data flow (App → children via props)
- Events bubble up via callbacks (`onStateChange`, etc.)
- No global state library needed yet

**Future considerations:**
- Undo/redo will require state history (consider Zustand or Immer)
- Multi-track will expand `TimelineState.tracks` to array
- Export will serialize `TimelineState` + `assets` to project JSON

---

## File Structure

```
src/
├── App.tsx              # Root component, state coordinator
├── types.ts             # Data model definitions
├── timelineOperations.ts # Pure timeline functions
├── assetHelper.ts       # Tauri convertFileSrc wrapper
├── MediaPanel.tsx       # Asset library + import
├── Timeline.tsx         # Timeline container + ruler
├── TimelineClip.tsx     # Individual clip + trim handles
├── PreviewPlayer.tsx    # Video playback interpreter
├── Playhead.tsx         # Draggable playhead overlay
└── *.css               # Component styles

src-tauri/src/
├── main.rs             # Tauri app entry point
└── lib.rs              # IPC commands (probe, thumbnail, etc.)
```

---

## Design Decisions

### Why Pure Timeline Operations?
- Unit testable without React
- Enables future undo/redo (state snapshots)
- Clear separation: UI vs. logic
- Export compiler can reuse same operations

### Why HTML5 Video for Preview?
- Native hardware acceleration
- Simple API for seek/play/pause
- Good enough for single-track MVP
- Complex multi-track will need WebCodecs or offscreen render

### Why Absolute Paths Internally?
- Tauri requires absolute paths for file access
- Simplifies drag-and-drop (event provides absolute paths)
- Project save/load will normalize to relative paths

### Why Single Track?
- MVP scope (simplifies overlap logic)
- Easy to extend to array of tracks later
- Most common use case for short-form content

### Why No Project Persistence Yet?
- Epic 5 (future)
- Need stable format first (current state is the format)
- Autosave will write to temp, manual save to user-chosen location

---

## Performance Considerations

### Import Bottlenecks
- **Probing:** Parallel with concurrency limit (3)
- **Thumbnails:** Parallel, optional (can skip for fast import)
- **Large files:** FFprobe is fast (<100ms for 1GB file)

### Timeline Rendering
- **Clips:** Direct DOM (not canvas) for now
- **Zoom:** CSS transform scale (no re-render)
- **Future:** Virtualize for 100+ clips

### Video Playback
- **Single clip:** Native video decode (hardware accelerated)
- **Clip transitions:** Slight stutter possible (needs buffering)
- **Future:** Proxy files (720p) for scrubbing large 4K assets

---

## Known Limitations & Future Work

### Current Scope (Epics 0-3)
- ✅ Single track only
- ✅ No ripple editing
- ✅ No snap-to-grid (planned for Epic 2 stretch)
- ✅ No undo/redo
- ✅ No project save/load
- ✅ No export (Epic 4)

### Next: Epic 4 (Export)
- Segment generation: FFmpeg `-ss/-to` for each clip
- Concat demuxer or filter_complex
- Progress events via Tauri event system
- Normalize heterogeneous codecs (H.264/AAC fallback)

### Post-MVP (Epics 5-7)
- Project persistence + autosave/recovery
- Multi-track support
- Transitions, effects, text overlays
- Screen/webcam recording integration

---

## Testing Strategy (Future)

### Timeline Operations
- Unit tests with Vitest (pure functions)
- Test invariant violations (overlap, negative duration, etc.)
- Test edge cases (empty timeline, single clip, etc.)

### Integration
- E2E with Tauri test harness
- Test import → edit → preview flow
- Mock FFmpeg for CI

### Manual Testing Checklist
- Import mixed codecs (H.264, HEVC, etc.)
- Trim near clip boundaries
- Playback across 3+ clips
- Drag-and-drop from Finder
- Non-ASCII filenames

---

## Debugging Tips

### Video Won't Play
1. Check browser console for CORS errors (Tauri asset protocol)
2. Verify FFprobe returned valid metadata
3. Check video codec (Safari requires H.264, not all codecs work)

### Playhead Stutters
1. Reduce `timeupdate` throttle in App.tsx (currently 100ms)
2. Check for excessive re-renders (React DevTools profiler)
3. Verify clip boundaries are calculated correctly

### Import Fails
1. Check FFmpeg/FFprobe installed: `which ffmpeg`
2. Look at Rust logs in terminal
3. Verify file permissions (sandbox restrictions on some OSes)

---

## Entry Points for New Developers

1. **Understand data model:** Read `types.ts` + `timelineOperations.ts`
2. **Trace import flow:** Start at `MediaPanel.tsx:importFiles`
3. **Trace playback:** Start at `PreviewPlayer.tsx` useEffect hooks
4. **Trace editing:** Start at `TimelineClip.tsx` trim handlers → `App.tsx` state updates
5. **Rust backend:** Start at `lib.rs:probe_media` (simplest command)

**Key function to understand everything:** `getClipAt()` in `timelineOperations.ts`
- This is the interpreter core
- Maps timeline time → (clip, asset time)
- Used by preview, export, and any playback system

---

*Last Updated: Epic 3 Complete (Preview Engine)*

