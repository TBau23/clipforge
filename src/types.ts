// Asset represents an imported media file
export type Asset = {
  id: string;
  path: string; // absolute path, used as de-dupe key
  name: string;
  durationMs: number;
  width: number;
  height: number;
  fps?: number;
  sizeBytes?: number;
  thumbPath?: string;
};

// Error envelope returned from Rust commands
export type ErrorEnvelope = {
  code: string;
  message: string;
  hint: string;
};

// Metadata returned from probe_media command
export type MediaMetadata = {
  durationMs: number;
  width: number;
  height: number;
  fps?: number;
  sizeBytes?: number;
};

// Timeline types
export type Ms = number; // milliseconds

export type Clip = {
  id: string;
  assetPath: string;  // path to the source asset (matches key in assets Map)
  inMs: Ms;           // source in point (where in the asset this clip starts)
  outMs: Ms;          // source out point (where in the asset this clip ends, exclusive)
  startMs: Ms;        // timeline position (when this clip begins on the timeline)
};

export type Track = {
  id: string;
  clips: Clip[]; // clips must be non-overlapping and sorted by startMs
};

export type TimelineState = {
  track: Track;
  playheadMs: Ms;
};

