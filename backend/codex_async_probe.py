import asyncio

from codex_client import (
    initialize_conversation,
    read_message,
    send_message,
    start_codex,
    stop_codex,
)
from scenarios import INTERVIEW_PROMPT


async def main():
    process = await start_codex()

    try:
        thread_id = await initialize_conversation(process)
        print("Created conversation:", thread_id)

        await send_message(process, {
            "id": 3,
            "method": "turn/start",
            "params": {
                "threadId": thread_id,
                "input": [
                    {"type": "text", "text": INTERVIEW_PROMPT}
                ],
            },
        })

        while True:
            message = await read_message(process)

            if "error" in message:
                raise RuntimeError(message["error"])

            if message.get("method") == "item/agentMessage/delta":
                print(message["params"]["delta"], end="", flush=True)

            elif message.get("method") == "turn/completed":
                turn = message["params"]["turn"]
                print("\nTurn status:", turn["status"])

                if turn["status"] != "completed":
                    raise RuntimeError(turn.get("error"))

                break
    finally:
        await stop_codex(process)


if __name__ == "__main__":
    asyncio.run(main())
