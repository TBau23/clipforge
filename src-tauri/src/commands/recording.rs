use crate::types::*;
use std::path::PathBuf;
use tauri::{Manager, State};

// Helper function to get app data directory
fn get_app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, ErrorEnvelope> {
    app.path()
        .app_data_dir()
        .map_err(|e| ErrorEnvelope::new(
            "PATH_ERROR",
            &format!("Failed to get app data directory: {}", e),
            "Try restarting the application"
        ))
}

// List available screen and audio devices (macOS)
#[tauri::command]
pub async fn list_screen_devices() -> Result<Vec<ScreenDevice>, ErrorEnvelope> {
    #[cfg(target_os = "macos")]
    {
        // Run ffmpeg to list avfoundation devices
        let output = tokio::process::Command::new("ffmpeg")
            .args(&[
                "-f", "avfoundation",
                "-list_devices", "true",
                "-i", ""
            ])
            .output()
            .await
            .map_err(|e| ErrorEnvelope::new(
                "FFMPEG_ERROR",
                &format!("Failed to run ffmpeg: {}", e),
                "Make sure FFmpeg is installed: brew install ffmpeg"
            ))?;
        
        // FFmpeg outputs device list to stderr
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("FFmpeg device list output:\n{}", stderr);
        
        let mut devices = Vec::new();
        
        // Parse the output for screen and audio devices
        let mut in_video_section = false;
        let mut in_audio_section = false;
        
        for line in stderr.lines() {
            if line.contains("AVFoundation video devices:") {
                in_video_section = true;
                in_audio_section = false;
                continue;
            }
            if line.contains("AVFoundation audio devices:") {
                in_video_section = false;
                in_audio_section = true;
                continue;
            }
            
            // Parse device lines
            if (in_video_section || in_audio_section) && line.contains("[AVFoundation") {
                if let Some(bracket_start) = line.rfind("] [") {
                    if let Some(bracket_end) = line[bracket_start+3..].find(']') {
                        let device_id = &line[bracket_start+3..bracket_start+3+bracket_end];
                        let device_name = &line[bracket_start+3+bracket_end+2..].trim();
                        
                        // Only include screen capture devices, not cameras
                        // Screen captures have names like "Capture screen 0" or "Capture screen 1"
                        if in_video_section {
                            if device_name.starts_with("Capture screen") {
                                devices.push(ScreenDevice {
                                    id: device_id.to_string(),
                                    name: device_name.to_string(),
                                    device_type: "screen".to_string(),
                                });
                            }
                        } else if in_audio_section {
                            devices.push(ScreenDevice {
                                id: device_id.to_string(),
                                name: device_name.to_string(),
                                device_type: "audio".to_string(),
                            });
                        }
                    }
                }
            }
        }
        
        // Add default devices if none found
        if devices.is_empty() || !devices.iter().any(|d| d.device_type == "screen") {
            println!("No screen capture devices found in FFmpeg output, adding default");
            devices.push(ScreenDevice {
                id: "0".to_string(),
                name: "Capture screen 0".to_string(),
                device_type: "screen".to_string(),
            });
        }
        if !devices.iter().any(|d| d.device_type == "audio") {
            println!("No audio devices found, adding default microphone");
            devices.push(ScreenDevice {
                id: "0".to_string(),
                name: "Default microphone".to_string(),
                device_type: "audio".to_string(),
            });
        }
        
        println!("Returning {} devices", devices.len());
        for device in &devices {
            println!("  - {} ({}): {}", device.device_type, device.id, device.name);
        }
        
        Ok(devices)
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        Err(ErrorEnvelope::new(
            "PLATFORM_NOT_SUPPORTED",
            "Screen recording is only supported on macOS",
            "Use a Mac to enable screen recording"
        ))
    }
}

