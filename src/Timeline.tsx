import { useState, useRef, useEffect } from "react";
import { Asset, TimelineState, Clip } from "./types";
import { TimelineClip } from "./TimelineClip";
import { Playhead } from "./Playhead";
import "./Timeline.css";

interface TimelineProps {
  state: TimelineState;
  assets: Map<string, Asset>;
  selectedClipId: string | null;
  onStateChange: (state: TimelineState) => void;
  onClipSelect: (clipId: string | null) => void;
}

const PIXELS_PER_MS = 0.1; // 1 second = 100 pixels
const MARKER_INTERVAL_MS = 1000; // Show marker every second
const MAJOR_MARKER_INTERVAL_MS = 5000; // Bold marker every 5 seconds

export function Timeline({
  state,
  assets,
  selectedClipId,
  onStateChange,
  onClipSelect,
}: TimelineProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  
  // Calculate timeline width based on content
  const timelineEnd = getTimelineEnd(state);
  const minWidth = 2000; // Minimum 20 seconds visible
  const contentWidth = Math.max(minWidth, timelineEnd * PIXELS_PER_MS + 500);

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handlePlayheadChange = (newMs: number) => {
    onStateChange({
      ...state,
      playheadMs: Math.max(0, newMs),
    });
  };

  const handleClipClick = (clipId: string) => {
    onClipSelect(clipId);
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Deselect if clicking empty track area
    if (e.target === e.currentTarget) {
      onClipSelect(null);
    }
  };

  // Generate time markers
  const markers: { position: number; time: string; major: boolean }[] = [];
  const maxTime = contentWidth / PIXELS_PER_MS;
  for (let ms = 0; ms <= maxTime; ms += MARKER_INTERVAL_MS) {
    const isMajor = ms % MAJOR_MARKER_INTERVAL_MS === 0;
    markers.push({
      position: ms * PIXELS_PER_MS,
      time: formatTime(ms),
      major: isMajor,
    });
  }

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <h2>Timeline</h2>
        <div className="timeline-controls">
          <div className="time-display">{formatTime(state.playheadMs)}</div>
        </div>
      </div>

      <div className="timeline-viewport" ref={viewportRef}>
        <div className="timeline-content" style={{ width: contentWidth }}>
          {/* Time ruler */}
          <div className="time-ruler">
            <div className="time-ruler-inner" style={{ width: contentWidth }}>
              {markers.map((marker, i) => (
                <div
                  key={i}
                  className={`time-marker ${marker.major ? "major" : ""}`}
                  style={{ left: marker.position }}
                >
                  {marker.major ? marker.time : ""}
                </div>
              ))}
            </div>
          </div>

          {/* Track area */}
          <div className="track-area" onClick={handleTrackClick}>
            {state.track.clips.length === 0 && (
              <div className="timeline-empty">
                <h3>Timeline is empty</h3>
                <p>Add clips from the Media Library above</p>
              </div>
            )}

            {/* Render clips */}
            {state.track.clips.map((clip) => {
              const asset = assets.get(clip.assetPath);
              if (!asset) return null;

              return (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  asset={asset}
                  isSelected={selectedClipId === clip.id}
                  pixelsPerMs={PIXELS_PER_MS}
                  onSelect={() => handleClipClick(clip.id)}
                  onTrimIn={(newInMs) => {
                    const updatedClips = state.track.clips.map((c) => {
                      if (c.id === clip.id) {
                        // When trimming left edge, adjust startMs so RIGHT edge stays fixed
                        const oldDuration = c.outMs - c.inMs;
                        const newDuration = c.outMs - newInMs;
                        const rightEdgePos = c.startMs + oldDuration;
                        let newStartMs = rightEdgePos - newDuration;
                        
                        // Collision detection: check if new position would overlap neighbors
                        const clipIndex = state.track.clips.findIndex(x => x.id === clip.id);
                        
                        // Check collision with previous clip
                        if (clipIndex > 0) {
                          const prevClip = state.track.clips[clipIndex - 1];
                          const prevEnd = prevClip.startMs + (prevClip.outMs - prevClip.inMs);
                          if (newStartMs < prevEnd) {
                            // Clamp to prevent overlap
                            newStartMs = prevEnd;
                            // Recalculate inMs based on clamped position
                            const clampedDuration = rightEdgePos - newStartMs;
                            newInMs = c.outMs - clampedDuration;
                          }
                        }
                        
                        // Don't allow startMs to go negative
                        if (newStartMs < 0) {
                          newStartMs = 0;
                          newInMs = c.outMs - rightEdgePos;
                        }
                        
                        return { ...c, inMs: newInMs, startMs: newStartMs };
                      }
                      return c;
                    });
                    onStateChange({
                      ...state,
                      track: { ...state.track, clips: updatedClips },
                    });
                  }}
                  onTrimOut={(newOutMs) => {
                    const updatedClips = state.track.clips.map((c) => {
                      if (c.id === clip.id) {
                        let clampedOutMs = newOutMs;
                        
                        // Collision detection: check if right edge would overlap next clip
                        const clipIndex = state.track.clips.findIndex(x => x.id === clip.id);
                        
                        // Check collision with next clip
                        if (clipIndex < state.track.clips.length - 1) {
                          const nextClip = state.track.clips[clipIndex + 1];
                          const newRightEdge = c.startMs + (clampedOutMs - c.inMs);
                          if (newRightEdge > nextClip.startMs) {
                            // Clamp to prevent overlap
                            const maxDuration = nextClip.startMs - c.startMs;
                            clampedOutMs = c.inMs + maxDuration;
                          }
                        }
                        
                        return { ...c, outMs: clampedOutMs };
                      }
                      return c;
                    });
                    onStateChange({
                      ...state,
                      track: { ...state.track, clips: updatedClips },
                    });
                  }}
                />
              );
            })}

            {/* Playhead */}
            <Playhead
              timeMs={state.playheadMs}
              pixelsPerMs={PIXELS_PER_MS}
              containerWidth={contentWidth}
              onSeek={handlePlayheadChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function
function getTimelineEnd(state: TimelineState): number {
  if (state.track.clips.length === 0) return 0;
  const lastClip = state.track.clips[state.track.clips.length - 1];
  const lastClipDuration = lastClip.outMs - lastClip.inMs;
  return lastClip.startMs + lastClipDuration;
}

