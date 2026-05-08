# Product Vision — ScreenSpeak

## 1. Vision & Mission

### Vision Statement

A world where every Windows user can speak, capture, and understand their screen instantly — without switching apps, signing up for services, or sending their data to the cloud.

### Mission Statement

ScreenSpeak delivers voice-to-text and AI-powered screen capture as a single, always-available system tray tool — local-first, hotkey-driven, and fast enough to never interrupt your flow.

### Founder's Why

Christian spotted this gap from living it. He uses AI tools constantly — dictating messages, asking ChatGPT about errors, grabbing screenshots for reference — and every single time it required switching apps, breaking focus, and repeating the same friction. A voice dictation tool. A screenshot tool. An AI chat window. Three separate products to do what should be one seamless action.

The terminal error use case crystallized the idea: a developer sees an error in VS Code, manually selects the text, opens a browser tab, pastes into ChatGPT, waits, reads the response, switches back. Every step is avoidable. The right product should let you press one key, get an instant AI explanation, and never leave your editor. That product didn't exist as a local, free, Windows-native desktop app — so ScreenSpeak is it.

Building as a non-technical founder using AI coding tools isn't a liability — it's founder-market fit in the purest sense. Christian represents exactly the kind of power user who wants capable software without the complexity tax.

### Core Values

**Local first, always.** ScreenSpeak never sends user data to a developer-controlled server. Voice transcription runs on-device via Whisper.cpp. AI analysis runs locally via Ollama. If a user chooses to add their own OpenAI key for cloud quality, that choice is theirs — and their API call goes directly to OpenAI, not through us. In practice this means: no analytics that capture screen content, no cloud sync of transcripts, no telemetry that could be sensitive.

**Speed is the feature.** An AI tool that's slow is worse than no tool at all — it adds friction instead of removing it. ScreenSpeak's target for the voice-to-text flow is under 2 seconds from hotkey release to cursor paste. For screen capture and local AI analysis, under 10 seconds. Every architectural decision should be evaluated against these thresholds first.

**Zero friction at activation.** The app must work without a tutorial. A developer who just installed it should be able to press the default hotkey and have something happen correctly. No onboarding flow, no wizard, no mandatory settings screen. Sensible defaults that work for 80% of users immediately.

**One tool, one job, done right.** ScreenSpeak is not a productivity suite. It does two things — voice-to-text and AI screen capture — and it does them exceptionally. Feature requests that fall outside this core will be deferred. Scope creep at this stage kills solo projects.

### Strategic Pillars

**The hotkey is the product.** Everything ScreenSpeak does is reachable without touching the mouse or leaving the current app. The product lives at the intersection of "always available" and "never in the way." Every feature must be evaluable against this test: can a user trigger and receive value from this feature without breaking their current workflow?

**Developers are the beachhead.** The magic moment — terminal error to AI diagnosis in 10 seconds — is a developer story. This community is vocal, shares tools obsessively, and has high tolerance for rough edges if the core value is real. Ship for developers first, then expand to the broader power-user audience once the product has proven its value.

**Local AI is a product differentiator, not a compromise.** In a world where every productivity tool is cloud-dependent and subscription-gated, "it runs on your machine, for free, forever" is a genuine competitive advantage. Position it as such. Don't apologize for local model quality — frame it as the responsible, private, and cost-free default.

**Validate before monetizing.** The free v1 exists to answer one question: do people come back? 50 weekly active users who return without prompting is worth more than 500 one-time downloads. When retention is clear, the monetization path becomes obvious.

### Success Looks Like

Twelve months from now, ScreenSpeak has 5,000+ active Windows users. It's the top result when someone searches "voice to text desktop Windows free" or "AI screenshot tool Windows." Developers are sharing the terminal-diagnosis clip on X and LinkedIn without being asked to. A paid tier exists — either a one-time purchase or a subscription that unlocks advanced features — and generates $3,000+ MRR from users who chose to upgrade because the free version earned their trust. The core app is stable enough that Christian can build Phase 2 features (browser extension, Mac support, team features) without fixing Phase 1 bugs. That's the signal this worked.

---

## 2. User Research

### Primary Persona

**Alex, 28, Software Developer — Windows**

Alex works at a mid-size company or freelances, spending most of his day in VS Code or Cursor, a browser, Slack, and email. He's an active AI user — runs ChatGPT or Claude constantly for coding questions and writing help. His machine runs Windows 11. He's technically comfortable but not a systems programmer; he'd rather use great tools than build them.

His day involves constant context-switching: copying error messages into ChatGPT, dictating Slack messages on his phone because Windows voice typing is unreliable, screenshotting documentation pages to reference in conversations. Each of these is a small friction, but together they add up to 30-45 minutes of wasted workflow per day.

When Alex hits a terminal error, his current flow is: select text, copy, alt-tab to browser, open ChatGPT, paste, type context, wait, read, alt-tab back. He's already using AI — he just wants it faster and closer. When he types long Slack messages or prompt inputs, he sometimes dictates on his phone and AirDrops the text to his computer because Windows dictation keeps cutting out. He knows better tools exist; he just hasn't found a single one that does everything without a monthly fee.

Alex would adopt ScreenSpeak immediately if he saw a 30-second demo of the terminal magic moment. He'd share it in his developer Discord within 24 hours of using it. He's the user this product is designed for.

### Secondary Personas

