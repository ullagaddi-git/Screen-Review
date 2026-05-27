# VoiceTypist — Standalone Voice-to-Text App: Complete Handoff

> Paste this entire document as the FIRST MESSAGE in a new Claude Code (or
> Cursor) session, in an empty folder. The agent will scaffold and build the
> app phase by phase. Working name is "VoiceTypist" — feel free to rename.

---

## 1. What you're building (the elevator pitch)

A free, local-first, Windows-only desktop app that turns voice into typed
text in **any** application — Word, Outlook, Chrome, Slack, VS Code, Notepad,
Claude desktop, terminal, anything that accepts a Ctrl+V paste.

The user holds (or single-taps) a keyboard hotkey. ScreenSpeak's competitor
WhisperTyping has the canonical UX:

> "Place your cursor in any text field and press/hold the Ctrl+Capital key
> to activate"

— a floating gradient pill that appears at the bottom of the screen, the
user holds the hotkey, speaks, releases, and the transcribed text appears
at the cursor of whichever app was previously focused.

This is the **WhisperTyping clone with cleaner UX**. Reference products:
- **WhisperTyping** (https://whispertyping.com) — closest analog, free, local
- **Wispr Flow** (https://wisprflow.ai) — paid, cloud, AI-cleaned transcripts
- **Apple Dictation / Win+H** — built-in, lower quality

VoiceTypist's positioning: "WhisperTyping quality, cleaner UI, free, local."

---

## 2. What this app **is NOT**

This is intentionally scoped tight. The following are explicitly **out of scope**:

| Out of scope | Reason |
|---|---|
| Screen capture / screenshot analysis | This is a voice tool only. (If you also want screen capture, see the existing `ScreenSpeak` project — that's a separate product.) |
| Meeting recording / system audio capture | Different product. |
| Image / AI vision features | Different product. |
| Multi-platform (macOS, Linux) | v1 is Windows 10/11 x64 only. macOS would need a separate implementation due to permission models. |
| Cloud transcription (sending audio to a server) | Local-first only. Whisper.cpp runs on the user's CPU. |
| Live streaming transcription (word-by-word as you speak) | Phase 2 candidate, not v1. v1 is batch: hold → speak → release → paste. |
| AI cleanup of transcripts (filler words removed, punctuation reformatted) | Phase 2 candidate. v1 outputs Whisper's raw transcript. |
| Multi-user / accounts / sync | None. Single-machine, no servers, no telemetry. |
| Microsoft Store / App Store distribution | NSIS installer + GitHub Releases is enough for v1. |

Document these explicitly in `docs/prd.md` § Out of Scope so future
contributors don't expand scope without explicit decision.

---

## 3. Tech stack (locked decisions)

These are non-negotiable for v1. Document why each was chosen in `docs/prd.md`:

| Layer | Choice | Why |
|---|---|---|
| Shell | **Electron 33** | Mature, Win32 API access via `globalShortcut`, easy distribution via electron-builder. |
| Build | **electron-vite** | Hot-reload dev experience, separate main/preload/renderer pipelines. |
| Language | **TypeScript (strict, composite tsconfigs)** | Catches IPC type mismatches at build time. |
| UI framework | **React 18 + Vite** | Standard. Renderer is small — settings panel + floating pill. |
| Styling | **Tailwind CSS + design tokens (CSS variables)** | Fast, consistent. Tokens defined in `src/renderer/styles/globals.css`. |
| Voice transcription | **Whisper.cpp v1.8.4 prebuilt Windows binary** | Bundled as `resources/whisper/bin/whisper-cli.exe` + `ggml-base.bin`. Spawned per transcription (no in-process model load → low idle memory). |
| Global hotkey | **uiohook-napi** for hold-to-talk (observes events, fires on press AND release) **OR** `globalShortcut` for press-to-toggle (consumes events). | uiohook = observe but not consume — the key passes through to focused app. globalShortcut = consumes the key. v1 uses **uiohook** for hold-to-talk. Document the trade-off in PRD § Known Limitations. |
| Paste at cursor | **@nut-tree-fork/nut-js** for `keyboard.pressKey(Key.LeftControl, Key.V)` + `clipboard.writeText()`. Detect active window via nut-js `getActiveWindow().title`. | The Windows-standard paste mechanism works in any app. No driver, no app-specific code. |
| Config storage | **electron-store v8** with `safeStorage` for any sensitive data | DPAPI-backed encryption for any secrets. |
| Tests | **node:test** (zero-install, ships with Node 20+) | No Jest/Vitest dependency. Pure helpers extracted into separate files so they're testable without Electron. |
| Installer | **electron-builder + NSIS** | One-click installer. `oneClick: false`, `allowToChangeInstallationDirectory: true`. |
| Auto-update | **electron-updater** wired to GitHub Releases | Phase 5. |

**Whisper-cli flags** to use:
```
whisper-cli.exe -m ggml-base.bin -l <lang> -nt -np -f <input.wav>
```
(`-nt`: no timestamps, `-np`: no diagnostic prints — stdout is just the transcription)

---

## 4. The 5 windows / surfaces

Plan the codebase around these surfaces from day 1:

| Surface | Purpose | Lifecycle |
|---|---|---|
| **Tray icon** | Always present. Right-click → Settings / Quit. Left-click → toggle Settings. | Created at app launch, destroyed on quit. |
| **Floating activation pill** | The "Place your cursor in any text field and press/hold Ctrl+Capital to activate" gradient banner. Bottom-center of primary display, always-on-top, click-through, fades when not focused on a text field. | Created at app launch IF setting "Show activation hint" is on. Destroyed on quit. Hideable. |
| **Mic indicator** | Small "● Recording…" / "Transcribing…" pill at bottom-right while a recording is in flight. | Created on first voice activation, idle-destroyed after 5 min inactive. |
| **Settings window** | Hotkey rebinder, model size selector, language selector, "Show activation hint" toggle, "Launch on startup" toggle, About. | Created on tray click, destroyed on close (not minimized). |
| **Offscreen recorder window** | Hidden 1×1 px window with `navigator.mediaDevices.getUserMedia({audio:true})`. Captures mic audio, encodes WAV, sends to main. | Lazy — created on first recording. Idle-destroyed after 5 min for memory. |

---

## 5. Reference UI (from the screenshot the user provided)

The floating activation pill should look like this:

- **Shape:** rounded rectangle, ~360×60 px
- **Position:** centered horizontally, ~64 px above the bottom of the primary display
- **Background:** gradient from `#7C3AED` (left) to `#9333EA` (right) to `#EC4899` (far right) — violet→pink. Or pick your own; document in product-vision.md.
- **Text:** white, centered, 14 px Inter:
  - Line 1: "Place your cursor in any text field"
  - Line 2: "and press/hold the **Ctrl+Capital** key to activate"
- **Behavior:**
  - Visible by default when the app is running
  - User can dismiss permanently via Settings → "Show activation hint" toggle
  - Click-through: clicking the pill itself does nothing (doesn't steal focus)
  - Fades to 0.3 opacity after 10 seconds of no recording, fades back to full when recording starts
  - Always-on-top, `setAlwaysOnTop(true, 'screen-saver')`

---

## 6. Project structure

Scaffold this exactly. Keep it consistent with the doc list below so the
agent can find files without grepping:

```
voicetypist/
├── docs/
│   ├── product-vision.md   ← brand, target audience, positioning
│   ├── prd.md              ← functional + non-functional reqs, tech stack, security, out-of-scope
│   ├── product-roadmap.md  ← phased build plan with check-boxable tasks
│   └── test-plan.md        ← what tests cover what
├── electron-builder.yml
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── tailwind.config.ts
├── postcss.config.cjs
├── README.md
├── resources/
│   ├── icons/
│   │   └── tray-icon.png      (16×16 PNG, violet "VT")
│   ├── installer/
│   │   └── icon.ico           (multi-resolution app icon)
│   └── whisper/
│       ├── .gitkeep
│       ├── (ggml-base.bin    ← gitignored, downloaded via postinstall)
│       └── bin/
│           └── (whisper-cli.exe + DLLs ← gitignored)
├── scripts/
│   ├── download-whisper-model.js
│   └── download-whisper-binary.js
├── src/
│   ├── main/
│   │   ├── index.ts                       ← bootstrap: tray, hotkey, lifecycle
│   │   ├── tray.ts                        ← system tray menu
│   │   ├── preload.ts                     ← main IPC bridge (window.electronAPI)
│   │   ├── activation-preload.ts          ← bridge for floating pill (read-only)
│   │   ├── recorder-preload.ts            ← bridge for offscreen recorder
│   │   ├── indicator-preload.ts           ← bridge for mic indicator
│   │   ├── ipc/
│   │   │   ├── settings.ts
│   │   │   └── voice.ts
│   │   ├── services/
│   │   │   ├── audio.ts                   ← recorder window lifecycle
│   │   │   ├── whisper.ts                 ← whisper-cli spawn + parse
│   │   │   ├── paste.ts                   ← clipboard + Ctrl+V via nut-js
│   │   │   ├── store.ts                   ← electron-store config
│   │   │   ├── security.ts                ← CSP, sandbox, IPC validators
│   │   │   ├── security-helpers.ts        ← pure URL allowlist (testable)
│   │   │   ├── ipc-validators.ts          ← pure input-type guards (testable)
│   │   │   ├── logger.ts                  ← rotating file logger
│   │   │   ├── logger-helpers.ts          ← pure formatter (testable)
│   │   │   ├── memory.ts                  ← idle-memory diagnostics
│   │   │   └── memory-helpers.ts          ← pure aggregator (testable)
│   │   ├── windows/
│   │   │   ├── activation-pill.ts         ← floating gradient banner
│   │   │   └── mic-indicator.ts           ← small recording pill
│   │   └── utils/
│   │       ├── paths.ts                   ← resolvePreloadPath, resolveRendererPath
│   │       ├── path-helpers.ts            ← pure (testable)
│   │       └── selfcheck.ts               ← verifies preloads exist at runtime
│   ├── preload/
│   │   ├── index.d.ts                     ← types for window.electronAPI
│   │   ├── activation.d.ts
│   │   ├── recorder.d.ts
│   │   └── indicator.d.ts
│   └── renderer/
│       ├── index.tsx                      ← Settings window entry
│       ├── index.html
│       ├── styles/
│       │   ├── globals.css                ← design tokens
│       │   └── tailwind.css
│       ├── components/ui/                 ← Button, Input, HotkeyChip, StatusDot, HotkeyRecorder
│       ├── hooks/useIPC.ts
│       └── windows/
│           ├── settings/
│           │   ├── Settings.tsx
│           │   └── tabs/
│           │       ├── HotkeysTab.tsx
│           │       ├── VoiceTab.tsx
│           │       └── AppTab.tsx
│           ├── recorder/
│           │   ├── recorder.html
│           │   └── recorder.ts            ← MediaRecorder + WAV encoder
│           ├── activation/
│           │   ├── activation.html
│           │   ├── activation.tsx
│           │   ├── ActivationPill.tsx
│           │   └── activation-styles.css
│           └── indicator/
│               ├── mic-indicator.html
│               ├── mic-indicator.tsx
│               └── MicIndicator.tsx
├── test/
│   ├── *.test.mjs                         ← node:test files
│   └── (15+ test files matching the pure helpers above)
└── .github/
    └── workflows/
        └── release.yml                    ← CI build + GitHub Releases publish
```

---

## 7. Build phases (the roadmap)

Each phase has a stated goal, reference sections to read, and an ordered task list.

### Phase 0 — Foundation & Setup

**Goal:** Empty repo → "Hello world" Electron app that opens an empty Settings window and a placeholder tray icon. No voice features yet.

- [ ] **TASK-001** — Initialize repo, package.json, tsconfig (node + web split), Tailwind, PostCSS, electron-vite, scaffold src/ tree per § 6.
- [ ] **TASK-002** — Build the design token CSS variables (`globals.css`): primary `#7C3AED`, surface tokens, text tokens, font tokens. Match ScreenSpeak's palette (the user has prior art there).
- [ ] **TASK-003** — Create the 5 base UI components (Button, Input, HotkeyChip, StatusDot, HotkeyRecorder placeholder) with stories in a Phase 0 placeholder Settings tab.
- [ ] **TASK-004** — Tray icon + Settings window stub. Tray menu: Settings, Quit. Settings window: empty 4-tab layout (Hotkeys, Voice, App, About).
- [ ] **TASK-005** — Set up electron-store with a typed Config interface. `getConfig`, `setConfig`, `getConfigValue<K>(key: K): Config[K]`.
- [ ] **TASK-006** — Security baseline: `applyAppSecurity()` installs `setWindowOpenHandler({ action: 'deny' })`, `will-navigate` allowlist (only file:// and localhost), and `setDisplayMediaRequestHandler` denial. All BrowserWindows: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. Pure URL allowlist in `security-helpers.ts` with tests.

**After Phase 0:** App launches, tray icon visible, Settings window opens with empty tabs. No voice yet.

### Phase 1 — Voice transcription core

**Goal:** Hold the hotkey, speak, release, watch the text appear in Notepad. The end-to-end happy path works.

- [ ] **TASK-007** — Download whisper-cli.exe + ggml-base.bin via `scripts/download-whisper-binary.js` and `scripts/download-whisper-model.js`, called by npm postinstall. Save to `resources/whisper/`. Both gitignored.
- [ ] **TASK-008** — `WhisperService` (`src/main/services/whisper.ts`) — spawns whisper-cli as a child process per transcription. `transcribe(wavBuffer): Promise<string>`. Parses stdout, strips diagnostic lines, returns the text. Throws typed errors: `WhisperBinaryMissingError`, `WhisperModelMissingError`, `WhisperTranscriptionError`.
- [ ] **TASK-009** — Offscreen recorder window (`src/main/services/audio.ts` + `src/renderer/windows/recorder/recorder.ts`). 1×1 px hidden window at (-10000, -10000). MediaRecorder captures mic via `getUserMedia({audio:{sampleRate:16000, channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true}})`. ScriptProcessorNode accumulates Float32Array chunks. On stop, encode WAV (16 kHz mono 16-bit PCM) and send buffer to main via IPC.
- [ ] **TASK-010** — uiohook-napi integration. Listen for the configured hotkey on `keydown`/`keyup`. On press → `audioService.startRecording()` + broadcast `recording` state. On release → `audioService.stopRecording()` → wav → whisper → paste at cursor. Default hotkey: `Ctrl+CapsLock` (rebindable).
- [ ] **TASK-011** — Paste-at-cursor service (`src/main/services/paste.ts`). Uses `@nut-tree-fork/nut-js`: write transcript to `clipboard.writeText()`, then synthesize `keyboard.pressKey(Key.LeftControl, Key.V)`. Detect own-window via `getActiveWindow().title` regex match — if VoiceTypist Settings has focus, skip the paste and show a notification "Text on clipboard — switch to your target app and paste."
- [ ] **TASK-012** — Mic indicator window. Small ~140×44 px pill at bottom-right of primary display. Pulses violet while recording. Lazy-create on first use, idle-destroy after 5 min inactivity.
- [ ] **TASK-013** — Race-condition lock-in test. Issue: holding hotkey for <100 ms can cause stopRecording to fire before startRecording finishes setting up the recorder window. Fix: synchronous `recording = true` flag + `startInProgress: Promise<void>` that stopRecording awaits. Test: pure helper `markStart/markStop` state machine in `recording-state.ts` + tests in `test/recording-state.test.mjs`.

**Verification for Phase 1:** Open Notepad, hold Ctrl+CapsLock, say "Hello world this is a test", release. Text should appear in Notepad. Repeat in Chrome, Word, VS Code, Slack.

### Phase 2 — Activation pill + Settings UI

**Goal:** The user can actually configure the app. The "press/hold the Ctrl+Capital key to activate" gradient banner is visible.

- [ ] **TASK-014** — Floating activation pill (`src/main/windows/activation-pill.ts`). Always-on-top, `skipTaskbar: true`, `focusable: false`, `transparent: true`, position centered horizontally at bottom-64 of primary display. Renderer at `src/renderer/windows/activation/`. CSS gradient violet→pink. Click-through via `setIgnoreMouseEvents(true)`.
- [ ] **TASK-015** — Hotkeys tab in Settings. `HotkeyRecorder` component: shows current binding as a chip, click → enters "recording" mode where it listens for the next keydown and parses the combo via a pure `formatHotkeyFromEvent` helper. Pure helper in `src/renderer/windows/settings/tabs/hotkey-format.ts` + tests.
- [ ] **TASK-016** — Voice tab in Settings. Whisper model picker (Tiny / Base / Small with size + speed blurb), language selector (11 languages + auto), max recording length cap (1/5/15/30/60 minutes). Reload whisper service on change.
- [ ] **TASK-017** — App tab in Settings. "Launch on Windows startup" toggle (calls `app.setLoginItemSettings({openAtLogin:true, openAsHidden:true})`). "Show activation hint" toggle (shows/hides the floating pill). "Show tray notifications" toggle. App version display. "View on GitHub" button.
- [ ] **TASK-018** — First-run flow. On firstRun=true: tray icon appears, ~1.5 s delay, then a welcome notification: "VoiceTypist is running. Hold Ctrl+CapsLock to dictate." Flip firstRun=false immediately so it never reshows. Skip if `showTrayNotifications=false`.

**Verification for Phase 2:** Fresh install, see welcome notification + floating pill. Open Settings, rebind hotkey to Ctrl+Alt+J, close Settings, dictate with new hotkey. Toggle "Show activation hint" off — pill disappears.

### Phase 3 — Security, memory, polish

**Goal:** App is production-grade — sandboxed renderers, idle memory ≤200 MB, IPC inputs validated, logging in place.

- [ ] **TASK-019** — IPC input validators (`src/main/services/ipc-validators.ts`, pure). `isNonEmptyString`, `isHttpUrl`, `isValidHotkeyString`. Apply to every `ipcMain.handle` and `ipcMain.on` entry point. Tests cover injection attempts and malformed payloads.
- [ ] **TASK-020** — Logger service (`src/main/services/logger.ts`). Rotating file at `%APPDATA%\voicetypist\logs\app.log`, max 5 MB, rolls to `app.1.log`. Hooks `process.on('uncaughtException')` and `process.on('unhandledRejection')`. Pure `formatLogLine(timestamp, level, message)` helper + tests.
- [ ] **TASK-021** — Memory diagnostics. `app.disableHardwareAcceleration()` at startup (saves ~50–80 MB GPU helper). Lazy-create mic indicator (don't pre-warm — save ~30–50 MB). Idle-destroy recorder window after 5 min of inactivity. Target: <200 MB at idle. Diagnostic IPC `app:get-memory` returns per-process breakdown. Pure aggregator + tests.
- [ ] **TASK-022** — Visual polish sweep. Every window imports `globals.css` for design tokens (verify with selfcheck). Remove debug console.logs. Consistent section dividers. Standardize focus rings.

**Verification for Phase 3:** Idle memory ≤200 MB (Settings → App → Memory readout). All security audits in PRD pass. No console errors in production build.

### Phase 4 — Packaging & launch

**Goal:** Shippable installer, GitHub Releases pipeline, public-facing README.

- [ ] **TASK-023** — electron-builder config: NSIS x64, `oneClick: false`, `allowToChangeInstallationDirectory: true`, `extraResources: [resources/whisper]`, `extraResources: [resources/icons]`. `publish: { provider: 'github', owner: '<your-github>', repo: 'voicetypist' }`.
- [ ] **TASK-024** — electron-updater wrapper. 5-second delay after app start, then `checkForUpdatesAndNotify()`. Tray notification on update available; click to apply on quit.
- [ ] **TASK-025** — GitHub Actions workflow `.github/workflows/release.yml`. Builds on push to main; on tag `v*.*.*` builds AND publishes to GitHub Releases. Python 3.11 for node-gyp compatibility. Skips native rebuild (`--c.npmRebuild=false`) since the bundled prebuilt whisper-cli is independent.
- [ ] **TASK-026** — README.md hero: tagline, demo GIF (record yourself dictating into Notepad), features (Voice → text anywhere, Local-first privacy, Free), system requirements (Windows 10/11 x64, mic), installation, hotkey reference, FAQ.
- [ ] **TASK-027** — Demo GIF: ~15–20 s with ScreenToGif. Show: hold Ctrl+CapsLock with cursor in Notepad → speak a sentence → release → text appears. Save to `assets/demo.gif`, embed in README.
- [ ] **TASK-028** — QA checklist (`docs/qa-checklist-v1.md`). 30-item clean-machine test plan covering: install/uninstall, dictation in Notepad / Chrome / VS Code / Slack, hotkey rebind persistence, language switching, model size impact, idle memory verification, log file presence.
- [ ] **TASK-029** — v1.0.0 release notes draft (`docs/release-notes-v1.0.0.md`). Paste-into-GitHub-release body covering what's in, known limitations, install steps, SHA-256.
- [ ] **TASK-030** — Publish v1.0.0. Tag, push, GitHub Actions builds + drafts. Edit release notes, publish.

**After Phase 4:** App is publicly downloadable. Share the installer link with reviewers.

### Phase 5 — Post-launch iteration (do nothing until users ask)

Reserved for features that real users request. Probable candidates:
- AI cleanup of transcripts (Wispr Flow-style — remove "um", punctuate)
- Live streaming dictation (words appear as you speak, not just at release)
- Custom phrase library / vocabulary boost
- Multi-language auto-detect
- Browser extension companion

Do not preemptively build any of these.

---

## 8. Non-functional requirements (from prd.md)

Lock these into `docs/prd.md` § Non-Functional Requirements:

- **Performance:** First transcription ≤3 s wall-clock for a 5-second utterance on a 2020-era laptop CPU. Subsequent transcriptions ≤2 s.
- **Idle memory:** ≤200 MB RSS at idle (no active recording). Strict — anything over flags a regression in the App tab readout.
- **Startup time:** Tray icon visible within 2 s of launch on cold start.
- **Security:** Sandboxed renderers + contextIsolation + nodeIntegration:false on every BrowserWindow. CSP via HTTP-header in production (defense-in-depth). All IPC inputs validated via type guards.
- **Privacy:** Audio NEVER leaves the machine. No telemetry. No analytics. Optional crash log upload is OFF by default (Phase 5 if added at all).
- **Accessibility:** All buttons keyboard-reachable. Focus rings visible. Tabbable Settings tabs.
- **Reliability:** Single-instance lock (`app.requestSingleInstanceLock()`). Crash in transcription does not crash the app. Logger captures uncaughtException + unhandledRejection.

---

## 9. Agent session guide (paste this with the document)

When you give this doc to a new Claude Code / Cursor session, also tell the agent:

> "Read this entire handoff document. Then read the existing `ScreenSpeak`
> project at `C:\Users\Administrator\Desktop\Screen Review\` as prior art —
> particularly:
>   - `src/main/services/whisper.ts` (Whisper integration pattern)
>   - `src/main/services/audio.ts` (recorder window + IPC)
>   - `src/main/services/paste.ts` (clipboard + Ctrl+V flow)
>   - `src/main/services/security.ts` + `security-helpers.ts` (hardening)
>   - `src/main/services/logger.ts` + `logger-helpers.ts` (file logging)
>   - `src/main/utils/paths.ts` + `path-helpers.ts` (preload path resolution)
>   - `src/renderer/components/ui/HotkeyRecorder.tsx` (hotkey recording UX)
>   - `electron.vite.config.ts` (multi-entry preload + renderer build)
>   - `electron-builder.yml` (NSIS config + whisper bundling)
>
> Reuse those patterns. Don't reinvent. ScreenSpeak shipped, the patterns work.
>
> Then start from TASK-001 in Phase 0. Mark each `- [x]` when verified.
> Commit after each phase, push, open a PR. Run typecheck + test + production
> build before marking any task complete."

---

## 10. Verification at each level (the L1-L5 framework)

For every task, verify at multiple levels before marking complete:

- **L1 — Typecheck.** `npm run typecheck` clean.
- **L2 — Unit tests.** `npm test` clean. Pure helpers extracted into separate files and covered by `node:test` files in `test/`. No mocks of Electron — if it can't be tested without Electron, it doesn't go in a pure helper.
- **L3 — Production build.** `npm run build` produces a clean installer in `dist/`.
- **L4 — Dev runtime.** `npm run dev` starts, selfcheck passes, no console errors during a happy-path user flow.
- **L5 — Clean-machine manual test.** Per `docs/qa-checklist-v1.md`, on a fresh Windows VM with no prior install.

A task is not "done" until at least L1-L4 are green and the relevant L5 item is checked.

---

## 11. What NOT to do (anti-patterns from real-world Electron apps)

Document these in `docs/prd.md` § Anti-Patterns so the agent doesn't drift:

- **Don't bundle Python or ffmpeg.** Whisper-cli is the only native dep. Anything else (audio format conversion, AI processing) must be done in the renderer via Web APIs.
- **Don't pre-load the Whisper model into Node memory.** Spawn whisper-cli per transcription. The model lives in the child process and dies when transcription ends. This is what keeps idle memory low.
- **Don't use `nodeIntegration: true` anywhere.** Period.
- **Don't write secrets to disk in plaintext.** Use `safeStorage.encryptString` if you ever add API keys (you shouldn't for v1).
- **Don't poll for things.** Use IPC events. The one exception is Settings's display of live metrics (memory, mic state) — those poll at ≥2 s intervals.
- **Don't use `console.log` for production diagnostics.** Use the logger. Production users never see stdout.
- **Don't ship debug `console.log` lines.** Strip them before marking a task complete.
- **Don't use globalShortcut for the voice hotkey.** It would consume the key and prevent hold-to-talk semantics. Use uiohook-napi.
- **Don't auto-rebuild native modules during CI.** `--c.npmRebuild=false` since whisper-cli is prebuilt and uiohook-napi ships prebuilt binaries.

---

## 12. Open questions for the user before you start

The agent should ask the user to answer these before TASK-001:

1. **What's the final product name?** Default working name is "VoiceTypist." Alternatives: Speakly, Whisperline, TypeByVoice. Affects: package.json `name`, electron-builder `productName`, tray tooltip, README, installer filename, GitHub repo name.
2. **What GitHub repo should this publish to?** Affects: `electron-builder.yml > publish.owner` and `publish.repo`.
3. **Default hotkey:** `Ctrl+CapsLock` per the WhisperTyping reference. Confirm or change. Rebindable in Settings either way.
4. **Default model size at first launch:** Tiny (75 MB, fast) vs Base (142 MB, balanced) vs Small (466 MB, accurate). Default: **Base**. Confirm or change.
5. **Should the activation pill show on EVERY launch or only first run?** Default: every launch (toggleable in Settings). Confirm or change.

Get answers to all 5 questions before writing code.

---

## 13. Done.

When the user pastes this whole document into a fresh Claude Code session,
the agent has everything it needs to:
- Understand the goal
- Understand the scope (and the explicit out-of-scope items)
- Pick a tech stack
- Reuse battle-tested patterns from the user's prior ScreenSpeak project
- Build phase-by-phase with verifiable acceptance criteria
- Ship a free, local-first voice-to-text utility comparable to WhisperTyping

Estimated total effort: **~30–40 hours of focused agent time** (about 60% of
the ScreenSpeak build, since screen capture + AI integration are gone).

— end of handoff —
