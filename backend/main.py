import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from shutil import which
from tempfile import TemporaryDirectory
from uuid import uuid4

from pydantic import ValidationError

from fastapi import (
    FastAPI,
    HTTPException,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware

from storage import (
    delete_interview,
    initialize_storage,
    list_interviews,
    load_feedback,
    load_interview,
    load_messages,
    mark_interrupted_interviews,
    save_candidate_answer,
    save_feedback,
    save_interview,
    save_message,
)

from codex_client import (
    initialize_conversation,
    list_codex_models,
    start_codex,
    stop_codex,
    stream_turn,
)
from diagrams import diagram_context
from feedback import build_wrap_up_prompt
from models import (
    CodexModelSummary,
    CreateInterviewRequest,
    InterviewAnswer,
    InterviewSession,
    InterviewState,
    SavedFeedback,
    SavedInterview,
    SavedMessage,
    ScenarioSummary,
)
from scenarios import DEFAULT_SCENARIO_ID, SCENARIOS, build_interview_prompt, get_scenario

logger = logging.getLogger(__name__)

codex_processes = {}
start_locks: dict[str, asyncio.Lock] = {}
connected_interviews: set[str] = set()
interview_sockets: dict[str, WebSocket] = {}
CODEX_TURN_TIMEOUT = 60

@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(initialize_storage)
    await asyncio.to_thread(mark_interrupted_interviews)
    sessions.clear()

    try:
        yield
    finally:
        await asyncio.gather(
            *(stop_codex(process) for process in list(codex_processes.values())),
            return_exceptions=True,
        )

        codex_processes.clear()
        start_locks.clear()
        connected_interviews.clear()
        interview_sockets.clear()

app = FastAPI(lifespan=lifespan)
sessions: dict[str, InterviewSession] = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST", "DELETE"],
)