**Morgan, 35, Marketing Manager — Non-Technical Windows User.** Morgan writes a lot — emails, briefs, LinkedIn posts, prompt inputs to ChatGPT. She types fast but would rather speak. She's tried Windows Voice Typing but it's unreliable and doesn't work in her CRM. She's not interested in the AI screenshot features; she wants system-wide dictation that just works, with no monthly subscription. ScreenSpeak's voice module alone would make her a loyal user.

**Priya, 31, Content Researcher and Writer.** Priya screenshots everything — articles, data tables, competitor websites — for reference. She currently saves screenshots and manually writes summaries. If ScreenSpeak could auto-summarize a webpage screenshot or extract a data table from an image, it would replace a tool she'd otherwise pay for. She's the user most likely to opt into the optional OpenAI key for higher-quality analysis.

**James, 42, Operations Lead — Power User.** James optimizes his Windows workflow obsessively. He uses AutoHotkey, custom shell scripts, and keyboard shortcuts for everything. He'd adopt ScreenSpeak as a productivity layer and share it in his power-user forums. He's not a developer but uses his computer all day and resents friction. He's a credibility multiplier — if James recommends it, his network listens.

### Jobs To Be Done

**Functional jobs:** Transcribe speech to text in any Windows application without switching focus. Capture a full terminal or window as a single image. Get an AI explanation of what's on screen without opening a browser. Extract readable text from a screenshot. Answer a question about visual content without manual copy-paste.

**Emotional jobs:** Feel in control of their workflow rather than interrupted by it. Feel like their AI tools are as fast as their thoughts. Feel secure knowing their screen content isn't being uploaded to a cloud service they don't control.

**Social jobs:** Be the person who knows the best productivity tools. Share a tool that makes others immediately say "I need that." Look competent and efficient in professional contexts where AI tools are increasingly expected.

### Pain Points

**Pain 1 — App-switching to AI (Severity: High, Frequency: Dozens/day).** The loop of copy → switch to browser → paste → wait → switch back is the #1 daily friction for AI-using developers. Consequences: broken focus, lost context, slower problem resolution. Current workaround: power users keep a ChatGPT tab pinned and use shortcuts, but it's still a multi-step context break.

**Pain 2 — Unreliable system-wide voice input on Windows (Severity: High, Frequency: Several/day).** Windows Voice Typing (Win+H) cuts out, doesn't work in all apps, requires an internet connection, and lacks AI cleanup. Consequences: users abandon it after the first frustrating experience and go back to typing. Current workaround: type everything, or use phone and transfer text manually.

**Pain 3 — Screenshot tools have zero intelligence (Severity: Medium, Frequency: Daily).** Snipping Tool, ShareX, and GoFullPage all capture images they can't understand. The user still has to read, interpret, and manually extract value. Consequences: screenshots sit in folders unread; users do the cognitive work AI should handle. Current workaround: none — or expensive SaaS tools.

**Pain 4 — Long-form terminal errors are hard to capture fully (Severity: Medium for developers, Frequency: Multiple/day).** A terminal error might span 3–5 screens. Capturing it requires multiple screenshots or manual scrolling — and the result is multiple images that can't easily be shared with an AI in context. Consequences: developers either paste raw text (tedious) or ask AI without full context (incomplete answers). Current workaround: copy-paste terminal text manually.

**Pain 5 — Subscription fatigue for utility tools (Severity: Low-Medium, Frequency: Constant background concern).** Users are reluctant to subscribe to a new tool until they've verified it's worth it. A $10/month dictation tool that might be abandoned in two weeks creates real friction at adoption. Consequences: users don't try potentially great tools. ScreenSpeak being free by default removes this barrier entirely.

### Current Alternatives & Competitive Landscape

**Wispr Flow / OpenWhispr (voice-only competitors).** These tools do voice-to-text well — Wispr Flow in particular is polished and accurate. Their fatal gap: they do only voice. No screen capture, no AI analysis, no terminal diagnosis flow. Switching cost to ScreenSpeak is low since users can keep their voice-only muscle memory and gain the capture layer. Wispr Flow is also Mac-first; OpenWhispr is cross-platform but less polished on Windows.

**ShareX (capture-only, open source).** ShareX is the most capable free screenshot tool for Windows. It supports auto-scroll capture, OCR, annotations, and dozens of integrations. Its gap: zero AI analysis. The app can capture a terminal but doesn't understand it. Switching cost is moderate for ShareX power users — ScreenSpeak needs to match its capture quality before these users migrate.

**GoFullPage (browser extension).** Excellent for full-page web screenshots, but browser-only and has no AI. Not a direct competitor for the developer/terminal use case. Relevant as a reference point for "this is what great capture UX looks like in a browser."

**Windows built-in Voice Typing (Win+H).** Free and built-in, but requires an internet connection, has spotty app compatibility, no AI cleanup, and cuts out unpredictably. Most users who've tried it have abandoned it. ScreenSpeak's offline Whisper-based transcription is meaningfully better on all dimensions.

**Manual copy-paste into ChatGPT.** The dominant "alternative" is not a tool — it's a workflow. Users manually copy terminal errors, paste into a browser tab, and get answers. This is the behavior ScreenSpeak collapses into a single hotkey. This is the actual competitive behavior to displace, not an app to beat.

