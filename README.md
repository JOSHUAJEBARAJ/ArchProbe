# ArchProbe

Practice DevOps and SRE system design interviews by speaking and drawing with an AI interviewer.

**v0.1.0 is a local preview.** Run the frontend, Python backend, Codex CLI, and Whisper on your own machine. This release is intended for personal practice and portfolio demonstrations.

## What you can do

- Choose **CI/CD pipeline design** or **observability platform design**.
- Draw on an embedded Excalidraw canvas while explaining your decisions aloud.
- Hear the interviewer's questions through browser speech synthesis.
- Automatically record answers after each spoken question. Five seconds of silence after detected speech submits the transcript and a snapshot of the diagram.
- Pause/resume the interview or stop recording manually.
- Choose a Codex model and supported reasoning effort in the gear menu before creating an interview.
- End the interview for a recap, strengths, improvements, and a practice exercise.
- Review saved conversations, diagram revisions, and evidence-linked feedback in History, or delete a completed interview.

The interviewer receives the submitted diagram elements, not a continuous screen recording. Uploaded images and screenshots are not part of the normal interview flow.

## Requirements

The current setup has been used on macOS. Other operating systems and browsers have not been verified for this release.

| Dependency | Requirement |
| --- | --- |
| Node.js | 24.x and npm; use `nvm use` if you already have nvm installed |
| Python | 3.12 or later, managed with [uv](https://docs.astral.sh/uv/getting-started/installation/) |
| Codex | Installed CLI, signed in, with access to the selected model |
| FFmpeg | `ffmpeg` available on the backend terminal's PATH |
| Whisper | [whisper.cpp](https://github.com/ggml-org/whisper.cpp), providing `whisper-cli` on PATH |
| Browser | Microphone permission, MediaRecorder, Web Audio, and SpeechSynthesis support |

Install and sign in to Codex using the [official CLI instructions](https://learn.chatgpt.com/docs/cli). For an npm installation:

```bash
npm install -g @openai/codex
codex login
```

This application uses a local `codex app-server` process and the CLI's configured authentication. Inference uses the signed-in account's allowance and model access. Audio transcription is a separate local Whisper process; a ChatGPT subscription is not an unlimited API allowance.

## Run locally

### 1. Get the source

```bash
git clone https://github.com/JOSHUAJEBARAJ/ArchProbe.git
cd ArchProbe
```

To use this release after its tag has been published, run `git checkout v0.1.0`. To use ongoing development instead, stay on `main`.

### 2. Download the English speech model

From the repository root:

```bash
mkdir -p models
curl --fail --location \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin \
  --output models/ggml-base.en.bin
```

This is the preconverted model distributed through the [whisper.cpp model instructions](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md). The model is downloaded separately and is not included in this repository or release archive.

### 3. Start the backend

Make sure `codex`, `ffmpeg`, and `whisper-cli` are available in this terminal:

```bash
codex --version
ffmpeg -version
whisper-cli --help
```

Then run:

```bash
cd backend
uv sync --locked
uv run uvicorn main:app --host 127.0.0.1 --port 8000
```

Keep the terminal open. API documentation is available at http://127.0.0.1:8000/docs and health status at http://127.0.0.1:8000/health.

For development, add `--reload`. Restarting the backend interrupts active interviews; saved history remains available.

### 4. Start the frontend

Open a second terminal at the repository root:

```bash
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173. The backend allows frontend requests from that address and `http://localhost:5173`.

### 5. Start an interview

1. Choose a scenario. Optionally open **Settings** using the top-right gear to select a model and reasoning effort.
2. Click **Create interview**, then **Connect interviewer**.
3. Allow microphone access. Listen to the opening question; the microphone starts when speech playback finishes.
4. Explain your design while drawing. Five seconds of silence after speech sends your answer and the diagram as it was when recording ended.
5. Use **Pause interview** before an extended thinking/drawing break. Pausing discards unsent audio. Resume when ready; an interrupted question may be replayed.
6. Click **End interview** for the wrap-up. Open **History** to review saved answers, diagrams, and feedback references.

Settings lock after interview creation. Finish the interview, or recover from an error using **New interview**, before choosing again. Closed interviews cannot be resumed as live Codex conversations.

## Architecture

```text
Browser: React + Excalidraw + MediaRecorder + SpeechSynthesis
    | HTTP audio uploads and history requests; WebSocket interview events
Python: FastAPI + SQLite
    |-- FFmpeg -> 16 kHz mono WAV -> whisper-cli (CPU, English)
    |-- codex app-server -> model responses through stdin/stdout JSON messages
    `-- SQLite -> saved messages, diagram revisions, and feedback references
```

`App.tsx` composes components and hooks for interview sessions, voice, settings, and history. See the [frontend guide](frontend/README.md) and [backend guide](backend/README.md) for code structure and checks. Scenario definitions live in `backend/scenario_content/*.yaml`; restart the backend after editing YAML.

## Local data and model input

- Conversations, accepted transcripts, diagram snapshots, and final feedback are saved in `backend/data/archprobe.db`.
- Audio conversion and Whisper transcription use temporary backend files that are cleaned up after processing. Browser recordings may remain in memory for playback or retry.
- Submitted transcripts, diagram elements, and interview context are sent to Codex for model inference. This is not an offline-only application.
- Codex may maintain its own conversation history under its configured home. Deleting an interview in ArchProbe removes ArchProbe's stored records, not Codex's separate history.
- Live scenario, model, and reasoning selections are currently kept in memory. A backend restart does not preserve those selections for an unstarted interview.
- Local databases, downloaded models, recordings, environments, and build output are excluded from Git.

## Preview limitations and deferred work

- English transcription uses `base.en` in CPU mode. Technical terms can be misheard; the transcript is sent automatically without a correction step.
- Silence detection uses audio volume, not semantic understanding. It can submit a thinking pause or react to background noise; Pause/Resume and manual Stop remain available.
- Speech quality and autoplay behavior depend on the browser and installed voices. Stop speaking cancels a response; a persistent mute setting is not implemented.
- End-to-end latency measurements, comprehensive failure/retry acceptance, browser automation, and the full interview-quality evaluation set are deferred.
- The final frontend refactor passed automated checks but still needs a full live browser audio smoke check.
- Feedback references are checked for source ownership and diagram revision. A valid reference does not prove that the model's judgment is correct.
- Diagram snapshots preserve scene elements, not embedded image files. Continuous screen sharing, video recording, public hosting, and multi-user accounts are not implemented.
- The production frontend build currently reports large Excalidraw-related chunks.

## Existing checks

These commands are available for contributors; the release preparation does not claim additional testing beyond the previously recorded checks.

```bash
cd frontend
npm test
npm run lint
npm run build
```

```bash
cd backend
uv run python -m unittest discover -s tests
```

The last recorded frontend refactor checks passed 14 frontend tests, 76 backend tests, lint, and the production build. The Node tests mock audio/fetch boundaries and do not replace live browser or real-model evaluation.

See [PLAN.md](PLAN.md) for completed milestones and deferred work, and [RELEASE_NOTES.md](RELEASE_NOTES.md) for the first preview release notes.
