export interface RegionRect {
  x: number
  y: number
  w: number
  h: number
}

export interface RegionBridge {
  complete: (rect: RegionRect) => Promise<{ ok: boolean }>
  cancel: () => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    regionBridge: RegionBridge
  }
}

export {}