// Start native screen recording (macOS)
#[tauri::command]
pub async fn start_screen_recording(
    app: tauri::AppHandle,
    recording_id: String,
    screen_device: String,
    audio_device: Option<String>,
    processes: State<'_, RecordingProcesses>,
) -> Result<String, ErrorEnvelope> {
    #[cfg(target_os = "macos")]
    {
        let app_data = get_app_data_dir(&app)?;
        let recordings_dir = app_data.join("recordings");
        
        tokio::fs::create_dir_all(&recordings_dir)
            .await
            .map_err(|e| ErrorEnvelope::new(
                "DIR_CREATE_ERROR",
                &format!("Failed to create recordings directory: {}", e),
                "Check application permissions"
            ))?;
        
        // Generate output filename with timestamp
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let output_filename = format!("screen-recording-{}.mp4", timestamp);
        let output_path = recordings_dir.join(&output_filename);
        
        // Build input device string: "<screen>:<audio>"
        let input_device = if let Some(audio) = audio_device {
            format!("{}:{}", screen_device, audio)
        } else {
            format!("{}:none", screen_device)
        };
        
        let child = tokio::process::Command::new("ffmpeg")
            .args(&[
                "-f", "avfoundation",
                "-framerate", "30",
                "-i", &input_device,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-y",
                output_path.to_str().unwrap()
            ])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| ErrorEnvelope::new(
                "FFMPEG_ERROR",
                &format!("Failed to start screen recording: {}", e),
                "Make sure FFmpeg is installed and screen recording permission is granted"
            ))?;
        
        // Store the process
        let mut procs = processes.lock().unwrap();
        procs.insert(recording_id.clone(), child);
        
        Ok(output_path.to_string_lossy().to_string())
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        Err(ErrorEnvelope::new(
            "PLATFORM_NOT_SUPPORTED",
            "Screen recording is only supported on macOS",
            "Use a Mac to enable screen recording"
        ))
    }
}

// Start native webcam recording (macOS)
#[tauri::command]
pub async fn start_webcam_recording(
    app: tauri::AppHandle,
    recording_id: String,
    webcam_device: String,
    audio_device: Option<String>,
    processes: State<'_, RecordingProcesses>,
) -> Result<String, ErrorEnvelope> {
    #[cfg(target_os = "macos")]
    {
        let app_data = get_app_data_dir(&app)?;
        let recordings_dir = app_data.join("recordings");
        
        tokio::fs::create_dir_all(&recordings_dir)
            .await
            .map_err(|e| ErrorEnvelope::new(
                "DIR_CREATE_ERROR",
                &format!("Failed to create recordings directory: {}", e),
                "Check application permissions"
            ))?;
        
        // Generate output filename with timestamp
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let output_filename = format!("webcam-recording-{}.mp4", timestamp);
        let output_path = recordings_dir.join(&output_filename);
        
        // Build input device string: "<webcam>:<audio>"
        let input_device = if let Some(audio) = audio_device {
            format!("{}:{}", webcam_device, audio)
        } else {
            format!("{}:none", webcam_device)
        };
        
        let child = tokio::process::Command::new("ffmpeg")
            .args(&[
                "-f", "avfoundation",
                "-framerate", "30",
                "-i", &input_device,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "frag_keyframe+empty_moov",
                "-y",
                output_path.to_str().unwrap()
            ])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| ErrorEnvelope::new(
                "FFMPEG_ERROR",
                &format!("Failed to start webcam recording: {}", e),
                "Make sure FFmpeg is installed and camera permission is granted"
            ))?;
        
        // Store the process
        let mut procs = processes.lock().unwrap();
        procs.insert(recording_id.clone(), child);
        
        Ok(output_path.to_string_lossy().to_string())
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        Err(ErrorEnvelope::new(
            "PLATFORM_NOT_SUPPORTED",
            "Webcam recording is only supported on macOS",
            "Use a Mac to enable webcam recording"
        ))
    }
}

