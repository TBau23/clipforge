mod commands;
mod ffmpeg;
mod types;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// Re-export modules
use commands::*;
use types::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize recording processes state
    let recording_processes: RecordingProcesses = Arc::new(Mutex::new(HashMap::new()));
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(recording_processes)
        .invoke_handler(tauri::generate_handler![
            greet,
            ping,
            open_dialog,
            probe_media,
            make_thumbnail,
            probe_media_stub,
            export_prepare,
            export_concat,
            check_ffmpeg,
            save_recording,
            list_screen_devices,
            start_screen_recording,
            start_webcam_recording,
            start_combined_recording,
            stop_screen_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
