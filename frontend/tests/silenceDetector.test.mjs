import assert from 'node:assert/strict'
import test from 'node:test'
import { createSilenceDetector } from '../src/silenceDetector.ts'

function speech(sample, start = 0) {
  for (let time = start; time <= start + 400; time += 100) sample(0.05, time)
}

test('initial silence and a brief click do not submit an answer', () => {
  const sample = createSilenceDetector()
  for (let time = 0; time <= 10000; time += 100) {
    assert.equal(sample(time === 500 ? 0.1 : 0.001, time), null)
  }
})

test('five seconds of observed silence after speech ends the turn', () => {
  const sample = createSilenceDetector()
  speech(sample)
  for (let time = 500; time < 5400; time += 100) assert.ok(sample(0.001, time) > 0)
  assert.equal(sample(0.001, 5400), 0)
})

test('speaking again resets the countdown', () => {
  const sample = createSilenceDetector()
  speech(sample)
  for (let time = 500; time <= 4000; time += 100) sample(0, time)
  speech(sample, 4100)
  assert.equal(sample(0, 4600), 4900)
})

test('continuous speech does not end the turn', () => {
  const sample = createSilenceDetector()
  for (let time = 0; time <= 20000; time += 100) {
    const remaining = sample(0.05, time)
    assert.ok(remaining === null || remaining === 5000)
  }
})

test('a delayed timer does not immediately submit after tab throttling', () => {
  const sample = createSilenceDetector()
  speech(sample)
  assert.equal(sample(0, 20000), 5000)
})
