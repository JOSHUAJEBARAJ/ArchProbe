// Volume is an approximation of speech, not a language-aware voice detector.
export function createSilenceDetector() {
  let speechStartedAt: number | null = null
  let lastSpeechAt: number | null = null
  let previousSampleAt: number | null = null

  return function sample(volume: number, now: number): number | null {
    // A throttled background tab must not count unobserved time as silence.
    if (previousSampleAt !== null && now - previousSampleAt > 1000) {
      speechStartedAt = null
      if (lastSpeechAt !== null) lastSpeechAt = now
    }
    previousSampleAt = now

    if (volume >= 0.02) {
      speechStartedAt ??= now
      // Ignore brief clicks; require 300 ms of sustained sound first.
      if (now - speechStartedAt >= 300 || lastSpeechAt !== null) lastSpeechAt = now
    } else {
      speechStartedAt = null
    }

    if (lastSpeechAt === null) return null
    return Math.max(0, 5000 - (now - lastSpeechAt))
  }
}
