import { useState } from "react";
import { Asset } from "./types";
import { MediaPanel } from "./MediaPanel";
import "./App.css";

function App() {
  const [assets, setAssets] = useState<Map<string, Asset>>(new Map());
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  return (
    <div className="app-container">
      <div className="app-header">
        <h1>ClipForge</h1>
        <p className="subtitle">Desktop Video Editor</p>
      </div>
      
      <div className="app-content">
        <MediaPanel
          assets={assets}
          selectedAssetId={selectedAssetId}
          onAssetsChange={setAssets}
          onAssetSelect={setSelectedAssetId}
        />
        
        <div className="main-area">
          <div className="timeline-placeholder">
            <h2>Timeline</h2>
            <p className="hint">Timeline coming soon...</p>
            {selectedAssetId && (
              <p className="selected-info">
                Selected: {Array.from(assets.values()).find(a => a.id === selectedAssetId)?.name}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
