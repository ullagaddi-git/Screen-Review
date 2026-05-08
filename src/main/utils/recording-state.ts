/**
 * Pure state machine for the audio recording lifecycle. Extracted from
 * AudioService so the start/stop race fix can be unit-tested.
 *
 * Invariants:
 *  - After `markStart()`, `isRecording()` returns true synchronously.
 *  - `markStop()` returns true only if there was something to stop, false
 *    otherwise (avoiding double-stop).
 *  - Concurrent start calls collapse: the second `markStart()` is a no-op
 *    if a start is already in progress.
 */
export class RecordingState {
  private recording = false
  private startInFlight = false

  isRecording(): boolean {
    return this.recording
  }

  /** Returns true if this call should drive the start workflow; false if a previous start is in flight. */
  markStart(): boolean {
    if (this.startInFlight || this.recording) return false
    this.startInFlight = true
    this.recording = true
    return true
  }

  markStartComplete(): void {
    this.startInFlight = false
  }

  isStartInFlight(): boolean {
    return this.startInFlight
  }

  /** Returns true if this call should drive the stop workflow. */
  markStop(): boolean {
    if (!this.recording) return false
    this.recording = false
    return true
  }
}
