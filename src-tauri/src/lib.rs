use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Emitter, Manager};

// Error envelope for consistent error handling
#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorEnvelope {
    code: String,
    message: String,
    hint: String,
}

impl ErrorEnvelope {
    fn new(code: &str, message: &str, hint: &str) -> Self {
        Self {
            code: code.to_string(),
            message: message.to_string(),
            hint: hint.to_string(),
        }
    }
}

// Media metadata structure
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadata {
    duration_ms: u64,
    width: u32,
    height: u32,
    fps: Option<f64>,
    size_bytes: Option<u64>,
}

// Export request structures
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportClip {
    asset_path: String,
    in_ms: u64,
    out_ms: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct ExportRequest {
    clips: Vec<ExportClip>,
    output_path: String,  // Passed separately to export_concat, not read from struct
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPrepareResult {
    segment_paths: Vec<String>,
    list_file: String,
    total_duration_ms: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    stage: String,
    progress: f32,  // 0.0 to 1.0
    current_ms: u64,
    total_ms: u64,
    message: String,
}

// FFprobe JSON output structures
#[derive(Debug, Deserialize)]
struct FFprobeOutput {
    streams: Vec<FFprobeStream>,
    format: FFprobeFormat,
}

#[derive(Debug, Deserialize)]
struct FFprobeStream {
    codec_type: String,
    width: Option<u32>,
    height: Option<u32>,
    r_frame_rate: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FFprobeFormat {
    duration: Option<String>,
    size: Option<String>,
}

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

// Helper function to calculate thumbnail time
fn calculate_thumbnail_time(duration_ms: u64) -> u64 {
    let ten_percent = duration_ms / 10;
    let time = ten_percent.max(500).min(5000);
    time
}

// Helper to get FFmpeg binary path (searches common locations)
fn get_ffmpeg_path() -> PathBuf {
    // Try common Homebrew locations first (for production .app bundles)
    let homebrew_paths = [
        "/opt/homebrew/bin/ffmpeg",  // Apple Silicon
        "/usr/local/bin/ffmpeg",     // Intel Mac
    ];
    
    for path in &homebrew_paths {
        if std::path::Path::new(path).exists() {
            return PathBuf::from(path);
        }
    }
    
    // Fall back to PATH (works in dev mode)
    PathBuf::from("ffmpeg")
}

// Helper to get FFprobe binary path (searches common locations)
fn get_ffprobe_path() -> PathBuf {
    // Try common Homebrew locations first (for production .app bundles)
    let homebrew_paths = [
        "/opt/homebrew/bin/ffprobe",  // Apple Silicon
        "/usr/local/bin/ffprobe",     // Intel Mac
    ];
    
    for path in &homebrew_paths {
        if std::path::Path::new(path).exists() {
            return PathBuf::from(path);
        }
    }
    
    // Fall back to PATH (works in dev mode)
    PathBuf::from("ffprobe")
}

// Check if FFmpeg is available
#[tauri::command]
async fn check_ffmpeg() -> Result<bool, ErrorEnvelope> {
    let output = tokio::process::Command::new(get_ffmpeg_path())
        .arg("-version")
        .output()
        .await;
    
    match output {
        Ok(out) if out.status.success() => Ok(true),
        _ => Err(ErrorEnvelope::new(
            "FFMPEG_NOT_FOUND",
            "FFmpeg is not installed or not found in PATH",
            "Install FFmpeg: brew install ffmpeg (macOS) or visit https://ffmpeg.org"
        ))
    }
}

// Parse frame rate string like "30/1" or "30000/1001"
fn parse_frame_rate(rate_str: &str) -> Option<f64> {
    let parts: Vec<&str> = rate_str.split('/').collect();
    if parts.len() != 2 {
        return None;
    }
    
    let num: f64 = parts[0].parse().ok()?;
    let den: f64 = parts[1].parse().ok()?;
    
    if den == 0.0 {
        return None;
    }
    
    Some(num / den)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn ping() -> String {
    "pong".to_string()
}

// Task 1.1: Open file dialog
#[tauri::command]
async fn open_dialog(app: tauri::AppHandle) -> Result<Vec<String>, ErrorEnvelope> {
    use tauri_plugin_dialog::DialogExt;
    
    let (tx, rx) = std::sync::mpsc::channel();
    
    app.dialog()
        .file()
        .add_filter("Video Files", &["mp4", "mov"])
        .pick_files(move |files| {
            let _ = tx.send(files);
        });
    
    match rx.recv() {
        Ok(Some(files)) => {
            let paths: Vec<String> = files
                .iter()
                .map(|f| f.to_string())
                .collect();
            Ok(paths)
        }
        Ok(None) => Ok(Vec::new()), // User cancelled
        Err(_) => Err(ErrorEnvelope::new(
            "DIALOG_ERROR",
            "File dialog was cancelled or failed",
            "Try using drag-and-drop instead"
        )),
    }
}

// Task 1.2: Probe media file
#[tauri::command]
async fn probe_media(path: String) -> Result<MediaMetadata, ErrorEnvelope> {
    // Check if file exists
    if !std::path::Path::new(&path).exists() {
        return Err(ErrorEnvelope::new(
            "FILE_NOT_FOUND",
            &format!("File not found: {}", path),
            "Check that the file path is correct and the file hasn't been moved"
        ));
    }
    
    // Run ffprobe
    let output = tokio::process::Command::new(get_ffprobe_path())
        .args([
            "-v", "error",
            "-show_streams",
            "-show_format",
            "-print_format", "json",
            &path
        ])
        .output()
        .await
        .map_err(|e| ErrorEnvelope::new(
            "FFPROBE_ERROR",
            &format!("Failed to run ffprobe: {}", e),
            "Make sure FFmpeg is installed: brew install ffmpeg"
        ))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ErrorEnvelope::new(
            "FFPROBE_FAILED",
            &format!("ffprobe failed: {}", stderr),
            "The file may be corrupted or in an unsupported format"
        ));
    }
    
    // Parse JSON output
    let stdout = String::from_utf8_lossy(&output.stdout);
    let probe_data: FFprobeOutput = serde_json::from_str(&stdout)
        .map_err(|e| ErrorEnvelope::new(
            "PARSE_ERROR",
            &format!("Failed to parse ffprobe output: {}", e),
            "The file may be corrupted"
        ))?;
    
    // Find video stream
    let video_stream = probe_data.streams.iter()
        .find(|s| s.codec_type == "video")
        .ok_or_else(|| ErrorEnvelope::new(
            "NO_VIDEO_STREAM",
            "No video stream found in file",
            "Make sure the file is a valid video file"
        ))?;
    
    // Extract metadata
    let duration_ms = probe_data.format.duration
        .and_then(|d| d.parse::<f64>().ok())
        .map(|d| (d * 1000.0) as u64)
        .ok_or_else(|| ErrorEnvelope::new(
            "NO_DURATION",
            "Could not determine video duration",
            "The file may be corrupted"
        ))?;
    
    let width = video_stream.width.ok_or_else(|| ErrorEnvelope::new(
        "NO_WIDTH",
        "Could not determine video width",
        "The file may be corrupted"
    ))?;
    
    let height = video_stream.height.ok_or_else(|| ErrorEnvelope::new(
        "NO_HEIGHT",
        "Could not determine video height",
        "The file may be corrupted"
    ))?;
    
    let fps = video_stream.r_frame_rate
        .as_ref()
        .and_then(|r| parse_frame_rate(r));
    
    let size_bytes = probe_data.format.size
        .and_then(|s| s.parse::<u64>().ok());
    
    Ok(MediaMetadata {
        duration_ms,
        width,
        height,
        fps,
        size_bytes,
    })
}

// Task 1.3: Generate thumbnail
#[tauri::command]
async fn make_thumbnail(
    app: tauri::AppHandle,
    path: String,
    duration_ms: u64
) -> Result<String, ErrorEnvelope> {
    // Check if file exists
    if !std::path::Path::new(&path).exists() {
        return Err(ErrorEnvelope::new(
            "FILE_NOT_FOUND",
            &format!("File not found: {}", path),
            "Check that the file path is correct"
        ));
    }
    
    // Create thumbnails directory
    let app_data = get_app_data_dir(&app)?;
    let thumb_dir = app_data.join("thumbnails");
    
    tokio::fs::create_dir_all(&thumb_dir)
        .await
        .map_err(|e| ErrorEnvelope::new(
            "DIR_CREATE_ERROR",
            &format!("Failed to create thumbnails directory: {}", e),
            "Check application permissions"
        ))?;
    
    // Calculate thumbnail time
    let thumb_time_ms = calculate_thumbnail_time(duration_ms);
    let thumb_time_sec = thumb_time_ms as f64 / 1000.0;
    
    // Generate unique filename from path hash
    let hash = format!("{:x}", md5::compute(path.as_bytes()));
    let thumb_path = thumb_dir.join(format!("{}.jpg", hash));
    
    // Skip if thumbnail already exists
    if thumb_path.exists() {
        return Ok(thumb_path.to_string_lossy().to_string());
    }
    
    // Run ffmpeg to generate thumbnail
    let output = tokio::process::Command::new(get_ffmpeg_path())
        .args([
            "-ss", &format!("{:.3}", thumb_time_sec),
            "-i", &path,
            "-frames:v", "1",
            "-q:v", "2",
            "-y",
            thumb_path.to_str().unwrap()
        ])
        .output()
        .await
        .map_err(|e| ErrorEnvelope::new(
            "FFMPEG_ERROR",
            &format!("Failed to run ffmpeg: {}", e),
            "Make sure FFmpeg is installed: brew install ffmpeg"
        ))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ErrorEnvelope::new(
            "THUMBNAIL_FAILED",
            &format!("ffmpeg failed to generate thumbnail: {}", stderr),
            "The file may be corrupted or too short"
        ));
    }
    
    Ok(thumb_path.to_string_lossy().to_string())
}

