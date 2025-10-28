import { useState, useEffect } from "react";
import { Asset, TimelineState } from "./types";
import { MediaPanel } from "./MediaPanel";
import { Timeline } from "./Timeline";
import { placeClip, deleteClip } from "./timelineOperations";
import "./App.css";

function App() {
  const [assets, setAssets] = useState<Map<string, Asset>>(new Map());
  const [selectedAssetPath, setSelectedAssetPath] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  
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

    console.log("Adding asset to timeline:", asset);
    const newState = placeClip(timelineState, asset);
    setTimelineState(newState);
    
    // Select the newly added clip
    const newClip = newState.track.clips[newState.track.clips.length - 1];
    if (newClip) {
      setSelectedClipId(newClip.id);
    }
  };

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
