# ArchProbe v0.1.0 — Local preview

An early release for practicing DevOps and SRE design interviews on your own machine.

## Included

- CI/CD pipeline and observability platform scenarios loaded from YAML.
- A large Excalidraw workspace with a conversation sidebar.
- Spoken interviewer responses and microphone recording after each question.
- Local FFmpeg conversion and English Whisper CPU transcription.
- Five-second silence submission, manual Stop, and Pause/Resume controls.
- Diagram snapshots submitted alongside spoken answers.
- Codex model and supported reasoning-effort selection before starting an interview.
- Local saved conversations, diagram revisions, and evidence-linked feedback.
- History review/deletion and troubleshooting in the gear menu.
- Frontend components and hooks separated by responsibility.

## Setup

Use the [README](README.md). This is a source-code release, not a hosted service or desktop installer. Requirements include Node.js 24, Python/uv, an authenticated Codex CLI with access to your chosen model, FFmpeg, whisper-cli, and the separately downloaded `ggml-base.en.bin` model.

The setup has been used on macOS. Other platforms have not been verified for this release. Model inference uses your configured Codex authentication and usage allowance.

## Known limitations

- English technical terms can be transcribed incorrectly; transcripts are automatically submitted.
- Volume-based silence detection may interrupt a thinking pause or react to noise. Pause/Resume is available.
- Voice quality and playback support depend on the browser.
- Scenario/model/reasoning selections are not yet saved in SQLite.
- Active interviews cannot resume after backend restart or a closed connection.
- Saved diagram elements do not include embedded image files.
- Feedback citations validate references, not the correctness of model judgments.
- Continuous screen/video recording and public multi-user hosting are not included.
- The production frontend build reports large drawing-related chunks.

## Verification and deferred work

The last recorded refactor checks passed 14 frontend tests, 76 backend tests, lint, and the production build. These are previous checks, not new release certification.

Further interview-quality evaluation, failure/retry acceptance testing, browser automation, and end-to-end latency measurements are deferred. A complete live browser smoke check after the final frontend refactor remains pending. The prepared evaluation case and related manual observation are retained under `evals/` without claiming the full case passed.

## Data

ArchProbe saves interview history in local SQLite. Audio processing uses temporary files. Submitted transcripts, diagrams, and context are sent through Codex for inference. Codex may keep separate conversation history; deleting ArchProbe history does not delete that separate data. Models, databases, recordings, and credentials are not included in the source release.
