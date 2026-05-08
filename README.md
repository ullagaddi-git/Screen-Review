# ScreenSpeak

Voice-to-text and AI-powered screen capture for Windows. Local-first, hotkey-driven, free.

> **Status:** Phase 0 — Foundation & Setup. The app builds, the tray icon appears, and the Settings window opens. Voice and capture flows land in Phase 1 and Phase 2.

## Prerequisites

- **Node.js 20+** ([download](https://nodejs.org/))
- **Windows 10 or 11** (the only supported OS for v1)
- **Windows Build Tools** for native modules — install via PowerShell **as admin**:
  ```powershell
  npm install -g windows-build-tools
  ```
  Or install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload — that gives you the C++ toolchain plus the Windows 10 SDK that node-gyp needs.
- **Ollama** (optional, but required for AI screen analysis) — install from <https://ollama.com>, then run `ollama pull qwen2-vl` to fetch the vision model.

## Setup

```bash
git clone <this-repo>
cd "Screen Review"
npm install
```

`npm install` installs JS deps and prebuilt native binaries (`sharp`, `@nut-tree-fork/nut-js`). It does **not** download the Whisper model — that comes in TASK-012.

## Commands

```bash
npm run dev        # Run in dev mode (hot reload, opens dev tools on Settings window)
npm run build      # Build production bundle + create the NSIS installer in dist/
npm run typecheck  # Run tsc on both main and renderer code
```

After `npm run dev`, the app is **tray-only**. Look for the violet "SS" icon in the system tray (or the overflow menu). Right-click it for Settings / Quit. Left-click also opens Settings.

## Project Layout

```
src/
  main/                    Electron main process (Node)
    services/store.ts      electron-store wrapper, typed Config
    ipc/                   IPC handlers (settings, ai)
    tray.ts                System tray menu
    preload.ts             contextBridge — only window.electronAPI is exposed
    index.ts               Main entry — tray + IPC registration
  preload/
    index.d.ts             Ambient types for window.electronAPI
  renderer/                React UI (Vite)
    components/ui/         Button, Input, HotkeyChip, StatusDot
    hooks/useIPC.ts        Typed IPC accessor for components
    windows/settings/      Settings window React app
    styles/                Tailwind + design tokens (globals.css)
docs/                      PRD, product vision, roadmap
resources/
  icons/tray-icon.png      16×16 tray icon
  installer/icon.ico       Multi-resolution app icon
  whisper/                 Bundled Whisper model (gitignored, downloaded later)
electron-builder.yml       Windows NSIS installer config
```

## Known Native Module Gotchas

- **`@nut-tree/nut-js` was unpublished from npm** — the maintained fork is `@nut-tree-fork/nut-js`. The roadmap and PRD reference the original name; the actual import is from the fork.
- **`whisper-node` requires Whisper.cpp built locally**. On Windows, its postinstall tries to run `make`, which fails by default. The package still imports and the binary will be built (or replaced with a precompiled `whisper.cpp`) in TASK-013. For Phase 0 this is expected.
- **`sharp`** ships prebuilt Windows binaries via `@img/sharp-win32-x64`, so no compile step is needed.
- If `npm install` complains about `node-gyp`, you're missing the Windows Build Tools step above.

## Contributing

This project is being built phase-by-phase from `docs/product-roadmap.md`. Each phase has a stated goal and a checklist of tasks. Pick the first unchecked task in the current phase, follow its `Notes` section, mark it `- [x]` when verified, and open a PR per phase. See the roadmap's *Agent Session Guide* for prompts that work well with Cursor / Claude Code.

## License

MIT.
