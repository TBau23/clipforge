

---

## Brief for Epic 3 — **Preview Engine (Interpreter)**

### Goal

Make the timeline “play.” Given a project JSON and playhead time `t`, the app should display the correct frame/audio from the right clip. This lets the user scrub, play, and preview edits in real time before export.

---

### Scope

* **Playhead & ruler:** draggable vertical bar representing current time.
* **Scrubbing:** drag playhead → preview updates instantly.
* **Playback:** play/pause controls advance playhead at ~30fps (or based on clip fps).
* **Clip lookup:** map global playhead time → `(clip, localTime)` using timeline JSON.
* **Preview window:** HTML `<video>` element plays the right source, jumping when crossing clip boundaries.
* **Audio:** basic sync with video (from HTML video).

---

### Out of Scope

* Multiple tracks (only 1 track for now).
* Overlays, transitions, effects.
* Smooth pre-buffering (simple source-swap is enough for MVP).

---

### Deliverables

* **Pure function:**

  ```ts
  function getClipAt(timeline: Track, playheadMs: number): { clip: Clip, localMs: number } | null;
  ```
* **React components:**

  * `TimelinePlayhead.tsx` — draggable ruler synced with state.
  * `PreviewPlayer.tsx` — wraps `<video>` element. Props: `{clip, localMs, playing}`.
* **Controller logic:**

  * `Play` button → starts interval/RAF to advance playhead.
  * `Pause` button → stop.
  * Scrubbing updates `playheadMs` directly.

---

### Acceptance Tests

* Scrub through 3 clips → preview swaps seamlessly at boundaries.
* Play at 1x speed → playhead advances, video stays in sync.
* Pause → both freeze.
* Edge case: playhead exactly at seam → loads next clip at `0ms`.
* Works with trimmed clips (in/out respected).

---

### Known MVP Limitations

* Gap handling: if playhead lands in empty space, preview shows black screen.
* Small stutter at clip boundaries (reloading `<video>` source). Acceptable for MVP.
* No multi-track compositing or transitions.

---

### Intuition

* Think of preview as an **interpreter**: at each `t`, resolve “which clip + where in that clip.”
* Don’t try to simulate the export pipeline — just cheat with `<video>` swapping.
* This makes the app *feel alive* without heavy lifting.

---

