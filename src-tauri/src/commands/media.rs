use crate::ffmpeg::*;
use crate::types::*;
use std::path::PathBuf;
use tauri::Manager;

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

// Check if FFmpeg is available
#[tauri::command]
pub async fn check_ffmpeg() -> Result<bool, ErrorEnvelope> {
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

// Task 1.2: Probe media file
#[tauri::command]
pub async fn probe_media(path: String) -> Result<MediaMetadata, ErrorEnvelope> {
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
pub async fn make_thumbnail(
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
pub fn probe_media_stub(path: String) -> String {
    format!("Would probe: {}", path)
}

// Legacy commands for compatibility
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}

