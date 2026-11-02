# ArchProbe learning and build plan

## How we will work

- Joshua writes the application code and runs the commands. The assistant acts as a guide and reviewer.
- Work on one small task at a time: explain the concept, build it, verify it, then review it together.
- Start with explanations and hints. Provide complete solutions or make application changes only when Joshua explicitly asks.
- Before marking a task complete, demonstrate the behavior and explain how it works in your own words.
- Record significant decisions, problems, and measurements here as we learn. Commit small, working milestones.
- The assistant may update this checklist when asked; that does not authorize implementing the application.

## Goal and boundaries

Build a local mock interviewer for mid-level cloud, platform, and DevOps system design interviews. It should listen to your explanation, follow an embedded Excalidraw diagram, ask relevant follow-up questions, and produce evidence-based feedback.

Start with one scenario: **design a highly available web application**. Add centralized logging and background job processing after the first complete interview works.

Aim for an initial version in 2–3 weeks, adjusting the schedule to preserve learning. Public hosting, user accounts, billing, screen sharing, video recording, and Kubernetes are outside the initial version.

## Milestone 1 — Understand and start the application

Learn: frontend/backend responsibilities, HTTP, Python environments, and browser origins.

- [x] Confirm Git, Node.js/npm, Python, uv, and Codex are available; record chosen versions.
- [x] Create `frontend/` using React, Vite, and TypeScript.
- [x] Create `backend/` using Python, uv, FastAPI, and Uvicorn.
- [x] Add a backend health endpoint and call it from React.
- [x] Configure the local frontend/backend connection and CORS for the development origin.
- [x] Add exact setup and run commands to the README.

Done when: both services start from the documented commands and the browser displays the backend health result. Explain the request's path from React to Python and back.

Implementation checkpoint (2026-11-02): frontend build and ESLint passed; backend import and direct health-function check passed. Joshua confirmed the browser's successful health response and failure message when the backend was stopped. Live HTTP could not be independently reached from the assistant's session. README run instructions have been reviewed; a fresh-clone setup has not yet been tested.

Development versions: Node.js 24.22.2, Python 3.12.10 in the backend virtual environment, and TypeScript 6.0.x. Joshua reported uv 0.12.22 and Codex CLI 0.166.0. TypeScript was changed from 7.0.x because the generated typescript-eslint dependency requires a version below 6.1.0.

Learning recap before moving on: explain how a button click calls `fetch`, how FastAPI handles `/health`, why CORS is needed, and how React state displays the response or a connection error.

## Milestone 2 — Validate the risky integrations early

Learn: subprocesses, JSON-RPC, authentication boundaries, and measuring latency.

- [ ] Confirm the supported local Codex authentication route works with your subscription; keep credentials out of source control and browser code.
- [ ] From Python, start or connect to Codex app-server and complete one text exchange using its documented protocol.
- [ ] Verify a second turn retains conversation context and capture request failures or usage-limit errors.
- [ ] Send a small diagram snapshot and verify the selected model can interpret it. Check diagram JSON input separately.
- [ ] Run local whisper.cpp on a short recording of your own architecture explanation; inspect technical-term accuracy and processing time.
- [ ] Make the browser speak a sample question and confirm microphone capture works.
- [ ] Record observed response times and any setup limitations before committing to the full voice flow.

Done when: reasoning, diagram input, transcription, and speech output each work independently. If subscription access or latency is unsuitable, discuss the trade-off together before changing providers, adding costs, or reducing scope.

## Milestone 3 — Build a text interview first

Learn: API contracts, Pydantic validation, interview state, and WebSockets.

- [ ] Write the first scenario: prompt, expected discussion areas, and feedback rubric.
- [ ] Define session states: ready, active, finished; define the messages exchanged with the frontend.
- [ ] Implement start, answer, and finish behavior, with one Codex conversation per interview.
- [ ] Build a basic React conversation panel and connect it through WebSockets.
- [ ] Guide the interview through requirements, architecture, reliability/scaling, and wrap-up.
- [ ] Handle pending replies, duplicate submissions, disconnects, and model failures with visible status and a safe retry path.
- [ ] Add focused pytest coverage for session transitions and backend validation using a fake model adapter.

Done when: a complete text interview produces relevant follow-up questions, preserves context, and finishes cleanly without requiring voice or a diagram.

