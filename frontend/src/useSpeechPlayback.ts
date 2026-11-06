import { useCallback, useEffect, useRef, useState } from 'react'

export default function useSpeechPlayback() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null)

  const stopSpeaking = useCallback(() => {
    speechRef.current = null
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [])

  const getSpeakingText = useCallback(() => speechRef.current?.text ?? null, [])

  const speak = useCallback((text: string, onComplete?: () => void) => {
    if (!text.trim()) return
    stopSpeaking()
    if (!('speechSynthesis' in window)) {
      setSpeechError('This browser does not support speech playback.')
      return
    }

    const speech = new SpeechSynthesisUtterance(text)
    speech.lang = 'en-US'
    speechRef.current = speech
    setSpeechError('')
    setIsSpeaking(true)
    speech.onend = () => {
      if (speechRef.current !== speech) return
      speechRef.current = null
      setIsSpeaking(false)
      onComplete?.()
    }
    speech.onerror = () => {
      if (speechRef.current !== speech) return
      speechRef.current = null
      setIsSpeaking(false)
      setSpeechError('Speech playback failed. Check browser audio permissions.')
    }
    window.speechSynthesis.speak(speech)
  }, [stopSpeaking])

  useEffect(() => {
    return () => {
      // Ignore completion events from speech cancelled during unmount.
      speechRef.current = null
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [])

  return { isSpeaking, speechError, speak, stopSpeaking, getSpeakingText }
}
