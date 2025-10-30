# ClipForge Architecture Overview

## Core Architecture

ClipForge is a **Tauri-based desktop video editor** that combines a Rust backend with a React TypeScript frontend. The architecture follows a clear separation of concerns:

- **Frontend (React/TypeScript)**: UI, timeline state management, playback coordination
- **Backend (Rust/Tauri)**: Media processing via FFmpeg, file I/O, native OS integrations
- **Communication**: Tauri's `invoke()` API for commands, event system for streaming updates

The app operates on an **immutable timeline model** where clips reference source assets without modifying them. All edits are non-destructive until export.

---

## Core Data Types (`src/types.ts`)

### Asset
Represents an imported media file in the library:
```typescript
type Asset = {
  id: string;           // UUID for React keys
  path: string;         // Absolute file path (de-dupe key)
  name: string;         // Display name
  durationMs: number;   // Total asset duration
  width, height: number; // Video dimensions
  fps?: number;         // Frame rate
  thumbPath?: string;   // Generated thumbnail path
}
```

### Clip
Represents a segment of an Asset placed on the timeline:
```typescript
type Clip = {
  id: string;           // Unique clip ID
  assetPath: string;    // References parent Asset
  inMs: Ms;             // Where in the source asset this clip starts
  outMs: Ms;            // Where in the source asset this clip ends (exclusive)
  startMs: Ms;          // Position on the timeline
}
```
**Critical distinction**: `inMs/outMs` define the *source trimming*, `startMs` defines *timeline placement*.

### TimelineState
The single source of truth for the editor:
```typescript
type TimelineState = {
  track: Track;         // Single video track with clips array
  playheadMs: Ms;       // Current timeline position
}
```

---

## Core Data Flows

### 1. Import Flow (User Adds Video)
```
User → File Dialog/Drag-Drop → open_dialog() [Rust]
  → probe_media() [Rust/FFprobe] → MediaMetadata
  → make_thumbnail() [Rust/FFmpeg] → thumbnail.jpg
  → Create Asset → Add to Map<path, Asset>
```

### 2. Recording Flow (Capture Screen/Webcam)
```
User → Start Recording → start_screen_recording() [Rust]
  → FFmpeg process spawned (stored in HashMap)
  → Recording → Stop Recording → stop_screen_recording()
  → FFmpeg graceful shutdown (send 'q' to stdin)
  → File saved → Auto-import via Import Flow
```

### 3. Timeline Editing Flow
```
User Action → timelineOperations.ts helper
  → Returns new TimelineState (immutable update)
  → setTimelineState() → React re-renders
```
Operations: `placeClip()`, `trimIn()`, `trimOut()`, `deleteClip()`

### 4. Playback Flow
```
User → Play → Timeline finds Clip at playheadMs
  → getClipAt() returns { clip, localMs }
  → PreviewPlayer loads video[clip.assetPath]
  → Seeks to localMs (clip.inMs offset)
  → Video timeupdate → Update playheadMs
  → Check if reached clip.outMs → Move to next clip or stop
```

### 5. Export Flow (Two-Phase Process)
```
Phase 1: Prepare Segments
  User → Export Dialog → export_prepare() [Rust]
  → For each clip: FFmpeg extracts/scales segment
  → Returns segment paths + concat list file

Phase 2: Concatenate
  export_concat() [Rust] → FFmpeg concat demuxer
  → Emits progress events → Frontend updates progress bar
  → Final MP4 written to disk
```

---

## Rust-Frontend Communication

### Commands (Frontend → Backend)
Frontend calls Rust via `invoke<ReturnType>("command_name", { params })`:

**Media Operations**:
- `open_dialog()` → File picker, returns selected paths
- `probe_media(path)` → FFprobe metadata extraction
- `make_thumbnail(path, durationMs)` → Generate JPEG thumbnail

**Recording Operations**:
- `list_screen_devices()` → Enumerate capture devices (macOS AVFoundation)
- `start_screen_recording(recordingId, screenDevice, audioDevice)` → Spawn FFmpeg
- `start_webcam_recording(...)` → Webcam capture
- `start_combined_recording(...)` → PiP screen+webcam with filter_complex
- `stop_screen_recording(recordingId)` → Graceful FFmpeg shutdown

**Export Operations**:
- `export_prepare(request)` → Create trimmed segments
- `export_concat(listFile, outputPath, totalDurationMs)` → Final render

### Events (Backend → Frontend)
Rust emits progress updates via `app.emit_to()`:

**`export-progress` event**:
```typescript
{ stage: "prepare"|"concat"|"complete", progress: 0.0-1.0, currentMs, totalMs, message }
```
Frontend listens with `listen<ExportProgress>("export-progress", callback)`

### Error Handling
All Rust commands return `Result<T, ErrorEnvelope>`:
```rust
struct ErrorEnvelope {
  code: String,      // e.g., "FFMPEG_NOT_FOUND"
  message: String,   // Human-readable error
  hint: String       // Actionable suggestion
}
```

---

## Key Frontend Components

### App.tsx (Main Coordinator)
- Manages global state: `assets`, `timelineState`, `playing`, `selectedClipId`
- Orchestrates playback logic (auto-advance clips, handle clip endings)
- Keyboard shortcuts (Backspace/Delete for clip deletion, Space handled by PreviewPlayer)
- Connects RecordingPanel → MediaPanel → Timeline → PreviewPlayer

