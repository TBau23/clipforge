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

