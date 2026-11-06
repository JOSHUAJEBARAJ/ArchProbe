export const API_BASE_URL = 'http://127.0.0.1:8000'
export const WS_BASE_URL = 'ws://127.0.0.1:8000'

export async function transcribeAudio(audio: Blob, signal?: AbortSignal): Promise<string> {
  const formData = new FormData()
  formData.append('file', audio, 'recording')
  const response = await fetch(`${API_BASE_URL}/audio/check`, {
    method: 'POST', body: formData, signal,
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(typeof result.detail === 'string' ? result.detail : 'Could not transcribe the recording.')
  }
  if (typeof result.transcript !== 'string') {
    throw new Error('The transcription response did not contain text. Please retry.')
  }
  return result.transcript.trim()
}
