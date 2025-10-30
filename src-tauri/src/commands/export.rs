use crate::ffmpeg::*;
use crate::types::*;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

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

// Export: Step 1 - Prepare segments
#[tauri::command]
pub async fn export_prepare(
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
pub async fn export_concat(
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

