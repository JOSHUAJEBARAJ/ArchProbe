# ArchProbe learning and build plan

## How we will work

- Joshua writes the application code and runs the commands. The assistant acts as a guide and reviewer.
- Work on one small task at a time: explain the concept, build it, verify it, then review it together.
- Start with explanations and hints. Provide complete solutions or make application changes only when Joshua explicitly asks.
- Before marking a task complete, demonstrate the behavior and explain how it works in your own words.
- Record significant decisions, problems, and measurements here as we learn. Commit small, working milestones.
- The assistant may update this checklist when asked; that does not authorize implementing the application.
- Keep the UI basic and functional: plain controls, readable conversation history, and minimal CSS. Avoid decorative branding, marketing copy, and dashboard layouts.

## Goal and boundaries

Build a local mock interviewer for mid-level DevOps and SRE interviews. It should listen to your explanation, follow an embedded Excalidraw diagram, ask relevant follow-up questions, and produce evidence-based feedback.

Start with one scenario: **design a CI/CD pipeline for a web application, from a code change to a safe production deployment**. Additional scenarios are deferred until this interview flow works.

Role focus: assess CI/CD design for DevOps/SRE roles, including repository triggers, build/test stages, reproducible artifacts, secrets and pipeline permissions, environment promotion and approvals, deployment strategies, rollback, and pipeline/deployment observability. Probe failed builds, broken deployments, and concurrent changes. Do not require a particular CI platform or cloud provider or reward tool names without explanation. Keep mid-level difficulty as the initial default.

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

- [x] Confirm the supported local Codex authentication route works with your subscription; keep credentials out of source control and browser code.
- [x] From Python, start or connect to Codex app-server and complete one text exchange using its documented protocol.
- [x] Verify a second turn retains conversation context and capture request failures or usage-limit errors.
- [x] Send a small diagram snapshot and verify the selected model can interpret it. Diagram JSON testing is deferred to milestone 4 by agreement.
- [x] Run local whisper.cpp on a short recording of your own architecture explanation; inspect technical-term accuracy and processing time.
- [x] Make the browser speak a sample question and confirm microphone capture works.
- [x] Record observed response times and any setup limitations before committing to the full voice flow.

Done when: reasoning, diagram input, transcription, and speech output each work independently. If subscription access or latency is unsuitable, discuss the trade-off together before changing providers, adding costs, or reducing scope.

Validation checkpoint (2026-11-02): Joshua ran the probes locally and shared successful output. Codex reported ChatGPT authentication with a Plus plan. The Python probe streamed completed responses, continued the same thread, and correctly described the diagram labels and arrow directions while distinguishing unknown replication details. A deliberately invalid thread method returned error -32600, which the probe printed before stopping; the valid method was then restored. Usage-limit, network-failure, and timeout behavior have not been tested.

| Measurement | Observed result |
| --- | --- |
| Codex opening question, send to turn completion | 4.39 seconds |
| Codex diagram response, send to turn completion | 3.82 seconds |
| Local English audio sample | Approximately 12.5 seconds |
| Whisper CPU transcription, second run wall time | 2.563 seconds; internal time 2.324 seconds |
| Whisper CPU transcription, first run wall time | 24.330 seconds; internal time 2.367 seconds; extra delay unexplained |

These are individual observations, not latency guarantees or end-to-end voice measurements. First-token latency has not been measured. The base.en model recognized availability zones, load balancer, replica, and failover in the sample; transcription quality has not been evaluated across multiple recordings.

Setup limitation: the installed Metal backend failed to compile GPU code. Transcription succeeded with `whisper-cli --no-gpu`. Keep CPU mode as the current workaround and measure again during integration.

Joshua also confirmed browser speech output, microphone permission, audio capture, and local playback. Browser audio upload/conversion/transcription and spoken Codex replies are not connected yet. The code remains a feasibility probe, not the interview engine. Diagram JSON and changed-diagram evaluation will be revisited in milestone 4.

