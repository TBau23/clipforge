# Setup Epic - Task List

**Goal:** Working Tauri + React app that builds to native macOS binary with basic IPC and file handling proven.

---

## Pre-flight Checks

- [x ] Verify Node v21.7.x installed: `node -v`
- [ x] Verify Rust 1.88 installed: `rustc --version`
- [ x] Install Tauri CLI: `cargo install tauri-cli`
- [x ] Install FFmpeg for local development: `brew install ffmpeg`

---

## 1. Scaffold Project

- [x ] Initialize Tauri project with React + Vite template
  ```bash
  npm create tauri-app@latest
  # Choose: React, TypeScript, Vite
  # Name: clip_forge_tauri
  ```
- [ x] Navigate into project: `cd clip_forge_tauri`
- [ x] Install dependencies: `npm install`
- [ x] Verify dev mode launches: `npm run tauri dev`
- [ x] Confirm window opens with React welcome screen

---

## 2. Git Setup

- [ x] Initialize git repo: `git init`
- [x ] Create `.gitignore` with:
  ```
  node_modules/
  dist/
  target/
  src-tauri/target/
  .DS_Store
  *.log
  ```
- [ ] Initial commit: `git add . && git commit -m "chore: initial Tauri + React scaffold"`
- [ ] Create GitHub repo and push: `git remote add origin <url> && git push -u origin main`

---

## 3. Hello World Frontend

- [ ] Open `src/App.tsx`
- [ ] Replace boilerplate with simple component:
  - Display "ClipForge" header
  - Show a state variable (e.g., status message)
  - Add button to update state
- [ ] Test hot reload works (edit text, see it update)
- [ ] Commit: `git commit -am "feat: add basic React UI"`

---

## 4. Hello World Backend (Rust IPC)

- [ ] Open `src-tauri/src/main.rs`
- [ ] Add Tauri command:
  ```rust
  #[tauri::command]
  fn ping() -> String {
      "pong".to_string()
  }
  ```
- [ ] Register command in `tauri::Builder`:
  ```rust
  .invoke_handler(tauri::generate_handler![ping])
  ```
- [ ] In `src/App.tsx`, import and invoke:
  ```typescript
  import { invoke } from '@tauri-apps/api/tauri';
  const response = await invoke('ping');
  ```
- [ ] Display response in UI
- [ ] Test: Click button → see "pong" displayed
- [ ] Commit: `git commit -am "feat: add ping/pong IPC command"`

---

## 5. File Dialog

- [ ] Add file dialog dependency to `src-tauri/Cargo.toml`:
  ```toml
  [dependencies]
  tauri = { version = "1.x", features = ["dialog-open"] }
  ```
- [ ] Create Rust command `select_file`:
  ```rust
  #[tauri::command]
  async fn select_file() -> Result<String, String> {
      // Use tauri::api::dialog::FileDialogBuilder
      // Return selected file path or error
  }
  ```
- [ ] Register command in handler
- [ ] Add button in React: "Select File"
- [ ] Invoke `select_file`, display path in UI
- [ ] Test: Click → file picker opens → path shows in UI
- [ ] Commit: `git commit -am "feat: add file picker dialog"`

---

## 6. FFmpeg Integration (Stub)

- [ ] Add new Rust command `probe_media`:
  ```rust
  #[tauri::command]
  fn probe_media(path: String) -> String {
      format!("Would probe: {}", path)
  }
  ```
- [ ] Register in handler
- [ ] Wire to file picker: After selecting file, auto-invoke `probe_media`
- [ ] Display probe result in UI
- [ ] Test full flow: Select file → probe stub returns path → shows in UI
- [ ] Commit: `git commit -am "feat: add media probe stub"`

---

## 7. Build & Package

- [ ] Update `src-tauri/tauri.conf.json`:
  - Set `productName`: `"ClipForge"`
  - Set `identifier`: `"com.clipforge.app"`
  - Verify `bundle.identifier` is unique
- [ ] Add app icon (optional but recommended):
  - Place icon files in `src-tauri/icons/`
  - Use Tauri icon generator if needed
- [ ] Run production build:
  ```bash
  npm run tauri build
  ```
- [ ] Locate binary:
  - macOS: `src-tauri/target/release/bundle/macos/ClipForge.app`
- [ ] Test packaged app:
  - Open `ClipForge.app` directly (not via terminal)
  - Test ping command works
  - Test file picker works
  - Test probe stub works
- [ ] Commit: `git commit -am "chore: configure app for production build"`
- [ ] Tag: `git tag setup-complete-v1.0`

---

## 8. Validation Checklist

- [ ] App launches in under 5 seconds
- [ ] Window opens with UI visible
- [ ] All three IPC commands work (ping, select_file, probe_media)
- [ ] File picker allows selecting video files (filter for .mp4, .mov)
- [ ] No console errors in dev tools
- [ ] Packaged binary runs independently of dev environment
- [ ] Git repo is clean with meaningful commit history

---

## 9. Documentation

- [ ] Create/update `README.md`:
  - Prerequisites (Node, Rust)
  - Setup instructions (`npm install`)
  - Dev mode: `npm run tauri dev`
  - Build: `npm run tauri build`
  - Architecture notes (React frontend, Rust backend, IPC via commands)
- [ ] Commit: `git commit -am "docs: add README with setup instructions"`

---

## Success Criteria

✅ **Binary launches outside dev mode**  
✅ **React UI renders and updates**  
✅ **Rust commands respond to UI**  
✅ **File picker works**  
✅ **Clean git history**  

**Time estimate:** 2-3 hours

---

## Notes

- Node 21.7 and Rust 1.88 are compatible with Tauri 1.x
- FFmpeg will be needed for real media probing later (installed via brew)
- For video file filtering, use: `filters: [{ name: "Video", extensions: ["mp4", "mov", "webm"] }]`
- If build fails, check Xcode Command Line Tools: `xcode-select --install`

---

## Next Steps After Setup

Once this epic is complete, move to MVP features:
1. Video import (drag & drop)
2. Timeline view
3. Video player
4. Trim functionality
5. Export to MP4

