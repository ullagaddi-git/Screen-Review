// Re-exports the result panel types from src/preload/result.d.ts so main
// process code has a stable import path within main/. The actual definition
// lives in preload/ because that file is in BOTH tsconfigs' include lists.
export type { ResultPanelData } from '../../preload/result'
