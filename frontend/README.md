# ArchProbe frontend

React, TypeScript, Vite, and Excalidraw. Use Node.js 24 and run the backend on `http://127.0.0.1:8000`.

```bash
npm install
npm run dev
```

## Structure

`App.tsx` composes the workspace and connects components to hooks. Components display data and invoke callbacks passed through props.

| File | Responsibility |
| --- | --- |
| `Whiteboard.tsx` | Editable Excalidraw canvas |
| `ConversationPanel.tsx` | Live messages and conversation scrolling |
| `VoiceControls.tsx` | Pause/resume, manual recording controls, and status |
| `SettingsDialog.tsx` | Model choices and troubleshooting controls |
| `HistoryDialog.tsx` | Saved messages, diagram previews, and feedback navigation |
| `useInterviewSettings.ts` | Scenario loading and model/effort selection |
| `useInterviewSession.ts` | Create/connect/end, WebSocket events, and sending answers |
| `useVoiceInterview.ts` | Recording, silence detection, transcription, retries, and voice turn coordination |
| `useSpeechPlayback.ts` | Browser speech playback, cancellation, and cleanup |
| `useInterviewHistory.ts` | History loading, deletion, and stale-response protection |
| `useDiagnostics.ts` | Backend and interview checks |
| `audioRecording.ts` | Audio chunk capture and microphone resource cleanup |
| `api.ts` | Local server addresses and multipart transcription requests |
| `silenceDetector.ts` | Speech-volume threshold and five-second silence timing |
| `interviewHistory.ts` | Shared saved-interview types |

The session hook composes the voice hook. They share the current socket and turn-state refs so old recordings and speech callbacks cannot submit an answer into another interview. The diagram is copied when a recording ends, before transcription begins.

## Checks

```bash
npm test
npm run lint
npm run build
```

Tests use Node's built-in test runner with mocked microphone and fetch APIs. They cover recording chunks, cancellation, track cleanup, transcription responses, and silence timing. They do not replace a real browser check of React, WebSockets, and browser audio.

## Manual check after a refactor

1. Create and connect an interview. The opening question should play aloud.
2. The microphone should start when playback finishes. Explain a diagram and leave five seconds of silence; the transcript and diagram should be sent together.
3. Pause while recording, wait, then resume. The discarded recording must not be sent.
4. End the interview and listen to the wrap-up. Recording must stay off afterward.
5. Open History, view a conversation and diagram, and follow a feedback reference.
6. Open the gear menu and check model selection and troubleshooting controls.
