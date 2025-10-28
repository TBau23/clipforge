Here’s a tight, practical epic brief for **Epic 1: Media Intake & Catalog** (aligned to your MVP).

# Epic 1 — Media Intake & Catalog

## Goal

Get files **into** the app reliably with trustworthy metadata and visuals so the timeline/preview/export have a solid base.

## Scope (what this delivers)

* Import via **drag-drop** and **file picker** (MP4/MOV).
* Probe and store **metadata** (duration, width/height, fps, size).
* Show a **media panel** listing imported clips.
* Generate and display a **thumbnail** per clip.
* Persist assets in app state (ready for timeline placement).

## Out of scope (for now)

* Proxies/transcoding
* Waveforms
* Deduping by hash
* Non-video formats

## Deliverables

* **UI:** Media panel with rows/cards: name, duration, resolution, thumbnail.
* **IPC/Rust commands:**

  * `open_dialog() -> paths[]`
  * `probe_media(path) -> {durationMs,width,height,fps?,sizeBytes?}`
  * `make_thumbnail(path, atMs=5000) -> thumbPath`
* **State model (TS):**

  ```ts
  type Asset = {
    id: string; path: string; durationMs: number;
    width: number; height: number; fps?: number;
    sizeBytes?: number; thumbPath?: string;
  };
  ```
* **Drag-drop** handler that resolves absolute paths and calls `probe_media`.

## Acceptance tests (MVP-grade)

* **Import 5 mixed files** (MP4/MOV, different codecs): all appear in Media panel.
* **Durations match ffprobe** within ~0.1s when checked manually.
* **Thumbnails render** for each clip (no broken images).
* **Non-ASCII paths** and spaces work.
* **Bad file** (corrupt/unreadable) shows a friendly error (toast) without crashing.

## UX specifics (keep it minimal)

* Media panel shows: **thumbnail | filename | duration | 1920×1080 @ 30fps | size**.
* Clicking an item **selects** it (ready to drag onto the timeline in the next epic).
* Long filenames **ellipsize**; tooltips show full path.

## Implementation notes

* **Drag-drop:** intercept drop event on the panel, filter by extension (`.mp4`, `.mov`).
* **Probe:** run `ffprobe -v error -show_streams -show_format -print_format json "<path>"`.
* **Thumbnail:** `ffmpeg -ss 5 -i "<path>" -frames:v 1 -q:v 2 "<thumb>.jpg"`.
* **Error envelope (Rust):** return `{code,message,hint}`; UI renders readable toasts.

## Intuition (why this pays rent)

* **Accurate duration** is the backbone for trim/split/export math.
* **Thumbnails** prove your FFmpeg pipeline + filesystem writes + IPC all work end-to-end.
* A clean **Asset** model lets the timeline stay a pure JSON transform.

## Edge cases to consciously handle

* File shorter than 5s → thumbnail at 0.5s fallback.
* Variable-fps files → compute fps from `r_frame_rate` safely (or omit if unreliable).
* Duplicate imports → allow for now; future epic can dedupe by path/hash.

## Quick checklist

* [ ] Drag-drop adds files
* [ ] Picker adds files
* [ ] `probe_media` wired + displayed
* [ ] `make_thumbnail` wired + displayed
* [ ] Errors surfaced (no crashes)
* [ ] Works on at least 5 real files, mixed sources

Want a copy-paste **TS hook + Rust command stubs** for `probe_media` and `make_thumbnail` next?
