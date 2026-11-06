import { API_BASE_URL } from './api'
import { useState } from 'react'

export default function useDiagnostics(interviewId: string | null) {
  const [backendStatus, setBackendStatus] = useState('Not checked')

  async function checkBackend() {
    setBackendStatus('Checking...')

    try {
      const response = await fetch(`${API_BASE_URL}/health`)

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`)
      }

      const data = await response.json()
      setBackendStatus(`Backend status: ${data.status}`)
    } catch (error) {
      console.error(error)
      setBackendStatus('Could not reach the backend')
    }
  }

  async function checkInterview() {
    if (!interviewId) {
      return
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/interviews/${interviewId}`
      )

      if (!response.ok) {
        throw new Error(`Could not retrieve interview: ${response.status}`)
      }

      const session = await response.json()
      console.log('Retrieved interview:', session)
    } catch (error) {
      console.error(error)
    }
  }

  return {
    backendStatus,
    checkBackend,
    checkInterview,
  }
}