## Milestone 3 — Build a text interview first

Learn: API contracts, Pydantic validation, interview state, and WebSockets.

- [x] Write the CI/CD design scenario: prompt, expected discussion areas, and feedback rubric; ask one question at a time and adapt to the candidate's answers.
- [x] Define session states: ready, active, finished; define the messages exchanged with the frontend.
- [x] Implement start, answer, and finish behavior, with one Codex conversation per interview.
- [x] Build a basic React conversation panel and connect it through WebSockets.
- [x] Guide the interview through delivery requirements, pipeline architecture, security and failure recovery, and wrap-up.
- [x] Handle pending replies, duplicate submissions, disconnects, and model failures with visible status and a safe retry path.
- [x] Add focused backend coverage for session transitions and validation using a fake model adapter (standard-library unittest suite).
- [ ] Final live acceptance: complete a CI/CD interview, request its new wrap-up, and create a fresh interview without refreshing. Joshua runs this check locally.

Done when: a complete text interview produces relevant follow-up questions, preserves context, and finishes cleanly without requiring voice or a diagram.

Implementation checkpoint (2026-11-03): Joshua verified real multi-turn questions, candidate clarification, ordered browser conversation history, and session ending. The app keeps its basic UI. End interview now requests a concise rubric-based wrap-up in the same Codex conversation, waits for an in-progress response, streams the recap, then closes and cleans up. New interview cleans up a previous session and permits recovery without a refresh. Setup failures, timeouts, duplicate starts, concurrent sockets, premature/blank input, disconnects, cancellation, shutdown, and wrap-up behavior have automated coverage using fake Codex responses. Tests remain in the existing standard-library suite rather than introducing a new framework. The new model-generated wrap-up and fresh-session UI flow still need the final live acceptance check above; no benchmark of feedback quality is claimed. Persistent sessions, detailed scoring, and evidence-linked saved feedback remain in milestone 6. Reconnection to a lost conversation is not supported; recovery creates a new session.

## Milestone 4 — Make the interviewer understand the whiteboard

Learn: Excalidraw scene data, snapshots, debouncing, and synchronized context.

- [x] Embed Excalidraw in the interview page above the conversation panel.
- [x] Read diagram elements, labels, and connector bindings; exclude deleted elements from submitted snapshots.
- [x] Reduce nonessential drawing data before sending it to Codex while preserving labels, connections, and layout. Python projects the raw scene into a compact context; the browser retains its full editor scene.
- [x] Validate Codex input from diagram JSON (deferred from milestone 2).
- [x] Associate numbered diagram snapshots with submitted answers, forward the current JSON to Codex, and display the revision beside each candidate turn.
- [x] Send diagram context only with submitted answers; drawing movements do not trigger model requests. Background updates and debouncing are unnecessary for this submission-based flow.
- [x] Add standing interviewer and wrap-up guidance to distinguish observed components from assumptions, use the latest complete snapshot, and clarify ambiguous diagrams. Verify the new prompt in a fresh live interview.
- [x] Confirm a follow-up uses an updated diagram: add a Run test stage to Git → CI pipeline, then remove it.
- [x] Check empty canvases and unconnected boxes; verify the model does not invent current components or connections.
- [ ] Final live acceptance after prompt and context changes: verify an updated and empty diagram, grounded interpretation without special candidate instructions, then wrap up and start a fresh interview. Deferred until the final testing session at Joshua's request.
- [ ] Deferred by agreement: compare PNG snapshots with JSON if complex drawings reveal limitations; PNG export and model input are not implemented.

Done when: the interviewer asks a relevant question about something actually drawn and follows a later diagram change.

Implementation checkpoint (2026-11-04): the JSON flow is implemented. Python removes editor seeds, version metadata, timestamps, and custom editor data before forwarding the scene to Codex. It preserves labels, geometry, grouping, visual cues, and connector bindings/arrowheads. All 25 backend tests pass, including new checks for scene preservation, deletion filtering, empty current snapshots, successive structured answers in one thread, and invalid-message recovery. The final live acceptance above remains pending; PNG stays deferred.