**"Do nothing."** A significant segment of potential users just lives with the friction — they don't even know voice-to-text tools exist for Windows, or they tried the built-in option and gave up. ScreenSpeak's demo-first marketing strategy (sharing the terminal magic moment) is designed to make "do nothing" feel obviously inferior.

### Key Assumptions to Validate

We assume developers will trust a local AI model enough for sensitive terminal output. To validate: ask first 20 users explicitly whether privacy was a factor in trying ScreenSpeak. If yes, it confirms positioning. If no, reconsider how prominently to feature the privacy angle.

We assume the auto-scroll stitching for terminals is reliable enough to build on as the magic moment. To validate: test on VS Code, Windows Terminal, PowerShell, and CMD with outputs ranging from 100 to 2000 lines before any marketing. If stitching breaks on common terminals, delay the launch.

We assume users will connect their own OpenAI key once they see the quality difference. To validate: measure what % of users who trigger AI analysis add a key within 7 days of first use.

We assume the free model is attractive enough to drive downloads without a paid tier. To validate: track download-to-weekly-active conversion. If below 10%, the free offer isn't compelling enough — consider what is missing.

We assume non-developers (Morgan, James) find the voice module compelling independently of AI capture. To validate: segment feedback by persona. If non-developer feedback focuses only on voice, consider making voice and capture separately toggleable in onboarding.

We assume Whisper.cpp transcription quality on mid-range Windows hardware is fast enough (under 2s). To validate: benchmark on a range of hardware in CI before launch. If speed on low-end machines is poor, consider a cloud fallback option for users without Whisper-capable hardware.

We assume the system tray + global hotkey UX is intuitive without a tutorial. To validate: first-run user testing with 3–5 people. If they can't trigger voice or capture without help within 60 seconds of install, the default hotkeys or tray icon need rethinking.

### User Journey Map

**Awareness:** Alex sees a short clip on X showing a developer press a key, their terminal get captured, and an AI explanation appear in a floating panel. He thinks "that's exactly what I need." No long explanation required — the demo does the work. He clicks the GitHub link or Product Hunt listing.

**Consideration:** Alex reads the README or product page. Key questions he's asking: Does this work on Windows? Is it free? Does it collect my data? Is there a catch? ScreenSpeak's positioning answers all four immediately: Windows-first, free, local-first, no account required.

**Installation:** Alex downloads the .exe installer, runs it. No registration, no license key. The system tray icon appears. A minimal first-run notification shows the two default hotkeys and says "You're ready." Time from download to ready: under 2 minutes.

**First use (Voice):** Alex tries the voice hotkey in a Slack message. He holds Ctrl+Shift+Space, speaks a sentence, releases, and sees it appear at his cursor. He smiles. This is the first micro-magic moment — smaller than the terminal magic, but immediate.

**Magic moment (Capture + AI):** The next time Alex hits a terminal error, he remembers ScreenSpeak. He presses the capture hotkey, sees the auto-scroll indicator, watches the terminal capture itself, and 8 seconds later reads an AI explanation in the floating panel. He clicks "Copy Fix" and pastes it back into his terminal. He tells his colleague about it within the hour.

**Habit formation:** Over the next two weeks, Alex uses voice-to-text daily for Slack and emails. He uses screen capture 2–3 times per week for errors and documentation. The app becomes invisible in the best sense — it's just part of how his computer works now.

**Advocacy:** Alex posts a short clip in his developer Discord. Three people download it the same day. He opens a GitHub issue requesting multi-monitor capture support. This is the conversion from user to contributor — the signal the product has become real.

---

## 3. Product Strategy

### Product Principles

**The hotkey triggers everything.** No feature requires touching the tray icon, navigating a menu, or leaving the current application. If a feature can't be hotkey-triggered, it's a settings feature — not a core feature.

**Local model quality is the floor, not the ceiling.** The local AI experience (Whisper for voice, Ollama/LLaVA for capture analysis) must be genuinely useful, not merely functional. If a local model produces embarrassing output on a common use case (simple terminal error, short spoken phrase), it needs a better model before launch — not a disclaimer.

**The result panel is ephemeral.** AI analysis results appear in a floating, dismissible overlay that doesn't require the user to "open an app." It appears, is read, and is dismissed or copied. The mental model is a tooltip with superpowers, not a persistent application window.

**Capture quality before AI quality.** If the screenshot is blurry, mis-stitched, or incomplete, the AI analysis is useless regardless of model quality. Capture reliability is the prerequisite. Test stitching across every common terminal and IDE before the AI layer is built on top.

**Never interrupt an existing workflow.** ScreenSpeak should integrate invisibly into what the user is already doing. It does not reposition windows, change focus unexpectedly, play intrusive sounds, or display persistent banners. The only exception: the first-run welcome notification, which appears once.

### Market Differentiation

The screenshot and voice-to-text markets are both established — there are good tools in each. ScreenSpeak's bet is that the combination plus local-first operation creates a category that doesn't exist yet.

Wispr Flow is the benchmark for voice quality. ShareX is the benchmark for capture breadth. Neither does AI analysis. Neither chains voice + capture + AI. And neither is free to run indefinitely without a server cost someone pays.

ScreenSpeak's differentiation is structural: because it runs entirely on-device, there's no marginal cost per user for the developer. That makes the free tier genuinely sustainable. A cloud-based competitor would need to charge to cover inference costs. ScreenSpeak's local-first architecture is a business model advantage, not just a privacy feature.

