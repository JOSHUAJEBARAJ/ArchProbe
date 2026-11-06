import { API_BASE_URL } from './api'
import { useEffect, useState } from 'react'
import type { CodexModel } from './SettingsDialog'

export type ScenarioSummary = { id: string; title: string }

export default function useInterviewSettings() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState('')
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(true)
  const [scenarioError, setScenarioError] = useState('')
  const [codexModels, setCodexModels] = useState<CodexModel[]>([])
  const [selectedModel, setSelectedModel] = useState('gpt-6.1-sol')
  const [selectedEffort, setSelectedEffort] = useState('medium')
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadScenarios() {
      try {
        const response = await fetch(`${API_BASE_URL}/scenarios`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Could not load scenarios: ${response.status}`)
        }
        const choices: ScenarioSummary[] = await response.json()
        if (choices.length === 0) {
          throw new Error('No scenarios are available.')
        }
        if (!controller.signal.aborted) {
          setScenarios(choices)
          setSelectedScenarioId(choices[0].id)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error)
          setScenarioError('Could not load scenarios. Check the backend and refresh this page.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingScenarios(false)
        }
      }
    }

    void loadScenarios()
    return () => controller.abort()
  }, [])

  async function loadCodexModels(locked = false) {
    if (isLoadingModels || locked) return
    setIsLoadingModels(true)
    setModelsError('')
    try {
      const response = await fetch(`${API_BASE_URL}/codex/models`)
      const choices = await response.json()
      if (!response.ok) throw new Error(choices.detail || 'Could not load Codex models.')
      if (!Array.isArray(choices) || choices.length === 0) throw new Error('Codex returned no models.')
      const models: CodexModel[] = choices
      const choice = models.find((item) => item.model === selectedModel)
        || models.find((item) => item.is_default) || models[0]
      setCodexModels(models)
      setSelectedModel(choice.model)
      setSelectedEffort(choice.supported_reasoning_efforts.some((item) => item.effort === selectedEffort)
        ? selectedEffort : choice.default_reasoning_effort)
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : 'Could not load Codex models.')
    } finally {
      setIsLoadingModels(false)
    }
  }

  function selectModel(model: string) {
    const choice = codexModels.find((item) => item.model === model)
    if (!choice) return
    setSelectedModel(choice.model)
    setSelectedEffort(choice.default_reasoning_effort)
  }

  return {
    scenarios,
    selectedScenarioId,
    isLoadingScenarios,
    scenarioError,
    codexModels,
    selectedModel,
    selectedEffort,
    isLoadingModels,
    modelsError,
    setSelectedScenarioId,
    setSelectedEffort,
    selectModel,
    loadCodexModels,
  }
}
