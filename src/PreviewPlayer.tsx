import { useEffect, useRef } from "react";
import { Clip } from "./types";
import { getAssetUrl } from "./assetHelper";
import "./PreviewPlayer.css";

interface PreviewPlayerProps {
  clip: Clip | null;
  localMs: number;
  playing: boolean;
  onTimeUpdate?: (currentMs: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onClipEnded?: () => void;
  currentTimeMs: number;
  totalDurationMs: number;
}

export function PreviewPlayer({
  clip,
  localMs,
  playing,
  onTimeUpdate,
  onPlayingChange,
  onClipEnded,
  currentTimeMs,
  totalDurationMs,
}: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentClipRef = useRef<{ id: string; path: string; inMs: number; outMs: number } | null>(null);

  // Effect 1: Load video when clip changes or when clip content changes (trim)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!clip) {
      video.pause();
      video.src = "";
      currentClipRef.current = null;
      return;
    }

    // Check if we need to reload: new clip OR same clip but content changed (trim)
    const needsReload = 
      !currentClipRef.current ||
      currentClipRef.current.id !== clip.id ||
      currentClipRef.current.inMs !== clip.inMs ||
      currentClipRef.current.outMs !== clip.outMs;

    if (!needsReload) return;
    
    video.pause();
    const videoUrl = getAssetUrl(clip.assetPath);
    video.src = videoUrl;
    video.load();
    
    currentClipRef.current = {
      id: clip.id,
      path: clip.assetPath,
      inMs: clip.inMs,
      outMs: clip.outMs,
    };

    const handleLoadedData = () => {
      video.currentTime = localMs / 1000;
    };

    video.addEventListener("loadeddata", handleLoadedData, { once: true });
    
    return () => {
      video.removeEventListener("loadeddata", handleLoadedData);
    };
  }, [clip?.id, clip?.assetPath, clip?.inMs, clip?.outMs, localMs]);

  // Effect 2: Seek when paused and localMs changes
  useEffect(() => {
    if (playing || !videoRef.current || !clip) return;
    
    const video = videoRef.current;
    const targetTime = localMs / 1000;
    
    if (Math.abs(video.currentTime - targetTime) > 0.05) {
      video.currentTime = targetTime;
    }
  }, [localMs, playing, clip]);

  // Effect 3: Play/Pause (ONLY depends on playing state, NOT localMs)
  useEffect(() => {
    if (!videoRef.current || !clip) return;
    
    const video = videoRef.current;

    if (playing) {
      video.play().catch((err) => {
        console.error("[PreviewPlayer] Play failed:", err.message);
        onPlayingChange(false);
      });
    } else {
      video.pause();
    }
  }, [playing, clip, onPlayingChange]);

  // Effect 4: Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        onPlayingChange(!playing);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playing, onPlayingChange]);

  // Video time update handler
  const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!playing || !onTimeUpdate || !clip) return;
    
    const video = e.currentTarget;
    const videoTimeMs = video.currentTime * 1000;
    
    // Check if we've reached the end of this clip's OUT point
    if (videoTimeMs >= clip.outMs) {
      video.pause();
      // Notify parent that clip ended (parent will handle moving to next clip)
      if (onClipEnded) {
        onClipEnded();
      } else {
        // Fallback if no handler provided
        onPlayingChange(false);
      }
      return;
    }
    
    // Report time to parent
    onTimeUpdate(videoTimeMs);
  };

  const handleVideoEnded = () => {
    // Treat this the same as reaching outMs
    if (onClipEnded) {
      onClipEnded();
    } else {
      onPlayingChange(false);
    }
  };

  const handlePlayPauseClick = () => {
    onPlayingChange(!playing);
  };

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="preview-player">
      <div className="preview-video-container">
        {!clip ? (
          <div className="preview-placeholder">
            <div className="preview-placeholder-text">
              No clip at playhead position
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="preview-video"
            preload="auto"
            playsInline
            onTimeUpdate={handleVideoTimeUpdate}
            onEnded={handleVideoEnded}
          />
        )}
      </div>

      <div className="preview-controls">
        <button
          className="preview-play-button"
          onClick={handlePlayPauseClick}
          disabled={!clip}
          title={playing ? "Pause (Space)" : "Play (Space)"}
        >
          {playing ? (
            <span className="control-icon">⏸</span>
          ) : (
            <span className="control-icon">▶</span>
          )}
        </button>

        <div className="preview-time-display">
          <span className="time-current">{formatTime(currentTimeMs)}</span>
          <span className="time-separator">/</span>
          <span className="time-total">{formatTime(totalDurationMs)}</span>
        </div>
      </div>
    </div>
  );
}