The defensibility increases over time: as users train their workflows around ScreenSpeak's hotkeys, configure their preferred models, and accumulate captured knowledge, the switching cost grows. The goal in v1 is not to be unbeatable — it's to be indispensable enough that users never look for an alternative.

### Magic Moment Design

The magic moment is: developer sees a terminal error → presses one hotkey → ScreenSpeak auto-scrolls and stitches the full terminal → local AI returns a plain-English explanation with suggested fix → developer copies the fix → all in under 10 seconds.

For this moment to work reliably, the following must be true: auto-scroll capture works correctly on Windows Terminal, CMD, PowerShell, and the VS Code integrated terminal. The scroll capture completes before the stitching begins. The stitched image is clean (no seams, no repeated content from scroll overlap). The local AI model (LLaVA or Qwen2-VL via Ollama) can reliably read code text from screenshots. The result panel appears floating above the active window without stealing focus. The "Copy Fix" action puts the suggested code on the clipboard immediately.

The path from install to this magic moment is: install app → default hotkeys active → press capture hotkey in VS Code terminal → select "auto-scroll" mode → watch it work. No configuration required. This path must work out of the box.

### MVP Definition

**Voice-to-text with global hotkey.** Press and hold hotkey, speak, release to paste at cursor. Uses Whisper.cpp for offline transcription. Configurable hotkey in settings. Works in any Windows app that accepts keyboard input. This is P0 — without it, ScreenSpeak is only a screenshot tool.

**Screenshot capture (region, window, full desktop).** Three basic capture modes accessible from a quick-pick overlay. Region: click-drag to select. Window: click a window to capture. Full desktop: capture entire screen. These are the foundation the auto-scroll mode builds on.

**Auto-scroll capture for terminals and IDEs.** The magic moment feature. Triggers automated scrolling via Windows input simulation, captures frame-by-frame, stitches into a single tall image. Works on Windows Terminal, CMD, PowerShell, VS Code terminal. This is the killer differentiator.

**Local AI analysis via Ollama.** After any capture, the image is sent to the locally running Ollama instance (LLaVA or Qwen2-VL model). The result appears in the floating panel with: summary, extracted text, and a "Copy" button. If Ollama isn't running or installed, the panel shows a helpful prompt to set it up.

**Floating result panel.** A frameless, always-on-top Electron window that shows the captured screenshot thumbnail and AI response. Dismisses on Escape or clicking outside. Includes Copy Text, Copy Image, and Dismiss actions.

**Settings panel.** Minimal settings screen: configure voice hotkey, configure capture hotkey, enter optional OpenAI API key for cloud AI, select AI mode (local / cloud / ask each time), check for updates.

**System tray integration.** App starts with Windows, lives in system tray, provides a right-click menu with: Open Settings, About, Quit. Left-click opens settings.

### Explicitly Out of Scope

**Browser companion extension.** Full-page web capture (GoFullPage-style) requires a browser extension to capture content below the fold reliably. This adds meaningful scope: extension development, Chrome Web Store review, version management. Defer to Phase 2. Native OS capture covers most use cases for the developer audience.

**Mac support.** macOS requires separate APIs for screen capture permissions, accessibility permissions, and global shortcuts. Building Mac support simultaneously doubles QA scope. Defer to Phase 2 after Windows is proven.

**Cloud sync of screenshots or transcripts.** Storing user content in the cloud requires backend infrastructure, privacy compliance, and ongoing costs. Conflicts with the local-first philosophy. Defer indefinitely unless users specifically request it.

**Team features or shared workspaces.** Not relevant for a solo productivity tool at this stage. Revisit at 5,000+ users if team use cases emerge organically.

**Video recording.** Screen recording is a different product with different tooling (ffmpeg pipeline, video storage, playback UI). Not in scope for v1 even if users request it.

**Payments integration.** Free in v1. Polar or Lemon Squeezy will be added in Phase 2 once there's a validated usage signal. Adding payments too early creates complexity and may discourage downloads.

### Feature Priority (MoSCoW)

**Must Have (MVP):** System tray app, voice-to-text via Whisper.cpp, region/window/desktop screenshot, auto-scroll terminal capture, local AI analysis via Ollama, floating result panel, settings with hotkey config and optional OpenAI key, Windows installer.

**Should Have (Phase 2):** Cloud AI via user's own OpenAI key (settings UI exists in v1, but feature fully built in Phase 2), OCR text extraction from any screenshot, "Ask a question" free-text input in the result panel, capture history (last 10 captures), browser extension for full-page web capture.

**Could Have (Phase 3):** AI-powered redaction of sensitive info before sharing, multi-monitor capture selection, custom Ollama model selection in settings, keyboard shortcut to re-analyze a saved capture with a new prompt, export result as PDF or markdown.

**Won't Have (this version):** Mobile app, team collaboration, video recording, cloud storage, mandatory account/login.

### Core User Flows

**Flow 1 — Voice to Text**
Trigger: User is in any Windows app (Slack, VS Code, browser) and wants to type without typing.
Steps: 1) Hold Ctrl+Shift+Space. 2) Floating mic indicator appears. 3) Speak sentence. 4) Release hotkey. 5) Whisper transcribes locally. 6) Text is pasted at cursor.
Outcome: Text appears in the active app within 2 seconds of hotkey release.
Success criteria: Text is 95%+ accurate for clear English speech. No app focus lost. Time from release to paste under 2s on mid-range hardware.

