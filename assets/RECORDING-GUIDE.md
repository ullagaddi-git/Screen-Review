# How to record the demo GIF

The README's hero section will eventually embed `assets/demo.gif` showing the
"magic moment" — capture a Python traceback in a terminal, get an AI
explanation in 3 seconds. This guide is the recipe.

## The script (20–30 seconds total)

| Beat | Time | What's on screen |
|---|---|---|
| 1 | 0–3 s | VS Code with a Python file producing a `KeyError: 'user_id'` in the integrated terminal. Cursor is in the terminal. |
| 2 | 3–5 s | Press `Ctrl+Shift+S`. Mode picker appears at the bottom of the screen, "Region" focused (violet ring around it). |
| 3 | 5–7 s | Press `→ → →` to focus "Auto-scroll". Press `Enter`. |
| 4 | 7–8 s | Click on the terminal pane (the auto-scroll target). |
| 5 | 8–12 s | Brief "Analyzing…" loading state in the result panel (bottom-right of screen). |
| 6 | 12–18 s | Result panel populates with: "**KeyError** means a Python dictionary lookup failed because the key wasn't present. The fix: use `.get('user_id')` to return `None` if missing, or check `if 'user_id' in user_data:` before accessing." |
| 7 | 18–20 s | Click "Copy text" button. Tooltip flashes "Copied!" |

## Recording tools

Pick one:

- **[ScreenToGif](https://www.screentogif.com/)** — Windows-only, free, open
  source. Best for this use case. Records to GIF directly with a precise
  area selector.
- **[Gifski](https://gif.ski/)** — paid (~$5), produces noticeably smaller +
  higher-quality GIFs. Take an MP4 first (OBS or Windows Game Bar Win+G),
  then convert. Recommended if file size matters.
- **OBS Studio** + ffmpeg — for control freaks. Record MP4 at 30 fps, then:
  ```powershell
  ffmpeg -i demo.mp4 -vf "fps=15,scale=720:-1:flags=lanczos,palettegen=stats_mode=full" palette.png
  ffmpeg -i demo.mp4 -i palette.png -filter_complex "fps=15,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse" demo.gif
  ```

## Constraints

- **Width:** 720 px max (GitHub markdown rendering caps at ~700 px useful
  width on most viewports).
- **File size:** under 5 MB (GitHub will refuse to inline-render larger).
  If you blow past 5 MB, drop frame rate from 15 → 10 fps, or shorten the
  result-panel reading time in beat 6.
- **Length:** under 30 s. Anyone watching a demo GIF for longer than that
  will scroll past.
- **No audio.** It's a GIF. Make the visuals self-explanatory.

## After recording

1. Save the file as `assets/demo.gif`.
2. Update the README hero section: replace the comment block at the top
   with `![demo](assets/demo.gif)` (no width/height attrs — GitHub
   markdown handles scaling).
3. Verify it renders by opening the README on github.com (the local VS Code
   preview won't trigger GitHub's image proxy correctly).

## Re-recording for v1.x

If the UI changes (different result-panel layout, new mode-picker hint
text, etc.), re-record. A stale GIF on the README is worse than no GIF —
it sets wrong expectations and looks neglected.
