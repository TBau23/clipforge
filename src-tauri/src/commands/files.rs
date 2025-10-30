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

// Task 1.1: Open file dialog
#[tauri::command]
pub async fn open_dialog(app: tauri::AppHandle) -> Result<Vec<String>, ErrorEnvelope> {
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

// Save recording blob to file
#[tauri::command]
pub async fn save_recording(
    app: tauri::AppHandle,
    data: Vec<u8>,
    filename: String,
) -> Result<String, ErrorEnvelope> {
    // Create recordings directory
    let app_data = get_app_data_dir(&app)?;
    let recordings_dir = app_data.join("recordings");
    
    tokio::fs::create_dir_all(&recordings_dir)
        .await
        .map_err(|e| ErrorEnvelope::new(
            "DIR_CREATE_ERROR",
            &format!("Failed to create recordings directory: {}", e),
            "Check application permissions"
        ))?;
    
    // Ensure filename has an extension (support .webm, .mp4, .mkv)
    let filename = if filename.contains('.') {
        filename
    } else {
        format!("{}.webm", filename)
    };
    
    let file_path = recordings_dir.join(&filename);
    
    // Write the blob data to file
    tokio::fs::write(&file_path, data)
        .await
        .map_err(|e| ErrorEnvelope::new(
            "FILE_WRITE_ERROR",
            &format!("Failed to write recording file: {}", e),
            "Check disk space and permissions"
        ))?;
    
    Ok(file_path.to_string_lossy().to_string())
}

