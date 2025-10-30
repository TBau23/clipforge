use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// Error envelope for consistent error handling
#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorEnvelope {
    pub code: String,
    pub message: String,
    pub hint: String,
}

impl ErrorEnvelope {
    pub fn new(code: &str, message: &str, hint: &str) -> Self {
        Self {
            code: code.to_string(),
            message: message.to_string(),
            hint: hint.to_string(),
        }
    }
}

// Screen recording state management
pub type RecordingProcesses = Arc<Mutex<HashMap<String, tokio::process::Child>>>;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenDevice {
    pub id: String,
    pub name: String,
    pub device_type: String, // "screen" or "audio"
}

// Media metadata structure
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadata {
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub fps: Option<f64>,
    pub size_bytes: Option<u64>,
}

// Export request structures
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportClip {
    pub asset_path: String,
    pub in_ms: u64,
    pub out_ms: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct ExportRequest {
    pub clips: Vec<ExportClip>,
    pub output_path: String,  // Passed separately to export_concat, not read from struct
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPrepareResult {
    pub segment_paths: Vec<String>,
    pub list_file: String,
    pub total_duration_ms: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub stage: String,
    pub progress: f32,  // 0.0 to 1.0
    pub current_ms: u64,
    pub total_ms: u64,
    pub message: String,
}

// FFprobe JSON output structures
#[derive(Debug, Deserialize)]
pub struct FFprobeOutput {
    pub streams: Vec<FFprobeStream>,
    pub format: FFprobeFormat,
}

#[derive(Debug, Deserialize)]
pub struct FFprobeStream {
    pub codec_type: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub r_frame_rate: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FFprobeFormat {
    pub duration: Option<String>,
    pub size: Option<String>,
}

