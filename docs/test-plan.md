# Test Plan & Acceptance Criteria

This file is the source of truth for what "done" means for each feature. Every task below must have its acceptance criteria verified before being marked `[x]` in the roadmap. **Typecheck passing and "the app boots" do NOT count as verification.**

## Verification levels

| Level | What it proves | Examples |
|---|---|---|
| **L1: Typecheck** | The code compiles | `npm run typecheck` |
| **L2: Unit test** | Pure logic is correct | `npm test` (path helpers, frame stitching, hotkey parsing) |
| **L3: Build artifact** | The bundler emits what we expect | `grep` the built chunks for required IPC handlers, preload paths, etc. |
| **L4: Self-check at runtime** | Files exist, listeners registered | `runSelfCheck()` at app start |
| **L5: Manual smoke test** | The user-facing flow works end-to-end | Person at the keyboard, against an explicit checklist |

A task is only "done" when ALL applicable levels pass. Most code-touching tasks need at least L1 + L3 + (L2 if pure logic is touched) + L5.

---

## Phase 0 — Foundation (verified ✓)

L1+L5 verified: `npm run dev` opens tray icon, Settings window renders dark theme, npm run build produces an installer.

## Phase 1 — Voice-to-text (verified ✓)

L5 verified: hold Ctrl+Shift+Space, speak in Notepad, text pastes at cursor.

## Phase 3 — AI Analysis & Result Panel

### TASK-032 — Floating result panel window

- **AC-32-1** (L3): `out/preload/result.js` and `out/renderer/windows/result/result-panel.html` exist after build. `result` is in the selfcheck preload list and resolves on every startup.
- **AC-32-2** (L3): `showResultPanel()` and `result-panel:get-initial` IPC handler are reachable from the main bundle (verified via dev tray harness in dev mode).
- **AC-32-3** (L4): On startup, `[selfcheck] OK: preload "result" → out/preload/result.js`.
- **AC-32-4** (L5): All three states render correctly via dev tray menu items: success (with code block in monospace), error (with "Open setup link →" button), loading (pulsing "Analyzing…" text).
- **AC-32-5** (L5): Panel does NOT steal keyboard focus from the active app — verified by typing in another app while panel is visible.
- **AC-32-6** (L5): Slide-in animation visible (translateY + opacity over 300ms ease).

### TASK-033 — Result panel interactions