**Flow 2 — Auto-Scroll Terminal Capture + AI Analysis**
Trigger: User sees a terminal error in VS Code, Windows Terminal, or CMD.
Steps: 1) Press Ctrl+Shift+S. 2) Quick-pick shows capture modes. 3) User selects "Auto-scroll." 4) User clicks the target terminal window. 5) ScreenSpeak scrolls and captures. 6) Floating result panel appears with AI summary and explanation. 7) User clicks "Copy Fix."
Outcome: A plain-English explanation with suggested code fix is on the clipboard within 10 seconds of clicking the terminal.
Success criteria: Stitch produces a single clean image. AI identifies the error type and suggests a plausible fix. Result panel appears without stealing focus from VS Code.

**Flow 3 — Quick Region Capture + AI**
Trigger: User wants to ask a question about something visible on screen.
Steps: 1) Press Ctrl+Shift+S. 2) Select "Region" mode. 3) Click-drag to select area. 4) Result panel appears with AI analysis. 5) User reads summary and dismisses.
Outcome: AI describes or summarizes the selected region. User stays in their current app.
Success criteria: Region selection is pixel-accurate. AI response is relevant to the content in the selected region. Panel dismisses cleanly on Escape.

### Success Metrics

**Primary metric:** Weekly Active Users (WAU) — the one number that captures whether people come back. Target: 50 WAU at 90 days.

**Secondary metrics:** Downloads (leading indicator — target 500 at 90 days), Voice-to-text sessions per WAU per week (engagement — target 5+), AI capture sessions per WAU per week (engagement — target 2+), OpenAI key connection rate (power user signal — target 15% of WAU), GitHub stars (community signal — target 200 at 90 days).

**Good vs. Great thresholds:** WAU retention week-over-week above 60% = good, above 75% = great. Time-to-magic-moment (install to first AI capture) under 5 minutes = good, under 2 minutes = great.

### Risks

**Risk 1 — Auto-scroll stitching is fragile.** Different terminals handle scroll behavior differently. CMD, Windows Terminal, and VS Code's integrated terminal may scroll at different speeds or have variable content. Mitigation: Build a test suite that runs stitching against all four major Windows terminals before launch. Ship with a "capture visible only" fallback if auto-scroll fails.

**Risk 2 — Whisper.cpp speed on low-end hardware.** On machines with less than 8GB RAM or older CPUs, Whisper inference may exceed the 2-second target. Mitigation: Benchmark on low-end hardware during development. Offer Whisper Tiny model (fastest, less accurate) as the default, with Whisper Base and Small as opt-in upgrades in settings.

**Risk 3 — Ollama setup friction.** Ollama requires a separate install and model download. Users who don't have it will see a degraded experience on first capture. Mitigation: Detect if Ollama is running at startup. If not, show a one-time setup prompt with a direct download link and instructions. Make the setup feel like 2 steps, not 10.

**Risk 4 — Windows permissions and antivirus flags.** Screen capture, global keyboard hooks, and input simulation (for auto-scroll) can trigger Windows security warnings and antivirus false positives. Mitigation: Code-sign the installer from day one. Document known antivirus workarounds in the README. Use Electron's official desktopCapturer API rather than low-level hooks where possible.

**Risk 5 — Local LLaVA quality on code/terminal content.** LLaVA-style models are trained on general visual content and may struggle with small-font terminal text in dark themes. Mitigation: Test with the best available local vision model before launch (Qwen2-VL is stronger than LLaVA on text-heavy content as of 2026). If local quality is insufficient for the terminal use case, make cloud AI the default for capture until local models improve.

**Risk 6 — Electron binary size and startup time.** Electron apps can be 100–200MB and take 3–5 seconds to cold-start. Mitigation: Use Electron's background startup (launch with Windows, minimize to tray immediately). Users should never see the app "loading" — it should already be running by the time they first press a hotkey.

**Risk 7 — Developer adoption without a web presence.** GitHub and Product Hunt are the primary GTM channels. If the launch doesn't get traction in the first 48 hours, organic growth slows significantly. Mitigation: Prepare the demo video before launch. Identify 5–10 developer communities where sharing would be appropriate and plan a coordinated release day post across all of them simultaneously.

---

## 4. Brand Strategy

### Positioning Statement

For Windows power users and developers who lose focus every time they switch apps to get AI help, ScreenSpeak is the desktop utility that brings voice transcription and AI screen analysis directly to wherever they're working. Unlike voice tools that don't capture and screenshot tools that don't think, ScreenSpeak combines both in a single, always-running, local-first system tray app — no subscription, no data upload, no friction.

### Brand Personality

ScreenSpeak is the brilliant, quiet colleague who knows exactly when to help and never overstays their welcome. They don't have a flashy desk or a loud personality. They have three monitors, a mechanical keyboard, custom shell scripts, and the fastest setup in the office. When you ask them a question, they answer it in one sentence — correct, no filler. They've already thought of the edge case you haven't mentioned yet.

In practice: ScreenSpeak's personality shows up in short, confident UI copy. In an error state, it says "Capture failed" — not "Oops! Something went wrong 😟 Try again later." In a success state, it says "AI ready" — not "Great news! Your screenshot has been analyzed!" The app knows what it is. It doesn't need to perform enthusiasm.

This personality is consistent whether in the product, the README, the Product Hunt listing, or social posts. The voice is always precise, slightly dry, technically credible. It would never use the word "revolutionary." It would use the word "reliable."

