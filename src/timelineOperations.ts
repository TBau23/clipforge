import { Asset, Clip, Ms, TimelineState, Track } from "./types";

/**
 * Places a new clip on the timeline at the playhead position (or end if conflict).
 * Initial clip spans the full asset (inMs=0, outMs=asset.durationMs).
 */
export function placeClip(
  state: TimelineState,
  asset: Asset
): TimelineState {
  const newClip: Clip = {
    id: crypto.randomUUID(),
    assetPath: asset.path,
    inMs: 0,
    outMs: asset.durationMs,
    startMs: state.playheadMs,
  };

  // Check if placement would cause overlap at playhead position
  const wouldOverlap = hasOverlapAt(
    state.track.clips,
    newClip.startMs,
    newClip.startMs + (newClip.outMs - newClip.inMs)
  );

  if (wouldOverlap) {
    // Place at end of timeline instead
    const endOfTimeline = getTimelineEnd(state.track);
    newClip.startMs = endOfTimeline;
  }

  // Insert clip in sorted position
  const newClips = [...state.track.clips, newClip].sort(
    (a, b) => a.startMs - b.startMs
  );

  return {
    ...state,
    track: {
      ...state.track,
      clips: newClips,
    },
  };
}

/**
 * Adjusts the source in-point of a clip (where it starts within the asset).
 * The clip's timeline position (startMs) stays fixed.
 */
export function trimIn(
  state: TimelineState,
  clipId: string,
  newInMs: Ms
): TimelineState {
  const clip = state.track.clips.find((c) => c.id === clipId);
  if (!clip) return state;

  // Validate: must maintain positive duration
  if (newInMs >= clip.outMs) return state; // would invert or zero duration
  if (newInMs < 0) return state; // can't be negative

  const newClips = state.track.clips.map((c) =>
    c.id === clipId ? { ...c, inMs: newInMs } : c
  );

  return {
    ...state,
    track: {
      ...state.track,
      clips: newClips,
    },
  };
}

/**
 * Adjusts the source out-point of a clip (where it ends within the asset).
 * The clip's timeline position (startMs) stays fixed.
 */
export function trimOut(
  state: TimelineState,
  clipId: string,
  newOutMs: Ms
): TimelineState {
  const clip = state.track.clips.find((c) => c.id === clipId);
  if (!clip) return state;

  // Validate: must maintain positive duration
  if (newOutMs <= clip.inMs) return state; // would invert or zero duration

  const newClips = state.track.clips.map((c) =>
    c.id === clipId ? { ...c, outMs: newOutMs } : c
  );

  return {
    ...state,
    track: {
      ...state.track,
      clips: newClips,
    },
  };
}

/**
 * Removes a clip from the timeline. Other clips are unaffected (no ripple).
 */
export function deleteClip(
  state: TimelineState,
  clipId: string
): TimelineState {
  const newClips = state.track.clips.filter((c) => c.id !== clipId);

  return {
    ...state,
    track: {
      ...state.track,
      clips: newClips,
    },
  };
}

/**
 * Maps a timeline time to a (clip, localMs) pair.
 * Returns null if no clip exists at that timeline position.
 * 
 * Critical for preview: localMs tells us which frame to show from the asset.
 */
export function getClipAt(
  state: TimelineState,
  timelineMs: Ms
): { clip: Clip; localMs: Ms } | null {
  for (const clip of state.track.clips) {
    const clipDuration = clip.outMs - clip.inMs;
    const clipEnd = clip.startMs + clipDuration;

    if (timelineMs >= clip.startMs && timelineMs < clipEnd) {
      const localMs = clip.inMs + (timelineMs - clip.startMs);
      return { clip, localMs };
    }
  }

  return null;
}

/**
 * Validates timeline state invariants.
 * Returns array of error messages (empty array = valid).
 */
export function validate(state: TimelineState): string[] {
  const errors: string[] = [];
  const clips = state.track.clips;

  // Check each clip's internal consistency
  for (const clip of clips) {
    if (clip.inMs < 0) {
      errors.push(`Clip ${clip.id}: inMs (${clip.inMs}) is negative`);
    }
    if (clip.inMs >= clip.outMs) {
      errors.push(
        `Clip ${clip.id}: inMs (${clip.inMs}) >= outMs (${clip.outMs})`
      );
    }
    if (clip.startMs < 0) {
      errors.push(`Clip ${clip.id}: startMs (${clip.startMs}) is negative`);
    }
  }

  // Check clips are sorted by startMs
  for (let i = 1; i < clips.length; i++) {
    if (clips[i].startMs < clips[i - 1].startMs) {
      errors.push(
        `Clips not sorted: clip ${clips[i].id} (startMs=${clips[i].startMs}) comes before ${clips[i - 1].id} (startMs=${clips[i - 1].startMs})`
      );
    }
  }

  // Check for overlaps
  for (let i = 1; i < clips.length; i++) {
    const prev = clips[i - 1];
    const curr = clips[i];
    const prevEnd = prev.startMs + (prev.outMs - prev.inMs);

    if (curr.startMs < prevEnd) {
      errors.push(
        `Overlap detected: clip ${prev.id} ends at ${prevEnd}, but clip ${curr.id} starts at ${curr.startMs}`
      );
    }
  }

  return errors;
}

// Helper functions

/**
 * Checks if a time range would overlap with any existing clips.
 */
function hasOverlapAt(clips: Clip[], startMs: Ms, endMs: Ms): boolean {
  for (const clip of clips) {
    const clipDuration = clip.outMs - clip.inMs;
    const clipEnd = clip.startMs + clipDuration;

    // Check if ranges overlap
    if (startMs < clipEnd && endMs > clip.startMs) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the end time of the timeline (where the last clip ends).
 * Returns 0 if timeline is empty.
 */
function getTimelineEnd(track: Track): Ms {
  if (track.clips.length === 0) return 0;

  const lastClip = track.clips[track.clips.length - 1];
  const lastClipDuration = lastClip.outMs - lastClip.inMs;
  return lastClip.startMs + lastClipDuration;
}

