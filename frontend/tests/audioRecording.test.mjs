import assert from 'node:assert/strict'
import test from 'node:test'
import { startAudioRecording } from '../src/audioRecording.ts'

function setup(t) {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const recorderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder')
  let stopped = 0
  const stream = { getTracks: () => [{ stop: () => stopped++ }] }
  const mediaDevices = { getUserMedia: async () => stream }
  class Recorder {
    mimeType = 'audio/webm'
    state = 'inactive'
    constructor(stream) { this.stream = stream }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.onstop?.() }
    chunk(text) { this.ondataavailable?.({ data: new Blob([text]) }) }
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices } })
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: Recorder })
  t.after(() => {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else delete globalThis.navigator
    if (recorderDescriptor) Object.defineProperty(globalThis, 'MediaRecorder', recorderDescriptor)
    else delete globalThis.MediaRecorder
  })
  return { mediaDevices, Recorder, stopped: () => stopped }
}

test('collects all recording chunks, keeps the MIME type, and releases the microphone', async (t) => {
  const env = setup(t)
  let audio
  const recorder = await startAudioRecording({ isCurrent: () => true, onStop: value => { audio = value }, onError: () => assert.fail() })
  recorder.chunk('first')
  recorder.chunk('second')
  recorder.stop()
  assert.equal(await audio.text(), 'firstsecond')
  assert.equal(audio.type, 'audio/webm')
  assert.equal(env.stopped(), 1)
})

test('cancellation while microphone permission is pending releases the late stream', async (t) => {
  const env = setup(t)
  let releasePermission
  let current = true
  const stream = await env.mediaDevices.getUserMedia()
  env.mediaDevices.getUserMedia = () => new Promise(resolve => { releasePermission = resolve })
  const pending = startAudioRecording({ isCurrent: () => current, onStop: () => assert.fail(), onError: () => assert.fail() })
  current = false
  releasePermission(stream)
  assert.equal(await pending, null)
  assert.equal(env.stopped(), 1)
})

test('a discarded recording never delivers an answer', async (t) => {
  const env = setup(t)
  let current = true
  const recorder = await startAudioRecording({ isCurrent: () => current, onStop: () => assert.fail('Discarded audio was submitted'), onError: () => assert.fail() })
  recorder.chunk('discard me')
  current = false
  recorder.stop()
  assert.equal(env.stopped(), 1)
})

test('failure to start recording still releases the microphone', async (t) => {
  const env = setup(t)
  env.Recorder.prototype.start = () => { throw new Error('Unsupported recording') }
  await assert.rejects(startAudioRecording({ isCurrent: () => true, onStop() {}, onError() {} }), /Unsupported/)
  assert.equal(env.stopped(), 1)
})

test('recorder errors release the microphone without submitting partial audio', async (t) => {
  const env = setup(t)
  let errors = 0
  const recorder = await startAudioRecording({ isCurrent: () => true, onStop: () => assert.fail(), onError: () => errors++ })
  recorder.onerror()
  recorder.stop()
  assert.equal(errors, 1)
  assert.equal(env.stopped(), 1)
})
