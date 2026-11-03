# ArchProbe

An AI system design interviewer that probes your architecture decisions through voice and an interactive whiteboard.

## Project status

The basic React interface supports a text CI/CD interview with streamed questions, candidate answers, ordered conversation history, and a concise end-of-interview wrap-up. FastAPI manages a local Codex process per active interview. Embedded whiteboard, connected voice interviews, persistent sessions, and detailed saved feedback are still being built.

ArchProbe is being built for personal interview preparation and as a portfolio project, initially targeting mid-level DevOps and SRE interviews.

The initial interview focuses on CI/CD pipeline design: source control triggers, builds, tests, artifact management, security, environment promotion, deployment strategies, rollbacks, and pipeline reliability. Candidates should explain their trade-offs rather than simply name tools.

## Planned experience

1. Choose a system design scenario and interview duration.
2. Discuss requirements with a voice-based AI interviewer.
3. Draw your architecture in an embedded Excalidraw whiteboard while explaining your decisions.
4. Answer follow-up questions grounded in your explanation and diagram.
5. Review feedback on requirements, scalability, reliability, trade-offs, and communication, with evidence from the session.

The first scenario is to design a CI/CD pipeline that takes a web application from a code change to a safe production deployment. Additional scenarios are deferred until this interview flow works.

## Proposed stack

| Component | Technology |
| --- | --- |
| Frontend | React, Vite, TypeScript |
| Styling | Minimal plain CSS |
| Whiteboard | Excalidraw |
| Backend | Python, FastAPI, Uvicorn, Pydantic |
| Live communication | WebSockets |
| Storage | SQLite, SQLAlchemy |
| Interview reasoning | Local Codex app-server integration |
| Speech recognition | Local whisper.cpp |
| Spoken responses | Browser SpeechSynthesis |
| Testing | unittest backend suite; frontend build/ESLint; browser automation planned |
| Tooling | uv, Ruff, GitHub Actions |

## Initial technical validation

Before implementing the full interview flow, validate subscription-backed Codex access for the local application, diagram context input, and end-to-end voice response latency on the development machine. Subscription limits still apply; speech handling is separate from Codex reasoning.

Transcription should run outside the backend event loop so audio processing does not block interview events. Use diagram elements and snapshots as visual context; screen sharing and video recording are future additions.

## Development

Follow the [learning and build plan](PLAN.md) for milestones, completion criteria, and our guide-and-builder workflow. Joshua implements the application; the assistant explains, reviews, and helps troubleshoot.

The first version is intended to run locally.

### Prerequisites

- Node.js 24 LTS and npm.
- Python 3.12 or later and uv.

### Run locally

From the repository root, start the backend in one terminal:

```bash
cd backend
uv sync
uv run uvicorn main:app --reload
```

From the repository root in a second terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the frontend URL printed by Vite.

- Health endpoint: http://127.0.0.1:8000/health
- API documentation: http://127.0.0.1:8000/docs
- Expand **Test controls** and click **Check backend** to verify the frontend/backend connection. Audio checks are independent of the interview.
- **Create interview** creates an in-memory backend session.
- **Connect interviewer** starts a Codex process and creates its conversation. This requires the local Codex CLI to be logged in.
- Answer the streamed questions in the text box. Sending is disabled while the interviewer responds.
- **End interview** requests a short wrap-up, then closes the conversation. If a response is already in progress, it finishes before the wrap-up starts.
- **New interview** becomes available after finishing or an error. It discards the previous session and its browser history and creates a fresh one without refreshing the page.

The backend permits frontend requests from `http://localhost:5173` and `http://127.0.0.1:5173`. If Vite starts on another port, update `allow_origins` in `backend/main.py` to match.

### Verify the frontend

From `frontend/`, run:

```bash
npm run build
npm run lint
```

To check connection failure handling, stop the backend with **Ctrl+C** and click **Check backend**. The page should display **Could not reach the backend**. Restart the backend and click again to see **Backend status: ok**.

### Test the Codex interview WebSocket

React automatically opens `ws://127.0.0.1:8000/interviews/<interview_id>/ws` after connecting the interviewer. Its conversation panel appends streamed text to the current response and preserves earlier questions and answers. A separate WebSocket client can test the same protocol, but only one socket may use an interview at a time.

The socket automatically sends the CI/CD scenario to Codex. It emits JSON messages:

| Type | Meaning |
| --- | --- |
| `delta` | Append the `text` field to the current interviewer response. |
| `turn_completed` | The response finished successfully; the candidate may answer. |
| `wrap_up_started` | Start a new interviewer message for the final recap. |
| `session_finished` | The wrap-up succeeded and the server will close the socket normally. |
| `error` | Read the `message` field. Empty or premature answers can be retried; model failures close the connection. |

Send candidate answers as plain text, after `turn_completed`. Send `{"type":"finish"}` to request the wrap-up; duplicate finish requests do not generate extra recaps. Subsequent turns use the same Codex thread and distinct request IDs. A model response has a 60-second deadline.

An unexpected disconnect also ends the interview and stops Codex, but cannot produce a wrap-up after the client is gone. Reconnecting to a finished session is not supported; use New interview. `POST /interviews/<interview_id>/finish` discards a session during recovery without requesting a recap. Reloading the backend clears in-memory sessions. Actual model responses, including the recap, consume the signed-in account's usage allowance.

The wrap-up uses the CI/CD rubric in `backend/scenarios.py`: requirements, builds/tests/artifacts, security, deployment, recovery, observability, and communication. It should identify demonstrated strengths, specific improvements, and one practice exercise; uncovered topics are not assessed. Numerical scores and durable feedback storage are outside this milestone. Model behavior still requires evaluation against real interview examples.

### Verify the backend bridge

From `backend/`, run:

```bash
uv run python -m unittest discover -s tests -v
```

These tests use simulated Codex events and in-process WebSocket connections. They check session creation/start/finish, retries, validation, multiple turns, overlapping input, rejected sessions, failures, timeouts, cancellation, shutdown, wrap-up, and disconnect cleanup without making live model requests.

### Milestone 3 live acceptance

1. Create an interview, connect it, and answer at least three questions about your CI/CD design.
2. Confirm earlier questions and answers stay visible and Send answer is disabled during generation.
3. Select End interview. Expect a Wrap-up entry, then Session finished with the conversation still visible.
4. Select New interview, connect, and confirm a new conversation starts without the previous history.
5. If the backend restarts or an interview fails, use New interview to recover. A failed setup should not leave the UI stuck in Connecting.

The existing live text flow was confirmed locally by Joshua. The latest wrap-up and fresh-session behavior still need this acceptance check; the assistant has verified those paths with simulated model responses and build/lint checks.
