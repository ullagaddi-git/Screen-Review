/**
 * Hidden renderer that captures microphone audio via Web Audio API,
 * resamples to 16 kHz mono int16 PCM, packages as WAV, and sends the
 * buffer to the main process. The window is never shown to the user.
 */

export {}

const SAMPLE_RATE = 16000
/** Fallback if main forgets to send a value. Matches main's DEFAULT_MAX_RECORDING_SECONDS. */
const FALLBACK_MAX_SECONDS = 300

let audioCtx: AudioContext | null = null
let mediaStream: MediaStream | null = null
let processor: ScriptProcessorNode | null = null
let source: MediaStreamAudioSourceNode | null = null
let chunks: Float32Array[] = []
let recording = false
let stopTimer: ReturnType<typeof setTimeout> | null = null
/**
 * Tracks an in-flight startRecording() so a quickly-following stopRecording()
 * waits for the async setup (getUserMedia, AudioContext) to finish before
 * tearing down. Without this, a fast hotkey press-release returned 0 bytes
 * because `recording` was still false when stop arrived.
 */
let startInProgress: Promise<void> | null = null

async function startRecording(maxSeconds: number = FALLBACK_MAX_SECONDS): Promise<void> {
  if (recording) return
  if (startInProgress) return startInProgress

  // Mark recording=true synchronously so an immediately-following stop sees
  // we're "recording" and waits for the setup promise instead of returning empty.
  recording = true
  chunks = []

  startInProgress = (async () => {
    try {
      audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE })
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
    } catch (err) {
      // getUserMedia failed — surface the error and reset state.
      recording = false
      window.recorderBridge.sendError(
        `Microphone access failed: ${(err as Error).message}`
      )
      return
    }

    source = audioCtx.createMediaStreamSource(mediaStream)
    processor = audioCtx.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (e) => {
      if (!recording) return
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    }
    source.connect(processor)
    processor.connect(audioCtx.destination)

    stopTimer = setTimeout(() => {
      if (recording) void stopRecording()
    }, maxSeconds * 1000)
  })()

  return startInProgress
}

async function stopRecording(): Promise<void> {
  // If a start is mid-flight, wait for getUserMedia + AudioContext setup to
  // finish before tearing down. Otherwise we'd disconnect nothing and return
  // 0 bytes for a recording the user thought they started.
  if (startInProgress) {
    try {
      await startInProgress
    } catch {
      // start failed — fall through to the !recording check below
    } finally {
      startInProgress = null
    }
  }

  if (!recording) {
    window.recorderBridge.sendAudio(new ArrayBuffer(0))
    return
  }
  recording = false
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = null
  }

  try {
    processor?.disconnect()
    source?.disconnect()
    mediaStream?.getTracks().forEach((t) => t.stop())
    await audioCtx?.close()
  } catch {
    // ignore cleanup errors
  } finally {
    processor = null
    source = null
    mediaStream = null
    audioCtx = null
  }

  if (chunks.length === 0) {
    window.recorderBridge.sendAudio(new ArrayBuffer(0))
    return
  }

  const totalSamples = chunks.reduce((sum, c) => sum + c.length, 0)
  const merged = new Float32Array(totalSamples)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }
  chunks = []

  const wav = encodeWav(merged, SAMPLE_RATE)
  window.recorderBridge.sendAudio(wav.buffer as ArrayBuffer)
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numSamples = samples.length
  const dataSize = numSamples * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)

  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  const u8 = new Uint8Array(buf)
  for (let i = 0; i < numSamples; i++) {
    const clipped = Math.max(-1, Math.min(1, samples[i]))
    const int16 = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff
    u8[44 + i * 2] = int16 & 0xff
    u8[44 + i * 2 + 1] = (int16 >> 8) & 0xff
  }
  return u8
}

window.recorderBridge.onStart((maxSeconds) => {
  void startRecording(maxSeconds)
})

window.recorderBridge.onStop(() => {
  void stopRecording()
})

window.recorderBridge.sendReady()
