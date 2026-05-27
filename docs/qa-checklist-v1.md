# ScreenSpeak v1.0 — clean-machine QA checklist

Run every box on this list against the **packaged installer**, on a clean
Windows 10 or 11 machine that has never had ScreenSpeak installed before.
A VM works (Hyper-V, VirtualBox, VMware Workstation) — just make sure the
guest has audio passthrough for the voice tests.

If any box fails, file an issue with the failing step's number and details
before publishing v1.0.0.

## Setup (do once on the clean machine)

- [ ] **1.** Download `ScreenSpeak-1.0.0-Setup.exe` from the GitHub Release page.
- [ ] **2.** Run the installer.
- [ ] **3.** SmartScreen warning appears → "More info" → "Run anyway" works.
- [ ] **4.** NSIS installer offers a path picker + elevation prompt.
- [ ] **5.** Install completes. Start Menu shortcut "ScreenSpeak" appears.
      Desktop shortcut also appears.
- [ ] **6.** Launch from the Start Menu shortcut. Tray icon (violet **SS**)
      appears in the bottom-right system tray within ~5 seconds.
- [ ] **7.** Welcome notification appears: "ScreenSpeak is running. Hold
      Ctrl+Shift+Space to dictate, press Ctrl+Shift+S to capture & analyze
      a screenshot."
- [ ] **8.** Right-click tray icon → menu shows Settings, Quit. Left-click
      opens Settings.
- [ ] **9.** Settings window opens. Title bar reads "ScreenSpeak Settings".
      Tabs: Hotkeys, AI, Voice, App.

## Voice (P0)

- [ ] **10.** Open Notepad. Click into the document area.
- [ ] **11.** Hold `Ctrl+Shift+Space`. Mic indicator (small "● Recording…"
      pill) appears bottom-right. Speak: "Hello world, this is a test."
- [ ] **12.** Release. Indicator changes to "Transcribing…". A second or two
      later, "Hello world, this is a test." appears in Notepad at the cursor.
- [ ] **13.** Repeat in **Chrome** (any text input).
- [ ] **14.** Repeat in **VS Code** (open any file, hold the hotkey, speak,
      release — text appears at the cursor). Verifies the global hotkey
      isn't being swallowed by a focused app.
- [ ] **15.** Repeat in **Slack** (or another Electron app of your choice).
- [ ] **16.** Open Settings → Voice. Switch trigger mode to "Press once to
      start / again to stop". Tap the hotkey, speak briefly, tap again.
      Same paste behavior.

## Screen capture (P0)

- [ ] **17.** Press `Ctrl+Shift+S`. Mode picker appears at the bottom of the
      screen with 4 buttons (Region, Window, Desktop, Auto-scroll). The
      first button (Region) has a violet ring around it.
- [ ] **18.** Press `→` three times. Focus ring moves through Window → Desktop
      → Auto-scroll. Press `←` once. Focus moves back to Desktop.
- [ ] **19.** Press `Esc`. Picker disappears, no capture taken.
- [ ] **20.** Press `Ctrl+Shift+S` again. Click "Region". Screen dims with a
      crosshair cursor. Drag a rectangle around any visible content. Release.
      Result panel slides up from the bottom-right with a thumbnail of the
      captured region.
- [ ] **21.** Repeat for "Window" — captures the previously-focused window
      (the one with focus before the picker opened).
- [ ] **22.** Repeat for "Desktop" — captures the entire primary screen.
- [ ] **23.** Open Windows Terminal. Generate ~200 lines of output (e.g.
      `Get-Process | Format-Table * -AutoSize`). Press `Ctrl+Shift+S` →
      Auto-scroll. Click into the terminal. ScreenSpeak captures multiple
      frames as it scrolls, stitches them, and shows the result panel with
      the full long image visible in the thumbnail.
- [ ] **24.** Repeat the auto-scroll on a long Notion / VS Code / Claude
      window. Verifies the keyboard-PageDown fallback for Chromium apps.
- [ ] **25.** Click anywhere outside the result panel. The panel dismisses.
- [ ] **26.** Press `Esc` while the result panel is open (after a fresh
      capture). The panel dismisses.

## AI analysis (P0 if Ollama available; otherwise P1)

If Ollama is **not** installed yet on the clean machine, do these first:

- [ ] **27a.** Open the URL from the first-run "Install Ollama" notification.
      Install Ollama from `ollama.com`.
