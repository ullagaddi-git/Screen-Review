/**
 * Hidden renderer that captures microphone audio via Web Audio API,
 * resamples to 16 kHz mono int16 PCM, packages as WAV, and sends the
 * buffer to the main process. The window is never shown to the user.
 *
 * Two modes:
 *   - Batch (default): accumulate the entire recording in memory, send
 *     one big WAV at stop via `recorder:audio`. Main runs whisper-cli
 *     once and pastes the full transcript.
 *   - Stream (when `streamMode=true`): every ~3 s of accumulated audio,
 *     encode a WAV chunk and emit via `recorder:audio-chunk` while
 *     recording continues. Residual audio at stop goes out via the
 *     normal `recorder:audio` channel — main routes it as one more
 *     chunk in stream mode.
 *
 * The audio capture pipeline (AudioContext, getUserMedia, ScriptProcessor)
 * is identical in both modes. Only the buffer-flush behavior differs.
 */

export {}

const SAMPLE_RATE = 16000
/** Fallback if main forgets to send a value. Matches main's DEFAULT_MAX_RECORDING_SECONDS. */
const FALLBACK_MAX_SECONDS = 300
/** Stream mode: how much audio to accumulate before emitting a chunk. */
const STREAM_CHUNK_SECONDS = 3

let audioCtx: AudioContext | null = null
let micStream: MediaStream | null = null
let systemStream: MediaStream | null = null
/**
 * In meeting mode, we mix mic + system audio into a single MediaStream
 * via Web Audio (MediaStreamAudioDestinationNode). `processor` reads
 * from this mixed stream; in non-meeting mode, processor reads directly
 * from `micStream`.
 */
let mixedDestination: MediaStreamAudioDestinationNode | null = null
let processor: ScriptProcessorNode | null = null
let micSource: MediaStreamAudioSourceNode | null = null
let systemSource: MediaStreamAudioSourceNode | null = null
let chunks: Float32Array[] = []
let recording = false
let stopTimer: ReturnType<typeof setTimeout> | null = null
/**
 * True if this session was started with stream mode on. Determines
 * whether interim chunks are emitted to `recorder:audio-chunk` during
 * recording. Captured at start so a mid-session config change doesn't
 * confuse the buffer state.
 */
let streamMode = false
/** Meeting mode = stream mode + system audio capture (in addition to mic). */
let meetingMode = false
/** Number of samples currently buffered toward the next stream chunk. */
let streamChunkSamples = 0
/**
 * Tracks an in-flight startRecording() so a quickly-following stopRecording()
 * waits for the async setup (getUserMedia, AudioContext) to finish before
 * tearing down. Without this, a fast hotkey press-release returned 0 bytes
 * because `recording` was still false when stop arrived.
 */
let startInProgress: Promise<void> | null = null

async function startRecording(
  maxSeconds: number = FALLBACK_MAX_SECONDS,
  streamModeArg = false,
  meetingModeArg = false
): Promise<void> {
  if (recording) return
  if (startInProgress) return startInProgress

  // Mark recording=true synchronously so an immediately-following stop sees
  // we're "recording" and waits for the setup promise instead of returning empty.
  recording = true
  chunks = []
  streamMode = streamModeArg
  meetingMode = meetingModeArg
  streamChunkSamples = 0

  startInProgress = (async () => {
    try {
      audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE })
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      // In meeting mode, also capture system audio (loopback) and mix
      // it with the mic via Web Audio. The main process's
      // setDisplayMediaRequestHandler returns loopback audio for any
      // getDisplayMedia request — we ask for video + audio but throw
      // away the video tracks immediately.
      if (meetingMode) {
        try {
          systemStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true
          })
          // Discard video tracks — we only want audio.
          for (const t of systemStream.getVideoTracks()) t.stop()
        } catch (err) {
          // System audio capture failed (no source available, user denied,
          // etc.). Fall back to mic-only meeting recording — better partial
          // capture than nothing. Surface a warning so the user knows.
          systemStream = null
          window.recorderBridge.sendError(
            `System audio unavailable — recording mic only. (${(err as Error).message})`
          )
        }
      }
    } catch (err) {
      // Mic getUserMedia failed — surface the error and reset state.
      recording = false
      window.recorderBridge.sendError(
        `Microphone access failed: ${(err as Error).message}`
      )
      return
    }

    micSource = audioCtx.createMediaStreamSource(micStream)
    processor = audioCtx.createScriptProcessor(4096, 1, 1)

    // Route audio into the processor. In meeting mode with a working
    // system stream, mix mic + system via a destination node and feed
    // the mix into the processor. Otherwise the processor reads mic
    // directly.
    if (meetingMode && systemStream && systemStream.getAudioTracks().length > 0) {
      mixedDestination = audioCtx.createMediaStreamDestination()
      micSource.connect(mixedDestination)
      systemSource = audioCtx.createMediaStreamSource(systemStream)
      systemSource.connect(mixedDestination)
      const mixedSource = audioCtx.createMediaStreamSource(mixedDestination.stream)
      mixedSource.connect(processor)
    } else {
      micSource.connect(processor)
    }

    processor.onaudioprocess = (e) => {
      if (!recording) return
      const sample = new Float32Array(e.inputBuffer.getChannelData(0))
      chunks.push(sample)

      if (streamMode) {
        streamChunkSamples += sample.length
        if (streamChunkSamples >= STREAM_CHUNK_SECONDS * SAMPLE_RATE) {
          flushStreamChunk()
        }
      }
    }
    processor.connect(audioCtx.destination)

    stopTimer = setTimeout(() => {
      if (recording) void stopRecording()
    }, maxSeconds * 1000)
  })()

  return startInProgress
}

/**
 * Encode whatever audio we've buffered since the last flush as a WAV,
 * emit it to main via `recorder:audio-chunk`, and reset the buffer so
 * we keep accumulating fresh samples. The AudioContext keeps running —
 * we're not stopping the recording, just sectioning it.
 */
function flushStreamChunk(): void {
  if (chunks.length === 0) return
  const totalSamples = chunks.reduce((sum, c) => sum + c.length, 0)
  if (totalSamples === 0) return

  const merged = new Float32Array(totalSamples)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }

  const wav = encodeWav(merged, SAMPLE_RATE)
  window.recorderBridge.sendAudioChunk(wav.buffer as ArrayBuffer)

  // Reset for the next chunk — the next sample frame from
  // ScriptProcessor starts a fresh buffer.
  chunks = []
  streamChunkSamples = 0
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
    micSource?.disconnect()
    systemSource?.disconnect()
    mixedDestination?.disconnect()
    micStream?.getTracks().forEach((t) => t.stop())
    systemStream?.getTracks().forEach((t) => t.stop())
    await audioCtx?.close()
  } catch {
    // ignore cleanup errors
  } finally {
    processor = null
    micSource = null
    systemSource = null
    mixedDestination = null
    micStream = null
    systemStream = null
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

window.recorderBridge.onStart((maxSeconds, streamModeArg, meetingModeArg) => {
  void startRecording(maxSeconds, streamModeArg, meetingModeArg)
})

window.recorderBridge.onStop(() => {
  void stopRecording()
})

window.recorderBridge.sendReady()