### Voice & Tone Guide

The voice is constant: direct, technically credible, never corporate, never cutesy. Tone shifts by context:

| Context | DO | DON'T |
|---|---|---|
| Onboarding / first run | "Set your hotkeys. You're ready." | "Welcome to ScreenSpeak! Let's get you set up with a quick tour! 🎉" |
| Error states | "Capture failed — window may be minimized." | "Oops! Something went wrong. Please try again." |
| Success states | "Captured. AI ready." | "Awesome! Your screenshot has been analyzed successfully!" |
| Settings labels | "Voice hotkey", "AI model", "OpenAI key (optional)" | "Configure your preferred dictation shortcut", "Choose your artificial intelligence provider" |
| Marketing copy | "Terminal errors explained in 10 seconds. No browser tab required." | "Revolutionize your workflow with cutting-edge AI-powered screenshot technology!" |
| Empty states | "No captures yet. Press Ctrl+Shift+S to start." | "It looks like you haven't taken any screenshots yet! Why not give it a try?" |

### Messaging Framework

**Tagline:** Speak. Capture. Understand.

**Homepage headline:** Your AI co-pilot lives in your taskbar. No subscription. No browser tab. No context switch.

**Value propositions:**
1. *Voice to text, anywhere.* Whisper-powered transcription that works in every Windows app — email, IDE, browser, Slack. Speak and it types.
2. *AI that reads your screen.* Capture a terminal error, a document, a webpage, or any window — and get an instant AI explanation without copying a single character.
3. *Your machine. Your data.* Everything runs locally by default. No account. No cloud. No cost to run — forever.

**Objection handlers:**
- *"Is local AI good enough?"* For most terminal errors and screen analysis tasks, yes. And you can plug in your own OpenAI key for GPT-4o quality whenever you want — one setting, your API call, no middleman.
- *"Why not just use ChatGPT?"* Because opening a browser tab breaks your focus. ScreenSpeak keeps the AI result in the same screen as your work.
- *"Is it really free?"* Yes. The app runs entirely on your machine. There are no server costs for the developer, so there's no reason to charge. A paid tier for advanced features will come later — but the core will always be free.

### Elevator Pitches

**5 seconds:** ScreenSpeak — voice to text and AI screen capture in one Windows hotkey.

**30 seconds:** ScreenSpeak is a Windows desktop app that gives you two superpowers: speak anywhere to type (no more hunt-and-peck), and capture anything on your screen to get instant AI analysis. It runs entirely on your machine — no sign-up, no subscription, no data leaving your computer. The magic moment is a developer hitting a terminal error, pressing one key, and getting an AI fix in 8 seconds without opening a browser tab.

**2 minutes:** Every developer I know has the same habit: they hit an error, copy it, alt-tab to ChatGPT, paste it in, wait, read the answer, alt-tab back. It works — but it's friction. Thirty times a day, you're breaking your flow to manage an AI interaction that should be invisible. ScreenSpeak collapses that loop into a single hotkey. Press it on your terminal, and within 10 seconds you have a plain-English explanation and a suggested fix — without leaving VS Code. It also does system-wide voice dictation using OpenAI's Whisper model running locally, so you can speak into any app — Slack, Gmail, your IDE — and the text appears at your cursor. No cloud, no subscription, no account. It runs on your machine, it's free, and it works today on Windows. We're building it in public and launching this month. Try the beta.

### Competitive Differentiation Narrative

The productivity software market has a missing product. Voice tools exist (Wispr Flow, OpenWhispr) and screenshot tools exist (ShareX, Snipping Tool) — but no one has combined them with local AI in a single lightweight desktop experience. Every AI-powered productivity tool either requires cloud infrastructure (which means subscription fees) or handles only one input type.

ScreenSpeak's insight is structural: because Whisper.cpp runs on-device and Ollama runs on-device, the marginal cost of an additional ScreenSpeak user to the developer is zero. That's not a temporary promotional strategy — it's a permanent structural advantage. Cloud-dependent competitors cannot match a free tier that's actually free to deliver.

The terminal diagnosis use case is also unaddressed by any existing tool. Developers who hit errors routinely break their flow to get AI help. ScreenSpeak's auto-scroll capture + local AI analysis turns this from a 45-second context switch into an 8-second hotkey press. That's a 5x improvement in a workflow that happens dozens of times per workday for the target user.

### Brand Anti-Patterns

**Never use corporate or bloatware language.** Words like "leverage," "synergy," "solution," "streamline," "empower," and "ecosystem" are banned. ScreenSpeak is a tool. It captures screens and transcribes voice. Describe it plainly.

**Never require a sign-up before delivering value.** If the app asks for an email address before the user has experienced the magic moment, we've lost them. Account creation belongs in settings, optional, after the user has already seen the value.

**Never display progress bars, loading screens, or spinners that suggest the app is "waking up."** The app lives in the tray. It's always running. When the user presses a hotkey, the response should feel instant — under 500ms for voice start, under 1 second for capture mode activation.

**Never use stock imagery of smiling people at computers.** ScreenSpeak's visual identity should be dark, precise, and technical. A terminal screenshot, a clean UI screenshot, or an abstract representation of the tool's output — never a staged office photo.

