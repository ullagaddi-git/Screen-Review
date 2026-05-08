type IndicatorStateHandler = (event: Event, payload: { state: string }) => void

export interface IndicatorBridge {
  onState: (handler: IndicatorStateHandler) => void
  offState: (handler: IndicatorStateHandler) => void
}

declare global {
  interface Window {
    indicatorBridge: IndicatorBridge
  }
}

export {}
