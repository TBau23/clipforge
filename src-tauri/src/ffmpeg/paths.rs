use std::path::PathBuf;

/// Get FFmpeg binary path (searches common locations)
pub fn get_ffmpeg_path() -> PathBuf {
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

/// Get FFprobe binary path (searches common locations)
pub fn get_ffprobe_path() -> PathBuf {
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