Validation checkpoint (2026-11-04): Joshua shared real Codex responses recognizing Git → CI pipeline, the added Run test stage and its direction, an empty canvas after deletion, and two unconnected boxes without inventing a flow. Joshua also confirmed deletion handling and visible per-answer revision numbers after receiving the new-interview reset test instructions. These are manual observations, not an automated diagram evaluation suite. PNG support was explicitly deferred in favor of completing the JSON flow first. Standing diagram-grounding guidance is now included in the opening and wrap-up prompts; the 20 existing backend tests pass, but do not evaluate model adherence. Remaining work includes trimming nonessential scene data and verifying the guidance in a fresh live interview without special instructions in the candidate's answer.

## Milestone 5 — Add conversational voice

Status (2026-11-06): the core spoken interview flow is implemented and Joshua reported successful voice turns, automatic microphone startup, silence submission, and Pause/Resume. Failure-and-retry acceptance testing and end-to-end latency measurements are deferred at Joshua's request. A browser smoke check after the final frontend refactor remains pending.

Learn: audio capture, transcription, turn detection, async work, and cancellation.

- [x] Capture microphone audio and send it for local transcription without blocking FastAPI's event loop.
- [x] Show the transcript and recording/transcribing/thinking/speaking states.
- [x] Use detected speech pauses to submit completed turns; provide an explicit end-turn control as a fallback.
- [x] Speak completed interviewer responses through browser SpeechSynthesis.
- [x] Stop microphone capture during interviewer playback; provide Stop speaking and Pause/Resume controls.
- [ ] Add a persistent speech-mute option if needed; Stop speaking currently cancels the current response only.
- [ ] Complete live acceptance of microphone denial, silence, transcription failure, and model timeout recovery. Deferred by Joshua.
- [ ] Measure end-of-user-speech to first audible response across several turns; document results and limitations. Deferred by Joshua.

Frontend refactor checkpoint: `App.tsx` composes the UI and hooks for settings, interview sessions, voice, history, and diagnostics. Shared audio helpers cover track cleanup and multipart transcription. Fourteen frontend tests, 76 backend tests, lint, and the production build passed after the refactor. These checks do not replace real browser audio acceptance.

Done when: you can hold a spoken interview while drawing, recover from a failed turn, and see understandable status throughout. Natural interruption handling can be improved after this basic flow works.

## Milestone 6 — Save sessions and give useful feedback

Status: complete for saved conversations, diagrams, and evidence-linked feedback. Joshua reported successful final checks; broader model-quality evaluation belongs to milestone 7. Live scenario/model/reasoning selections are not yet persisted in SQLite.

Learn: SQLAlchemy, persistence, rubric-based evaluation, and evidence grounding.

- [x] Save interview IDs, creation timestamps, lifecycle state, and Codex thread IDs in SQLite.
- [x] Store accepted candidate answers and completed interviewer replies in order, including final wrap-ups; exclude failed partial replies from completed history.
- [x] Save diagram snapshots and revisions atomically with their candidate answers, preserving empty canvases and excluding deleted elements.
- [x] List saved interviews and expose message history, snapshots, and registered final feedback through validated API responses.
- [x] Review saved conversations, read-only diagram revisions, and final feedback in the browser after a backend restart.
- [x] Create missing tables automatically and mark leftover active interviews interrupted at startup, preserving saved history.
- [x] Delete saved interviews, messages, snapshots, feedback, and evidence together; protect active/busy interviews and roll back failed deletes.
- [x] Request rubric feedback on delivery requirements, build/test/artifacts, security, deployment, recovery, observability, reasoning, and communication, limited to discussed evidence.
- [x] Supply actual candidate answer IDs and exact diagram revisions to wrap-up generation. Validate references against this interview's sources; expose valid answer/snapshot links and disclose unavailable or absent references.
- [x] Instruct the interviewer to accept different valid designs, separate missing discussion from demonstrated weaknesses, and avoid invented scores or hiring predictions.
- [x] Test persistence, feedback storage, invalid references, empty evidence, failed wrap-ups, and deletion with isolated temporary databases.
- [x] Final user-reported acceptance: evidence-link review, saved history/diagrams/feedback after restarting the backend and refreshing the browser, an interview without candidate answers, and saved-interview deletion.

