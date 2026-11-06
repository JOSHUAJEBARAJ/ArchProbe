# ArchProbe backend

Run commands from this directory. Follow the [root setup guide](../README.md) to install and authenticate Codex, install FFmpeg and whisper.cpp, and download `../models/ggml-base.en.bin`.

```bash
uv sync --locked
uv run uvicorn main:app --host 127.0.0.1 --port 8000
```

Add `--reload` for development. Documentation: http://127.0.0.1:8000/docs.

## Main modules

- `main.py`: FastAPI routes, audio processing, and interview WebSocket lifecycle.
- `codex_client.py`: app-server handshake, model discovery, thread creation, streamed turns, and process cleanup.
- `scenario_loader.py` and `scenario_content/`: validated YAML interview scenarios.
- `diagrams.py`: trims submitted scene elements into model context.
- `feedback.py`: builds evidence-aware wrap-up prompts and validates source markers.
- `storage.py`, `db_models.py`, and `database.py`: SQLite persistence in `data/archprobe.db`.

Scenario and model selections live in memory; they are not database columns yet. Restarting the backend marks previously active saved interviews interrupted. Completed history can still be read, but live interview resumption is not implemented.

## Checks

```bash
uv run python -m unittest discover -s tests
```

Tests simulate Codex events and use temporary databases; they do not perform live model-quality evaluation. See [PLAN.md](../PLAN.md) for deferred acceptance testing and measurements.