### PreviewPlayer.tsx (Video Playback Engine)
**Complex synchronization logic**:
1. **Effect 1**: Reload video when clip ID/trim changes
2. **Effect 2**: Seek when paused and playhead moves (scrubbing)
3. **Effect 3**: Play/pause video element
4. **Effect 4**: Space bar toggle

**Critical feature**: Checks `video.currentTime >= clip.outMs` to stop at trim boundary, then calls `onClipEnded()` to let App.tsx handle next-clip logic.

### Timeline.tsx (Visual Editor)
- Renders clips as draggable/resizable boxes
- Click-to-scrub playhead positioning
- Trim handles that call `trimIn()`/`trimOut()`
- Zoom controls (pixels-per-millisecond scaling)
- Selection state for clip operations

### RecordingPanel.tsx (Capture Interface)
Three modes: Screen, Webcam, Combined (all use native FFmpeg now)
- Generates unique `recordingId` per session
- Stores `Child` process in Rust-side `HashMap<String, Child>`
- Timer UI updates every second during recording
- On stop: sends 'q' to FFmpeg stdin for graceful shutdown

### ExportDialog.tsx (Render UI)
- Resolution options (original/1080p/720p/custom)
- Two-step export: prepare segments → concat
- Real-time progress bar driven by Rust events
- Auto-closes 2 seconds after completion

### timelineOperations.ts (Pure Functions)
**Immutable timeline transformations**:
- `placeClip(state, asset)` → Add clip, handle overlap by placing at end
- `trimIn/trimOut(state, clipId, newMs)` → Adjust source boundaries
- `deleteClip(state, clipId)` → Filter out clip (no ripple)
- `getClipAt(state, timelineMs)` → Map timeline position to (clip, localMs)
- `validate(state)` → Check invariants (no overlaps, sorted, positive durations)

---

## Critical Architecture Patterns

### 1. Playhead-Driven Rendering
The `playheadMs` is the single source of truth. Preview always shows:
```typescript
const clipAtPlayhead = getClipAt(timelineState, timelineState.playheadMs);
// Then: <PreviewPlayer clip={clipAtPlayhead?.clip} localMs={clipAtPlayhead?.localMs} />
```

### 2. Immutable Timeline State
Never mutate `timelineState.track.clips` directly. Always:
```typescript
const newState = trimIn(timelineState, clipId, newInMs);
setTimelineState(newState);
```

### 3. Asset Path as Identity
Assets use `path` as the Map key (natural de-duplication). Clips reference assets via `assetPath` string.

### 4. Two-Phase Export
**Why separate prepare/concat?**
- Phase 1 (prepare): CPU-intensive re-encoding with scaling/trimming (no progress)
- Phase 2 (concat): Fast stream copy with accurate progress tracking (FFmpeg reports time=)

### 5. Native Recording with Process Management
FFmpeg processes stored in `Arc<Mutex<HashMap<String, Child>>>`:
- Allows concurrent recordings (keyed by UUID)
- Graceful shutdown via stdin 'q' command
- 5-second timeout before force kill

### 6. Tauri Asset Protocol
Videos loaded via `convertFileSrc()` (from `assetHelper.ts`) to use Tauri's secure asset:// protocol instead of file://

---

## FFmpeg Integration

**All media operations use FFmpeg/FFprobe**:
- **Probe**: `ffprobe -show_streams -show_format -print_format json`
- **Thumbnail**: `ffmpeg -ss {time} -i {path} -frames:v 1 -q:v 2 {output}`
- **Screen Record**: `ffmpeg -f avfoundation -i "{screen}:{audio}" -c:v libx264 -preset ultrafast`
- **PiP**: `ffmpeg -i screen -i webcam -filter_complex "[1:v]scale=320:240[pip];[0:v][pip]overlay=W-w-20:H-h-20[v]"`
- **Export Segment**: `ffmpeg -ss {start} -i {path} -t {duration} -vf scale={w}:{h} -c:v libx264 -crf 23`
- **Concat**: `ffmpeg -f concat -safe 0 -i {list_file} -c copy {output}`

Binary location: Searches Homebrew paths first (`/opt/homebrew/bin`, `/usr/local/bin`) then falls back to PATH.

---

## State Persistence Note

**Currently no auto-save**: Timeline state lives only in React memory. Closing the app loses work. Future enhancement: Serialize `TimelineState` + `Assets` to JSON in app data directory.

---

## Quick Start for New Developers

1. **Run Dev Mode**: `npm run tauri dev` (starts Vite + Rust in parallel)
2. **Key Files to Understand**:
   - `src/types.ts` → Data model
   - `src/timelineOperations.ts` → Timeline logic
   - `src/App.tsx` → State orchestration
   - `src-tauri/src/lib.rs` → All Rust commands
3. **Add New Command**: 
   - Write `#[tauri::command] fn my_command()` in lib.rs
   - Add to `invoke_handler![]` array
   - Call from frontend: `invoke("my_command")`
4. **Debugging**: Check browser DevTools console + Rust stdout in terminal

---

## Known Limitations

- **Single track only**: No multi-track timeline (overlays require combined recording)
- **No undo/redo**: State transitions are one-way
- **macOS only**: Screen recording uses AVFoundation (Windows would need different backend)
- **No project files**: Timeline state not persisted
- **Trim-only editing**: No split-at-playhead or advanced effects



