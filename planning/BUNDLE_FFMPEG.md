# Bundle FFmpeg with Tauri App

## Quick Steps

### 1. Download FFmpeg Binaries

```bash
# Create binaries directory
mkdir -p src-tauri/binaries

# Download FFmpeg static builds for macOS
# Using official builds from https://evermeet.cx/ffmpeg/
cd src-tauri/binaries

# FFmpeg
curl -O https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip
unzip zip && rm zip

# FFprobe
curl -O https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip
unzip zip && rm zip

# Verify
ls -lh  # Should see ffmpeg and ffprobe executables

cd ../..
```

### 2. Configure Tauri to Bundle Them

Add to `src-tauri/tauri.conf.json` in the `bundle` section:

```json
"bundle": {
  "active": true,
  "targets": "all",
  "resources": [
    "binaries/ffmpeg",
    "binaries/ffprobe"
  ],
  "icon": [...]
}
```

### 3. Update Rust Code to Use Bundled Binaries

In `src-tauri/src/lib.rs`, add helper function:

```rust
use std::path::PathBuf;
use tauri::Manager;

fn get_ffmpeg_path(app: &tauri::AppHandle) -> PathBuf {
    let resource_path = app.path().resource_dir().expect("failed to get resource dir");
    resource_path.join("binaries").join("ffmpeg")
}

fn get_ffprobe_path(app: &tauri::AppHandle) -> PathBuf {
    let resource_path = app.path().resource_dir().expect("failed to get resource dir");
    resource_path.join("binaries").join("ffprobe")
}
```

### 4. Use in Commands

```rust
#[tauri::command]
fn probe_media(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let ffprobe = get_ffprobe_path(&app);
    
    let output = std::process::Command::new(ffprobe)
        .args([
            "-v", "error",
            "-show_streams",
            "-show_format",
            "-print_format", "json",
            &path
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;
    
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

### 5. Test It

```bash
# Dev mode (uses system FFmpeg)
npm run tauri dev

# Production build (uses bundled FFmpeg)
npm run tauri build

# Test the packaged app
open src-tauri/target/release/bundle/macos/ClipForge.app
```

---

## Alternative: Simple Version (System FFmpeg)

If you're short on time, just check for system FFmpeg:

```rust
fn get_ffmpeg_path() -> PathBuf {
    PathBuf::from("ffmpeg")  // Uses system PATH
}

fn get_ffprobe_path() -> PathBuf {
    PathBuf::from("ffprobe")  // Uses system PATH
}
```

Then require users to have FFmpeg installed. For MVP this is acceptable.

---

## Which Approach?

- **Bundled**: Better UX, app "just works", +100MB bundle size
- **System**: Faster to implement, users must install FFmpeg

For your tight timeline, I recommend **system FFmpeg** for MVP, bundle later if needed.