- [ ] **27b.** In a terminal: `ollama pull llava:7b`. (~5 GB; takes ~10 min
      on a typical connection.)
- [ ] **27c.** Restart ScreenSpeak (Quit from tray, re-launch).

Then:

- [ ] **28.** Open Settings → AI. Status dot says "Ollama running · 1 model
      installed". "Active model" dropdown shows `llava:7b`.
- [ ] **29.** Generate a Python error in a terminal. Capture it via
      `Ctrl+Shift+S` → Region.
- [ ] **30.** Result panel shows "Analyzing…" with elapsed-seconds counter.
      First call: 30–90 s on CPU. Subsequent calls: 5–15 s.
- [ ] **31.** AI response appears, identifying the error and suggesting a fix.
- [ ] **32.** "Copy text" button → text on clipboard. "Copy image" → image on
      clipboard (paste into MS Paint to verify).

If you have an OpenAI key:

- [ ] **33.** Settings → AI → switch mode to "Cloud (OpenAI)". Paste key.
      Click "Test key" → "Valid" within 2 seconds.
- [ ] **34.** Click "Save". Status dot turns green: "Key saved".
- [ ] **35.** Capture a screenshot. Result panel uses OpenAI; analysis returns
      in ~3–5 s.

## Settings persistence + hotkey rebinding

- [ ] **36.** Settings → Hotkeys. Click "Change voice hotkey". Press
      `Ctrl+Alt+J`. The new hotkey is saved (chip text updates).
- [ ] **37.** Quit + relaunch ScreenSpeak. The hotkey is still `Ctrl+Alt+J`
      (persists in `%APPDATA%\screenshpeak\config.json`).
- [ ] **38.** Try to rebind voice and capture to the same combo. The recorder
      shows "Already used for [other hotkey]." and refuses to save.
- [ ] **39.** Reset both back to defaults (`Ctrl+Shift+Space` and `Ctrl+Shift+S`).

## App tab

- [ ] **40.** Settings → App. "Launch ScreenSpeak when Windows starts"
      checkbox toggles. Watch for "Setting says X but Windows still has it
      registered" warning if you toggle quickly — should NOT appear when
      toggle is in steady state.
- [ ] **41.** "Memory usage" section shows a live RSS readout. Total < 200 MB
      with no other windows open. "Refresh" updates the number.
- [ ] **42.** "Check for updates" button works (returns "up to date" or
      "available" depending on whether a newer release exists).
- [ ] **43.** "View on GitHub" button opens the repo in the default browser.

## Tray + lifecycle

- [ ] **44.** Tray menu → Quit. Tray icon disappears immediately. Verify in
      Task Manager (`Ctrl+Shift+Esc`) that no `ScreenSpeak.exe` processes
      remain. (Sometimes 1 GPU helper takes a second or two to terminate —
      that's OK.)
- [ ] **45.** Re-launch from Start Menu. Tray icon reappears. The welcome
      notification does **NOT** show again (firstRun=false persisted).
- [ ] **46.** Double-launch test: try to open the app a second time while
      already running. The second launch quietly opens Settings instead of
      spawning a duplicate (single-instance lock).

## Memory baseline

- [ ] **47.** Quit + relaunch. Wait 90 seconds without touching the app.
      Open Settings → App → look at the Memory usage readout. Total should
      be ≤ ~200 MB. (Settings being open will add ~30–50 MB; that's
      expected. The 200 MB target is for true idle.)

## Logs

- [ ] **48.** Open `%APPDATA%\screenshpeak\logs\app.log` in Notepad.
      Verify the most recent app start logged a line like
      `2026-05-08T10:30:00.000Z [INFO] app starting — v1.0.0 (packaged=true)`.

## Uninstall

- [ ] **49.** Settings → Apps → ScreenSpeak → Uninstall. Confirms NSIS
      uninstall flow. After uninstall: Start Menu shortcut gone, Desktop
      shortcut gone, `C:\Users\<you>\AppData\Local\Programs\screenshpeak\`
      gone. (`%APPDATA%\screenshpeak\` config + logs are intentionally
      preserved across uninstall — uninstall is not "wipe my data".)

---

## Sign-off

**Tester:** _______________
**Machine:** Windows ___ build ___ x64
**Tested against:** ScreenSpeak vX.Y.Z (`<sha256 of installer>`)
**Date:** _______________
**All checked?:** ☐ Yes / ☐ No (note failures above)
