import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ScreenDevice } from "./types";
import "./RecordingPanel.css";

interface RecordingPanelProps {
  onRecordingComplete: (path: string) => void;
}

type RecordingMode = "screen" | "webcam" | "combined";

// Generate unique recording ID
const generateRecordingId = () => `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;


export function RecordingPanel({ onRecordingComplete }: RecordingPanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<RecordingMode | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [screenDevices, setScreenDevices] = useState<ScreenDevice[]>([]);

  // Refs for native recording (all modes now use FFmpeg)
  const nativeRecordingIdRef = useRef<string | null>(null);
  const nativeOutputPathRef = useRef<string | null>(null);
  
  // Timer ref
  const timerRef = useRef<number | null>(null);

  // Load screen devices on mount
  useEffect(() => {
    invoke<ScreenDevice[]>("list_screen_devices")
      .then(devices => {
        console.log("Screen devices loaded:", devices);
        setScreenDevices(devices);
      })
      .catch(err => {
        console.error("Failed to list screen devices:", err);
        handleError("Failed to load screen devices. Check FFmpeg installation.");
      });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const handleError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async (mode: RecordingMode) => {
    try {
      setError(null);
      
      if (mode === "screen") {
        // Native screen recording via FFmpeg
        const recordingId = generateRecordingId();
        nativeRecordingIdRef.current = recordingId;
        
        // Get first screen device and first audio device
        const screenDevice = screenDevices.find(d => d.deviceType === "screen");
        const audioDevice = screenDevices.find(d => d.deviceType === "audio");
        
        if (!screenDevice) {
          throw new Error("No screen device available");
        }
        
        const outputPath = await invoke<string>("start_screen_recording", {
          recordingId,
          screenDevice: screenDevice.id,
          audioDevice: audioDevice?.id || null,
        });
        
        nativeOutputPathRef.current = outputPath;
        
        // Start timer
        setIsRecording(true);
        setRecordingMode(mode);
        setElapsedTime(0);
        timerRef.current = window.setInterval(() => {
          setElapsedTime(t => t + 1);
        }, 1000);
        
        return; // Exit early for native recording
        
      } else if (mode === "combined") {
        // Native combined recording via FFmpeg (screen + webcam PiP)
        const recordingId = generateRecordingId();
        nativeRecordingIdRef.current = recordingId;
        
        // Get devices
        const screenDevice = screenDevices.find(d => d.deviceType === "screen");
        const audioDevice = screenDevices.find(d => d.deviceType === "audio");
        
        // For webcam, we need to find a camera device (not in our filtered list)
        // We'll use the first camera which is typically FaceTime HD Camera (id "0")
        const webcamDevice = "0"; // First camera device
        
        if (!screenDevice) {
          throw new Error("No screen device available");
        }
        
        const outputPath = await invoke<string>("start_combined_recording", {
          recordingId,
          screenDevice: screenDevice.id,
          webcamDevice,
          audioDevice: audioDevice?.id || null,
        });
        
        nativeOutputPathRef.current = outputPath;
        
        // Start timer
        setIsRecording(true);
        setRecordingMode(mode);
        setElapsedTime(0);
        timerRef.current = window.setInterval(() => {
          setElapsedTime(t => t + 1);
        }, 1000);
        
        return; // Exit early for native combined recording
      } else if (mode === "webcam") {
        // Native webcam recording via FFmpeg (better A/V sync than WebRTC)
        const recordingId = generateRecordingId();
        nativeRecordingIdRef.current = recordingId;
        
        // Get devices - webcam is device 0, audio is first audio device
        const webcamDevice = "0"; // First camera (FaceTime HD Camera)
        const audioDevice = screenDevices.find(d => d.deviceType === "audio");
        
        const outputPath = await invoke<string>("start_webcam_recording", {
          recordingId,
          webcamDevice,
          audioDevice: audioDevice?.id || null,
        });
        
        nativeOutputPathRef.current = outputPath;
        
        // Start timer
        setIsRecording(true);
        setRecordingMode(mode);
        setElapsedTime(0);
        timerRef.current = window.setInterval(() => {
          setElapsedTime(t => t + 1);
        }, 1000);
        
        return; // Exit early for native webcam recording
      }

    } catch (err) {
      console.error("Recording error:", err);
      handleError("Failed to start recording. Permission denied or device unavailable.");
    }
  };

  const stopRecording = async () => {
    // Handle native recordings (screen, webcam, or combined)
    if ((recordingMode === "screen" || recordingMode === "webcam" || recordingMode === "combined") && nativeRecordingIdRef.current) {
      try {
        await invoke("stop_screen_recording", {
          recordingId: nativeRecordingIdRef.current,
        });
        
        // Backend now waits for FFmpeg to exit, but add small delay
        // to ensure file is fully flushed to disk
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Import the recording
        if (nativeOutputPathRef.current) {
          onRecordingComplete(nativeOutputPathRef.current);
        }
        
        // Clean up
        nativeRecordingIdRef.current = null;
        nativeOutputPathRef.current = null;
        setIsRecording(false);
        setRecordingMode(null);
        setElapsedTime(0);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } catch (err) {
        console.error("Stop recording error:", err);
        handleError("Failed to stop recording");
      }
      return;
    }
  };

  return (
    <div className="recording-panel">
      <div className="recording-panel-header">
        <h3>Record</h3>
        {isRecording && (
          <div className="recording-indicator">
            <span className="recording-dot"></span>
            <span className="recording-time">{formatTime(elapsedTime)}</span>
          </div>
        )}
      </div>

      {error && <div className="recording-error">{error}</div>}

      {!isRecording ? (
        <div className="recording-buttons">
          <button
            className="record-button screen"
            onClick={() => startRecording("screen")}
          >
            <span className="button-icon">🖥️</span>
            <span>Screen</span>
          </button>
          <button
            className="record-button webcam"
            onClick={() => startRecording("webcam")}
          >
            <span className="button-icon">📹</span>
            <span>Webcam</span>
          </button>
          <button
            className="record-button combined"
            onClick={() => startRecording("combined")}
          >
            <span className="button-icon">🎬</span>
            <span>Both</span>
          </button>
        </div>
      ) : (
        <div className="recording-controls">
          <div className="recording-mode-label">
            Recording: {recordingMode === "screen" ? "Screen" : recordingMode === "webcam" ? "Webcam" : "Screen + Webcam"}
          </div>
          {recordingMode === "screen" && (
            <div className="native-recording-info">
              <p>🎥 Native screen recording in progress...</p>
              <p className="info-text">Using AVFoundation for high-quality capture</p>
            </div>
          )}
          {recordingMode === "webcam" && (
            <div className="native-recording-info">
              <p>📹 Native webcam recording in progress...</p>
              <p className="info-text">Perfect audio/video sync with FFmpeg</p>
            </div>
          )}
          {recordingMode === "combined" && (
            <div className="native-recording-info">
              <p>🎬 Combined recording in progress...</p>
              <p className="info-text">Screen + Webcam with Picture-in-Picture</p>
            </div>
          )}
          <button className="stop-button" onClick={stopRecording}>
            Stop Recording
          </button>
        </div>
      )}
    </div>
  );
}

