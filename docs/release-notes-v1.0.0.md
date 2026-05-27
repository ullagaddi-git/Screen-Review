# ScreenSpeak v1.0.0

> Speak. Capture. Understand.
>
> Voice-to-text dictation and AI-powered screen capture for Windows.
> Local-first, hotkey-driven, free.

This is the first public release. Paste this into the GitHub Release body
when publishing the `v1.0.0` tag.

---

## What it does

- **Hold `Ctrl+Shift+Space`** anywhere on Windows, talk, and your words appear
  in whatever app you're using. Whisper.cpp runs locally — no API keys, no
  cloud round-trip, no audio leaves your machine.
- **Press `Ctrl+Shift+S`** to capture any region, window, or auto-scrolling
  terminal — and get an AI explanation of what's on screen. Local AI via
  Ollama (free) or cloud via OpenAI (your key, your cost).
- **Tray-only.** No taskbar icon, no telemetry, no servers. Open source under
  MIT.

## What's in v1.0.0

- 🎙️ Voice dictation with hold-to-talk **or** press-to-toggle modes
- 🌐 11 languages + auto-detect (English, Spanish, French, German,
  Portuguese, Italian, Japanese, Korean, Chinese, Hindi)
- 📸 Four capture modes: Region (drag), Window, Desktop, Auto-scroll
- 🧠 Local AI via Ollama (`llava:7b` or `moondream`) — works fully offline
- 🔑 Optional OpenAI mode (`gpt-4o`) for fastest, most accurate analysis
- ⌨️ Fully rebindable hotkeys with conflict detection
- 🚀 Optional "launch on Windows startup" so it's always one keypress away
- 🔒 Sandboxed renderers + CSP + IPC validators (security audit in TASK-042)
- 📊 ~169 MB idle memory footprint (Whisper model loaded only during
  transcription; recorder window self-destroys after 5 minutes idle)

## Known limitations

- **Windows-only.** macOS and Linux are not supported in v1. The Win32
  APIs we use (`SendMessage WM_MOUSEWHEEL` for autoscroll, `EnumWindows`,
  `RegisterHotKey`, DPAPI via `safeStorage`) don't have direct equivalents.
- **x64 only.** ARM64 Windows users can't install this build.
- **Installer is not code-signed.** SmartScreen will warn "Windows protected
  your PC" — you have to click *More info → Run anyway*. Code signing is
  expensive (~$200–400/yr); we'll add it once download numbers justify it.
- **Auto-scroll on Chromium apps** (VS Code, Notion, Claude) uses a keyboard
  PageDown fallback. It works but is slower than the native `WM_MOUSEWHEEL`
  path used for Win32-native apps.
- **Local AI on CPU** is slow on first run. `llava:7b` takes 30–90 s for the
  first analysis (model load + inference) and 5–15 s for subsequent ones.
  If you have a GPU, Ollama uses it automatically.

## System requirements

- Windows 10 (build 1809+) or Windows 11
- x64 architecture
- 4 GB RAM (8 GB+ recommended if using local AI with `llava:7b`)
- ~250 MB disk for the app, +5 GB if using Ollama with `llava:7b`
- Microphone (for voice features)

## How to install

1. Download `ScreenSpeak-1.0.0-Setup.exe` from the Assets section below.
2. Run it. Click **More info → Run anyway** when SmartScreen warns.
3. Optional: install [Ollama](https://ollama.com) and run
   `ollama pull llava:7b` for AI screenshot analysis.

See the [README](https://github.com/ullagaddi-git/Screen-Review#readme) for
detailed setup and a full keyboard shortcut reference.

## Verification

The installer SHA-256 is available in the workflow artifact metadata (see
the "Build" job in the GitHub Actions run linked from this release). For a
manual check after download:

```powershell
Get-FileHash .\ScreenSpeak-1.0.0-Setup.exe -Algorithm SHA256
```

Compare against the value listed at the top of this release body once
published.

## Support & feedback

- **Bugs / feature requests:** [GitHub Issues](https://github.com/ullagaddi-git/Screen-Review/issues)
- **General questions:** GitHub Discussions (enable on the repo settings page first)

## Roadmap

The full roadmap lives at [`docs/product-roadmap.md`](https://github.com/ullagaddi-git/Screen-Review/blob/main/docs/product-roadmap.md).
Phase 6 (post-launch iteration) is intentionally driven by user feedback —
the items will reorder as real-world reports come in. The current top
candidates:

- "Ask a question" free-text input on the result panel
- OCR text extraction action button
- Capture history (last 10, in-memory)
- Multi-monitor support
- Browser extension companion (research spike first)

## Credits

ScreenSpeak builds on excellent open-source work:

- [Electron](https://www.electronjs.org/) for the cross-platform shell
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) for fast local
  transcription
- [Ollama](https://ollama.com) for the local AI runtime
- [nut.js](https://nut-tree.github.io/) (`@nut-tree-fork/nut-js`) for the
  paste-at-cursor + active-window detection
- [uiohook-napi](https://github.com/SnosMe/uiohook-napi) for the global
  voice hotkey listener
- [sharp](https://sharp.pixelplumbing.com/) for image manipulation
- All the React + Vite + Tailwind ecosystems

Thanks to everyone shipping these.