// Start combined screen + webcam recording (PiP)
#[tauri::command]
pub async fn start_combined_recording(
    app: tauri::AppHandle,
    recording_id: String,
    screen_device: String,
    webcam_device: String,
    audio_device: Option<String>,
    processes: State<'_, RecordingProcesses>,
) -> Result<String, ErrorEnvelope> {
    #[cfg(target_os = "macos")]
    {
        let app_data = get_app_data_dir(&app)?;
        let recordings_dir = app_data.join("recordings");
        
        tokio::fs::create_dir_all(&recordings_dir)
            .await
            .map_err(|e| ErrorEnvelope::new(
                "DIR_CREATE_ERROR",
                &format!("Failed to create recordings directory: {}", e),
                "Check application permissions"
            ))?;
        
        // Generate output filename with timestamp
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let output_filename = format!("combined-recording-{}.mp4", timestamp);
        let output_path = recordings_dir.join(&output_filename);
        
        // Build input device strings
        // Screen input with audio: "<screen>:<audio>"
        let screen_input = if let Some(audio) = audio_device {
            format!("{}:{}", screen_device, audio)
        } else {
            format!("{}:none", screen_device)
        };
        
        // Webcam input (no audio to avoid echo): "<webcam>:none"
        let webcam_input = format!("{}:none", webcam_device);
        
        // FFmpeg filter_complex for PiP overlay
        // [0:v] = screen video, [1:v] = webcam video
        // overlay=W-w-20:H-h-20 = position webcam at bottom-right with 20px padding
        // scale=320:240 = resize webcam to 320x240
        let filter_complex = "[1:v]scale=320:240[pip];[0:v][pip]overlay=W-w-20:H-h-20[v]";
        
        let child = tokio::process::Command::new("ffmpeg")
            .args(&[
                "-f", "avfoundation",
                "-framerate", "30",
                "-i", &screen_input,
                "-f", "avfoundation",
                "-framerate", "30",
                "-i", &webcam_input,
                "-filter_complex", filter_complex,
                "-map", "[v]",      // Map the filtered video output
                "-map", "0:a?",     // Map audio from first input (screen), ? makes it optional
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "frag_keyframe+empty_moov",  // Fragmented MP4 for valid file during recording
                "-y",
                output_path.to_str().unwrap()
            ])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| ErrorEnvelope::new(
                "FFMPEG_ERROR",
                &format!("Failed to start combined recording: {}", e),
                "Make sure FFmpeg is installed and permissions are granted"
            ))?;
        
        // Store the process
        let mut procs = processes.lock().unwrap();
        procs.insert(recording_id.clone(), child);
        
        Ok(output_path.to_string_lossy().to_string())
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        Err(ErrorEnvelope::new(
            "PLATFORM_NOT_SUPPORTED",
            "Combined recording is only supported on macOS",
            "Use a Mac to enable combined recording"
        ))
    }
}

// Stop native screen recording
#[tauri::command]
pub async fn stop_screen_recording(
    recording_id: String,
    processes: State<'_, RecordingProcesses>,
) -> Result<(), ErrorEnvelope> {
    // Extract child process from map and release lock immediately
    let child = {
        let mut procs = processes.lock().unwrap();
        procs.remove(&recording_id)
    }; // Lock is dropped here
    
    if let Some(mut child) = child {
        // Send 'q' to ffmpeg stdin to stop gracefully
        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            let _ = stdin.write_all(b"q\n").await;
            let _ = stdin.flush().await;
            drop(stdin); // Close stdin to signal EOF
        }
        
        // Wait for FFmpeg to finish writing and exit (up to 5 seconds)
        let timeout = tokio::time::Duration::from_secs(5);
        match tokio::time::timeout(timeout, child.wait()).await {
            Ok(Ok(status)) => {
                println!("FFmpeg exited with status: {:?}", status);
                Ok(())
            }
            Ok(Err(e)) => {
                println!("Error waiting for FFmpeg: {}", e);
                let _ = child.kill().await;
                Ok(())
            }
            Err(_) => {
                println!("FFmpeg did not exit within timeout, killing process");
                let _ = child.kill().await;
                let _ = child.wait().await;
                Ok(())
            }
        }
    } else {
        Err(ErrorEnvelope::new(
            "RECORDING_NOT_FOUND",
            &format!("No active recording with ID: {}", recording_id),
            "Recording may have already stopped"
        ))
    }
}

