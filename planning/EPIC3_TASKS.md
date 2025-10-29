# Epic 3: Preview Engine - Task List

**Goal:** Make the timeline "play" - display correct frame at playhead position, support scrubbing and playback

**Estimate:** 3-4 hours

---

## Phase 1: Asset URL Helper & Video Loading (30 min)

### 1.1 Investigate Tauri asset protocol
- [ ] Research `convertFileSrc()` from `@tauri-apps/api/core`
- [ ] Test converting absolute path → webview-safe URL
- [ ] Verify works for both images (thumbnails) and videos

### 1.2 Update MediaPanel to use convertFileSrc
- [ ] Replace `asset://localhost/${thumbPath}` with proper helper
- [ ] Test thumbnails still load correctly
- [ ] Document the pattern for video usage

---

## Phase 2: Preview Player Component (1.5-2 hours)

### 2.1 Create `PreviewPlayer.tsx`
- [ ] Props: `{ clip: Clip | null, localMs: number, playing: boolean, onTimeUpdate }`
- [ ] Render `<video>` element
- [ ] Convert asset path to webview URL using convertFileSrc
- [ ] Set `video.currentTime = localMs / 1000` (ms → seconds)
- [ ] Handle null clip (show placeholder or black screen)

### 2.2 Clip switching logic
- [ ] Detect when `clip.assetPath` changes
- [ ] Update `<video src>` when clip changes
- [ ] Reset to new `localMs` after source change
- [ ] Handle loading states

### 2.3 Play/pause controls
- [ ] Play button (▶️)
- [ ] Pause button (⏸️)
- [ ] Space bar toggle play/pause
- [ ] Visual feedback (disabled states)

### 2.4 Time display
- [ ] Show current time (format: MM:SS or MM:SS.mmm)
- [ ] Show total timeline duration
- [ ] Format: "00:45 / 03:22"

### 2.5 Styling
- [ ] Container with appropriate aspect ratio (16:9 default)
- [ ] Black background for video
- [ ] Controls overlay or below video
- [ ] Match existing app styling

---

## Phase 3: Playback Controller (1 hour)

### 3.1 Play logic
- [ ] Play button starts `requestAnimationFrame` loop
- [ ] Advance playhead by delta time (e.g., 16.67ms for 60fps)
- [ ] Update `timelineState.playheadMs`
- [ ] Stop at end of timeline

### 3.2 Pause logic
- [ ] Pause button cancels RAF loop
- [ ] Preserves current playhead position
- [ ] Updates UI state

### 3.3 Sync playhead with video
- [ ] When scrubbing playhead → update video currentTime
- [ ] When playing → video plays naturally, RAF advances playhead
- [ ] Handle clip boundaries (pause briefly, swap source, resume)

### 3.4 Edge cases
- [ ] Playhead in gap between clips → show blank/placeholder
- [ ] Playhead past last clip → show blank/placeholder
- [ ] Very short clips (<100ms) → still switch correctly
- [ ] Loop prevention (stop at timeline end)

---

## Phase 4: Integration & Layout (30-45 min)

### 4.1 Update App.tsx layout
- [ ] Add preview player above timeline
- [ ] Adjust CSS for new layout (preview takes ~50% height)
- [ ] Ensure timeline still scrollable

### 4.2 Wire up state
- [ ] Pass `timelineState` to PreviewPlayer
- [ ] Use existing `getClipAt()` to resolve clip
- [ ] Pass `playing` state from App
- [ ] Handle play/pause events

### 4.3 Update App.css
- [ ] `.app-content` → column layout for preview + timeline
- [ ] Preview area: fixed height or flex
- [ ] Timeline area: scrollable, flex-grow
- [ ] Responsive sizing

---

## Phase 5: Testing & Polish (30 min)

### 5.1 Acceptance tests
- [ ] **Scrub through 3 clips** → preview swaps seamlessly at boundaries
- [ ] **Play at 1x speed** → playhead advances, video stays in sync
- [ ] **Pause** → both playhead and video freeze
- [ ] **Edge case:** Playhead at clip boundary → loads next clip correctly
- [ ] **Trimmed clips:** Preview respects in/out points (shows correct portion)
- [ ] **Gap handling:** Playhead in gap → blank screen (acceptable)
- [ ] **End of timeline:** Playback stops, doesn't loop

### 5.2 UX polish
- [ ] Smooth scrubbing (no lag between playhead and video)
- [ ] Clear visual feedback for play/pause state
- [ ] Loading states for video (spinner?)
- [ ] Error handling if video fails to load

### 5.3 Optional: Performance enhancement (if time permits)
- [ ] Preload next clip when nearing boundary
- [ ] Cache video elements for faster switching
- [ ] Reduce stutter at clip boundaries

---

## Key Technical Details

### Asset URL Helper
```ts
import { convertFileSrc } from '@tauri-apps/api/core';

// Convert absolute path to webview-safe URL
const videoUrl = convertFileSrc(asset.path);
// Use: <video src={videoUrl} />
```

### getClipAt Usage
```ts
import { getClipAt } from './timelineOperations';

// Already implemented in Epic 2!
const result = getClipAt(timelineState, timelineState.playheadMs);
if (result) {
  const { clip, localMs } = result;
  // clip.assetPath = path to video file
  // localMs = time within that video to show
}
```

### Video Seeking
```ts
// HTML5 video uses seconds, our timeline uses ms
videoRef.current.currentTime = localMs / 1000;
```

### Playback Loop Pattern
```ts
const animate = (timestamp: number) => {
  if (!isPlaying) return;
  
  const deltaMs = timestamp - lastTimestamp;
  setPlayheadMs(prev => Math.min(prev + deltaMs, timelineEndMs));
  
  animationFrameId = requestAnimationFrame(animate);
};
```

---

## Deferred to Later

❌ Multiple track compositing
❌ Transitions/effects preview
❌ Smooth pre-buffering (advanced)
❌ Waveform visualization
❌ Frame-accurate stepping (< > keys)
❌ Playback speed controls (0.5x, 2x)
❌ Audio-only tracks

---

## Key Files to Create/Modify

**New files:**
- `src/PreviewPlayer.tsx` - main preview component
- `src/PreviewPlayer.css` - preview styling
- `src/playbackController.ts` (optional) - playback logic helper

**Modified files:**
- `src/App.tsx` - add preview player to layout
- `src/App.css` - update layout for preview area
- `src/MediaPanel.tsx` - update to use convertFileSrc
- `src/TimelineClip.tsx` - update thumbnails to use convertFileSrc

---

## Success Criteria

✅ Can scrub playhead and see correct frame in preview  
✅ Can press play and watch timeline play back  
✅ Preview switches between clips automatically  
✅ Trimmed clips show correct portions  
✅ Audio plays in sync with video  
✅ Pause works instantly  
✅ No crashes when playhead in gaps  

---

**Ready to implement!** Start with Phase 1 to get asset loading working, then build the preview player.