#[tauri::command]
fn probe_media_stub(path: String) -> String {
    format!("Would probe: {}", path)
}

// Export: Step 1 - Prepare segments
#[tauri::command]
async fn export_prepare(
    app: tauri::AppHandle,
    request: ExportRequest,
) -> Result<ExportPrepareResult, ErrorEnvelope> {
    // Create temp directory for segments
    let app_data = get_app_data_dir(&app)?;
    let export_dir = app_data.join("export_temp");
    
    tokio::fs::create_dir_all(&export_dir)
        .await
        .map_err(|e| ErrorEnvelope::new(
            "DIR_CREATE_ERROR",
            &format!("Failed to create export directory: {}", e),
            "Check application permissions"
        ))?;
    
    let mut segment_paths = Vec::new();
    let mut total_duration_ms = 0u64;
    
    // Generate segments for each clip
    for (i, clip) in request.clips.iter().enumerate() {
        // Validate file exists
        if !std::path::Path::new(&clip.asset_path).exists() {
            return Err(ErrorEnvelope::new(
                "FILE_NOT_FOUND",
                &format!("Source file not found: {}", clip.asset_path),
                "Make sure all source files are available"
            ));
        }
        
        let segment_path = export_dir.join(format!("segment_{:04}.mp4", i));
        
        // Calculate duration and times in seconds
        let duration_ms = clip.out_ms - clip.in_ms;
        total_duration_ms += duration_ms;
        
        let start_sec = clip.in_ms as f64 / 1000.0;
        let duration_sec = duration_ms as f64 / 1000.0;
        
        // Build ffmpeg command for segment extraction
        let mut args = vec![
            "-ss".to_string(),
            format!("{:.3}", start_sec),
            "-i".to_string(),
            clip.asset_path.clone(),
            "-t".to_string(),
            format!("{:.3}", duration_sec),
        ];
        
        // Add scaling if requested
        if let (Some(width), Some(height)) = (request.width, request.height) {
            args.extend_from_slice(&[
                "-vf".to_string(),
                format!("scale={}:{}", width, height),
            ]);
        }
        
        // Re-encode to H.264/AAC for compatibility
        args.extend_from_slice(&[
            "-c:v".to_string(),
            "libx264".to_string(),
            "-preset".to_string(),
            "medium".to_string(),
            "-crf".to_string(),
            "23".to_string(),
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            "192k".to_string(),
            "-y".to_string(),
            segment_path.to_str().unwrap().to_string(),
        ]);
        
        // Execute ffmpeg
        let output = tokio::process::Command::new(get_ffmpeg_path())
            .args(&args)
            .output()
            .await
            .map_err(|e| ErrorEnvelope::new(
                "FFMPEG_ERROR",
                &format!("Failed to run ffmpeg: {}", e),
                "Make sure FFmpeg is installed: brew install ffmpeg"
            ))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ErrorEnvelope::new(
                "SEGMENT_FAILED",
                &format!("Failed to create segment {}: {}", i, stderr),
                "Check if the source file is valid"
            ));
        }
        
        segment_paths.push(segment_path.to_string_lossy().to_string());
    }
    
    // Create concat demuxer list file
    let list_file = export_dir.join("concat_list.txt");
    let mut list_content = String::new();
    
    for segment_path in &segment_paths {
        list_content.push_str(&format!("file '{}'\n", segment_path));
    }
    
    tokio::fs::write(&list_file, list_content)
        .await
        .map_err(|e| ErrorEnvelope::new(
            "FILE_WRITE_ERROR",
            &format!("Failed to write concat list: {}", e),
            "Check application permissions"
        ))?;
    
    Ok(ExportPrepareResult {
        segment_paths,
        list_file: list_file.to_string_lossy().to_string(),
        total_duration_ms,
    })
}

