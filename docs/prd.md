# PRD — ScreenSpeak

## 1. Overview

### Product Summary

**ScreenSpeak** is a Windows desktop productivity utility that provides two AI-powered superpowers from a system tray app: (1) system-wide voice-to-text transcription using local Whisper.cpp, and (2) AI-powered screen capture and analysis using local Ollama vision models. The app runs entirely on-device by default, with optional cloud AI via the user's own OpenAI API key. No sign-up, no subscription, no data leaving the machine.

### Objective

This PRD covers the MVP as defined in `docs/product-vision.md § Product Strategy`. Scope includes: Electron system tray app, global hotkey voice-to-text, multi-mode screen capture (region, window, desktop, auto-scroll), local AI analysis via Ollama, floating result panel, settings UI, and Windows installer. Browser extension, Mac support, cloud sync, and payments are explicitly out of scope.

### Market Differentiation

ScreenSpeak is the only Windows desktop tool that chains voice + capture + AI in a single hotkey workflow, running entirely locally. Cloud-dependent competitors (Wispr Flow, various screenshot SaaS tools) require subscriptions because they pay per inference. ScreenSpeak's local-first architecture means zero marginal cost per user — enabling a genuinely sustainable free tier. The technical implementation must deliver: sub-2s voice response, sub-10s capture-to-AI-result, and zero required network calls.

### Magic Moment

A developer sees an error in their VS Code terminal. They press `Ctrl+Shift+S`, select "Auto-scroll", click the terminal. ScreenSpeak scrolls the terminal, stitches all frames into one image, sends it to the locally running Ollama model, and displays a plain-English explanation with suggested fix in a floating panel — all within 10 seconds, without the user leaving VS Code. This must work on first use, with no configuration beyond installing Ollama.

### Success Criteria

- Time from voice hotkey release to cursor paste: < 2 seconds on hardware with 8GB+ RAM
- Time from capture hotkey to AI result in panel: < 10 seconds with local Ollama model
- Auto-scroll capture works correctly on: Windows Terminal, CMD, PowerShell, VS Code integrated terminal
- App cold-start to tray-ready (on Windows startup): < 3 seconds
- Installer size: < 150MB
- All P0 functional requirements working before launch
- No mandatory network calls for core functionality

---

## 2. Technical Architecture

### Architecture Overview

```mermaid
graph TD
  A[Windows System Tray] --> B[Electron Main Process]
  B --> C[Global Shortcuts API]
  B --> D[desktopCapturer API]
  B --> E[Whisper.cpp via node-whisper]
  B --> F[Ollama HTTP API :11434]
  B --> G[electron-store - Local Config]
  B --> H[IPC Bridge]
  H --> I[Renderer Process - React UI]
  I --> J[Settings Window]
  I --> K[Floating Result Panel]
  I --> L[Capture Mode Picker]
  F --> M[LLaVA / Qwen2-VL Model - Local]
  N[OpenAI API - Optional Cloud] --> B
  B --> O[@nut-tree/nut-js - Input Simulation for Auto-scroll]
  B --> P[sharp - Image Stitching]
```

### Chosen Stack

| Layer | Choice | Rationale |
|---|---|---|
| Desktop Shell | Electron (latest stable) | Most mature Windows desktop framework, built-in desktopCapturer, globalShortcut, Tray APIs, massive ecosystem, excellent Cursor/Claude Code support |
| Frontend UI | React 18 + TypeScript | Component model suits the panel-based UI, TypeScript eliminates runtime errors, best AI coding tool support |
| Styling | Tailwind CSS v3 | Utility-first, design token configuration, no runtime CSS-in-JS overhead |
| Local Voice AI | whisper-node (Whisper.cpp bindings for Node) | Offline Whisper transcription in the Electron main process, fastest local option |
| Local Vision AI | Ollama HTTP API (Qwen2-VL or LLaVA) | User-installed, runs locally, free, good text-in-image understanding |
| Image Processing | sharp | High-performance image stitching, resizing, format conversion |
| Input Simulation | @nut-tree/nut-js | Cross-platform input simulation for auto-scroll capture |
| Local Config | electron-store | JSON persistence for settings, hotkeys, API keys |
| Packaging | electron-builder | Creates .exe installer for Windows, handles code signing |

### Stack Integration Guide

**Setup order:**
1. Initialize Electron project with TypeScript (`electron-forge` with Webpack + TypeScript template)
2. Configure React renderer with Tailwind CSS
3. Set up IPC channels between main and renderer
4. Integrate electron-store for config persistence
5. Add whisper-node and test voice transcription in main process
6. Add Ollama integration and test image analysis
7. Add desktopCapturer + @nut-tree/nut-js for screenshot and auto-scroll
8. Add sharp for image stitching
9. Configure electron-builder for Windows packaging

**Critical IPC channels:**
```typescript
// Main → Renderer
'voice:start'           // recording started
'voice:stop'            // transcription complete + text result
'capture:started'       // capture mode activated
'capture:complete'      // screenshot + AI result ready
'capture:error'         // capture failed with reason
'ollama:status'         // Ollama running/not running
'settings:updated'      // settings changed in another window

// Renderer → Main
'voice:request-start'   // user pressed voice hotkey
'voice:request-stop'    // user released voice hotkey
'capture:request'       // user pressed capture hotkey
'capture:mode-selected' // user selected a capture mode
'settings:save'         // user saved settings
'result:copy-text'      // user clicked copy in result panel
'result:dismiss'        // user dismissed result panel
```

**Known gotchas:**
- `desktopCapturer` requires `contextBridge` for secure usage — never expose it directly to renderer
- `@nut-tree/nut-js` requires the Windows developer build tools (node-gyp) — include in build instructions
- Whisper.cpp binaries must be bundled with the app in the resources/ directory — not installed via npm at runtime
- Ollama must be running before sending requests — always check `GET http://localhost:11434/` before calling the API
- `globalShortcut` must be registered in `app.whenReady()` and unregistered in `app.on('will-quit')`
- Electron's `desktopCapturer.getSources()` returns all windows including minimized ones — filter by checking `display_id`