**Never send a notification the user didn't ask for.** Push notifications for "tips," "streaks," or "you haven't used ScreenSpeak in 3 days" will be uninstalled immediately by the target audience. The only permitted notification is the one-time first-run setup message.

---

## 5. Design Direction

### Design Philosophy

**Utility over decoration.** Every visual element must justify its existence by serving a function. No gradients, no illustrations, no decorative animations. The aesthetic is a byproduct of precision, not a layer applied on top.

**Dark is the default and the priority.** ScreenSpeak lives in the workflow of developers who use dark-themed IDEs and terminals all day. A light theme would feel like a flashbang. Dark mode is not an option — it's the product's visual identity. Light mode can come in Phase 2.

**Information density over breathing room.** The result panel is used quickly and dismissed. It should show maximum useful information in minimum space — no excessive padding, no large whitespace sections. Think "VS Code output panel," not "Notion page."

**Interface components feel like tools, not widgets.** Buttons are rectangular with clear affordances. Inputs have visible borders. There are no rounded pill buttons or bubbly cards. The visual vocabulary is precise and angular — controlled, not playful.

### Visual Mood

ScreenSpeak looks like it was designed by someone who lives in VS Code and reads Linear's changelog for fun. The primary canvas is a deep, slightly blue-tinted dark (#1E1E2E — Catppuccin Mocha base, already familiar to a huge developer audience). Surfaces are layered darker-to-lighter as they come forward (#181825, #1E1E2E, #2A2A3E). Text is near-white (#CDD6F4) with muted secondary text (#6C7086). The single accent color is a precise blue-violet (#7C3AED) used only for interactive elements, hotkey indicators, and the recording state indicator. Everything else is monochrome.

The energy is "sharp minimal." This is not a brutalist aesthetic — there is visual refinement. But every element earns its place. The floating result panel has a 1px border and a subtle shadow, but no blur, no gradient, no rounded excess.

### Color Palette

| Role | Name | Hex | CSS Variable | Tailwind Key | Usage |
|---|---|---|---|---|---|
| Primary | Violet | `#7C3AED` | `--color-primary` | `primary` | Buttons, active states, recording indicator, hotkey chips |
| Primary Hover | Violet Dark | `#6D28D9` | `--color-primary-hover` | `primary-hover` | Button hover state |
| Background | Base | `#1E1E2E` | `--color-background` | `bg-base` | App background, result panel background |
| Surface 1 | Mantle | `#181825` | `--color-surface-1` | `surface-1` | System tray menu background, modal backgrounds |
| Surface 2 | Crust | `#11111B` | `--color-surface-2` | `surface-2` | Deepest backgrounds, borders |
| Surface 3 | Overlay | `#2A2A3E` | `--color-surface-3` | `surface-3` | Hover backgrounds on list items |
| Text | Lavender | `#CDD6F4` | `--color-text` | `text-primary` | Primary text |
| Text Muted | Subtext | `#6C7086` | `--color-text-muted` | `text-muted` | Secondary labels, placeholders |
| Border | Overlay0 | `#3A3A5C` | `--color-border` | `border` | Panel borders, input borders, dividers |
| Success | Green | `#A6E3A1` | `--color-success` | `success` | Successful capture indicator |
| Warning | Yellow | `#F9E2AF` | `--color-warning` | `warning` | Ollama not running, slow performance alerts |
| Error | Red | `#F38BA8` | `--color-error` | `error` | Capture failed, transcription error states |
| Info | Blue | `#89DCEB` | `--color-info` | `info` | Informational tooltips, model status |

### Typography

**Heading font:** Inter (Google Fonts) — clean, neutral, technically credible. Used for panel titles, mode labels, setting section headers.

**Body font:** Inter — same family for consistency. Distinguish via weight and size, not family switch.

