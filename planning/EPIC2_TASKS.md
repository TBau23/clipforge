# Epic 2: Timeline Core - Task List

**Goal:** Build a non-destructive timeline with place/trim/delete operations (MVP scope for tonight)

**Estimate:** 4-6 hours

---

## Phase 1: Data Model & Core Logic (1 hour)

### 1.1 Extend `types.ts` with timeline types
- [ ] Add `Ms` type alias for milliseconds
- [ ] Add `Clip` type: `{ id, assetId, inMs, outMs, startMs }`
- [ ] Add `Track` type: `{ id, clips: Clip[] }`
- [ ] Add `TimelineState` type: `{ track, playheadMs }`

### 1.2 Create `timeline.ts` with pure operations
- [ ] `placeClip(state, assetId, asset)` - add clip at playhead (or end if conflict)
  - Initial clip spans full asset: `inMs=0, outMs=asset.durationMs`
  - Use current playhead position, fallback to timeline end if occupied
- [ ] `trimIn(state, clipId, newInMs)` - adjust source start
  - Clamp to `[0, clip.outMs)`, reject if would invert
- [ ] `trimOut(state, clipId, newOutMs)` - adjust source end
  - Clamp to `(clip.inMs, asset.durationMs]`, reject if would invert
- [ ] `deleteClip(state, clipId)` - remove clip (no ripple)
- [ ] `getClipAt(timelineMs)` - returns `{clip, localMs}` or `null`
  - Critical for preview: `localMs = clip.inMs + (timelineMs - clip.startMs)`
- [ ] `validate(state)` - check invariants (no overlaps, sorted, valid ranges)

**Invariants to maintain:**
- `0 ≤ inMs < outMs` (positive duration)
- No overlaps on track
- `clips` sorted by `startMs`

---

## Phase 2: UI Components (2-3 hours)

### 2.1 Create `Timeline.tsx` - main container
- [ ] Time ruler showing seconds (use pixel-per-ms scale, e.g. `100px = 1000ms`)
- [ ] Horizontal scrollable container
- [ ] Empty state: "Add clips from Media Library"
- [ ] Props: `{ state, onStateChange, assets }`

### 2.2 Create `TimelineClip.tsx` - clip rectangle
- [ ] Render as positioned `div` based on `startMs` and duration
- [ ] Show thumbnail if `asset.thumbPath` exists
- [ ] Display asset name + duration overlay
- [ ] Selection visual: blue border when selected
- [ ] Props: `{ clip, asset, isSelected, onSelect }`

### 2.3 Create `TrimHandle.tsx` - left/right drag handles
- [ ] Small vertical bars on clip edges (visible when selected)
- [ ] Mouse cursor: `ew-resize`
- [ ] Drag handlers update `inMs` (left) or `outMs` (right)
- [ ] Show live duration feedback during drag
- [ ] Props: `{ side: 'left' | 'right', onTrim }`

### 2.4 Create `Playhead.tsx` - timeline cursor
- [ ] Red vertical line with draggable head
- [ ] Position based on `playheadMs`
- [ ] Drag to scrub (updates `playheadMs`)
- [ ] Display current time tooltip
- [ ] Props: `{ timeMs, onSeek }`

### 2.5 Create CSS files
- [ ] `Timeline.css` - grid, ruler, scrolling
- [ ] Clean modern look matching existing MediaPanel style

---

## Phase 3: Integration (1-2 hours)

### 3.1 Wire up state in `App.tsx`
- [ ] Add `timelineState` to App state
- [ ] Add `selectedClipId` state for selection
- [ ] Initialize with empty track: `{ track: { id: 'main', clips: [] }, playheadMs: 0 }`

### 3.2 Connect MediaPanel → Timeline
- [ ] Add "Add to Timeline" button in MediaPanel (when asset selected)
- [ ] OR: Double-click asset to add
- [ ] Calls `placeClip()` with selected asset
- [ ] Update timeline state immutably

### 3.3 Timeline interactions
- [ ] Click clip to select (updates `selectedClipId`)
- [ ] Drag playhead to scrub (updates `playheadMs`)
- [ ] Drag trim handles (calls `trimIn`/`trimOut`)
- [ ] Keyboard: `Backspace`/`Delete` key deletes selected clip
  - Add `useEffect` with keydown listener
  - Guard: only if `selectedClipId !== null`

### 3.4 Update `App.tsx` layout
- [ ] Replace `.timeline-placeholder` with `<Timeline />` component
- [ ] Pass timeline state and handlers down

---

## Phase 4: Testing & Polish (30 min)

### 4.1 Manual acceptance tests
- [ ] **Place:** Add 3 clips, verify they appear without overlaps
- [ ] **Trim left:** Drag left handle, `inMs` changes, `startMs` stays fixed
- [ ] **Trim right:** Drag right handle, `outMs` changes
- [ ] **Trim bounds:** Can't trim beyond asset duration or invert (inMs ≥ outMs)
- [ ] **Delete:** Select clip, press Backspace → removed, others stay
- [ ] **Playhead:** Drag playhead → position updates correctly
- [ ] **getClipAt:** Console test - returns correct clip+localMs or null

### 4.2 Edge case validation
- [ ] Place clip when playhead overlaps existing → goes to end
- [ ] Trim to invalid range → operation rejected (state unchanged)
- [ ] Delete with nothing selected → no-op
- [ ] Empty timeline shows helpful message

### 4.3 Visual polish
- [ ] Clips visually distinct with borders
- [ ] Trim handles only show on selected clip
- [ ] Playhead clearly visible (z-index correct)
- [ ] Time ruler readable

---

## Deferred to Post-MVP

❌ Move clips (drag position)
❌ Split at playhead (S key)
❌ Snap-to-grid logic
❌ Multiple track support
❌ Undo/redo
❌ Additional keyboard shortcuts
❌ Drag-drop from MediaPanel to Timeline
❌ Video preview (comes in Epic 3)

---

## Key Files to Create/Modify

**New files:**
- `src/timeline.ts` - pure functions
- `src/Timeline.tsx` - main timeline UI
- `src/Timeline.css` - styles
- `src/TimelineClip.tsx` - individual clip
- `src/Playhead.tsx` - playhead component
- `src/TrimHandle.tsx` - trim handles (or inline in TimelineClip)

**Modified files:**
- `src/types.ts` - add timeline types
- `src/App.tsx` - integrate timeline state
- `src/MediaPanel.tsx` - add "Add to Timeline" button

---

## Success Criteria (MVP)

✅ Can import 3+ video files  
✅ Can add clips to timeline  
✅ Clips render as rectangles with thumbnails  
✅ Can drag playhead to scrub  
✅ Can select clips  
✅ Can trim clip in/out points with handles  
✅ Can delete clips with Backspace  
✅ Timeline state stays valid (no overlaps, sorted)  
✅ `getClipAt()` correctly maps timeline time → (clip, localMs)

---

## Implementation Tips

1. **Pure first:** Write timeline.ts functions with unit tests in console before UI
2. **Pixel math:** Choose scale constant (e.g., `PIXELS_PER_MS = 0.1` → 1 sec = 100px)
3. **Immutability:** Always return new state objects, never mutate
4. **Selection model:** Single selection for MVP (one `selectedClipId` in App state)
5. **Drag handlers:** Use `onMouseDown` + window `onMouseMove`/`onMouseUp` pattern

---

**Ready to build!** Start with Phase 1 (data model), test in console, then move to UI.

