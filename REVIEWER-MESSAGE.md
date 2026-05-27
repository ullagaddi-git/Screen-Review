# ScreenSpeak — early review build

Hi 👋

I've been building **ScreenSpeak** — a Windows tray app for **voice
dictation** and **AI-powered screenshot analysis**. It's at v1.0.0-ready
state and I'd love your feedback before I publish publicly.

About 5 minutes to install and try.

---

## Download

- **Installer:** [link to Drive / Dropbox / GitHub Release]
- **File:** `ScreenSpeak-1.0.0-beta.1-Setup.exe`
- **Size:** 242 MB
- **SHA-256:** `ffd25f066bd7ed20c62b266d6cf036d2abf4564b1dc0901288cfabd267d13d91`

To verify the download integrity (optional but recommended):

```powershell
Get-FileHash .\ScreenSpeak-1.0.0-beta.1-Setup.exe -Algorithm SHA256
```

It should match the SHA-256 above.

---

## Installing (3 clicks, but read step 2)

1. Run `ScreenSpeak-1.0.0-beta.1-Setup.exe`.
2. ⚠️ **Windows will warn "Windows protected your PC"** — this is because
   the installer isn't yet code-signed (signing certs cost ~$200–400/year
   and I haven't bought one yet). Click **More info** → **Run anyway**.
3. The installer asks where to put it (default location is fine).
4. After install, the app starts in your **system tray** (bottom-right
   icon). Right-click the tray icon → Settings to configure.

---

## What to try

### 1. Voice dictation (works out of the box)

- Open Notepad or any text field.
- Hold **`Ctrl+Shift+Space`** while you speak.
- Release. Your words paste at the cursor.
- Works in any app — Chrome, VS Code, Slack, etc.

### 2. Screen capture

- Press **`Ctrl+Shift+S`**. A small mode picker appears at the bottom
  of your screen.
- Use **arrow keys** + **Enter** (or click) to pick a mode:
  - **Region** — drag a rectangle.
  - **Window** — captures whatever window had focus before the picker.
  - **Desktop** — full screen.
  - **Auto-scroll** — captures a long, scrollable area (e.g. a Terminal
    with 200+ lines or a long Notion page) and stitches the frames.
- Press **Esc** to cancel anytime.

### 3. AI screenshot analysis (optional, choose one)

This part isn't required to test the rest of the app, but it's the
"magic moment" feature.

**Option A: Local AI (free, private, ~5 GB to download)**

1. Install [Ollama](https://ollama.com) (5 MB binary).
2. In a terminal: `ollama pull llava:7b` (~5 GB; takes ~10 min).
3. ScreenSpeak detects Ollama automatically. Capture a screenshot of an
   error message, code, or anything visual — the result panel will pop
   up with an AI explanation.
4. First analysis takes 30–90 s on CPU; subsequent ones are 5–15 s.
   With a GPU, Ollama uses it automatically.

**Option B: OpenAI (fast, paid, ~$0.01/analysis)**

1. Get an API key from
   [platform.openai.com](https://platform.openai.com/api-keys).
2. ScreenSpeak Settings → AI tab → switch mode to "Cloud (OpenAI)".
   Paste the key, click "Test key", then "Save". Key is encrypted on
   your machine; only sent to OpenAI for the actual analysis call.

---

## System requirements

- **Windows 10** (build 1809+) or **Windows 11**
- **x64** architecture (no ARM64 in v1)
- **4 GB RAM** (8 GB+ recommended if using local AI)
- **~250 MB disk** for the app itself
- **A microphone** (for voice features)

---

## What I'd love feedback on

If you can spare 5 minutes after trying it:

1. **Did the SmartScreen warning scare you off?** Real concern — non-technical
   users sometimes abandon at this point. Curious whether you proceeded and
   whether you hesitated.
2. **Was the tray-only UX discoverable?** The app has no taskbar entry; the
   only UI is the violet **SS** icon in the system tray. Did you find it?
3. **Did the voice latency feel right?** First transcription: ~2–3 s. Is
   that fast enough for your dictation use case?
4. **Did the hotkeys conflict with anything you use?** I'm especially
   curious about `Ctrl+Shift+S` — VS Code uses it for "Save As", but I
   *consume* the event so VS Code shouldn't see it. Worth verifying.
5. **Anything broken or surprising.** Bug reports are gold. Even small ones.

---

## How to send feedback

Pick whatever's easiest for you:

- **GitHub Issues** (public, best for bug tracking):
  <https://github.com/ullagaddi-git/Screen-Review/issues>
- **Reply to this message** with screenshots or notes.
- **Quick voice note** — try recording it with ScreenSpeak itself 😉
  Hold the hotkey, talk, paste into your reply.

---

## What it isn't (yet)

So you don't waste time looking for these:

- ❌ macOS or Linux support — Windows only.
- ❌ Multi-monitor capture target picker — captures the primary display.
- ❌ Capture history — once you dismiss the result panel, the analysis is
  gone (clipboard still has the text/image if you copied).
- ❌ "Ask a follow-up question" — first response only.
- ❌ Code signing — the installer triggers SmartScreen as noted above.
- ❌ Auto-update from GitHub — wired in code, but only kicks in after the
  first public release.

All of those are on the Phase 6 roadmap if there's user demand.

---

Thanks for trying it. Genuinely appreciate any reaction — even "this isn't
useful for me because…" is helpful.
