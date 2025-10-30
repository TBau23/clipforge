# Epic 7: Recording Stack - Current Status

**Date:** October 29, 2025
**Status:** Implementation Complete, Debugging Permissions

---

## Epic Overview

**Goal:** Add screen, webcam, and combined recording capabilities that auto-import to the media panel.

**Approach:** Web APIs (`getDisplayMedia`, `getUserMedia`, `MediaRecorder`) → WebM → Tauri backend saves file → auto-import to timeline

---

## What We've Built

### Backend (Rust)
- **File:** `src-tauri/src/lib.rs`
- **Command:** `save_recording(data: Vec<u8>, filename: String) → Result<String, ErrorEnvelope>`
  - Saves WebM blobs to `AppData/recordings/`
  - Auto-generates filenames with timestamps
  - Returns absolute path for import

### Frontend (React)
- **File:** `src/RecordingPanel.tsx` + `src/RecordingPanel.css`
- **Features:**
  - Three recording modes: Screen, Webcam, Combined (PiP)
  - Start/Stop controls with elapsed timer
  - Live preview during recording
  - Visual recording indicator (pulsing red dot)
  - Error handling with user-friendly messages

- **File:** `src/App.tsx` (modified)
  - `handleRecordingComplete()` - auto-imports recordings
  - Probes metadata, generates thumbnails
  - Adds to media panel automatically
  - RecordingPanel integrated into layout

---

## Current Problem

**Error:** `navigator.mediaDevices.getDisplayMedia is undefined`

**Root Cause:** Tauri's WKWebView doesn't expose media device APIs by default for security reasons.

---

## What We've Tried

### Attempt 1: Enable macOS Private API
**File:** `src-tauri/tauri.conf.json`
```json
"app": {
  "macOSPrivateApi": true
}
```
**Result:** Needed but not sufficient alone

### Attempt 2: Set User Agent
**File:** `src-tauri/tauri.conf.json`
```json
"windows": [{
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)..."
}]
```
**Result:** Helps identify as Safari browser

### Attempt 3: Create Info.plist with Permissions
**File:** `src-tauri/Info.plist` (new)
```xml
<key>NSCameraUsageDescription</key>
<string>ClipForge needs access to your camera...</string>
<key>NSMicrophoneUsageDescription</key>
<string>ClipForge needs access to your microphone...</string>
<key>NSScreenCaptureUsageDescription</key>
<string>ClipForge needs permission to record your screen.</string>
```

### Attempt 4: Reference Info.plist in Config
**File:** `src-tauri/tauri.conf.json`
```json
"bundle": {
  "macOS": {
    "infoPlist": "Info.plist"
  }
}
```
**Status:** Config error fixed, ready to test

---

## Relevant Files

### Modified Files
- `src-tauri/tauri.conf.json` - Webview config + permissions
- `src/App.tsx` - Recording integration + auto-import
- `src-tauri/src/lib.rs` - `save_recording` command

### New Files
- `src/RecordingPanel.tsx` - Recording UI component
- `src/RecordingPanel.css` - Recording UI styles
- `src-tauri/Info.plist` - macOS permission descriptions

---

## Next Steps

1. **Restart dev server:** `npm run tauri dev`
2. **Test permissions:** Click recording buttons, grant permissions when prompted
3. **Verify APIs available:** Check if `navigator.mediaDevices` is defined
4. **Manual permission grant:** If still failing, grant screen recording permission manually:
   - System Settings → Privacy & Security → Screen Recording → Enable ClipForge

---

## Alternative Approaches (If Current Fails)

### Option A: Use Tauri Dialog + Native Capture
- More complex, requires Rust native screen capture
- Platform-specific code (AVFoundation on macOS)
- ~2-3 days of work

### Option B: External Recording Tool
- Use system screen recorder
- Import recordings via file picker
- Doesn't meet "native recording" requirement

### Option C: Electron Migration
- Electron has better WebRTC/media API support
- ~1 day to migrate but loses Tauri benefits
- Nuclear option

---

## Known Limitations

- **Screen Recording:** Requires macOS permission grant (System Settings)
- **Webcam:** Should work once Info.plist is loaded
- **Combined Mode:** Most complex, uses Canvas compositing
- **Format:** WebM only (VP8/Opus), converted during export if needed

---

## Testing Checklist

Once permissions work:
- [ ] Screen recording starts and shows preview
- [ ] Recording saves to AppData/recordings/
- [ ] Auto-imports to media panel with thumbnail
- [ ] Can drag to timeline
- [ ] Can trim recorded clip
- [ ] Exports correctly in final video
- [ ] Webcam recording works
- [ ] Combined recording shows PiP correctly

---

## Resources

- Tauri v2 Security Docs: https://v2.tauri.app/concept/security/
- MDN MediaDevices API: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices
- macOS App Sandbox: https://developer.apple.com/documentation/security/app_sandbox

---

*Last Updated: After Info.plist configuration fix*