**Required environment variables (development only):**
```env
ELECTRON_IS_DEV=true
WHISPER_MODEL_PATH=./resources/whisper/ggml-base.bin
OLLAMA_HOST=http://localhost:11434
```

### Repository Structure

```
screenshpeak/
├── src/
│   ├── main/                         # Electron main process
│   │   ├── index.ts                  # App entry point, window management, tray
│   │   ├── ipc/                      # IPC handler registrations
│   │   │   ├── voice.ts              # Voice-to-text IPC handlers
│   │   │   ├── capture.ts            # Screen capture IPC handlers
│   │   │   └── settings.ts           # Settings IPC handlers
│   │   ├── services/
│   │   │   ├── whisper.ts            # Whisper.cpp integration (node-whisper)
│   │   │   ├── ollama.ts             # Ollama HTTP API client
│   │   │   ├── openai.ts             # Optional OpenAI API client
│   │   │   ├── capture.ts            # desktopCapturer wrapper
│   │   │   ├── autoscroll.ts         # @nut-tree/nut-js scroll automation
│   │   │   ├── stitch.ts             # sharp-based image stitching
│   │   │   └── store.ts              # electron-store config wrapper
│   │   └── tray.ts                   # System tray icon and menu
│   ├── renderer/                     # React renderer process
│   │   ├── index.tsx                 # Renderer entry point
│   │   ├── windows/
│   │   │   ├── result/               # Floating result panel
│   │   │   │   ├── ResultPanel.tsx
│   │   │   │   ├── ScreenshotPreview.tsx
│   │   │   │   └── AIResponse.tsx
│   │   │   ├── picker/               # Capture mode picker overlay
│   │   │   │   └── ModePicker.tsx
│   │   │   └── settings/             # Settings window
│   │   │       ├── Settings.tsx
│   │   │       ├── HotkeyInput.tsx
│   │   │       └── ModelSettings.tsx
│   │   ├── components/
│   │   │   └── ui/                   # Shared UI primitives
│   │   │       ├── Button.tsx
│   │   │       ├── Input.tsx
│   │   │       ├── HotkeyChip.tsx
│   │   │       └── StatusDot.tsx
│   │   ├── hooks/
│   │   │   ├── useIPC.ts             # Typed IPC hook
│   │   │   └── useSettings.ts        # Settings state hook
│   │   └── styles/
│   │       ├── globals.css           # CSS variables and design tokens
│   │       └── tailwind.css          # Tailwind imports
├── resources/
│   ├── whisper/
│   │   └── ggml-base.bin             # Bundled Whisper model (base, ~142MB)
│   ├── icons/
│   │   ├── tray-icon.png             # 16x16 tray icon (light)
│   │   └── tray-icon-active.png      # 16x16 tray icon (recording state)
│   └── installer/
│       └── icon.ico                  # Windows installer icon
├── scripts/
│   └── download-whisper-model.js     # Pre-build script to download Whisper model
├── electron.vite.config.ts           # electron-vite config
├── electron-builder.yml              # electron-builder packaging config
├── tailwind.config.ts                # Tailwind design tokens
├── tsconfig.json
└── package.json
```

### Infrastructure & Deployment

ScreenSpeak is a local desktop app — there is no server to deploy. Distribution:

- **Windows installer:** `.exe` built with electron-builder, NSIS installer. Distributed via GitHub Releases.
- **Auto-update:** Use `electron-updater` pointing to GitHub Releases for seamless in-app updates. Users should never need to manually re-download.
- **Code signing:** Windows requires code signing to avoid SmartScreen warnings. Use a self-signed certificate for development; purchase an EV certificate before v1 public launch. Budget ~$200/year.
- **CI:** GitHub Actions — on every push to `main`, build the installer and run unit tests. On version tags, publish to GitHub Releases.

### Security Considerations

- **No server = no server-side attack surface.** All data stays on device.
- **OpenAI API key storage:** Stored in electron-store, which writes to the OS's user data directory (`%APPDATA%\screenshpeak\config.json` on Windows). Never logged, never transmitted except directly to `api.openai.com` when the user explicitly enables cloud AI.
- **Screen capture permissions:** Electron's `desktopCapturer` on Windows does not require special permissions — but be explicit in the privacy policy that screen content is only captured on user-initiated hotkey press and is never stored persistently or transmitted without the user's OpenAI key being configured.
- **Input simulation security:** `@nut-tree/nut-js` keyboard simulation for auto-scroll only triggers while the capture is in progress. Never simulate input outside of the capture window.
- **Content Security Policy:** Set strict CSP on all renderer windows to prevent XSS from AI response content.

### Cost Estimate

