import { desktopCapturer, screen } from 'electron'

export interface ScreenCapture {
  /** PNG-encoded image of the primary screen at native pixel resolution. */
  pngBuffer: Buffer
  /** Native pixel width. */
  width: number
  /** Native pixel height. */
  height: number
  /** Display scale factor (1.0, 1.25, 1.5, 2.0, etc.). */
  scaleFactor: number
  /** Display work area in DIP (matches what selection coords use in the overlay). */
  workArea: { x: number; y: number; width: number; height: number }
}

export class ScreenCaptureUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScreenCaptureUnavailableError'
  }
}

export async function capturePrimaryScreen(): Promise<ScreenCapture> {
  const display = screen.getPrimaryDisplay()
  const { width: dipW, height: dipH } = display.size
  const scaleFactor = display.scaleFactor || 1

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(dipW * scaleFactor),
      height: Math.round(dipH * scaleFactor)
    }
  })

  if (sources.length === 0) {
    throw new ScreenCaptureUnavailableError(
      'Screen capture unavailable. Check that ScreenSpeak has screen recording permission.'
    )
  }

  const primary = sources[0]
  const pngBuffer = primary.thumbnail.toPNG()
  const size = primary.thumbnail.getSize()

  return {
    pngBuffer,
    width: size.width,
    height: size.height,
    scaleFactor,
    workArea: display.workArea
  }
}