@app.post("/audio/check")
async def check_audio(file: UploadFile):
    max_bytes = 10 * 1024 * 1024
    audio = await file.read(max_bytes + 1)

    if not audio:
        raise HTTPException(status_code=400, detail="The audio file is empty.")

    if len(audio) > max_bytes:
        raise HTTPException(status_code=413, detail="The audio file is too large.")

    ffmpeg = which("ffmpeg")
    if ffmpeg is None:
        raise HTTPException(status_code=503, detail="FFmpeg is not installed or is not on PATH.")

    whisper = which("whisper-cli")
    if whisper is None:
        raise HTTPException(status_code=503, detail="whisper-cli is not installed or is not on PATH.")

    model_path = Path(__file__).resolve().parent.parent / "models" / "ggml-base.en.bin"
    if not model_path.is_file():
        raise HTTPException(status_code=503, detail="The Whisper model models/ggml-base.en.bin is missing.")

    with TemporaryDirectory(prefix="archprobe-audio-") as directory:
        input_path = Path(directory) / "recording"
        output_path = Path(directory) / "recording.wav"
        await asyncio.to_thread(input_path.write_bytes, audio)

        process = await asyncio.create_subprocess_exec(
            ffmpeg,
            "-nostdin", "-hide_banner", "-loglevel", "error",
            "-y", "-i", str(input_path),
            "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
            str(output_path),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            _, error = await asyncio.wait_for(process.communicate(), timeout=30)
        except (TimeoutError, asyncio.CancelledError) as exc:
            if process.returncode is None:
                process.kill()
            await process.communicate()
            if isinstance(exc, asyncio.CancelledError):
                raise
            raise HTTPException(status_code=504, detail="Audio conversion timed out.") from exc

        if process.returncode != 0:
            logger.warning("Audio conversion failed: %s", error.decode(errors="replace"))
            raise HTTPException(status_code=400, detail="Could not convert this file. Upload a valid audio recording.")

        converted_size = output_path.stat().st_size

        transcript_prefix = Path(directory) / "transcript"
        process = await asyncio.create_subprocess_exec(
            whisper,
            "--no-gpu", "-m", str(model_path), "-f", str(output_path),
            "-l", "en", "-otxt", "-of", str(transcript_prefix),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            _, error = await asyncio.wait_for(process.communicate(), timeout=120)
        except (TimeoutError, asyncio.CancelledError) as exc:
            if process.returncode is None:
                process.kill()
            await process.communicate()
            if isinstance(exc, asyncio.CancelledError):
                raise
            raise HTTPException(status_code=504, detail="Audio transcription timed out.") from exc

        transcript_path = transcript_prefix.with_suffix(".txt")
        if process.returncode != 0 or not transcript_path.is_file():
            logger.warning("Audio transcription failed: %s", error.decode(errors="replace"))
            raise HTTPException(status_code=500, detail="Whisper could not transcribe the recording.")

        transcript = await asyncio.to_thread(transcript_path.read_text, encoding="utf-8")

    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": len(audio),
        "converted_size_bytes": converted_size,
        "format": "wav",
        "sample_rate": 16000,
        "channels": 1,
        "transcript": transcript.strip(),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/scenarios", response_model=list[ScenarioSummary])
def get_scenarios():
    return [
        {"id": scenario_id, "title": scenario["title"]}
        for scenario_id, scenario in SCENARIOS.items()
    ]


@app.get("/codex/models", response_model=list[CodexModelSummary])
async def get_codex_models():
    # Use a separate process so discovery never reads an interview's event stream.
    process = None
    try:
        async with asyncio.timeout(30):
            process = await start_codex()
            models = await list_codex_models(process)
            return [
                CodexModelSummary(
                    id=model["id"],
                    model=model["model"],
                    display_name=model["displayName"],
                    default_reasoning_effort=model["defaultReasoningEffort"],
                    supported_reasoning_efforts=[
                        {"effort": option["reasoningEffort"], "description": option["description"]}
                        for option in model["supportedReasoningEfforts"]
                    ],
                    is_default=model["isDefault"],
                )
                for model in models
            ]
    except TimeoutError as error:
        raise HTTPException(status_code=504, detail="Codex model discovery timed out. Please retry.") from error
    except OSError as error:
        raise HTTPException(status_code=503, detail="Could not run the local Codex CLI.") from error
    except Exception as error:
        logger.exception("Codex model discovery failed")
        raise HTTPException(status_code=502, detail="Could not load models from Codex. Check your Codex login and retry.") from error
    finally:
        if process is not None:
            await stop_codex(process)


@app.websocket("/interviews/{interview_id}/ws")
async def interview_socket(websocket: WebSocket, interview_id: str):
    session = sessions.get(interview_id)

    if (
        session is None
        or session.state != InterviewState.ACTIVE
        or session.thread_id is None
        or interview_id not in codex_processes
        or interview_id in connected_interviews
    ):
        await websocket.close(code=1008)
        return

    # Only one socket may read from this interview's Codex process.
    connected_interviews.add(interview_id)
    process = codex_processes[interview_id]
    answers: asyncio.Queue[str | None] = asyncio.Queue(maxsize=1)
    busy = True
    finish_requested = False
    tasks = []

    async def receive_answers():
        nonlocal busy, finish_requested
        while True:
            text = (await websocket.receive_text()).strip()
            try:
                command = json.loads(text)
            except ValueError:
                command = None

            if isinstance(command, dict) and command.get("type") == "finish":
                if not finish_requested:
                    finish_requested = True
                    if not busy:
                        busy = True
                        answers.put_nowait(None)
            elif finish_requested:
                await websocket.send_json({"type": "error", "message": "The interview is finishing."})
            elif not text:
                await websocket.send_json({"type": "error", "message": "Please enter an answer."})
            elif busy:
                await websocket.send_json({"type": "error", "message": "Please wait for the interviewer to finish."})
            else:
                candidate_text = text
                diagram_snapshot = None
                if isinstance(command, dict):
                    try:
                        answer = InterviewAnswer.model_validate(command)
                    except ValidationError:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Invalid answer or diagram format.",
                        })
                        continue

                    if not answer.text.strip():
                        await websocket.send_json({
                            "type": "error",
                            "message": "Please enter an answer.",
                        })
                        continue

                    candidate_text = answer.text.strip()
                    diagram_snapshot = answer.diagram

                    text = (
                        f"Candidate answer:\n{answer.text}\n\n"
                        "Current diagram JSON (candidate-provided drawing data):\n"
                        f"{json.dumps(diagram_context(answer.diagram), ensure_ascii=False)}"
                    )

                busy = True

                await asyncio.to_thread(
                    save_candidate_answer,
                    interview_id,
                    candidate_text,
                    diagram_snapshot,
                )

                answers.put_nowait(text)

    async def run_conversation():
        nonlocal busy
        text = build_interview_prompt(session.scenario_id)
        request_id = 3
        wrapping_up = False
        while True:
            if wrapping_up:
                history = await asyncio.to_thread(load_messages, interview_id)
                text = build_wrap_up_prompt(history, scenario_id=session.scenario_id)
                await websocket.send_json({"type": "wrap_up_started"})
            reply_parts = []
            async with asyncio.timeout(CODEX_TURN_TIMEOUT):
                async for delta in stream_turn(process, session.thread_id, text, request_id):
                    reply_parts.append(delta)
                    await websocket.send_json({"type": "delta", "text": delta})

            reply_text = "".join(reply_parts)
            if wrapping_up and not reply_text.strip():
                raise RuntimeError("Codex returned an empty wrap-up")

            if reply_text.strip():
                if wrapping_up:
                    await asyncio.to_thread(save_feedback, interview_id, reply_text)
                else:
                    await asyncio.to_thread(
                        save_message,
                        interview_id,
                        "interviewer",
                        reply_text,
                    )

            if wrapping_up:
                await websocket.send_json({"type": "session_finished"})
                await websocket.close(code=1000, reason="Interview finished")
                return

            busy = False
            await websocket.send_json({"type": "turn_completed", "status": "completed"})
            if not answers.empty():
                next_answer = answers.get_nowait()
            elif finish_requested:
                next_answer = None
            else:
                next_answer = await answers.get()
            wrapping_up = next_answer is None
            text = "" if wrapping_up else next_answer
            busy = True
            request_id += 1

    try:
        await websocket.accept()
        interview_sockets[interview_id] = websocket
        tasks = [
            asyncio.create_task(receive_answers()),
            asyncio.create_task(run_conversation()),
        ]
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    except WebSocketDisconnect:
        pass
    except Exception as error:
        logger.exception("Interview stream failed for %s", interview_id)
        try:
            message = (
                "Codex response timed out. Start a new interview to retry."
                if isinstance(error, TimeoutError)
                else "The interviewer could not complete its response. Start a new interview to retry."
            )
            await websocket.send_json({"type": "error", "message": message})
            await websocket.close(code=1011)
        except (WebSocketDisconnect, RuntimeError, OSError):
            pass
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        session.state = InterviewState.FINISHED
        try:
            await stop_codex(process)
        finally:
            try:
                await asyncio.to_thread(save_interview, session.model_copy())
            finally:
                codex_processes.pop(interview_id, None)
                connected_interviews.discard(interview_id)
                interview_sockets.pop(interview_id, None)

