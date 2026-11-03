import asyncio
import json 


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


async def initialize_conversation(process):
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

    await send_message(process, {
        "id": 2,
        "method": "thread/start",
        "params": {},
    })

    result = await wait_for_response(process, 2)
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
