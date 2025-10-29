# ClipForge

A desktop video editor built with Tauri + React, designed for rapid video editing workflows.

## Overview

ClipForge is a desktop application that enables users to:
- Import video files (MP4, MOV, WebM, AVI, MKV)
- Edit clips on a timeline
- Trim and arrange video content
- Export finished videos

## Prerequisites

- **Node.js**: Version 20.19+ or 22.12+ (currently using 21.7.0)
- **Rust**: Version 1.88+
- **Tauri CLI**: `cargo install tauri-cli`
- **FFmpeg**: **REQUIRED** - `brew install ffmpeg` (used for video probing, thumbnails, and export)

## Development Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd clip_forge_tauri
   npm install
   ```

2. **Run in development mode**:
   ```bash
   npm run tauri dev
   ```

3. **Build for production**:
   ```bash
   npm run tauri build
   ```

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust with Tauri framework
- **IPC**: Commands for frontend-backend communication
- **Packaging**: Native macOS app bundle (.app) and DMG installer

## Current Features

### ✅ MVP Complete
- [x] Desktop app launches (Tauri + React)
- [x] Video import (drag & drop + file picker)
- [x] Timeline view with imported clips
- [x] Video preview player with playback
- [x] Trim functionality (in/out points)
- [x] Export to MP4 with progress tracking
- [x] Multiple resolution export options (Original, 1080p, 720p, Custom)
- [x] Production build and packaging
- [x] Native macOS app bundle

### 🚧 Future Features
- [ ] Project save/load
- [ ] Undo/redo
- [ ] Multi-track support
- [ ] Transitions and effects

### 🎯 Core Features (Full Submission)
- [ ] Screen recording
- [ ] Webcam recording
- [ ] Simultaneous screen + webcam
- [ ] Audio capture
- [ ] Advanced timeline editing
- [ ] Multiple tracks
- [ ] Real-time preview

## Project Structure

```
clip_forge_tauri/
├── src/                    # React frontend
│   ├── App.tsx            # Main React component
│   ├── App.css            # Styling
│   └── main.tsx           # React entry point
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── main.rs        # Tauri entry point
│   │   └── lib.rs         # Command definitions
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
└── dist/                  # Built frontend assets
```

## Available Commands

### Rust Commands (IPC)
- `ping()` → Returns "pong" (tests IPC)
- `open_dialog()` → Opens native file picker
- `probe_media(path)` → Probes video metadata using FFprobe
- `make_thumbnail(path, durationMs)` → Generates video thumbnail
- `export_prepare(request)` → Prepares video segments for export
- `export_concat(listFile, outputPath, totalDurationMs)` → Concatenates and exports final video
- `check_ffmpeg()` → Verifies FFmpeg installation

## Build Outputs

After running `npm run tauri build`:
- **App Bundle**: `src-tauri/target/release/bundle/macos/ClipForge.app`
- **DMG Installer**: `src-tauri/target/release/bundle/dmg/ClipForge_0.1.0_aarch64.dmg`

## Development Notes

- **Node Version**: Currently using Node 21.7.0 (Vite recommends 20.19+ or 22.12+)
- **FFmpeg**: Currently uses system FFmpeg via PATH (requires `brew install ffmpeg`)
  - For distribution to users without FFmpeg, see `planning/BUNDLE_FFMPEG.md` for bundling instructions
- **Export**: Uses FFmpeg segment extraction + concat demuxer for efficient multi-clip export
- **Cross-platform**: Configured for macOS, Windows support possible with FFmpeg binaries

## Next Steps

1. **Post-MVP**: Project persistence, undo/redo, multi-track
2. **Recording**: Screen + webcam capture capabilities
3. **Polish**: Transitions, effects, keyboard shortcuts, export presets

## Milestones

- **Setup Epic (0)**: ✅ Complete
- **Media Intake (1)**: ✅ Complete
- **Timeline Core (2)**: ✅ Complete
- **Preview Engine (3)**: ✅ Complete
- **Export Compiler (4)**: ✅ Complete
- **MVP**: ✅ **COMPLETE**

---

Built with ❤️ using Tauri + React