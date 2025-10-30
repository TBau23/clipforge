import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ErrorEnvelope, ScreenDevice } from "./types";
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
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [screenDevices, setScreenDevices] = useState<ScreenDevice[]>([]);

  // Refs for WebRTC-based recording (webcam, combined)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedMimeTypeRef = useRef<string>('video/webm');
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  
  // Refs for native screen recording
  const nativeRecordingIdRef = useRef<string | null>(null);
  const nativeOutputPathRef = useRef<string | null>(null);
  
  // Timer ref (shared)
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

  // Cleanup function
  const stopAllStreams = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(track => track.stop());
      webcamStreamRef.current = null;
    }
    if (previewStream) {
      previewStream.getTracks().forEach(track => track.stop());
      setPreviewStream(null);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllStreams();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Update video preview
  useEffect(() => {
    if (videoPreviewRef.current && previewStream) {
      videoPreviewRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

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
      chunksRef.current = [];
      
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
        
      }
      
      // For webcam and combined modes, use WebRTC
      let stream: MediaStream;
      
      if (mode === "webcam") {
        // Webcam recording only
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: true,
        });
        webcamStreamRef.current = stream;
        
      } else {
        // Combined: screen + webcam
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        screenStreamRef.current = screenStream;

        const webcamStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: false, // Use screen audio only to avoid echo
        });
        webcamStreamRef.current = webcamStream;

        // Create canvas to combine streams
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d")!;

        const screenVideo = document.createElement("video");
        screenVideo.srcObject = screenStream;
        screenVideo.play();

        const webcamVideo = document.createElement("video");
        webcamVideo.srcObject = webcamStream;
        webcamVideo.play();

        // Draw combined frame
        const drawFrame = () => {
          if (!screenStreamRef.current || !webcamStreamRef.current) return;
          
          // Draw screen (full canvas)
          ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
          
          // Draw webcam in corner (PiP style)
          const pipWidth = 320;
          const pipHeight = 240;
          const pipX = canvas.width - pipWidth - 20;
          const pipY = canvas.height - pipHeight - 20;
          
          // Add border around webcam
          ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
          ctx.fillRect(pipX - 2, pipY - 2, pipWidth + 4, pipHeight + 4);
          
          ctx.drawImage(webcamVideo, pipX, pipY, pipWidth, pipHeight);
          
          requestAnimationFrame(drawFrame);
        };
        drawFrame();

        // Capture canvas stream
        const canvasStream = canvas.captureStream(30);
        
        // Add audio from screen
        const audioTracks = screenStream.getAudioTracks();
        audioTracks.forEach(track => canvasStream.addTrack(track));
        
        stream = canvasStream;
      }

      setPreviewStream(stream);

      // Create MediaRecorder with compatible MIME type
      // Try formats in order of preference, use first supported one
      const mimeTypes = [
        'video/mp4',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/x-matroska;codecs=avc1',
      ];
      
      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          console.log('Using MIME type:', mimeType);
          break;
        }
      }

      const mediaRecorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream); // Let browser choose

      // Store the MIME type for later
      recordedMimeTypeRef.current = selectedMimeType || mediaRecorder.mimeType;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recordedMimeTypeRef.current });
        await saveRecording(blob);
        stopAllStreams();
        setIsRecording(false);
        setRecordingMode(null);
        setElapsedTime(0);
      };

      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;

      // Start timer
      setIsRecording(true);
      setRecordingMode(mode);
      setElapsedTime(0);
      timerRef.current = window.setInterval(() => {
        setElapsedTime(t => t + 1);
      }, 1000);

    } catch (err) {
      console.error("Recording error:", err);
      stopAllStreams();
      handleError("Failed to start recording. Permission denied or device unavailable.");
    }
  };

  const stopRecording = async () => {
    // Handle native screen recording
    if (recordingMode === "screen" && nativeRecordingIdRef.current) {
      try {
        await invoke("stop_screen_recording", {
          recordingId: nativeRecordingIdRef.current,
        });
        
        // Wait a bit for file to be written
        await new Promise(resolve => setTimeout(resolve, 1000));
        
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
    
    // Handle WebRTC recording (webcam, combined)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const saveRecording = async (blob: Blob) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      
      // Determine file extension from MIME type
      const mimeType = recordedMimeTypeRef.current;
      let extension = 'webm';
      if (mimeType.includes('mp4')) {
        extension = 'mp4';
      } else if (mimeType.includes('webm')) {
        extension = 'webm';
      } else if (mimeType.includes('matroska')) {
        extension = 'mkv';
      }
      
      const filename = `recording-${timestamp}.${extension}`;
      
      // Convert blob to array buffer
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Save to file via Tauri
      const path = await invoke<string>("save_recording", {
        data: Array.from(uint8Array),
        filename,
      });
      
      console.log("Recording saved:", path);
      onRecordingComplete(path);
      
    } catch (err) {
      console.error("Save error:", err);
      const errorEnv = err as ErrorEnvelope;
      if (errorEnv.code) {
        handleError(`${errorEnv.message}\n💡 ${errorEnv.hint}`);
      } else {
        handleError("Failed to save recording");
      }
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
          {previewStream && recordingMode !== "screen" && (
            <video
              ref={videoPreviewRef}
              autoPlay
              muted
              className="recording-preview"
            />
          )}
          <button className="stop-button" onClick={stopRecording}>
            Stop Recording
          </button>
        </div>
      )}
    </div>
  );
}

