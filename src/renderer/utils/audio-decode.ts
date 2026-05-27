// Browser-native audio decoder + re-encoder for the upload-transcribe
// feature (TASK-060). Takes a user-selected file (any format the
// browser's AudioContext can decode — MP3 / M4A / WAV / OGG / WebM /
// FLAC / MP4 video audio track) and produces the 16 kHz mono WAV that
// whisper-cli expects.
//
// Why browser-native instead of bundling ffmpeg?
//   - Zero install weight: AudioContext.decodeAudioData is built into
//     Chromium and supports every audio container we care about for v1.
//   - Same security boundary: no spawning external processes from the
//     renderer.
//   - Same audio pipeline shape as our existing recorder, so the WAV
//     encoder is shared.
//
// Limitations:
//   - Very large files (>500 MB-ish, multi-hour) may exceed the renderer's
//     memory ceiling because decodeAudioData materializes the whole PCM
//     into memory. For typical meeting recordings (1-2 hours @ MP3 128k)
//     it's fine.

const TARGET_SAMPLE_RATE = 16000

export interface DecodedAudio {
  /** Raw 16 kHz mono Float32 PCM samples, ready for WAV encoding. */
  pcm: Float32Array
  /** Source duration in seconds (length / 16000). */
  durationSeconds: number
}

/**
 * Decode an arbitrary audio (or video-with-audio) file into mono Float32
 * PCM at 16 kHz. Throws a descriptive error if the format is unsupported.
 */
export async function decodeToMonoPcm(file: File): Promise<DecodedAudio> {
  const arrayBuffer = await file.arrayBuffer()

  // Use the default AudioContext sample rate for initial decode (browsers
  // typically default to 48 kHz), then resample to 16 kHz via an
  // OfflineAudioContext. Decoding at the target rate directly would
  // require an OfflineAudioContext from the start, which doesn't accept
  // the original-rate Blob.
  const tempCtx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await tempCtx.decodeAudioData(arrayBuffer)
  } catch (err) {
    void tempCtx.close().catch(() => {})
    throw new Error(
      `Could not decode "${file.name}" — unsupported audio format or corrupted file. ` +
        `(${(err as Error).message})`
    )
  } finally {
    void tempCtx.close().catch(() => {})
  }

  const targetSamples = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE)
  const offlineCtx = new OfflineAudioContext(1, targetSamples, TARGET_SAMPLE_RATE)
  const source = offlineCtx.createBufferSource()
  source.buffer = decoded
  source.connect(offlineCtx.destination)
  source.start(0)

  const resampled = await offlineCtx.startRendering()
  // OfflineAudioContext with channelCount=1 already mixes multi-channel
  // input down to mono in the rendering pass.
  const pcm = resampled.getChannelData(0)

  return {
    pcm: new Float32Array(pcm),
    durationSeconds: resampled.duration
  }
}

/**
 * Encode Float32 PCM samples as a single-channel 16-bit WAV file at the
 * target sample rate. Same format whisper-cli expects (matches what
 * our recorder produces for live dictation).
 */
export function encodeWav(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): Uint8Array {
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
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // format: PCM
  view.setUint16(22, 1, true) // channels: mono
  view.setUint32(24, sampleRate, true) // sample rate
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
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
