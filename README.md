# ArchProbe

An AI system design interviewer that probes your architecture decisions through voice and an interactive whiteboard.

## Project status

The initial React frontend and FastAPI backend are running locally, with a health check connecting them. The interview, whiteboard, and voice features are not implemented yet.

ArchProbe is being built for personal interview preparation and as a portfolio project, initially targeting mid-level cloud, platform, and DevOps interviews.

## Planned experience

1. Choose a system design scenario and interview duration.
2. Discuss requirements with a voice-based AI interviewer.
3. Draw your architecture in an embedded Excalidraw whiteboard while explaining your decisions.
4. Answer follow-up questions grounded in your explanation and diagram.
5. Review feedback on requirements, scalability, reliability, trade-offs, and communication, with evidence from the session.

Initial scenarios include a highly available web application, a centralized logging platform, and a background job processing system.

## Proposed stack

| Component | Technology |
| --- | --- |
| Frontend | React, Vite, TypeScript |
| Styling | Tailwind CSS, shadcn/ui |
| Whiteboard | Excalidraw |
| Backend | Python, FastAPI, Uvicorn, Pydantic |
| Live communication | WebSockets |
| Storage | SQLite, SQLAlchemy |
| Interview reasoning | Local Codex app-server integration |
| Speech recognition | Local whisper.cpp |
| Spoken responses | Browser SpeechSynthesis |
| Testing | pytest, Vitest, Playwright |
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
- Click **Check backend** to verify the frontend/backend connection.
- **Start interview** currently updates the frontend only; it does not start an AI interview.

The backend permits frontend requests from `http://localhost:5173` and `http://127.0.0.1:5173`. If Vite starts on another port, update `allow_origins` in `backend/main.py` to match.

### Verify the frontend

From `frontend/`, run:

```bash
npm run build
npm run lint
```

To check connection failure handling, stop the backend with **Ctrl+C** and click **Check backend**. The page should display **Could not reach the backend**. Restart the backend and click again to see **Backend status: ok**.
