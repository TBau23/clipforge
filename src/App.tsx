import { useState, useEffect, useRef } from "react";
import { Asset, TimelineState } from "./types";
import { MediaPanel } from "./MediaPanel";
import { Timeline } from "./Timeline";
import { PreviewPlayer } from "./PreviewPlayer";
import { placeClip, deleteClip, getClipAt } from "./timelineOperations";
import "./App.css";

function App() {
  const [assets, setAssets] = useState<Map<string, Asset>>(new Map());
  const [selectedAssetPath, setSelectedAssetPath] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  
  // Initialize timeline state
  const [timelineState, setTimelineState] = useState<TimelineState>({
    track: { id: "main", clips: [] },
    playheadMs: 0,
  });

  // Handle adding asset to timeline
  const handleAddToTimeline = (assetPath: string) => {
    const asset = assets.get(assetPath);
    if (!asset) {
      console.error("Asset not found:", assetPath);
      return;
    }

    const newState = placeClip(timelineState, asset);
    setTimelineState(newState);
    
    // Select the newly added clip
    const newClip = newState.track.clips[newState.track.clips.length - 1];
    if (newClip) {
      setSelectedClipId(newClip.id);
    }
  };

  // Calculate timeline duration
  const getTimelineDuration = (): number => {
    if (timelineState.track.clips.length === 0) return 0;
    const lastClip = timelineState.track.clips[timelineState.track.clips.length - 1];
    return lastClip.startMs + (lastClip.outMs - lastClip.inMs);
  };

  // No RAF loop needed - video element drives playback timing

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete selected clip with Backspace or Delete
      if ((e.key === "Backspace" || e.key === "Delete") && selectedClipId) {
        // Prevent if focused on input
        if (
          document.activeElement?.tagName === "INPUT" ||
          document.activeElement?.tagName === "TEXTAREA"
        ) {
          return;
        }

        e.preventDefault();
        const newState = deleteClip(timelineState, selectedClipId);
        setTimelineState(newState);
        setSelectedClipId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedClipId, timelineState]);

  // Handle video time updates during playback
  const lastUpdateTimeRef = useRef<number>(0);
  const handleVideoTimeUpdate = (videoTimeMs: number) => {
    if (!playing) return;
    
    // Throttle to ~10 updates per second to avoid excessive re-renders
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < 100) return;
    lastUpdateTimeRef.current = now;
    
    const currentClip = getClipAt(timelineState, timelineState.playheadMs);
    if (!currentClip) {
      setPlaying(false);
      return;
    }
    
    // Map video time to timeline position
    const timelinePos = currentClip.clip.startMs + (videoTimeMs - currentClip.clip.inMs);
    
    // Update playhead
    setTimelineState((prev) => ({ ...prev, playheadMs: timelinePos }));
  };
  
  // Handle clip ended - move to next clip automatically
  const handleClipEnded = () => {
    const currentClip = getClipAt(timelineState, timelineState.playheadMs);
    if (!currentClip) {
      setPlaying(false);
      return;
    }
    
    // Calculate where this clip ends
    const clipEnd = currentClip.clip.startMs + (currentClip.clip.outMs - currentClip.clip.inMs);
    
    // Look for next clip
    const nextClipResult = getClipAt(timelineState, clipEnd + 1);
    if (nextClipResult) {
      // Move playhead to start of next clip and keep playing
      setTimelineState((prev) => ({ ...prev, playheadMs: clipEnd }));
    } else {
      // No more clips - stop playback
      setPlaying(false);
      setTimelineState((prev) => ({ ...prev, playheadMs: clipEnd }));
    }
  };

  // Get current clip for preview
  const clipAtPlayhead = getClipAt(timelineState, timelineState.playheadMs);
  const timelineDuration = getTimelineDuration();
  

  return (
    <div className="app-container">
      <div className="app-header">
        <h1>ClipForge</h1>
        <p className="subtitle">Desktop Video Editor</p>
      </div>
      
      <div className="app-content">
        <MediaPanel
          assets={assets}
          selectedAssetPath={selectedAssetPath}
          onAssetsChange={setAssets}
          onAssetSelect={setSelectedAssetPath}
          onAddToTimeline={handleAddToTimeline}
        />
        
        <div className="main-area">
          <PreviewPlayer
            clip={clipAtPlayhead?.clip || null}
            localMs={clipAtPlayhead?.localMs || 0}
            playing={playing}
            onPlayingChange={setPlaying}
            onTimeUpdate={handleVideoTimeUpdate}
            onClipEnded={handleClipEnded}
            currentTimeMs={timelineState.playheadMs}
            totalDurationMs={timelineDuration}
          />
          
          <Timeline
            state={timelineState}
            assets={assets}
            selectedClipId={selectedClipId}
            onStateChange={setTimelineState}
            onClipSelect={setSelectedClipId}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
