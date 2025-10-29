import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Asset, MediaMetadata, ErrorEnvelope } from "./types";
import { getAssetUrl } from "./assetHelper";
import "./MediaPanel.css";

interface MediaPanelProps {
  assets: Map<string, Asset>;
  selectedAssetPath: string | null;
  onAssetsChange: (assets: Map<string, Asset>) => void;
  onAssetSelect: (path: string | null) => void;
  onAddToTimeline: (assetPath: string) => void;
}

// Concurrency limiter for parallel operations
async function runWithConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const p = task().then((result) => {
      results.push(result);
      executing.splice(executing.indexOf(p), 1);
    });

    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

export function MediaPanel({
  assets,
  selectedAssetPath,
  onAssetsChange,
  onAssetSelect,
  onAddToTimeline,
}: MediaPanelProps) {
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "Unknown";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const handleError = (err: ErrorEnvelope | string) => {
    if (typeof err === "string") {
      setError(err);
    } else {
      setError(`${err.message}\n💡 ${err.hint}`);
    }
    setTimeout(() => setError(null), 5000);
  };

  const importFiles = async (paths: string[]) => {
    if (paths.length === 0) return;

    setImporting(true);
    setError(null);
    const newAssets = new Map(assets);

    // Filter out duplicates
    const newPaths = paths.filter((path) => {
      if (newAssets.has(path)) {
        // If already imported, just select it
        const existing = newAssets.get(path);
        if (existing) {
          onAssetSelect(existing.path);
        }
        return false;
      }
      return true;
    });

    if (newPaths.length === 0) {
      setImporting(false);
      return;
    }

    try {
      // Create tasks for probing and thumbnail generation
      const tasks = newPaths.map((path) => async () => {
        const filename = path.split("/").pop() || path;
        setImportProgress(`Importing ${filename}...`);

        try {
          // Probe media
          const metadata = await invoke<MediaMetadata>("probe_media", { path });

          // Generate thumbnail
          const thumbPath = await invoke<string>("make_thumbnail", {
            path,
            durationMs: metadata.durationMs,
          });

          // Create asset
          const asset: Asset = {
            id: crypto.randomUUID(),
            path,
            name: filename,
            durationMs: metadata.durationMs,
            width: metadata.width,
            height: metadata.height,
            fps: metadata.fps,
            sizeBytes: metadata.sizeBytes,
            thumbPath,
          };

          newAssets.set(path, asset);
          return asset;
        } catch (err) {
          console.error(`Failed to import ${filename}:`, err);
          handleError(err as ErrorEnvelope);
          return null;
        }
      });

      // Run with concurrency limit of 3
      await runWithConcurrencyLimit(tasks, 3);

      onAssetsChange(newAssets);
      setImportProgress(`Imported ${newPaths.length} file(s)`);
      setTimeout(() => setImportProgress(""), 2000);
    } catch (err) {
      handleError(err as ErrorEnvelope);
    } finally {
      setImporting(false);
    }
  };

  const handleImportClick = async () => {
    try {
      const paths = await invoke<string[]>("open_dialog");
      await importFiles(paths);
    } catch (err) {
      handleError(err as ErrorEnvelope);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // In Tauri, we need to read the file paths from the data transfer
    const items = e.dataTransfer.items;
    const paths: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          const ext = file.name.toLowerCase().split(".").pop();
          if (ext === "mp4" || ext === "mov") {
            // @ts-ignore - Tauri adds path property to File objects
            if (file.path) {
              // @ts-ignore
              paths.push(file.path);
            }
          }
        }
      }
    }

    if (paths.length > 0) {
      await importFiles(paths);
    }
  };

  const handleAssetClick = (asset: Asset) => {
    onAssetSelect(asset.path);
  };

  const assetArray = Array.from(assets.values());

  const handleAddToTimelineClick = () => {
    if (selectedAssetPath) {
      onAddToTimeline(selectedAssetPath);
    }
  };

  return (
    <div className="media-panel">
      <div className="media-panel-header">
        <h2>Media Library</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleImportClick}
            disabled={importing}
            className="import-button"
          >
            {importing ? "Importing..." : "Import Files"}
          </button>
          {selectedAssetPath && (
            <button
              onClick={handleAddToTimelineClick}
              className="timeline-button"
            >
              Add to Timeline
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-toast">{error}</div>}
      
      {importProgress && (
        <div className="import-progress">{importProgress}</div>
      )}

      <div
        className="media-list"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {assetArray.length === 0 ? (
          <div className="empty-state">
            <p>No media files imported yet</p>
            <p className="hint">Click "Import Files" or drag & drop .mp4 or .mov files here</p>
          </div>
        ) : (
          assetArray.map((asset) => (
            <div
              key={asset.id}
              className={`media-card ${
                selectedAssetPath === asset.path ? "selected" : ""
              }`}
              onClick={() => handleAssetClick(asset)}
              title={asset.path}
            >
              {asset.thumbPath && (
                <img
                  src={getAssetUrl(asset.thumbPath)}
                  alt={asset.name}
                  className="media-thumbnail"
                />
              )}
              <div className="media-info">
                <div className="media-name">{asset.name}</div>
                <div className="media-meta">
                  {formatDuration(asset.durationMs)} • {asset.width}×{asset.height}
                  {asset.fps && ` @ ${Math.round(asset.fps)}fps`}
                </div>
                <div className="media-size">{formatFileSize(asset.sizeBytes)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

