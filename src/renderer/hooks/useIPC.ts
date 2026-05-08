import type { ElectronAPI } from '../../preload'

export function useIPC(): ElectronAPI {
  return window.electronAPI
}
