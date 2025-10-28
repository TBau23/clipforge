# Epic 1: Media Intake & Catalog - Task List

## Setup (before implementation)
- [ ] Bundle FFmpeg as Tauri sidecar (in `src-tauri/bin/<platform>/`) OR use system FFmpeg
- [ ] Add `serde_json`, `tokio` to Cargo.toml for parsing FFmpeg output
- [ ] Create `src/types.ts` for Asset type definitions
- [ ] Create error envelope type in Rust: `{code: String, message: String, hint: String}`

---

## Backend (Rust Commands)

### Task 1.1: File Dialog
- [ ] Implement `async fn open_dialog()` command
- [ ] Filter for video files: **`.mp4`, `.mov` ONLY** (MVP scope)
- [ ] Return array of absolute paths
- [ ] Test: Can select multiple files, paths are correct

### Task 1.2: Probe Media
- [ ] Implement `async fn probe_media(path: String)` command (non-blocking)
- [ ] Run `ffprobe -v error -show_streams -show_format -print_format json`
- [ ] Parse JSON output for: duration, width, height, fps, size
- [ ] Return structured metadata object OR error envelope `{code, message, hint}`
- [ ] Handle errors: file not found → hint: "Check file path"; corrupt → hint: "Try re-downloading"
- [ ] Test: Probe 5 different files, durations match reality

### Task 1.3: Generate Thumbnail
- [ ] Implement `async fn make_thumbnail(path: String, duration_ms: u64)` command (non-blocking)
- [ ] Create thumbnails directory in AppData: `AppData/ClipForge/thumbnails/`
- [ ] Calculate time: `t = min(5000, max(500, duration_ms * 0.1))` ms
- [ ] Run `ffmpeg -ss {seconds} -i "{path}" -frames:v 1 -q:v 2 "{output}.jpg"`
- [ ] Return thumbnail absolute path OR error envelope
- [ ] Test: Generate thumbs for files: 1s, 10s, 60s, 5min → all render correctly

---

## Frontend (React/TypeScript)

### Task 2.1: Asset Type & State
- [ ] Define `Asset` type in `src/types.ts`
  ```ts
  type Asset = {
    id: string;
    path: string;  // absolute path, used as de-dupe key
    name: string;
    durationMs: number;
    width: number;
    height: number;
    fps?: number;
    sizeBytes?: number;
    thumbPath?: string;
  };
  ```
- [ ] Add `assets: Map<string, Asset>` to app state (keyed by path for de-dupe)
- [ ] Create `addAsset`, `removeAsset`, `getAssetByPath` state functions
- [ ] De-dupe logic: if path exists, select it instead of re-importing

### Task 2.2: Media Panel UI Component
- [ ] Create `MediaPanel.tsx` component
- [ ] Layout: Sidebar or top panel with scrollable list
- [ ] Display asset cards: thumbnail, name, duration, resolution
- [ ] Format duration as `MM:SS` (e.g., `02:34`)
- [ ] Format file size as `MB` (e.g., `45.2 MB`)
- [ ] Show loading spinner while probing/thumbnail generation
- [ ] Truncate long filenames with tooltip showing full path

### Task 2.3: File Picker Integration
- [ ] Add "Import Files" button to MediaPanel
- [ ] Wire to `invoke("open_dialog")`
- [ ] Check for duplicates: if path already imported, select existing asset
- [ ] For new paths: call `probe_media`, then `make_thumbnail`
- [ ] Use concurrency pool of 3-4 simultaneous operations (Promise with limit)
- [ ] Show progress indicator while importing
- [ ] Add assets to state when complete
- [ ] Handle errors: parse error envelope, show toast with `message` + `hint`

### Task 2.4: Drag & Drop
- [ ] Add drag-drop zone to MediaPanel (or entire window)
- [ ] Intercept `dragover` (preventDefault), `drop` events
- [ ] Extract file paths from `DataTransfer`
- [ ] Filter by extension: **`.mp4`, `.mov` ONLY** (MVP scope)
- [ ] Same import flow as file picker (includes de-dupe check)
- [ ] Visual feedback: highlight drop zone on dragover

### Task 2.5: Asset Selection
- [ ] Add `selectedAssetId` to state
- [ ] Click asset card → set as selected
- [ ] Visual indicator for selected asset (border/background)
- [ ] (Deferred) Multi-select with Cmd/Ctrl+click

---

## Integration & Testing

### Task 3.1: End-to-End Smoke Test
- [ ] Import via file picker: add 3 files
- [ ] Import via drag-drop: add 2 files
- [ ] Verify all 5 assets appear in MediaPanel
- [ ] Check thumbnails load correctly
- [ ] Check metadata displays correctly (duration, resolution)
- [ ] Test with files containing: spaces, non-ASCII chars

### Task 3.2: Error Handling
- [ ] Try importing corrupted file → shows error toast with hint, doesn't crash
- [ ] Try importing non-video file → filtered by extension
- [ ] Try importing from path with special characters
- [ ] FFmpeg not found → error envelope with hint: "Install FFmpeg or check PATH"
- [ ] Re-import same file → selects existing asset, no re-probe

### Task 3.3: Edge Cases
- [ ] Import video < 5 seconds → thumbnail uses `min(5s, max(0.5s, duration*0.1))`
- [ ] Import very large file (> 1GB) → doesn't hang UI (async commands)
- [ ] Import 10+ files at once → concurrency pool limits to 3-4, all complete
- [ ] Import same file twice → second import just selects existing asset

---

## Polish (if time allows)

- [ ] Add "Clear All" button to MediaPanel
- [ ] Add remove button on each asset card
- [ ] Show file extension badge on thumbnails
- [ ] Add keyboard shortcut for import (Cmd+I)
- [ ] Cache assets to `AppData/ClipForge/assets.json` (path → metadata)
- [ ] On startup: load cached assets if files still exist

---

## Definition of Done

- [ ] Can import files via picker and drag-drop
- [ ] Assets display with thumbnail, name, duration, resolution
- [ ] All metadata matches ffprobe output (± 0.1s)
- [ ] Works with 5+ mixed files (different codecs, sizes)
- [ ] Non-ASCII paths and spaces work
- [ ] Errors don't crash app, show user-friendly messages
- [ ] No console errors or warnings
- [ ] Code compiles in dev and production builds

---

## Notes

- **Thumbnail storage**: `AppData/ClipForge/thumbnails/` (created by Rust on first run)
- **Asset IDs**: Use `crypto.randomUUID()` 
- **De-dupe key**: Use absolute path as Map key
- **File size**: Get from FFprobe's `format.size`
- **FPS handling**: Use `r_frame_rate` from ffprobe, handle "0/0" gracefully
- **Concurrency**: Max 3-4 simultaneous probe/thumbnail operations
- **Thumbnail time**: `t_ms = min(5000, max(500, duration_ms * 0.1))`
- **Error envelope**: All Rust commands return `Result<T, ErrorEnvelope>`
- **Non-blocking**: All FFmpeg commands use `tokio::process::Command` (async)
- **Formats**: `.mp4`, `.mov` only for MVP

---

**Estimated Time**: 4-6 hours for full implementation + testing

