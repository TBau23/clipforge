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
- **FFmpeg**: `brew install ffmpeg` (for future media processing)

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

### ✅ Setup Epic Complete
- [x] Desktop app launches (Tauri + React)
- [x] Basic IPC communication (ping/pong)
- [x] Media probe stub command
- [x] Production build and packaging
- [x] Native macOS app bundle

### 🚧 MVP Features (Next)
- [ ] Video import (drag & drop)
- [ ] Timeline view with imported clips
- [ ] Video preview player
- [ ] Basic trim functionality
- [ ] Export to MP4

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
- `select_file()` → Placeholder for file picker
- `probe_media(path)` → Media probe stub

### Frontend Functions
- `ping()` → Tests IPC communication
- `selectFile()` → Triggers file selection flow

## Build Outputs

After running `npm run tauri build`:
- **App Bundle**: `src-tauri/target/release/bundle/macos/ClipForge.app`
- **DMG Installer**: `src-tauri/target/release/bundle/dmg/ClipForge_0.1.0_aarch64.dmg`

## Development Notes

- **Node Version**: Currently using Node 21.7.0 (Vite recommends 20.19+ or 22.12+)
- **File Dialog**: Currently stubbed - will implement proper file picker in MVP phase
- **FFmpeg Integration**: Ready for media processing implementation
- **Cross-platform**: Configured for macOS, Windows builds possible

## Next Steps

1. **MVP Phase**: Implement video import, timeline, and basic editing
2. **Core Features**: Add recording capabilities and advanced editing
3. **Polish**: UI improvements, keyboard shortcuts, export presets

## Timeline

- **Setup Epic**: ✅ Complete
- **MVP Deadline**: Tuesday, October 28th at 10:59 PM CT
- **Final Submission**: Wednesday, October 29th at 10:59 PM CT

---

Built with ❤️ using Tauri + React