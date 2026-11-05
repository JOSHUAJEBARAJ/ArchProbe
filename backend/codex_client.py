import asyncio
import json 

CODEX_MODEL = "gpt-6.1-sol"
CODEX_REASONING_EFFORT = "medium"


async def start_codex():
    process = await asyncio.create_subprocess_exec(
        "codex", "app-server", stdout=asyncio.subprocess.PIPE,stdin= asyncio.subprocess.PIPE
    )

    return process

async def send_message(process, message):
    data = json.dumps(message) + "\n"
    process.stdin.write(data.encode("utf-8"))
    await process.stdin.drain()

async def read_message(process):
    line = await process.stdout.readline()

    if not line:
        raise RuntimeError("Codex closed its output stream")

    return json.loads(line.decode("utf-8"))


async def wait_for_response(process, request_id):
    while True:
        message = await read_message(process)

        if message.get("id") == request_id:
            if "error" in message:
                raise RuntimeError(message["error"])

            return message["result"]


async def initialize_connection(process):
    """Complete the handshake without creating an interview thread."""
    await send_message(process, {
        "id": 1,
        "method": "initialize",
        "params": {
            "clientInfo": {
                "name": "archprobe",
                "title": "ArchProbe",
                "version": "0.1.0",
            }
        },
    })

    await wait_for_response(process, 1)

    await send_message(process, {
        "method": "initialized",
        "params": {},
    })


async def list_codex_models(process):
    await initialize_connection(process)
    return await read_model_catalog(process)


async def read_model_catalog(process):
    models = []
    cursor = None
    seen_cursors = set()
    request_id = 2
    while True:
        params = {"limit": 100, "includeHidden": False}
        if cursor is not None:
            params["cursor"] = cursor
        await send_message(process, {
            "id": request_id,
            "method": "model/list",
            "params": params,
        })
        result = await wait_for_response(process, request_id)
        models.extend(model for model in result["data"] if not model.get("hidden", False))
        cursor = result.get("nextCursor")
        if cursor is None:
            return models
        if cursor in seen_cursors:
            raise RuntimeError("Codex returned a repeated model-list cursor")
        seen_cursors.add(cursor)
        request_id += 1


async def initialize_conversation(process, model=None, reasoning_effort=None):
    await initialize_connection(process)
    selected_model = model or CODEX_MODEL
    selected_effort = reasoning_effort or CODEX_REASONING_EFFORT
    if model is not None or reasoning_effort is not None:
        catalog = await read_model_catalog(process)
        choice = next((item for item in catalog if item["model"] == selected_model), None)
        if choice is None:
            raise ValueError("The selected model is no longer available in Codex.")
        efforts = {option["reasoningEffort"] for option in choice["supportedReasoningEfforts"]}
        if selected_effort not in efforts:
            raise ValueError("The selected reasoning effort is not supported by this model.")
    await send_message(process, {
        "id": 1000,
        "method": "thread/start",
        "params": {
            "model": selected_model,
            "config": {
                "model_reasoning_effort": selected_effort,
            },
        },
    })

    result = await wait_for_response(process, 1000)
    return result["thread"]["id"]


async def stream_turn(process, thread_id, text, request_id):
    """Stream one turn; the caller must be the process's only output reader."""
    await send_message(process, {
        "id": request_id,
        "method": "turn/start",
        "params": {
            "threadId": thread_id,
            "input": [{"type": "text", "text": text}],
        },
    })

    while True:
        message = await read_message(process)

        if message.get("id") == request_id and "error" in message:
            raise RuntimeError(message["error"])

        params = message.get("params", {})
        if params.get("threadId", thread_id) != thread_id:
            continue

        if message.get("method") == "item/agentMessage/delta":
            yield params["delta"]
        elif message.get("method") == "turn/completed":
            turn = params["turn"]
            if turn["status"] != "completed":
                raise RuntimeError(turn.get("error") or f"Codex turn {turn['status']}")
            return


async def stop_codex(process):
    if process.returncode is not None:
        return

    try:
        process.terminate()
    except ProcessLookupError:
        await process.wait()
        return

    try:
        await asyncio.wait_for(process.wait(), timeout=5)
    except asyncio.TimeoutError:
        try:
            process.kill()
        except ProcessLookupError:
            pass
        await process.wait()
