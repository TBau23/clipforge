# Tauri Development Workflow

## Quick Reference

### Development Mode (Hot Reload)
```bash
npm run tauri dev
```
- **Frontend changes (React/TypeScript)**: Auto-reloads instantly (Vite hot reload)
- **Backend changes (Rust)**: Auto-recompiles in ~2-5 seconds, app restarts
- **No full rebuild needed** - changes are incremental
- App opens in a dev window, not as a standalone app

### Production Build (Packaging)
```bash
npm run tauri build
```
- **Full compilation**: Takes ~30-60 seconds
- **Creates distributable app**: `.app` bundle + `.dmg` installer
- **Optimized**: Smaller, faster, production-ready
- **Output**: `src-tauri/target/release/bundle/`

---

## Development Flow

### Starting Your Session
1. Open terminal: `npm run tauri dev`
2. App window opens + terminal shows logs
3. Edit code in your IDE
4. Changes apply automatically

### Making Changes

**React/TypeScript (Frontend)**
- Edit `src/App.tsx`, `src/App.css`, etc.
- Save file → changes appear instantly (< 1 second)
- No compilation step visible to you

**Rust (Backend)**
- Edit `src-tauri/src/lib.rs` or `src-tauri/src/main.rs`
- Save file → terminal shows "Compiling..."
- Wait 2-5 seconds → app restarts with new code
- **First compile is slow (~30s), subsequent are fast**

**Config Changes**
- Edit `src-tauri/tauri.conf.json` → requires dev server restart
- Edit `src-tauri/Cargo.toml` (dependencies) → requires restart

---

## Testing Your Work

### During Development
- **Visual testing**: See changes live in dev window
- **Console logs**: 
  - Frontend: Browser DevTools (Cmd+Option+I in dev window)
  - Backend: Terminal where you ran `npm run tauri dev`
- **Rust errors**: Show in terminal immediately
- **TypeScript errors**: Show in terminal + IDE

### Before Committing
1. Check terminal for Rust compilation errors
2. Open DevTools (Cmd+Option+I) - check for console errors
3. Test all features manually in dev window

### Before Submitting
1. Run production build: `npm run tauri build`
2. Open the packaged app: `src-tauri/target/release/bundle/macos/ClipForge.app`
3. Test all features in the real app (not dev window)

---

## Key Differences: Dev vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| **Command** | `npm run tauri dev` | `npm run tauri build` |
| **Speed** | Fast incremental builds | Full optimization (~1 min) |
| **Size** | Larger, includes debug info | Smaller, optimized |
| **Hot Reload** | ✅ Yes | ❌ No (standalone app) |
| **DevTools** | Easy access | Hidden by default |
| **Performance** | Slower | Much faster |
| **Output** | No files created | `.app` + `.dmg` created |

---

## Common Commands

```bash
# Start development
npm run tauri dev

# Build for production (creates distributable app)
npm run tauri build

# Run frontend only (no Tauri backend)
npm run dev

# Build frontend only
npm run build

# Open built app
open src-tauri/target/release/bundle/macos/ClipForge.app

# Clean build cache (if things break)
cd src-tauri && cargo clean && cd ..
rm -rf dist node_modules
npm install
```

---

## Compilation: What's Happening?

### Frontend (React/TypeScript)
- **Dev**: Vite transforms TypeScript → JavaScript on-the-fly
- **Build**: Vite bundles everything into optimized files in `dist/`
- **You don't see this** - it's nearly instant

### Backend (Rust)
- **Dev**: Cargo compiles Rust → native machine code
- **First run**: Compiles all dependencies (~30-60 seconds)
- **Subsequent**: Only compiles your changed files (~2-5 seconds)
- **Build**: Full optimization pass + code stripping

---

## Troubleshooting

### Dev server won't start
```bash
# Kill any running processes
pkill -f tauri

# Clean and restart
cd src-tauri && cargo clean && cd ..
npm run tauri dev
```

### Changes not appearing
- **Frontend**: Check terminal - might be a TypeScript error
- **Rust**: Check terminal - might be a compilation error
- **Force restart**: Stop dev server (Ctrl+C), run again

### Build fails
- Run `cargo clean` in `src-tauri/` directory
- Check `src-tauri/Cargo.toml` for dependency errors
- Ensure all Rust code compiles in dev mode first

---

## Mental Model

Think of Tauri as two separate apps:

1. **Frontend (React)**: Web-like development
   - Edit → Save → See change (instant)
   - Like regular web dev, but in a desktop window

2. **Backend (Rust)**: Native app development
   - Edit → Save → Compile → Restart (2-5s)
   - Like iOS/Android dev, but faster

They talk via **IPC commands** (the `invoke()` calls you see).

---

## Pro Tips

- Keep `npm run tauri dev` running - don't restart unless you have to
- Rust compilation errors are very helpful - read them carefully
- Use `console.log()` in React, `println!()` in Rust for debugging
- Open DevTools early to catch JavaScript errors
- Only do production builds when testing the final package
- Commit code that works in dev mode, not just production mode

---

**Bottom Line**: Dev mode is for fast iteration. Production build is for final testing and distribution. You'll spend 99% of your time in dev mode.