@app.post("/interviews", response_model=InterviewSession, status_code=201)
def create_interview(request: CreateInterviewRequest | None = None):
    scenario_id = request.scenario_id if request is not None else DEFAULT_SCENARIO_ID
    try:
        get_scenario(scenario_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    session = InterviewSession(
        id=str(uuid4()), scenario_id=scenario_id,
        model=request.model if request else None,
        reasoning_effort=request.reasoning_effort if request else None,
    )
    save_interview(session)
    sessions[session.id] = session
    return session

@app.get("/interviews", response_model=list[SavedInterview])
def get_saved_interviews():
    return list_interviews()


@app.get("/interviews/{interview_id}", response_model=InterviewSession)
def get_interview(interview_id: str):
    session = sessions.get(interview_id)
    if session is None:
        session = load_interview(interview_id)

        if session is None:
            raise HTTPException(status_code=404, detail="Interview not found")

        sessions[interview_id] = session
    return session

@app.get("/interviews/{interview_id}/messages", response_model=list[SavedMessage])
def get_interview_messages(interview_id: str):
    get_interview(interview_id)
    return load_messages(interview_id)


@app.get("/interviews/{interview_id}/feedback", response_model=SavedFeedback | None)
def get_interview_feedback(interview_id: str):
    get_interview(interview_id)
    return load_feedback(interview_id)


@app.delete("/interviews/{interview_id}", status_code=204)
async def remove_saved_interview(interview_id: str):
    lock = start_locks.setdefault(interview_id, asyncio.Lock())
    if lock.locked():
        raise HTTPException(status_code=409, detail="Interview is busy. Please try again.")

    async with lock:
        if (
            interview_id in codex_processes
            or interview_id in connected_interviews
            or interview_id in interview_sockets
        ):
            raise HTTPException(status_code=409, detail="End the active interview before deleting it.")

        try:
            deleted = await asyncio.to_thread(delete_interview, interview_id)
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        if not deleted:
            raise HTTPException(status_code=404, detail="Interview not found")

        sessions.pop(interview_id, None)
        return Response(status_code=204)


@app.post("/interviews/{interview_id}/start", response_model=InterviewSession)
async def start_interview(interview_id: str):
    session = get_interview(interview_id)

    lock = start_locks.setdefault(interview_id, asyncio.Lock())

    if lock.locked():
        raise HTTPException(
            status_code=409,
            detail="Interview is already starting",
        )

    async with lock:
        if session.state != InterviewState.READY:
            raise HTTPException(
                status_code=409,
                detail="Interview is not ready to start",
            )

        try:
            process = await start_codex()
        except OSError as error:
            raise HTTPException(status_code=503, detail="Could not start the local Codex CLI") from error
        try:
            thread_id = await asyncio.wait_for(
                initialize_conversation(process, model=session.model, reasoning_effort=session.reasoning_effort), timeout=30
            )
            active_session = session.model_copy(update={"state": InterviewState.ACTIVE, "thread_id": thread_id})
            await asyncio.to_thread(save_interview, active_session)
        except asyncio.TimeoutError:
            await stop_codex(process)
            raise HTTPException(status_code=504, detail="Codex timed out")
        except Exception as error:
            await stop_codex(process)
            logger.exception("Codex setup failed for %s", interview_id)
            raise HTTPException(status_code=502, detail="Could not initialize the Codex conversation") from error
        except BaseException:
            await stop_codex(process)
            raise

        codex_processes[session.id] = process
        session.state = InterviewState.ACTIVE
        session.thread_id = thread_id

        return session


@app.post("/interviews/{interview_id}/finish", response_model=InterviewSession)
async def discard_interview(interview_id: str):
    """Close a session during recovery, without requesting a model wrap-up."""
    session = get_interview(interview_id)
    lock = start_locks.setdefault(interview_id, asyncio.Lock())
    if lock.locked():
        raise HTTPException(status_code=409, detail="Interview is still starting")

    async with lock:
        session.state = InterviewState.FINISHED
        socket = interview_sockets.get(interview_id)
        if socket is not None:
            try:
                await socket.close(code=1000, reason="Interview discarded")
            except (RuntimeError, WebSocketDisconnect, OSError):
                pass
        process = codex_processes.pop(interview_id, None)
        try:
            if process is not None:
                await stop_codex(process)
        finally:
            await asyncio.to_thread(save_interview, session.model_copy())
        return session