## Milestone 4 — Make the interviewer understand the whiteboard

Learn: Excalidraw scene data, snapshots, debouncing, and synchronized context.

- [ ] Embed Excalidraw beside the conversation panel.
- [ ] Read diagram elements, labels, and connector bindings; account for deleted elements and nonessential drawing data.
- [ ] Associate diagram revisions with interview turns and provide the latest scene summary and snapshot when requesting a follow-up.
- [ ] Debounce background diagram updates and avoid sending every pointer movement to the model.
- [ ] Ask the interviewer to distinguish observed components from assumptions and clarify ambiguous diagrams.
- [ ] Check a diagram with a single database, then revise it to include a replica; confirm the follow-up uses the current revision.

Done when: the interviewer asks a relevant question about something actually drawn and follows a later diagram change.

## Milestone 5 — Add conversational voice

Learn: audio capture, transcription, turn detection, async work, and cancellation.

- [ ] Capture microphone audio and send it for local transcription without blocking FastAPI's event loop.
- [ ] Show the transcript and recording/transcribing/thinking/speaking states.
- [ ] Use detected speech pauses to submit completed turns; provide an explicit end-turn control as a fallback.
- [ ] Speak completed interviewer sentences through browser SpeechSynthesis.
- [ ] Prevent the interviewer's playback from being submitted as the user's answer; add mute and stop-speaking controls.
- [ ] Handle microphone denial, silence, transcription failure, and model timeout without losing the session.
- [ ] Measure end-of-user-speech to first audible response across several turns; document results and limitations.

Done when: you can hold a spoken interview while drawing, recover from a failed turn, and see understandable status throughout. Natural interruption handling can be improved after this basic flow works.

## Milestone 6 — Save sessions and give useful feedback

Learn: SQLAlchemy, persistence, rubric-based evaluation, and evidence grounding.

- [ ] Store session metadata, timestamped turns, diagram revisions, and final feedback in SQLite and local files as appropriate.
- [ ] Restore a completed session for review and provide a way to delete its saved data.
- [ ] Generate rubric feedback on requirements, scalability, reliability, trade-offs, and communication.
- [ ] Tie each strength or improvement to a transcript turn or diagram revision; acknowledge missing evidence.
- [ ] Avoid treating one architecture as the only correct answer or presenting scores as hiring predictions.
- [ ] Test persistence and feedback structure, including an incomplete interview.

Done when: restarting the application preserves a completed interview, and the feedback explains what you did well and what to practice next using session evidence.

## Milestone 7 — Verify and prepare the portfolio demo

Learn: end-to-end testing, AI evaluation, CI, and explaining engineering decisions.

- [ ] Create a small evaluation set covering a weak design, a strong design, an ambiguous diagram, a corrected design, and missing evidence.
- [ ] Review whether follow-ups match the current design and feedback references valid evidence; record examples and failures.
- [ ] Add one Playwright smoke test for the core interview flow with fake AI/audio responses, and run a separate manual check with real integrations.
- [ ] Add GitHub Actions for backend tests/lint and frontend type checking/build/tests.
- [ ] Add the remaining two scenarios using the same interview engine.
- [ ] Document architecture, setup, subscription requirements, local data handling, measured latency, evaluation results, and known limitations.
- [ ] Record a short demo showing a diagram-specific follow-up and the resulting feedback.
- [ ] Write resume bullets based on implemented behavior and measured results.

Done when: a fresh local setup can complete an interview using the README, checks pass, and you can explain the architecture and its trade-offs without relying on generated code.

## Decisions and measurements

| Topic | Current decision or result |
| --- | --- |
| Audience | Personal interview practice and portfolio demonstration |
| Frontend | React + Vite + TypeScript; Excalidraw |
| Backend | Python + FastAPI; WebSockets |
| Storage | SQLite + SQLAlchemy |
| Reasoning | Local Codex app-server; subscription access must be validated |
| Voice | Local whisper.cpp + browser SpeechSynthesis; latency must be measured |
| Next task | Review the milestone 1 request flow, then validate local Codex access in milestone 2 |

## Later improvements

- [ ] More natural interruptions and improved speech quality.
- [ ] Progress comparisons across interviews and targeted practice sessions.
- [ ] Screen sharing or optional session recording.
- [ ] Public deployment with a supported authentication and usage-cost model.
