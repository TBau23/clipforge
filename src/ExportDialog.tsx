import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Clip, ErrorEnvelope } from "./types";
import "./ExportDialog.css";

interface ExportDialogProps {
  clips: Clip[];
  onClose: () => void;
}

interface ExportProgress {
  stage: string;
  progress: number;
  currentMs: number;
  totalMs: number;
  message: string;
}

interface ExportClip {
  assetPath: string;
  inMs: number;
  outMs: number;
}

interface ExportRequest {
  clips: ExportClip[];
  outputPath: string;
  width?: number;
  height?: number;
}

interface ExportPrepareResult {
  segmentPaths: string[];
  listFile: string;
  totalDurationMs: number;
}

export function ExportDialog({ clips, onClose }: ExportDialogProps) {
  const [resolution, setResolution] = useState<string>("original");
  const [customWidth, setCustomWidth] = useState<number>(1920);
  const [customHeight, setCustomHeight] = useState<number>(1080);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Listen for progress events
    const unlisten = listen<ExportProgress>("export-progress", (event) => {
      setProgress(event.payload);
      
      // Close on completion
      if (event.payload.stage === "complete") {
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onClose]);

  const handleExport = async () => {
    if (clips.length === 0) {
      setError("No clips to export");
      return;
    }

    // Open save dialog
    const outputPath = await save({
      defaultPath: "output.mp4",
      filters: [
        {
          name: "Video",
          extensions: ["mp4"],
        },
      ],
    });

    if (!outputPath) {
      return; // User cancelled
    }

    setExporting(true);
    setError(null);
    setProgress({
      stage: "prepare",
      progress: 0,
      currentMs: 0,
      totalMs: 0,
      message: "Preparing export...",
    });

    try {
      // Build export request
      const exportClips: ExportClip[] = clips.map((clip) => ({
        assetPath: clip.assetPath,
        inMs: clip.inMs,
        outMs: clip.outMs,
      }));

      const request: ExportRequest = {
        clips: exportClips,
        outputPath,
      };

      // Add resolution if not original
      if (resolution === "1080p") {
        request.width = 1920;
        request.height = 1080;
      } else if (resolution === "720p") {
        request.width = 1280;
        request.height = 720;
      } else if (resolution === "custom") {
        request.width = customWidth;
        request.height = customHeight;
      }

      // Step 1: Prepare segments
      setProgress({
        stage: "prepare",
        progress: 0,
        currentMs: 0,
        totalMs: 0,
        message: "Creating video segments...",
      });

      const prepareResult = await invoke<ExportPrepareResult>(
        "export_prepare",
        { request }
      );

      // Step 2: Concatenate
      setProgress({
        stage: "concat",
        progress: 0,
        currentMs: 0,
        totalMs: prepareResult.totalDurationMs,
        message: "Concatenating segments...",
      });

      await invoke("export_concat", {
        listFile: prepareResult.listFile,
        outputPath,
        totalDurationMs: prepareResult.totalDurationMs,
      });

      // Success - progress listener will handle completion
    } catch (err) {
      console.error("Export failed:", err);
      const errorEnv = err as ErrorEnvelope;
      if (errorEnv.code) {
        setError(`${errorEnv.message}\n💡 ${errorEnv.hint}`);
      } else {
        setError(String(err));
      }
      setExporting(false);
    }
  };

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const totalDuration = clips.reduce((sum, clip) => {
    return sum + (clip.outMs - clip.inMs);
  }, 0);

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-dialog-header">
          <h2>Export Video</h2>
          <button className="close-button" onClick={onClose} disabled={exporting}>
            ×
          </button>
        </div>

        <div className="export-dialog-content">
          {!exporting ? (
            <>
              <div className="export-info">
                <p>
                  <strong>Clips:</strong> {clips.length}
                </p>
                <p>
                  <strong>Total Duration:</strong> {formatDuration(totalDuration)}
                </p>
              </div>

              <div className="export-option">
                <label>Resolution:</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                >
                  <option value="original">Original</option>
                  <option value="1080p">1080p (1920×1080)</option>
                  <option value="720p">720p (1280×720)</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {resolution === "custom" && (
                <div className="custom-resolution">
                  <div className="resolution-input">
                    <label>Width:</label>
                    <input
                      type="number"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(parseInt(e.target.value))}
                      min={1}
                    />
                  </div>
                  <div className="resolution-input">
                    <label>Height:</label>
                    <input
                      type="number"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(parseInt(e.target.value))}
                      min={1}
                    />
                  </div>
                </div>
              )}

              {error && <div className="export-error">{error}</div>}

              <div className="export-actions">
                <button onClick={onClose}>Cancel</button>
                <button className="primary" onClick={handleExport}>
                  Export
                </button>
              </div>
            </>
          ) : (
            <div className="export-progress">
              {progress && (
                <>
                  <div className="progress-message">{progress.message}</div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress.progress * 100}%` }}
                    />
                  </div>
                  <div className="progress-stats">
                    <span>{Math.round(progress.progress * 100)}%</span>
                    {progress.totalMs > 0 && (
                      <span>
                        {formatDuration(progress.currentMs)} /{" "}
                        {formatDuration(progress.totalMs)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