// Export: Step 2 - Concatenate segments with progress
#[tauri::command]
async fn export_concat(
    app: tauri::AppHandle,
    list_file: String,
    output_path: String,
    total_duration_ms: u64,
) -> Result<(), ErrorEnvelope> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    
    // Start ffmpeg process with concat demuxer
    let mut child = tokio::process::Command::new(get_ffmpeg_path())
        .args([
            "-f", "concat",
            "-safe", "0",
            "-i", &list_file,
            "-c", "copy",
            "-y",
            &output_path,
        ])
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| ErrorEnvelope::new(
            "FFMPEG_ERROR",
            &format!("Failed to start ffmpeg: {}", e),
            "Make sure FFmpeg is installed"
        ))?;
    
    // Read stderr for progress
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        
        while let Ok(Some(line)) = lines.next_line().await {
            // Parse progress from ffmpeg output (time=hh:mm:ss.xx)
            if line.contains("time=") {
                if let Some(time_str) = line.split("time=").nth(1) {
                    if let Some(time_part) = time_str.split_whitespace().next() {
                        if let Some(current_ms) = parse_ffmpeg_time(time_part) {
                            let progress = (current_ms as f32) / (total_duration_ms as f32);
                            let progress = progress.min(1.0);
                            
                            let _ = app.emit_to(
                                tauri::EventTarget::Any,
                                "export-progress",
                                ExportProgress {
                                    stage: "concat".to_string(),
                                    progress,
                                    current_ms,
                                    total_ms: total_duration_ms,
                                    message: format!("Exporting... {:.0}%", progress * 100.0),
                                }
                            );
                        }
                    }
                }
            }
        }
    }
    
    // Wait for process to complete
    let status = child.wait().await.map_err(|e| ErrorEnvelope::new(
        "FFMPEG_ERROR",
        &format!("FFmpeg process error: {}", e),
        "Export may have been interrupted"
    ))?;
    
    if !status.success() {
        return Err(ErrorEnvelope::new(
            "EXPORT_FAILED",
            "FFmpeg export failed",
            "Check if output path is writable and source files are valid"
        ));
    }
    
    // Emit completion
    let _ = app.emit_to(
        tauri::EventTarget::Any,
        "export-progress",
        ExportProgress {
            stage: "complete".to_string(),
            progress: 1.0,
            current_ms: total_duration_ms,
            total_ms: total_duration_ms,
            message: "Export complete!".to_string(),
        }
    );
    
    Ok(())
}

// Helper: Parse FFmpeg time format (hh:mm:ss.xx) to milliseconds
fn parse_ffmpeg_time(time_str: &str) -> Option<u64> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    
    let hours: f64 = parts[0].parse().ok()?;
    let minutes: f64 = parts[1].parse().ok()?;
    let seconds: f64 = parts[2].parse().ok()?;
    
    let total_seconds = hours * 3600.0 + minutes * 60.0 + seconds;
    Some((total_seconds * 1000.0) as u64)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            ping,
            open_dialog,
            probe_media,
            make_thumbnail,
            probe_media_stub,
            export_prepare,
            export_concat,
            check_ffmpeg
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
