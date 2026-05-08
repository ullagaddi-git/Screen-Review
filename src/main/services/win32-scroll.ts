import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Scrolls a target window by sending WM_MOUSEWHEEL messages directly to its
 * HWND via Win32 SendMessage. This is more reliable than synthesizing wheel
 * events at the cursor position (which only works when the cursor is over a
 * scrollable region) — the message goes straight to the window's input queue
 * regardless of cursor location.
 *
 * The target is identified by its visible title. Most app windows have unique
 * titles; if multiple windows match, FindWindow returns the first one in
 * z-order, which is typically the focused one.
 */
export async function scrollWindowByTitle(
  title: string,
  direction: 'up' | 'down',
  ticks: number,
  intervalMs = 20
): Promise<{ ok: boolean; hwnd: string; reason?: string }> {
  // Escape title for safe interpolation: replace single quotes with two single
  // quotes, which is how PowerShell escapes single quotes inside single-quoted
  // strings.
  const safeTitle = title.replace(/'/g, "''")
  const delta = direction === 'up' ? 120 : -120

  // We use EnumWindows + GetWindowText to find the target by title — that
  // covers every window class (FindWindow with class=null misses legacy
  // ConsoleWindowClass, FindWindow with a specific class misses everything
  // else). The exact-match-then-substring fallback handles apps that append
  // status text to their titles.
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class W32 {
  public const int WM_MOUSEWHEEL = 0x020A;
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);
  public static IntPtr MakeWParam(int delta) { return new IntPtr(delta << 16); }
  public static IntPtr FindByTitle(string target) {
    IntPtr exact = IntPtr.Zero;
    IntPtr partial = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      var t = sb.ToString();
      if (t.Length == 0) return true;
      if (t == target) { exact = h; return false; }
      if (partial == IntPtr.Zero && t.Contains(target)) partial = h;
      return true;
    }, IntPtr.Zero);
    return exact != IntPtr.Zero ? exact : partial;
  }
}
"@
$hwnd = [W32]::FindByTitle('${safeTitle}')
if ($hwnd -eq [IntPtr]::Zero) {
  Write-Output "NO_WINDOW"
  exit 0
}
Write-Output "HWND=$($hwnd.ToInt64())"
for ($i = 0; $i -lt ${ticks}; $i++) {
  [W32]::SendMessage($hwnd, [W32]::WM_MOUSEWHEEL, [W32]::MakeWParam(${delta}), [IntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds ${intervalMs}
}
Write-Output "DONE"
`

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, maxBuffer: 1024 * 1024, timeout: 30_000 }
    )

    if (stdout.includes('NO_WINDOW')) {
      return { ok: false, hwnd: '0', reason: 'window-not-found' }
    }
    const match = stdout.match(/HWND=(\d+)/)
    const hwnd = match ? match[1] : 'unknown'
    return { ok: stdout.includes('DONE'), hwnd }
  } catch (err) {
    return {
      ok: false,
      hwnd: '0',
      reason: `powershell-failed: ${(err as Error).message}`
    }
  }
}