| Service | Monthly Cost (< 1000 users) |
|---|---|
| GitHub Releases (hosting) | Free |
| Whisper.cpp (local) | $0 |
| Ollama (local) | $0 |
| OpenAI API (user's own key) | $0 to developer |
| Code signing certificate | ~$17/month (amortized annually) |
| **Total developer cost** | **~$17/month** |

---

## 3. Data Model

ScreenSpeak is local-only. There is no database — all state is stored in electron-store JSON files on the user's machine.

### Entity Definitions

**Config store** (`electron-store` key: `config`):
```typescript
interface Config {
  // Hotkeys
  voiceHotkey: string;          // Default: 'Ctrl+Shift+Space'
  captureHotkey: string;        // Default: 'Ctrl+Shift+S'
  
  // AI settings
  aiMode: 'local' | 'cloud' | 'ask';  // Default: 'local'
  openaiApiKey: string | null;  // Encrypted at rest, null if not set
  ollamaModel: string;          // Default: 'qwen2-vl' or 'llava'
  ollamaHost: string;           // Default: 'http://localhost:11434'
  
  // Voice settings
  whisperModel: 'tiny' | 'base' | 'small';  // Default: 'base'
  voiceLanguage: string;        // Default: 'en'
  
  // App behavior
  launchOnStartup: boolean;     // Default: true
  showTrayNotifications: boolean;  // Default: true (first-run only)
  
  // Meta
  firstRun: boolean;            // Default: true, set to false after onboarding
  version: string;              // App version for migration detection
}
```

**Capture history** (`electron-store` key: `captureHistory`) — stored in-memory only during session, not persisted in v1:
```typescript
interface CaptureRecord {
  id: string;                   // UUID
  timestamp: number;            // Unix ms
  imagePath: string;            // Temp file path (cleared on app exit)
  aiResponse: string;           // AI analysis text
  captureMode: 'region' | 'window' | 'desktop' | 'autoscroll';
}
```

### Relationships

All entities are flat — no relational data in v1. Config is a single JSON document. Capture history is in-memory only.

### Indexes

No indexes needed — config is a single document read at startup and cached in memory. Capture history is in-memory array accessed by index.

---

## 4. API Specification

### API Design Philosophy

ScreenSpeak has no REST API. All communication between the renderer (React UI) and the main process uses Electron IPC with typed channels. External API calls are made only from the main process (never from the renderer) — Ollama local API and optional OpenAI API.

### Internal IPC API

**Voice channels:**
```typescript
// Renderer calls: start recording
ipcRenderer.invoke('voice:start') → Promise<void>

// Renderer calls: stop recording and get transcription
ipcRenderer.invoke('voice:stop') → Promise<{ text: string; durationMs: number }>

// Main sends: voice state update
ipcMain.on('voice:state', (event, state: 'idle' | 'recording' | 'transcribing') => {})
```

**Capture channels:**
```typescript
// Renderer calls: open capture mode picker
ipcRenderer.invoke('capture:open-picker') → Promise<void>

// Renderer calls: execute capture with selected mode
ipcRenderer.invoke('capture:execute', {
  mode: 'region' | 'window' | 'desktop' | 'autoscroll',
  targetWindowId?: string,   // for 'window' mode
  region?: { x: number; y: number; width: number; height: number }  // for 'region' mode
}) → Promise<{ imagePath: string; imageBase64: string }>

// Renderer calls: run AI analysis on captured image
ipcRenderer.invoke('ai:analyze', {
  imageBase64: string,
  prompt?: string    // Optional user question. Default: 'Summarize what is shown.'
}) → Promise<{ response: string; model: string; durationMs: number }>
```

**Settings channels:**
```typescript
// Renderer calls: get current config
ipcRenderer.invoke('settings:get') → Promise<Config>

// Renderer calls: update config
ipcRenderer.invoke('settings:set', partial: Partial<Config>) → Promise<void>

// Renderer calls: check Ollama status
ipcRenderer.invoke('ollama:check') → Promise<{
  running: boolean;
  model: string | null;
  availableModels: string[]
}>

// Renderer calls: test OpenAI key
ipcRenderer.invoke('openai:test-key', key: string) → Promise<{
  valid: boolean;
  error?: string
}>
```

### External API: Ollama (Local)

**Check if running:**
```
GET http://localhost:11434/
Response 200: { version: string }
```

**List available models:**
```
GET http://localhost:11434/api/tags
Response 200: { models: [{ name: string, size: number }] }
```

**Analyze image:**
```
POST http://localhost:11434/api/generate
Body: {
  model: "qwen2-vl",      // or "llava"
  prompt: string,
  images: [base64string], // Array of base64-encoded images
  stream: false
}
Response 200: {
  response: string,
  done: true,
  total_duration: number  // nanoseconds
}
```

### External API: OpenAI (Optional Cloud)

**Analyze image (GPT-4o Vision):**
```
POST https://api.openai.com/v1/chat/completions
Headers: Authorization: Bearer {user_api_key}
Body: {
  model: "gpt-4o",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: "data:image/png;base64,{base64}" } }
    ]
  }],
  max_tokens: 1000
}
Response 200: { choices: [{ message: { content: string } }] }
```

---

## 5. User Stories

### Epic: Voice-to-Text

**US-001: System-wide voice transcription**
As Alex (developer), I want to hold a hotkey, speak a sentence, and have the text appear at my cursor in any app, so that I can dictate without switching windows.

Acceptance Criteria:
- [ ] Given the app is running, when I hold Ctrl+Shift+Space and speak, a recording indicator appears
- [ ] Given I release the hotkey, when Whisper finishes transcribing, the text is pasted at the current cursor position
- [ ] Given I speak in VS Code, Gmail, Slack, and Notepad, all four apps receive the pasted text correctly
- [ ] Edge case: If no window has focus, the text is copied to clipboard and a notification says "Copied to clipboard (no active input field)"

**US-002: Visual recording feedback**
As Alex, I want to see when the app is recording my voice, so that I know when to speak and when it's processing.

Acceptance Criteria:
- [ ] Given I press the voice hotkey, when recording starts, a floating mic indicator appears (bottom-right of screen)
- [ ] Given recording is active, the indicator pulses with the --color-primary accent
- [ ] Given I release the hotkey, the indicator shows "Processing..." state until transcription is complete
- [ ] Given transcription completes, the indicator disappears within 500ms

**US-003: Configurable voice hotkey**
As Alex, I want to change the voice hotkey, so that it doesn't conflict with hotkeys in my existing tools.

Acceptance Criteria:
- [ ] Given I open Settings, when I click the voice hotkey field and press a new key combination, the new hotkey is saved
- [ ] Given the new hotkey is saved, the old hotkey is immediately unregistered and the new one registered
- [ ] Edge case: If the chosen hotkey is already registered by another app, show "This hotkey may conflict with another application"

### Epic: Screen Capture

**US-004: Capture mode selection**
As Alex, I want to choose between region, window, desktop, and auto-scroll capture modes, so that I can capture exactly what I need.

Acceptance Criteria:
- [ ] Given I press the capture hotkey, when the mode picker appears, I can see four distinct modes clearly labeled
- [ ] Given I select a mode, the mode picker closes and the appropriate capture flow begins
- [ ] Given I press Escape during mode selection, the picker closes with no action taken

**US-005: Auto-scroll terminal capture**
As Alex, I want to capture my entire terminal output including content above the visible area, so that I can get AI analysis of the full error without manual scrolling or copy-paste.

Acceptance Criteria:
- [ ] Given I select "Auto-scroll" mode and click a terminal window, ScreenSpeak scrolls to the top of the terminal output
- [ ] Given scrolling begins, the terminal is captured frame by frame as it scrolls
- [ ] Given capture completes, the frames are stitched into a single tall image with no visible seams
- [ ] Given the stitched image is ready, it is sent to AI for analysis automatically
- [ ] Edge case: If the terminal is empty, show "Nothing to capture — terminal appears empty"
- [ ] Edge case: If auto-scroll completes but stitching fails, fall back to capturing the currently visible portion

**US-006: Region capture**
As Priya (researcher), I want to drag-select a specific region of my screen to capture, so that I can analyze just the relevant portion of a page or window.

Acceptance Criteria:
- [ ] Given I select "Region" mode, a fullscreen translucent overlay appears for selection
- [ ] Given I click and drag, a selection rectangle is drawn with pixel precision
- [ ] Given I release the mouse, the selected region is captured and sent for analysis
- [ ] Given I press Escape during region selection, the overlay closes with no capture

### Epic: AI Analysis

**US-007: Local AI analysis of screenshot**
As Alex, I want the captured screenshot to be analyzed by a local AI model, so that I get an explanation of what's on screen without sending my data to the cloud.

Acceptance Criteria:
- [ ] Given Ollama is running with a vision model, when a screenshot is captured, the image is sent to Ollama's API
- [ ] Given the analysis completes, the AI response appears in the floating result panel within 15 seconds
- [ ] Given Ollama is not running, the panel shows "Local AI unavailable — install Ollama to enable analysis" with a setup link
- [ ] Edge case: If Ollama times out after 30 seconds, show "Analysis timed out. Try again or switch to cloud AI."

**US-008: Floating result panel**
As Alex, I want the AI analysis result to appear in a small floating panel that I can dismiss without losing my current window's focus, so that I can read the result and return to my work instantly.

Acceptance Criteria:
- [ ] Given AI analysis completes, the result panel appears bottom-right, above the taskbar, as an always-on-top frameless window
- [ ] Given the panel is open, my previous app (e.g. VS Code) retains keyboard focus
- [ ] Given I press Escape or click outside the panel, it dismisses
- [ ] Given I click "Copy Text", the full AI response text is copied to clipboard and the panel stays open
- [ ] Given I click "Copy Image", the captured screenshot PNG is copied to clipboard

**US-009: Optional cloud AI via user's API key**
As Priya (power user), I want to add my own OpenAI API key to get GPT-4o Vision quality analysis, so that I can get better results for complex screenshots without paying a subscription to ScreenSpeak.

Acceptance Criteria:
- [ ] Given I enter my OpenAI API key in Settings and save, the key is stored locally (never transmitted to ScreenSpeak)
- [ ] Given cloud AI is enabled, the next capture sends the image directly to api.openai.com using my key
- [ ] Given an invalid key is entered, Settings shows "Invalid API key — check and try again"
- [ ] Given the API call fails (network error), the panel shows the error and offers to retry with local AI

### Epic: Settings & Configuration

**US-010: Settings window**
As Alex, I want a minimal settings screen where I can configure hotkeys, AI mode, and model options, so that I can customize the app to my workflow.

Acceptance Criteria:
- [ ] Given I left-click the tray icon or right-click → Settings, the settings window opens
- [ ] Given settings are changed and saved, the changes take effect immediately without restarting
- [ ] Given I close the settings window, the app continues running in the tray

---

## 6. Functional Requirements

**FR-001: System Tray Resident App**
Priority: P0
Description: The app runs in the Windows system tray on startup. It never shows a visible window unless the user initiates an action. Right-click tray menu includes: Settings, About, Quit.
Acceptance Criteria:
- App appears in system tray within 3 seconds of Windows startup
- Left-click tray icon opens Settings
- Right-click shows context menu with Settings, About, Quit
- Quit fully terminates the process (no background zombie processes)
Related Stories: US-010

**FR-002: Global Voice Hotkey (Hold-to-Record)**
Priority: P0
Description: A global keyboard shortcut starts audio recording while held and stops + transcribes on release. Registered system-wide so it works regardless of which app is in focus.
Acceptance Criteria:
- Default hotkey: `Ctrl+Shift+Space`
- Recording starts within 200ms of hotkey press
- Whisper transcription begins immediately on hotkey release
- Transcribed text is pasted at the current cursor position via Windows clipboard API
- Works in: VS Code, Chrome, Edge, Firefox, Slack (desktop), Outlook, Notepad, Word
Related Stories: US-001, US-002

**FR-003: Whisper.cpp Local Transcription**
Priority: P0
Description: Voice audio is transcribed locally using Whisper.cpp bindings (whisper-node). The base model is bundled with the app. No network call is made for transcription.
Acceptance Criteria:
- Whisper base model is bundled in resources/whisper/ggml-base.bin
- Transcription completes within 2 seconds for utterances up to 30 seconds long (on 8GB+ RAM hardware)
- English transcription accuracy ≥ 95% for clear speech in quiet environment
- Settings offer tiny/base/small model selection (tiny is faster, small is more accurate)
- If Whisper fails, show error notification and offer retry
Related Stories: US-001, US-003

**FR-004: Global Capture Hotkey + Mode Picker**
Priority: P0
Description: A global keyboard shortcut opens a minimal capture mode picker overlay. User selects mode and capture begins.
Acceptance Criteria:
- Default hotkey: `Ctrl+Shift+S`
- Mode picker appears within 200ms of hotkey press
- Picker shows four options: Region, Active Window, Full Desktop, Auto-scroll
- Keyboard-navigable (arrow keys + Enter to select)
- Escape closes picker with no capture
Related Stories: US-004

**FR-005: Region Capture**
Priority: P0
Description: Fullscreen translucent overlay allows click-drag region selection. Selected region is captured as PNG.
Acceptance Criteria:
- Overlay appears instantly (< 300ms from mode selection)
- Selection rectangle draws in real-time as user drags
- Minimum selectable region: 50×50 pixels
- Captured image is exact pixel representation of selected region
- Cursor is excluded from the capture
Related Stories: US-006

**FR-006: Active Window Capture**
Priority: P0
Description: User clicks a window to capture it entirely, including any non-scrollable content.
Acceptance Criteria:
- After selecting "Active Window" mode, cursor changes to a crosshair/window-select indicator
- Clicking a visible window captures the entire window contents
- Minimized windows cannot be selected (highlight only visible windows)
- Captured image preserves the window's actual pixel dimensions
Related Stories: US-004

**FR-007: Full Desktop Capture**
Priority: P0
Description: Captures the entire primary monitor as a single PNG, including all visible windows and the taskbar.
Acceptance Criteria:
- Capture executes immediately on mode selection, no additional click required
- Captures primary monitor at native resolution
- Multi-monitor: captures primary monitor only in v1 (secondary monitor capture is Phase 2)
Related Stories: US-004

**FR-008: Auto-Scroll Capture**
Priority: P0
Description: After selecting a target window, the app simulates scroll-to-top, then captures frame-by-frame as it scrolls to the bottom. All frames are stitched into a single tall image using sharp.
Acceptance Criteria:
- Works on: Windows Terminal, CMD, PowerShell, VS Code integrated terminal
- Scroll-to-top occurs before capture begins (ensures full content)
- Frames are captured at 300ms intervals during scroll
- Stitching produces a single image with no seams or repeated lines
- Overlap detection removes duplicate content between frames
- If terminal content is less than one screen, captures the visible area without scrolling
- Maximum capture height: 20,000px (cap to prevent memory issues on very long outputs)
Related Stories: US-005

**FR-009: Ollama Local AI Analysis**
Priority: P0
Description: After capture, the image is sent to the locally running Ollama instance for AI analysis. The result is displayed in the floating panel.
Acceptance Criteria:
- Check Ollama availability at `http://localhost:11434/` before every analysis request
- Default prompt: "You are analyzing a screenshot. Describe what you see, identify any errors or issues, and suggest relevant actions or fixes. Be concise."
- If code or terminal content is detected in the image, prioritize explaining any errors and suggesting fixes
- Response displayed in result panel within 15 seconds (30-second timeout)
- If Ollama unavailable: show "Local AI not running" with setup link
Related Stories: US-007, US-008

**FR-010: Optional OpenAI Cloud AI**
Priority: P1
Description: Users can enter their own OpenAI API key in Settings to use GPT-4o Vision instead of local Ollama. The key is stored locally. All API calls go directly from the user's machine to OpenAI — no proxy.
Acceptance Criteria:
- Settings field for OpenAI API key (masked input)
- "Test key" button validates the key against the OpenAI API
- When cloud AI is active, API call goes to `https://api.openai.com/v1/chat/completions`
- AI mode setting: Local / Cloud / Ask each time
- Key stored in electron-store with basic obfuscation (not plaintext)
Related Stories: US-009

**FR-011: Floating Result Panel**
Priority: P0
Description: A frameless, always-on-top Electron window that shows the screenshot thumbnail and AI response. Appears bottom-right above the taskbar.
Acceptance Criteria:
- Window is frameless (no OS title bar)
- Always-on-top but does NOT steal keyboard focus from the active app
- Position: bottom-right, 16px from screen edge, above Windows taskbar
- Width: 460px, height: auto (min 200px, max 600px with internal scroll)
- Panel contains: small screenshot thumbnail (max 200px tall), AI response text (monospace for code blocks), "Copy Text" button, "Copy Image" button, "Dismiss" button
- Escape key dismisses panel (captured by panel's own key listener, not stealing focus)
- Clicking anywhere outside the panel dismisses it
Related Stories: US-008

**FR-012: Settings Window**
Priority: P0
Description: A standard Electron window for configuring all app options.
Acceptance Criteria:
- Opens as a standard (non-tray) window, 560×480px, resizable
- Sections: Hotkeys, AI Settings, Voice Settings, App Behavior
- Changes save immediately on each field change (no "Save" button — autosave)
- Hotkey fields show a recorder UI (press any key combination to set)
- Shows current Ollama status (running/not running) in AI Settings
- Shows current Whisper model with estimated accuracy/speed trade-off labels
Related Stories: US-003, US-009, US-010

**FR-013: Windows Startup Launch**
Priority: P1
Description: The app starts with Windows by default (configurable in Settings). Uses Electron's `app.setLoginItemSettings()`.
Acceptance Criteria:
- Default: enabled
- Toggle in Settings → App Behavior
- Does not show a visible window on startup — opens directly to tray
Related Stories: US-010

**FR-014: Windows Installer**
Priority: P0
Description: A signed .exe installer for Windows using electron-builder with NSIS.
Acceptance Criteria:
- Installer size < 150MB (including bundled Whisper base model)
- Installs to `%LOCALAPPDATA%\ScreenSpeak` by default
- Creates Start Menu shortcut and optional desktop shortcut
- Uninstaller removes all app files and shortcuts
- Installer is code-signed to avoid Windows SmartScreen warnings
Related Stories: (all)

---

## 7. Non-Functional Requirements

### Performance

- Voice hotkey response (press to mic indicator visible): < 200ms
- Voice transcription (hotkey release to text paste): < 2000ms for utterances up to 30 seconds on hardware with 8GB+ RAM and Whisper base model
- Capture hotkey response (press to mode picker visible): < 200ms
- Region/window/desktop capture (mode selection to image ready): < 1000ms
- Auto-scroll capture (click to stitched image ready): < 8 seconds for 2000-line terminal
- Local AI analysis (image ready to result in panel): < 15 seconds with Qwen2-VL on hardware with 16GB+ RAM and GPU
- App cold-start to tray-ready (manual launch): < 3 seconds
- App memory usage at idle: < 150MB RAM
- App memory usage during capture+analysis: < 500MB RAM (transient spike)

### Security

- No network calls made without explicit user action (no telemetry, no analytics pinging home)
- OpenAI API key stored with electron-safeStorage encryption (uses OS keychain on Windows)
- Screen capture only triggered by user-initiated global hotkey — no background surveillance
- Content Security Policy on all renderer windows: `default-src 'self'; script-src 'self'`
- Input simulation via @nut-tree/nut-js limited strictly to the auto-scroll capture window and duration

### Accessibility

- WCAG 2.1 AA color contrast: all body text achieves minimum 4.5:1 ratio against backgrounds
- All interactive elements keyboard-navigable with visible focus indicators (2px solid primary color)
- Minimum click target size: 32×32px for all buttons and interactive elements
- Result panel uses `role="dialog"` and `aria-live="polite"` for AI response content
- Settings window fully operable with keyboard only

### Scalability

- Single-user desktop app — no scalability concerns for the app itself
- electron-store JSON config is suitable for up to ~1MB of data (far exceeds v1 needs)
- Auto-update via electron-updater scales to any number of users via GitHub CDN

### Reliability

- App must recover gracefully from Ollama being unavailable (show status, allow retry)
- App must recover gracefully from Whisper transcription failure (show notification, user retries)
- Auto-scroll capture must not crash on unusual terminal content (wrap in try/catch, fall back to visible-area capture)
- Global hotkeys must be unregistered on app exit to prevent OS-level conflicts with future launches
- Crash recovery: Electron's built-in crash reporter writes to `%APPDATA%\ScreenSpeak\logs\` for debugging

---

## 8. UI/UX Requirements

### Screen: System Tray

Purpose: Always-available app presence in Windows taskbar notification area.

States:
- **Idle:** Standard tray icon (16×16px, violet geometric mark on dark background)
- **Recording voice:** Animated tray icon (pulsing indicator to show active recording)
- **Capturing:** Static capture icon variant

Key Interactions:
- Left-click → opens Settings window
- Right-click → context menu: Settings | About ScreenSpeak v{version} | Quit
- The tray icon is the only persistent UI element — there is no persistent app window

---

### Screen: Mode Picker Overlay

Route: N/A (Electron window, `mode-picker`)
Purpose: Let the user select a capture mode after pressing the capture hotkey.

Layout: Centered horizontal bar, 4 capture mode buttons, appears at bottom-center of screen.

States:
- **Visible:** All 4 modes displayed, keyboard-navigable
- **No state (Escape):** Closes with no action

Key Interactions:
- Click any mode → begin capture in that mode, close picker
- Arrow keys navigate between modes, Enter selects
- Escape → close picker
- Click outside picker → close picker

Components Used: Button (ghost variant × 4), HotkeyChip for mode shortcuts, StatusDot for Ollama running indicator

Mode buttons:
```
[ 🔲 Region ]  [ 🪟 Window ]  [ 🖥 Desktop ]  [ 📜 Auto-scroll ]
```
Below the buttons (12px smaller text, muted): "Ollama: ● Running" or "⚠ Ollama not running"

---

### Screen: Region Capture Overlay

Route: N/A (Electron window, `region-overlay`)
Purpose: Fullscreen overlay for click-drag region selection.

Layout: Fullscreen transparent window (covers entire primary monitor).

States:
- **Selecting:** Semi-transparent dark overlay with selection rectangle drawn in primary accent color. Top-left shows coordinates (for power users). Bottom shows "Release to capture • Escape to cancel"
- **Captured:** Overlay disappears immediately

Key Interactions:
- Mouse down → start selection
- Mouse drag → draw selection rectangle (clear area inside selection, dimmed outside)
- Mouse up → capture selection, close overlay
- Escape → close overlay, no capture

---

### Screen: Floating Result Panel

Route: N/A (Electron window, `result-panel`, frameless, always-on-top)
Purpose: Show the captured screenshot and AI analysis result. Quick dismiss.

Layout:
```
┌─────────────────────────────────────┐
│ [Screenshot thumbnail, max 200px h] │
├─────────────────────────────────────┤
│ AI Response                         │
│ (scrollable text, monospace for     │
│  code blocks, plain text otherwise) │
│                                     │
│ Model: qwen2-vl • 8.2s              │
├─────────────────────────────────────┤
│ [Copy Text]  [Copy Image]  [✕]      │
└─────────────────────────────────────┘
```

States:
- **Loading:** Screenshot thumbnail shown, body shows "Analyzing…" with pulsing dots animation
- **Complete:** Full AI response text shown, action buttons active
- **Error:** Error message shown in `--color-error`, "Retry" and "✕" buttons shown
- **No Ollama:** "Local AI not running" message with "Set up Ollama →" link

Key Interactions:
- "Copy Text" → clipboard ← AI response text, button shows "Copied!" for 1.5s
- "Copy Image" → clipboard ← PNG screenshot
- "✕" or Escape → dismiss panel (fade out, window closes)
- Click outside panel → dismiss panel
- Panel does NOT steal keyboard focus from the underlying app

Components Used: ScreenshotPreview, AIResponse (with code block detection), Button (primary × 2, ghost × 1), StatusDot

---

### Screen: Settings Window

Route: N/A (Electron window, `settings`)
Purpose: Configure all app options. Standard window (with OS title bar).

Layout: Left nav tabs + right content area.

Tabs: Hotkeys | AI | Voice | App

**Hotkeys tab:**
```
Voice Hotkey:    [Ctrl + Shift + Space  ↺]
Capture Hotkey:  [Ctrl + Shift + S      ↺]
```
Each hotkey field is click-to-record (click → press combination → auto-saves).

**AI tab:**
```
AI Mode:  ○ Local (Ollama)  ○ Cloud (My OpenAI key)  ○ Ask each time

Local AI:
  Ollama status:  ● Running  (model: qwen2-vl)
  Ollama model:   [qwen2-vl ▾]

Cloud AI (Optional):
  OpenAI API Key:  [••••••••••••••••] [Test Key]
  (Your key is stored locally and sent directly to OpenAI)
```

**Voice tab:**
```
Whisper Model:
  ○ Tiny    — Fastest (~0.5s), less accurate
  ● Base    — Balanced (~1.5s), recommended  ← default
  ○ Small   — Slower (~3s), most accurate

Language:  [English ▾]
```

**App tab:**
```
[✓] Launch ScreenSpeak when Windows starts
[ ] Show notifications for first-run tips
    Version: 1.0.0
    [Check for updates]  [View on GitHub]
```

States:
- **All fields:** Autosave on change (no Save button)
- **Hotkey field recording:** Field highlights in primary color, shows "Press keys…"
- **Ollama not running:** Status shows "● Not running" in warning color with "Install Ollama →" link

---

## 9. Design System

### Color Tokens

```css
:root {
  --color-primary:        #7C3AED;
  --color-primary-hover:  #6D28D9;
  --color-background:     #1E1E2E;
  --color-surface-1:      #181825;
  --color-surface-2:      #11111B;
  --color-surface-3:      #2A2A3E;
  --color-text:           #CDD6F4;
  --color-text-muted:     #6C7086;
  --color-border:         #3A3A5C;
  --color-success:        #A6E3A1;
  --color-warning:        #F9E2AF;
  --color-error:          #F38BA8;
  --color-info:           #89DCEB;
}
```

### Typography Tokens

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --font-heading: 'Inter', system-ui, sans-serif;
  --font-body:    'Inter', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', 'Fira Code', monospace;

  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;

  --font-weight-normal:   400;
  --font-weight-medium:   500;
  --font-weight-semibold: 600;

  --line-height-tight:   1.25;
  --line-height-normal:  1.5;
  --line-height-relaxed: 1.625;
}
```

### Spacing Tokens

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;

  --radius-sm: 4px;
  --radius-md: 6px;

  --shadow-panel: 0 4px 16px rgba(0,0,0,0.4);
  --shadow-sm:    0 1px 4px rgba(0,0,0,0.3);

  --transition-fast:   100ms ease;
  --transition-normal: 200ms ease;
  --transition-slow:   300ms ease;
}
```

### Component Specifications

**Button — Primary:**
```css
background: var(--color-primary);
color: white;
padding: 8px 16px;
border-radius: var(--radius-md);
font-size: var(--text-sm);
font-weight: var(--font-weight-medium);
border: none;
transition: background var(--transition-fast);

&:hover { background: var(--color-primary-hover); }
&:active { filter: brightness(0.9); }
&:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
```

**Button — Ghost:**
```css
background: transparent;
color: var(--color-text);
padding: 8px 16px;
border-radius: var(--radius-md);
font-size: var(--text-sm);
border: 1px solid var(--color-border);
transition: background var(--transition-fast);

&:hover { background: var(--color-surface-3); }
&:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
```

**Input:**
```css
background: var(--color-surface-1);
color: var(--color-text);
border: 1px solid var(--color-border);
border-radius: var(--radius-sm);
padding: 8px 12px;
font-size: var(--text-sm);
font-family: var(--font-body);
width: 100%;
transition: border-color var(--transition-fast);

&:focus { 
  border-color: var(--color-primary); 
  outline: none; 
}
&::placeholder { color: var(--color-text-muted); }
```

**HotkeyChip:**
```css
display: inline-flex;
align-items: center;
background: var(--color-surface-3);
border: 1px solid var(--color-border);
border-radius: var(--radius-sm);
padding: 2px 8px;
font-size: var(--text-xs);
font-family: var(--font-mono);
color: var(--color-text);
```

**StatusDot:**
```
8px × 8px circle, margin-right: 6px
Colors: success/warning/error/info mapped to --color-* values
```

### Tailwind Configuration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary:        '#7C3AED',
        'primary-hover':'#6D28D9',
        'bg-base':      '#1E1E2E',
        'surface-1':    '#181825',
        'surface-2':    '#11111B',
        'surface-3':    '#2A2A3E',
        'text-primary': '#CDD6F4',
        'text-muted':   '#6C7086',
        border:         '#3A3A5C',
        success:        '#A6E3A1',
        warning:        '#F9E2AF',
        error:          '#F38BA8',
        info:           '#89DCEB',
      },
      fontFamily: {
        heading: ['Inter', 'system-ui', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
      },
      boxShadow: {
        panel: '0 4px 16px rgba(0,0,0,0.4)',
        sm:    '0 1px 4px rgba(0,0,0,0.3)',
      },
      transitionDuration: {
        fast:   '100',
        normal: '200',
        slow:   '300',
      },
    },
  },
  plugins: [],
} satisfies Config
```

---

## 10. Auth Implementation

This app does not require authentication. Users run ScreenSpeak locally without any account. The optional OpenAI API key in Settings is a user credential that goes directly to OpenAI — ScreenSpeak never handles user authentication.

If auth is added later (e.g. for a cloud sync feature or a paid tier license check), revisit this section. Recommended provider at that point: Clerk (supports desktop app OAuth flows via PKCE).

---

## 11. Payment Integration

Payment integration is deferred to Phase 2. The app launches as a free tool. No payment code should be written in Phase 1.

When Phase 2 begins, evaluate: Polar (for web-based license purchase with desktop app validation) or Lemon Squeezy (handles global tax as merchant of record, simpler for solo founders). The key decision is whether to gate features (freemium) or charge for the app outright (one-time purchase). This decision should be informed by 3+ months of usage data.

---

## 12. Edge Cases & Error Handling

### Feature: Voice-to-Text

| Scenario | Expected Behavior | Priority |
|---|---|---|
| No active input field when hotkey released | Copy text to clipboard; show notification "Copied to clipboard — no active text field found" | P0 |
| User speaks for 0 seconds (immediate release) | No transcription attempt; mic indicator dismisses silently | P0 |
| Whisper model file missing or corrupted | Show error notification "Voice model missing — reinstall may be required." Log error to file | P0 |
| Hotkey conflict with another app | Log warning; show one-time notification "Voice hotkey may conflict with another app — consider changing it in Settings" | P1 |
| Very long utterance (> 60 seconds) | Cap recording at 60 seconds; transcribe what was captured; notify user "Max recording length reached" | P1 |
| Non-English speech with English language set | Transcription will be inaccurate; no special handling in v1. Language setting is user's responsibility | P2 |

### Feature: Screen Capture

| Scenario | Expected Behavior | Priority |
|---|---|---|
| Target window is minimized during auto-scroll | Show error: "Window was minimized during capture. Please keep the window visible." | P0 |
| Auto-scroll produces only 1 frame (content fits in view) | Skip stitching; use single frame as the capture; proceed to AI analysis | P0 |
| Stitching algorithm produces seams or duplicated content | Log warning; deliver the stitched image anyway; do not block AI analysis | P1 |
| Region selection is too small (< 50×50px) | Show brief tooltip "Selection too small — try a larger area" and reset selection | P0 |
| desktopCapturer returns no sources | Show error: "Screen capture unavailable. Check that ScreenSpeak has screen recording permission." | P0 |
| Capture produces a blank/black image | Deliver image but show warning in result panel: "Capture may be incomplete — try again" | P1 |

### Feature: AI Analysis

| Scenario | Expected Behavior | Priority |
|---|---|---|
| Ollama not installed | Show "Set up Ollama" prompt with link in result panel. App does not crash. | P0 |
| Ollama running but no vision model installed | Show: "No vision model found. Run: `ollama pull qwen2-vl` in your terminal." | P0 |
| Ollama times out (> 30 seconds) | Show: "Analysis timed out — local AI is slow or unresponsive. Try again or switch to cloud AI in Settings." | P0 |
| OpenAI API key invalid | Show: "OpenAI key invalid. Check your key in Settings." Do not retry. | P0 |
| OpenAI API rate limited | Show: "OpenAI rate limit hit. Wait a moment and try again." | P1 |
| AI response is empty string | Show: "AI returned an empty response. Try capturing a larger area or rephrasing your question." | P1 |
| Very large stitched image (> 20MB) | Resize image to max 2000×8000px before sending to AI. Notify user: "Image scaled for analysis." | P0 |

### Feature: Settings

| Scenario | Expected Behavior | Priority |
|---|---|---|
| Two hotkeys set to the same combination | Show inline error: "This combination is already used for [other action]." Revert the conflicting field. | P0 |
| electron-store file corrupted or unreadable | Reset to default config; show one-time notification "Settings were reset to defaults due to a configuration error" | P0 |
| Settings window fails to open | Log error; show tray notification "Settings unavailable — try restarting ScreenSpeak" | P1 |

---

## 13. Dependencies & Integrations

### Core Dependencies

```json
{
  "electron": "latest",
  "react": "^18",
  "react-dom": "^18",
  "electron-store": "latest",
  "electron-updater": "latest",
  "whisper-node": "latest",
  "@nut-tree/nut-js": "latest",
  "sharp": "latest",
  "axios": "latest",
  "openai": "latest",
  "tailwindcss": "^3",
  "lucide-react": "latest",
  "clsx": "latest"
}
```

### Development Dependencies

```json
{
  "typescript": "^5",
  "electron-vite": "latest",
  "electron-builder": "latest",
  "@types/react": "^18",
  "@types/react-dom": "^18",
  "@types/node": "latest",
  "eslint": "^9",
  "@typescript-eslint/eslint-plugin": "latest",
  "prettier": "latest",
  "concurrently": "latest"
}
```

### Third-Party Services

| Service | Purpose | Pricing | API Key Required |
|---|---|---|---|
| Ollama | Local vision AI inference | Free (self-hosted) | No |
| Whisper.cpp (via whisper-node) | Local speech-to-text | Free (local) | No |
| OpenAI API | Optional cloud AI | User pays (their own key) | User's own key |
| GitHub Releases | App distribution and auto-update | Free | No |

**Ollama model recommendation:** `qwen2-vl` (stronger on text/code in images) or `llava` (more widely available). Both are free via `ollama pull`. The app should check which models are installed and use the best available.

**Whisper.cpp model:** Bundle `ggml-base.bin` (~142MB) in the installer. This is the best accuracy/speed trade-off for most hardware. Allow upgrade to `ggml-small.bin` (~461MB) via settings for users who want higher accuracy.

---

## 14. Out of Scope

**Browser extension for full-page web capture.** Requires separate Chrome/Edge extension development, Chrome Web Store review process, and ongoing version management. Deferred to Phase 2. Reconsider when core app has 1,000+ users.

**macOS support.** macOS requires separate permission handling (Screen Recording permission in System Preferences), different global shortcut APIs, and different packaging. Deferred to Phase 2 after Windows is proven.

**Cloud sync of screenshots or transcripts.** Requires backend infrastructure, privacy compliance work, and ongoing server costs. Conflicts with local-first philosophy. Deferred indefinitely until there is a clear user demand signal.

**Video recording or screen recording.** Entirely different technology stack (ffmpeg, video storage, playback). Not in scope for v1.

**Payments integration.** App is free in v1. No payment code. Polar or Lemon Squeezy added in Phase 2.

**Mobile companion app.** Desktop-only product in v1.

**Team/multi-user features.** Single-user local app in v1.

**Custom Ollama model selection beyond what's installed.** Settings show installed models; downloading models from within the app is Phase 2.

---

## 15. Open Questions

**Q1: Auto-scroll speed for different terminals.**
Terminals have different scroll behaviors. Scrolling too fast may miss frames; too slow makes capture feel slow. Recommended default: 300ms between frames with 3-frame overlap for deduplication. Adjust based on testing across all four target terminals before launch.

**Q2: Whisper model bundling vs. download on first run.**
Bundling ggml-base.bin adds ~142MB to the installer. The alternative is downloading on first run (~10-30 seconds depending on connection). Recommended: bundle the model. The convenience of immediate offline function outweighs the larger installer size for this audience.

**Q3: Code signing certificate priority.**
Without code signing, Windows SmartScreen blocks the installer with a "Windows protected your PC" warning. This is a first-impression killer. Prioritize purchasing an EV certificate before public launch — even for a free app. Budget ~$200-400/year.

**Q4: Qwen2-VL vs LLaVA as the recommended default model.**
Qwen2-VL 7B produces better results on text/code content but requires more VRAM. LLaVA 7B is more universally available and works on CPU-only machines. Recommended: default to `qwen2-vl` with fallback recommendation to `llava` if the user's hardware can't run it. Display VRAM requirements in the Settings AI tab.

**Q5: First-run Ollama setup flow.**
If the user doesn't have Ollama installed, the capture feature is degraded on day one. Recommended: Show a first-run notification in the tray on first launch if Ollama is not detected: "Want AI analysis? Install Ollama (free, 1 min) → [link]." Make this dismissible and don't block usage of the voice module.
