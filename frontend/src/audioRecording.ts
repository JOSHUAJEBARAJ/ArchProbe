type AudioRecordingOptions = {
  isCurrent: () => boolean
  onStop: (audio: Blob) => void
  onError: () => void
}

/** Own the microphone tracks until recording stops, fails, or is cancelled. */
export async function startAudioRecording({ isCurrent, onStop, onError }: AudioRecordingOptions) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const release = () => stream.getTracks().forEach((track) => track.stop())
  if (!isCurrent()) {
    release()
    return null
  }

  let recorder: MediaRecorder | undefined
  try {
    recorder = new MediaRecorder(stream)
    const recording = recorder
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      release()
      if (isCurrent()) onStop(new Blob(chunks, { type: recording.mimeType }))
    }
    recorder.onerror = () => {
      recording.onstop = null
      release()
      if (isCurrent()) onError()
    }
    recorder.start()
    return recorder
  } catch (error) {
    if (recorder) {
      recorder.onstop = null
      recorder.ondataavailable = null
      recorder.onerror = null
    }
    release()
    throw error
  }
}