- **AC-33-1** (L2): `parseCodeBlocks` strips language tags from triple-backtick fences, returns text/code/text triples for typical AI responses, defensive against non-string input. Locked in by `test/code-block-parser.test.mjs`.
- **AC-33-2** (L3): `clipboard.writeText` and `clipboard.writeImage` are called from `result-panel:copy-text` and `result-panel:copy-image` IPC handlers in the main bundle.
- **AC-33-3** (L3): `outsideMousedownHandler` + `screen.dipToScreenPoint` + `uIOhook.on("mousedown")` in the built `out/main/index.js` (replaces the unreliable `blur` event for `focusable:false` windows).
- **AC-33-4** (L5): Copy Text → AI response text pastes into Notepad correctly. Verified manually.
- **AC-33-5** (L5): Copy Image → screenshot (the captured PNG, not panel text) pastes into Paint correctly. Verified manually.
- **AC-33-6** (L5): Esc / X / Dismiss buttons all close the panel.
- **AC-33-7** (L5): Click-outside-the-panel (anywhere on screen outside the panel's bounds) dismisses the panel — via uIOhook mousedown handler with DIP→pixel coord conversion. Click-inside-panel keeps it open.
- **AC-33-8** (L5): Copy Text is disabled (greyed) on error/loading states; Copy Image works in all states (it just copies the screenshot regardless of AI outcome).

### TASK-037 — Hotkeys tab with live recorder

- **AC-37-1** (L2): `formatHotkeyFromEvent` produces canonical `Ctrl+Shift+Alt+Meta+X` format regardless of key-press order. Locked in by `test/hotkey-format.test.mjs`.
- **AC-37-2** (L2): Modifier-only key presses return `reason: 'modifier-only'` (caller keeps listening); plain key presses without a modifier return `reason: 'no-modifier'` (rejected to avoid clashing with normal typing).
- **AC-37-3** (L2): `eventCodeToToken` maps browser KeyboardEvent codes to Electron Accelerator-compatible tokens (KeyA → A, Digit1 → 1, ArrowDown → Down, Space → Space, NumpadEnter → Enter, etc.).
- **AC-37-4** (L3): `settings.ts` calls `reloadCaptureHotkey()` when `captureHotkey` changes (alongside the existing `reloadVoiceHotkey()` for `voiceHotkey`). Verified in built bundle.
- **AC-37-5** (L5): Click "Change…" next to a hotkey → field shows "Press key combination…" with violet highlight. Press Esc → cancels. Press a valid combo → saved immediately. Try the OTHER hotkey's current value → inline error "Already used for [voice/capture]".
- **AC-37-6** (L5): After changing the voice hotkey to (say) `Ctrl+Shift+V`, the OLD `Ctrl+Shift+Space` no longer triggers recording, and the NEW combo does. No app restart required.

### TASK-036 — Settings AI tab

- **AC-36-1** (L3): `AITab` component is rendered when active tab is "AI". Verified in built `out/renderer/assets/settings-*.js`.
- **AC-36-2** (L3): `app:open-external` IPC handler in `out/main/index.js` validates http(s) before calling `shell.openExternal`.
- **AC-36-3** (L4): Live Ollama status section refreshes every 10 s — `setInterval` in `useEffect` with cleanup.
- **AC-36-4** (L5): AI Mode radios (Local / Cloud / Ask) update config via `settings:set` immediately. Verified by switching mode and confirming the change persists across Settings re-open.
- **AC-36-5** (L5): Ollama status section shows "Ollama running · N models installed" when reachable; selector dropdown lists installed models AND the configured model (with "(not installed)" suffix if missing). Switching the dropdown updates config.
- **AC-36-6** (L5): OpenAI section shows "No key set" / "Key saved" status. With masked input, "Test Key" calls `openai:test-key` and shows "Valid ✓" or the typed error message. Save button stores via `settings:set` (encrypted at rest via safeStorage).
- **AC-36-7** (L5): The result panel's "Add OpenAI key" / "Use OpenAI instead" CTAs open the Settings window AND focus the AI tab via `settings:focus-tab` IPC.

### TASK-035 — Ollama unavailable state + setup CTAs

- **AC-35-1** (L3): Result panel error UI dispatches on `errorKind` to render the right CTAs (`ErrorActions` switch). Verified in `out/renderer/assets/result-panel-*.js`.
- **AC-35-2** (L5): For `ollama-unavailable` — panel shows two buttons: "Install Ollama" (opens ollama.com via `shell.openExternal`) and "Use OpenAI instead" (opens Settings → AI tab). Verified via dev tray `(Ollama unavailable)` menu item.
- **AC-35-3** (L5): For `ollama-model-missing` — panel shows the model name in a `<code>` block with a Copy button so the user can paste the install command into PowerShell. Verified during real capture against an Ollama instance with no installed model.
- **AC-35-4** (L5): For `openai-key-missing` / `openai-auth` — panel shows "Add OpenAI key" / "Fix key in Settings" CTA that opens the Settings window via `app:open-settings` IPC.
- **AC-35-5** (L4): `app:open-settings` handler is registered in `src/main/index.ts`. Renderer-side bridge `openSettings(tab?)` exposed via contextBridge.
- **AC-35-6** (NOT a TASK-35 concern but flagged): Inference latency on CPU is hardware-bound. Tracked as separate perf task (streaming responses, optional GPU detection, cloud-AI-as-default).

### Performance optimizations (cross-cutting, locked in by tests)

- **AC-PERF-1** (L2): `prepareImageForAI` resizes captures larger than `MAX_AI_IMAGE_LONG_SIDE` (currently 768 px), preserves aspect ratio, passes through smaller images unchanged. Locked in by `test/image-prep.test.mjs`.
- **AC-PERF-2** (L2): `buildAnalyzeRequest` includes `options.num_predict <= 512` and `options.temperature <= 0.3` — caps output length and reduces sampling variance for faster, more deterministic analysis on CPU. Locked in by `test/ollama-helpers.test.mjs`.

### TASK-034 — Capture → AI → result panel end-to-end

- **AC-34-1** (L3): `executeAndAnalyze` is wired into the picker's mode-selected callback. Visible in built `out/main/index.js` at the picker callback site.
- **AC-34-2** (L3): The flow calls `aiService.analyze` and `showResultPanel` with the right shapes (loading then success/error) — confirmed by build inspection.
- **AC-34-3** (L4): Stale-result guard via session counter — if the user triggers a second capture while the first is mid-analysis, only the latest session updates the panel. `[capture] session N stale after capture/AI — abandoning/discarding` log lines confirm guard fires.
- **AC-34-4** (L5): With Ollama running but no vision model installed: Ctrl+Shift+S → Desktop produces a panel with screenshot thumbnail + "Analyzing…" pulse → updates within ~2 s to error: "Ollama model 'qwen2-vl' is not installed. Run `ollama pull qwen2-vl` to install it." (`errorKind: 'ollama-model-missing'`). Verified manually.
- **AC-34-5** (L5 — deferred): With Ollama + vision model installed, capture produces a real AI analysis in the panel within ~15 s. Will verify after the user runs `ollama pull qwen2-vl`.

### TASK-031 — AI router

- **AC-31-1** (L2): `pickStrategy({aiMode:'local'})` → `'ollama'`. Locked in by `test/ai-router.test.mjs`.
- **AC-31-2** (L2): `pickStrategy({aiMode:'cloud'})` → `'openai'` regardless of `hasOpenAIKey`. (Deliberate — surfaces "key missing" error rather than silently demoting to local AI.)
- **AC-31-3** (L2): `pickStrategy({aiMode:'ask'})` → `'ollama'` (v1 default; per-capture chooser is out of scope here).
- **AC-31-4** (L3): Built `out/main/index.js` contains `ipcMain.handle("ai:analyze", ...)` invoking `aiService.analyze()`, plus `pickStrategy` reachable from the router.
- **AC-31-5** (L4): `AIAnalyzeIPCResult` discriminates ok/error. The error variant has a stable `errorKind` string the result panel UI switches on (`ollama-unavailable`, `ollama-model-missing`, `openai-auth`, etc.).
- **AC-31-6** (L4): Verified live — Ollama returns HTTP 404 `{"error":"model 'qwen2-vl' not found"}` when the model isn't installed. Our router translates this to `ok:false, provider:'ollama', errorKind:'ollama-model-missing'`. Confirmed against the running local Ollama instance during fix.
- **AC-31-7** (L4): Renderer sees `AIAnalyzeIPCResult` shape, NOT raw service errors. Type-checked at the contextBridge boundary.

### TASK-030 — OpenAI service + key storage

- **AC-30-1** (L2): `buildAnalyzeMessages` produces a single user message with `text` + `image_url` parts; the image URL is `data:image/png;base64,...` per PRD spec. Locked in by `test/openai-helpers.test.mjs`.
- **AC-30-2** (L2): `parseAnalyzeResponse` defensive against malformed shapes (returns `''`, never throws).
- **AC-30-3** (L2): `classifyOpenAIError` distinguishes auth / rate-limit / quota / timeout / network. UI relies on this discriminant for messaging.
- **AC-30-4** (L2): `isPlausibleApiKey` rejects empty/short/wrong-prefix strings before we waste an API round-trip.
- **AC-30-5** (L3): Built `out/main/index.js` contains `ipcMain.handle("openai:test-key", ...)` invoking `openaiService.testKey()`, AND `encryptSecret(raw)` is called from `settings:set` for the `openaiApiKey` field.
- **AC-30-6** (L3): The renderer-facing `PublicConfig` strips `openaiApiKey` and exposes only `hasOpenAIKey: boolean`. The encrypted blob never crosses the contextBridge.
- **AC-30-7** (L4): With safeStorage available (Windows DPAPI), `encryptSecret(plaintext)` returns base64. `decryptSecret` round-trips it. Stored keys survive restarts.
- **AC-30-8** (L4): `settings:set` with `openaiApiKey: '<plaintext>'` encrypts before writing to electron-store. The on-disk JSON contains the base64 ciphertext, NOT the plaintext.
- **AC-30-9** (L5 — deferred): With a real OpenAI key, "Test Key" in Settings AI tab returns "Valid". Verified once Settings AI tab lands in TASK-036.

### TASK-029 — Ollama service

- **AC-29-1** (L2): `buildAnalyzeRequest` produces a body matching Ollama's `/api/generate` schema: `{model, prompt, images:[base64], stream:false}`. Locked in by `test/ollama-helpers.test.mjs`. The `stream: false` invariant is explicitly tested.
- **AC-29-2** (L2): The DEFAULT_PROMPT includes both "error" and "code" keywords (matches PRD spec — explain errors, summarize code).
- **AC-29-3** (L2): `parseModelsResponse` extracts model names from `/api/tags`, returns `[]` for malformed input.
- **AC-29-4** (L2): `normalizeHost` handles missing scheme, trailing slashes, empty input.
- **AC-29-5** (L3): The built `out/main/index.js` contains `ipcMain.handle("ollama:check", ...)` calling `ollamaService.isRunning()` and `listModels()`.
- **AC-29-6** (L4): Live integration test against running Ollama: `GET /` returns 200 → `isRunning()` returns true; `GET /api/tags` parsing extracts model list correctly. Verified manually with axios.
- **AC-29-7** (L4): When Ollama is reachable but the configured model is missing, `analyze()` throws `OllamaError` with `kind: 'model-missing'` (not a generic crash).
- **AC-29-8** (L4): When Ollama is unreachable (port closed), `isRunning()` returns `false` instead of throwing — handler stays callable.

## Phase 2 — Screen capture

### Region capture

- **AC-R1** (L4): On app start, `out/preload/region.js` exists at the path returned by `resolvePreloadPath('region')`. Self-check logs `[selfcheck] OK: preload "region"`.
- **AC-R2** (L5): Press Ctrl+Shift+S → Region. The overlay's `window.regionBridge` must be `typeof === 'object'` (not `undefined`). The first `[region-renderer] mousedown` log must appear when you click on the overlay.
- **AC-R3** (L5): A 200×200+ drag-release saves a PNG at `%TEMP%\screenshpeak-captures\region-<ts>.png` within 1 second of release. The dev log must show `[region-main] complete RECEIVED` followed by `[region-main] crop done: <N> bytes`.
- **AC-R4** (L5): Esc, right-click, OR clicking Cancel button must close the overlay within 200 ms with no PNG saved. Dev log must show `[region-main] cancel RECEIVED`.
- **AC-R5** (L5): A drag <50×50 must show "Selection too small" warning and NOT save a PNG.

### Active window capture

- **AC-W1** (L5): With Notepad as the active window, press Ctrl+Shift+S → Window. Saved PNG dimensions must roughly match Notepad's window dimensions (within ±20 px).
- **AC-W2** (L5): The dev log must show `[active-window] snapshot: title="..."` matching the user's intended target.
- **AC-W3** (L5): If the active window is too small (<50×50 px, e.g. a tooltip), the user gets an error toast — not a 0-byte PNG.

### Desktop capture

- **AC-D1** (L5): Press Ctrl+Shift+S → Desktop. PNG dimensions match the primary display's native resolution.

### Auto-scroll capture

- **AC-A1** (L5): With a fresh PowerShell window running `Get-Process | Format-List *` as the active window, Auto-scroll produces a stitched PNG with `height ≥ 2 × bounds.height`. (Proves multiple distinct frames were captured.)
- **AC-A2** (L4): The dev log shows `[autoscroll] scroll-up result: ok=true, hwnd=<non-zero>` (proves Win32 SendMessage was delivered to a real window) AND `[autoscroll] i=N pixel diff vs prev: X.XX%` lines with X >= 0.5% for at least one frame pair (proves the scroll actually moved pixels).
- **AC-A3** (L5): The dev log shows `[autoscroll] done: N frames, reason=bottom-detected` with N >= 3 for a long buffer like Get-Process output.
- **AC-A4** (L5): Capture completes within 30 s. If the target window closes mid-capture, dev log shows `reason=aborted` and a tray notification surfaces.
- **AC-A5** (L4): If Win32 SendMessage returns `NO_WINDOW` (target title not found in EnumWindows), `autoScrollCapture` returns `frames=[]` with `reason=aborted` instead of crashing.

### Auto-scroll Win32 scroll helper (TASK-025 lesson)

- **AC-W32-1** (L2): `scrollWindowByTitle` uses `EnumWindows`-based title resolution, NOT `FindWindow($null, title)`. (Locked in by `test/win32-scroll-script.test.mjs`. The original FindWindow approach silently returned 0 for legacy console windows like Administrator: Windows PowerShell.)
- **AC-W32-2** (L2): The PowerShell script escapes single quotes in titles by doubling them (`'` → `''`), the documented PowerShell escape inside single-quoted strings.
- **AC-W32-3** (L4): Smoke-tested manually before claiming complete — the helper's PowerShell command, run against an actual PowerShell window, returns a non-zero HWND and successfully delivers SendMessage calls. Verified during fix.

### IPC plumbing (Phase-wide)

- **AC-IPC1** (L3): Every renderer-side `ipcRenderer.invoke(channel)` has a matching `ipcMain.handle(channel)` in the build output. Verify by grepping `out/main/index.js` and `out/main/chunks/*.js` for each channel name.
- **AC-IPC2** (L4): `runSelfCheck()` returns `ok: true` at app start. Any failure surfaces a tray notification.
- **AC-IPC3** (L2): `buildPreloadPath` returns paths that contain no `..` segments.

---

## Anti-patterns (things that have burned us)

1. **`__dirname`-based paths in modules that get code-split into chunks.** Always use `app.getAppPath()`-rooted helpers (`resolvePreloadPath`, `resolveRendererPath`).
2. **Marking a task complete on typecheck-only.** Typecheck does not exercise IPC, file system paths, or runtime registrations. Always run unit tests + a real smoke test.
3. **Silent failures swallowed by React.** When a preload bridge is undefined, `bridge.fn()` throws TypeError inside React. Catch these via try/catch around bridge calls AND log the bridge type at startup.
4. **Asserting "should work" without proof.** Read the dev log for the trace lines that prove the code path executed. Absence of a log line is evidence of absence.

---

## Adding new tests

Pure functions go in `test/<feature>.test.mjs` using `node:test` (zero-install). Run with `npm test`. The current suite covers:
- `test/paths.test.mjs` — preload/renderer path building (5 tests)
- `test/stitch.test.mjs` — frame-overlap detection (7 tests)

For Electron-context tests (IPC, BrowserWindow), add Playwright + `@playwright/test` later if needed. For now, runtime self-checks fill that gap.