Done when: restarting the application preserves a completed interview, and the feedback explains what you did well and what to practice next using session evidence.

Validation (2026-11-05): all 59 backend tests, frontend TypeScript, lint, and production build passed. Joshua reported that the live review/restart flow and insufficient-evidence case work. These user reports are distinct from the assistant's automated checks; no independent claim-by-claim model-quality audit is claimed. Reference validation establishes source ownership and exact revisions, not semantic correctness. Milestone 7 will evaluate whether claims actually follow from their cited evidence across weak, strong, ambiguous, and revised designs.

Scope: older feedback is not retroactively assigned citations. Stored diagrams contain scene elements, not embedded image files. Missing tables are created automatically; changes to existing columns still require migrations. Vite's existing large drawing-dependency chunk warning remains a portfolio optimization consideration.

## Milestone 7 — Verify and prepare the portfolio demo

Learn: end-to-end testing, AI evaluation, CI, and explaining engineering decisions.

- [ ] Create a small evaluation set covering a weak design, a strong design, an ambiguous diagram, a corrected design, and missing evidence.
- [ ] Review whether follow-ups match the current design and feedback references valid evidence; record examples and failures.
- [ ] Add one Playwright smoke test for the core interview flow with fake AI/audio responses, and run a separate manual check with real integrations.
- [ ] Add GitHub Actions for backend tests/lint and frontend type checking/build/tests.
- [ ] Evaluate the implemented CI/CD and observability scenarios. Start with CI/CD, then check observability against its own rubric.
- [ ] Document architecture, setup, subscription requirements, local data handling, measured latency, evaluation results, and known limitations.
- [ ] Record a short demo showing a diagram-specific follow-up and the resulting feedback.
- [ ] Write resume bullets based on implemented behavior and measured results.

Done when: a fresh local setup can complete an interview using the README, checks pass, and you can explain the architecture and its trade-offs without relying on generated code.

Evaluation checkpoint (2026-11-06): the first manual case, [weak CI/CD design](evals/ci_cd/01-weak-design.md), is prepared. Its real-model result is pending; the rest of the evaluation set is not yet written.

Release preparation (2026-11-06): Joshua chose a GitHub local-preview release and deferred further testing/evaluation until later. `v0.1.0` setup documentation, release notes, version metadata, and [publication instructions](RELEASING.md) are prepared. Frontend and backend versions match, and `uv lock --check --offline` passed after declaring the existing PyYAML dependency directly. No new test suite or live evaluation was run during release preparation. The Git commit, tag push, and GitHub pre-release publication are still pending.

## Decisions and measurements

| Topic | Current decision or result |
| --- | --- |
| Audience | Mid-level DevOps/SRE interview practice and portfolio demonstration |
| Frontend | React + Vite + TypeScript; Excalidraw |
| Backend | Python + FastAPI; WebSockets |
| Storage | SQLite + SQLAlchemy |
| Reasoning | Local Codex app-server; subscription-backed text and image responses verified |
| Voice | Local whisper.cpp in CPU mode + browser SpeechSynthesis; core spoken loop reported working; latency and failure acceptance deferred |
| Next task | Publish the prepared v0.1.0 GitHub local preview. Resume milestone 7 evaluation, browser coverage, CI, and portfolio work after release; further testing is deferred by Joshua. |

## Later improvements

- [ ] More natural interruptions and improved speech quality.
- [ ] Progress comparisons across interviews and targeted practice sessions.
- [ ] Screen sharing or optional session recording.
- [ ] Public deployment with a supported authentication and usage-cost model.
