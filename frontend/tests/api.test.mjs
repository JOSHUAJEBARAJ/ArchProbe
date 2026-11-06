import assert from 'node:assert/strict'
import test from 'node:test'
import { API_BASE_URL, transcribeAudio } from '../src/api.ts'

test('transcription sends real multipart audio and propagates cancellation', async (t) => {
  const controller = new AbortController()
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `${API_BASE_URL}/audio/check`)
    assert.equal(options.method, 'POST')
    assert.equal(options.signal, controller.signal)
    assert.equal(options.headers, undefined)
    const file = options.body.get('file')
    assert.equal(await file.text(), 'audio bytes')
    return Response.json({ transcript: '  My explanation.  ' })
  })
  assert.equal(await transcribeAudio(new Blob(['audio bytes']), controller.signal), 'My explanation.')
})

test('transcription errors preserve the backend explanation', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Whisper model is missing.' }, { status: 503 }))
  await assert.rejects(transcribeAudio(new Blob(['audio'])), /Whisper model is missing/)
})

test('malformed successful responses cannot be submitted as answers', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ transcript: { invalid: true } }))
  await assert.rejects(transcribeAudio(new Blob(['audio'])), /did not contain text/)
})

test('empty transcripts remain empty for the interview to reject', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ transcript: '  ' }))
  assert.equal(await transcribeAudio(new Blob(['audio'])), '')
})