**Mono font:** JetBrains Mono (Google Fonts) — for all code content in AI responses, terminal captures, OCR output, hotkey labels. Non-negotiable for the developer audience.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --font-heading: 'Inter', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --text-xs:   0.75rem;   /* 12px — captions, status labels */
  --text-sm:   0.875rem;  /* 14px — secondary text, settings labels */
  --text-base: 1rem;      /* 16px — primary body text */
  --text-lg:   1.125rem;  /* 18px — panel titles */
  --text-xl:   1.25rem;   /* 20px — settings section headers */
  --text-2xl:  1.5rem;    /* 24px — modal titles */

  --font-weight-normal:   400;
  --font-weight-medium:   500;
  --font-weight-semibold: 600;

  --line-height-tight:  1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.625;
}
```

### Spacing & Layout

Base unit: 4px. All spacing is a multiple of 4px.

```
4px   — between inline elements (icon + label)
8px   — within component padding (button padding, input padding)
12px  — between related items in a list
16px  — standard component gap, section internal padding
24px  — between sections within a panel
32px  — major section separation
48px  — panel edge padding on larger views
```

Result panel max-width: 480px. Settings window: 560px wide × 480px tall. Floating result panel: 460px wide, variable height (min 200px, max 600px before scrolling).

Responsive breakpoints are not relevant — this is a fixed desktop application with defined window sizes.

### Component Philosophy

**Buttons:** Full-width in panels, rectangular with 6px border-radius (subtle, not pill). Padding: 8px 16px. Two variants: Primary (filled violet), Ghost (transparent with visible border). No shadow on buttons — flat design.

**Inputs:** 1px border in `--color-border`. Background: `--color-surface-1`. Padding: 8px 12px. 4px border-radius. On focus: border color shifts to `--color-primary`. Monospace font for API key input fields.

**Cards/panels:** 1px border, `--color-border`. Background: `--color-background`. No rounded corners beyond 6px. Subtle drop shadow: `0 4px 16px rgba(0,0,0,0.4)`.

**Hotkey chips:** Inline monospace label, surface-3 background, 4px border-radius, 4px 8px padding. Used for displaying keyboard shortcuts throughout the UI.

**Status indicators:** 8px dot with color-coded fill (success/warning/error/info) + text label. No icons for simple status — dot is sufficient.

### Iconography & Imagery

Icon library: Lucide Icons (consistent with React ecosystem, outline style, MIT license). All icons rendered at 16px or 20px. Stroke width: 1.5px. Color: `--color-text-muted` for inactive, `--color-text` for active, `--color-primary` for interactive icons.

No illustrations. No stock photography. No screenshots of people using the app. Product screenshots (actual UI) are the only imagery used in marketing and README.

### Accessibility Commitments

- WCAG 2.1 AA contrast ratio: all text must meet 4.5:1 against its background. `--color-text` (#CDD6F4) on `--color-background` (#1E1E2E) achieves 10.5:1. Muted text (#6C7086) on background achieves 3.8:1 — use only for non-essential labels, never for content text.
- All interactive elements must be keyboard navigable. Tab order follows visual order. Focus indicators: 2px solid `--color-primary` outline, 2px offset.
- Minimum click target: 32px × 32px for all interactive elements.
- Screen reader support for the result panel (ARIA live regions for AI response content, role="dialog" for the floating panel).
- No color-only communication: all status states use both a color indicator and a text label.

### Motion & Interaction

Transitions are minimal and functional. No decorative animations.

```css
:root {
  --transition-fast:   100ms ease;   /* focus states, hover color changes */
  --transition-normal: 200ms ease;   /* panel open/close, button press */
  --transition-slow:   300ms ease;   /* result panel slide-in */
}
```

The floating result panel slides in from the bottom-right of the screen using a `translateY(8px) → translateY(0)` + `opacity 0 → 1` transition at `--transition-slow`. Dismissal is `opacity 1 → 0` at `--transition-normal` (faster dismiss than appear).

Hover states: background color shift only, no transform/scale. Active states: 5% brightness reduction on buttons. No bounce, no spring, no easing overrides.

Loading state for AI analysis: a single animated dot sequence (`Analyzing...`) in the result panel body — no spinner, no skeleton. The dot animation is `opacity` pulsing at 1.5s interval.

### Design Tokens

Complete reference table for implementation:

| Token | CSS Variable | Tailwind Class | Value |
|---|---|---|---|
| Primary | `--color-primary` | `bg-primary` / `text-primary` | `#7C3AED` |
| Primary Hover | `--color-primary-hover` | `hover:bg-primary-hover` | `#6D28D9` |
| Background | `--color-background` | `bg-base` | `#1E1E2E` |
| Surface 1 | `--color-surface-1` | `bg-surface-1` | `#181825` |
| Surface 2 | `--color-surface-2` | `bg-surface-2` | `#11111B` |
| Surface 3 | `--color-surface-3` | `bg-surface-3` | `#2A2A3E` |
| Text Primary | `--color-text` | `text-primary` | `#CDD6F4` |
| Text Muted | `--color-text-muted` | `text-muted` | `#6C7086` |
| Border | `--color-border` | `border-border` | `#3A3A5C` |
| Success | `--color-success` | `text-success` | `#A6E3A1` |
| Warning | `--color-warning` | `text-warning` | `#F9E2AF` |
| Error | `--color-error` | `text-error` | `#F38BA8` |
| Info | `--color-info` | `text-info` | `#89DCEB` |
| Font Heading | `--font-heading` | `font-heading` | `'Inter', system-ui, sans-serif` |
| Font Body | `--font-body` | `font-body` | `'Inter', system-ui, sans-serif` |
| Font Mono | `--font-mono` | `font-mono` | `'JetBrains Mono', monospace` |
| Text XS | `--text-xs` | `text-xs` | `0.75rem` |
| Text SM | `--text-sm` | `text-sm` | `0.875rem` |
| Text Base | `--text-base` | `text-base` | `1rem` |
| Text LG | `--text-lg` | `text-lg` | `1.125rem` |
| Text XL | `--text-xl` | `text-xl` | `1.25rem` |
| Transition Fast | `--transition-fast` | — | `100ms ease` |
| Transition Normal | `--transition-normal` | — | `200ms ease` |
| Transition Slow | `--transition-slow` | — | `300ms ease` |
| Radius SM | `--radius-sm` | `rounded-sm` | `4px` |
| Radius MD | `--radius-md` | `rounded` | `6px` |
| Shadow Panel | `--shadow-panel` | — | `0 4px 16px rgba(0,0,0,0.4)` |
| Space 1 | `--space-1` | `p-1` / `gap-1` | `4px` |
| Space 2 | `--space-2` | `p-2` / `gap-2` | `8px` |
| Space 3 | `--space-3` | `p-3` / `gap-3` | `12px` |
| Space 4 | `--space-4` | `p-4` / `gap-4` | `16px` |
| Space 6 | `--space-6` | `p-6` / `gap-6` | `24px` |
| Space 8 | `--space-8` | `p-8` / `gap-8` | `32px` |
