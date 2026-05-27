# ScreenSpeak

**Speak. Capture. Understand.**

Voice-to-text dictation and AI-powered screen capture for Windows. Local-first, hotkey-driven, free.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue.svg)](#system-requirements)
[![Release](https://img.shields.io/github/v/release/ullagaddi-git/Screen-Review?include_prereleases&label=release)](https://github.com/ullagaddi-git/Screen-Review/releases)
[![Downloads](https://img.shields.io/github/downloads/ullagaddi-git/Screen-Review/total.svg)](https://github.com/ullagaddi-git/Screen-Review/releases)

<!-- A short demo GIF lives at assets/demo.gif. See assets/RECORDING-GUIDE.md
     for instructions on how to capture and re-export it. Until that's
     recorded, this section is intentionally text-only. -->

> Hold **Ctrl+Shift+Space** anywhere on Windows, talk, and your words appear in
> whatever app you're using. Press **Ctrl+Shift+S** to capture any region,
> window, or auto-scrolling terminal — and get an AI explanation of what's on
> screen. Works offline. Your screen never leaves your machine unless you
> choose OpenAI mode.

## Features

### 🎙️ Voice → Text, anywhere

- **Hold-to-talk or press-to-toggle** — your choice. Default is hold the
  hotkey while you speak; release to transcribe and auto-paste at your cursor.
- **Whisper.cpp** runs locally — no API key required, no audio leaves your
  machine. `tiny` / `base` / `small` models trade off speed vs. accuracy.
- **Multi-language** — English, Spanish, French, German, Portuguese, Italian,
  Japanese, Korean, Chinese, Hindi, plus auto-detect.
- **Up to 60-minute recordings** — useful for meetings, lectures, brainstorms.
  (Configurable cap; default 5 minutes to prevent stuck-hotkey runaways.)

### 📸 Screenshot → AI explanation

- **Four capture modes** — Region (drag to select), Window (focused app),
  Desktop (full screen), or Auto-scroll (capture a scrollable area like a
  Terminal or long page, stitched into one image).
- **Local AI by default** — uses [Ollama](https://ollama.com) running on your
  machine. We recommend `llava:7b` for accuracy or `moondream` for speed.
  Your screen never leaves your machine.
- **Cloud AI optional** — paste an OpenAI API key in Settings and switch to
  GPT-4o for fastest, most accurate analysis. Pay-per-use; you control the key.
- **Smart fallbacks** — Auto-scroll uses Win32 `WM_MOUSEWHEEL` first and
  falls back to keyboard `PageDown` for Chromium-based apps (VS Code, Claude,
  Notion) that don't honor mousewheel events.

### 🔒 Privacy by default

- **Tray-only** — no taskbar icon, no startup window, no telemetry.
- **OpenAI key encrypted** with Electron `safeStorage` (DPAPI on Windows) —
  never written to disk in plaintext.
- **Sandboxed renderers** + Content Security Policy + IPC input validators —
  the standard Electron security recipe, with HTTP-header CSP as defense-
  in-depth on top of the per-page `<meta>` tag.
- **Open source.** Audit the code, build it yourself, or fork it.

## System requirements

| | Required | Recommended |
|---|---|---|
| **OS** | Windows 10 (1809+) or 11, x64 | Windows 11, latest cumulative update |
| **RAM** | 4 GB | 8 GB+ |
| **Disk** | 250 MB for the app | + 5 GB if using Ollama with llava:7b |
| **Microphone** | For voice features | A decent USB or built-in mic |
| **Ollama** | Optional — only for local AI screenshot analysis | [ollama.com](https://ollama.com) + `ollama pull llava:7b` |
| **OpenAI key** | Optional — alternative to Ollama | [platform.openai.com](https://platform.openai.com/api-keys) |

ARM64 Windows is not supported in v1 (let us know if you want it).

## Installation

### From the installer (recommended)

1. Go to [Releases](https://github.com/ullagaddi-git/Screen-Review/releases)
   and download `ScreenSpeak-X.Y.Z-Setup.exe`.
2. Run the installer.
3. **Windows SmartScreen will warn** "Windows protected your PC" because the
   installer isn't yet code-signed (signing certs are expensive; we'll add
   one once we have meaningful download numbers). Click **More info** →
   **Run anyway**.
4. Pick an install location, confirm. The app launches into the system tray —
   look for the violet **SS** icon in the bottom-right.

### From source

```powershell
git clone https://github.com/ullagaddi-git/Screen-Review.git
cd "Screen Review"
npm install        # also downloads whisper-cli.exe and the base model (~200 MB)
npm run dev        # hot-reload dev mode
# OR
npm run build      # produces dist/ScreenSpeak-X.Y.Z-Setup.exe
```

Building from source needs Node 20+ and Python 3.11 (Python 3.12 dropped
`distutils` which `node-gyp` needs for native modules). On a clean install,
you may also need the Windows 10 SDK + "Desktop development with C++" via
Visual Studio Build Tools.

## First-run setup

ScreenSpeak's first launch shows a welcome notification and (if Ollama isn't
running) a second notification with a link to install it. Both notifications
respect your "Show tray notifications" setting.

### Voice — works out of the box

The Whisper `base` model is bundled with the installer. The first transcription
takes ~2–3 seconds (model load + decode); subsequent ones are similar (we
spawn a fresh `whisper-cli` process per call to keep idle memory low).

### AI screenshot analysis — choose one of:

**Option A: Local (free, private, slower)**

```powershell
# 1. Install Ollama from https://ollama.com (5 MB binary)
# 2. Pull a vision model:
ollama pull llava:7b   # ~5 GB, accurate, slower on CPU
# OR
ollama pull moondream  # ~1.7 GB, faster, less accurate
```

Then open ScreenSpeak Settings → AI tab → set "Active model" to whichever
you pulled. ScreenSpeak detects Ollama on `localhost:11434` automatically.

**Option B: Cloud (fast, paid, requires key)**

1. Get an API key from <https://platform.openai.com/api-keys>.
2. Settings → AI tab → choose "Cloud (OpenAI)" mode.
3. Paste the key, click "Test key" → should show "Valid".
4. Click "Save". The key is encrypted on your machine; it's only ever sent to
   `api.openai.com` for the analysis call you trigger.

## Keyboard shortcuts

| Default hotkey | Action |
|---|---|
| **Ctrl+Shift+Space** | Hold to dictate (or in toggle mode: tap to start, tap to stop) |
| **Ctrl+Shift+S** | Open the capture mode picker |
| **Esc** | Cancel any active capture or picker |
| **Right-click on region overlay** | Cancel region capture |

Both hotkeys are rebindable in **Settings → Hotkeys**.

## FAQ

### Is local AI good enough?

For most "what's on screen" tasks (explaining errors, summarizing terminals,
identifying UI elements), **yes** — `llava:7b` produces useful results on a
modern CPU within ~30–60 seconds for the first call and ~5–15 seconds after
that. For OCR-heavy or fine-detail tasks, OpenAI's GPT-4o is meaningfully
better; switch modes when you need the precision.

### Why not just use ChatGPT?

You can. ChatGPT requires you to manually screenshot (Win+Shift+S → save →
upload). ScreenSpeak collapses that into one keypress. It also runs in your
tray and is keyboard-first — no browser tab to find, no upload step, no copy-
paste-from-result-to-actual-app dance.

### Is it really free?

Yes. The Windows installer is free, the source is MIT-licensed, voice
dictation is fully local, and screenshot AI is free if you use Ollama.
OpenAI mode costs you whatever OpenAI charges you (~$0.01 per analysis on
GPT-4o). We have no servers, no telemetry, and no billing.

### Where does my data go?

- **Voice audio:** stays on your machine. Captured by an offscreen recorder
  window, fed to `whisper-cli.exe` as a temp WAV, deleted after transcription.
- **Screenshots:** saved to `%TEMP%\screenshpeak-captures\` and sent to
  whichever AI provider you picked (Ollama on localhost, or OpenAI). With
  Ollama, the screenshot never leaves your machine.
- **Settings + OpenAI key:** stored in `%APPDATA%\screenshpeak\config.json`.
  The OpenAI key is encrypted via Electron `safeStorage` (Windows DPAPI).

## Contributing

ScreenSpeak is built phase-by-phase from `docs/product-roadmap.md`. Phases
0–4 are complete; Phase 5 covers packaging and launch; Phase 6 is post-launch
iteration based on real user feedback.

If you want to contribute:

1. Read `docs/product-roadmap.md` for context.
2. Pick an unchecked task or open a fresh issue describing what you want to
   build.
3. Branch from `main` (`git checkout -b your-feature`), make changes, run
   `npm run typecheck && npm test && npm run build`.
4. Open a PR. We'll review.

## License

[MIT](LICENSE) — fork it, ship it, charge for it. We just appreciate a credit
if you do.
