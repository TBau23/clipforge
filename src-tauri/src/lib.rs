use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

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
    let output = tokio::process::Command::new("ffprobe")
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
    let output = tokio::process::Command::new("ffmpeg")
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
            probe_media_stub
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
