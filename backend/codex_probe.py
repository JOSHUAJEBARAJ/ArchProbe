import json
import subprocess
from time import perf_counter

from scenarios import INTERVIEW_PROMPT


def send_message(process, message):
    process.stdin.write(json.dumps(message) + "\n")
    process.stdin.flush()


def main():
    process = subprocess.Popen(
        ["codex", "app-server"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )

    try:
        message = {
            "id": 1,
            "method": "initialize",
            "params": {
                "clientInfo": {
                    "name": "archprobe",
                    "title": "ArchProbe",
                    "version": "0.1.0",
                }
            },
        }

        send_message(process, message)
        completed_turns = 0

        for line in process.stdout:
            response = json.loads(line)
            if "error" in response:
                print("Codex returned an error:", response["error"])
                break

            if response.get("id") == 1:
                print("Connected to Codex")

                notification = {
                    "method": "initialized",
                    "params": {},
                }
                send_message(process, notification)

                request = {
                    "id": 2,
                    "method": "thread/start",
                    "params": {},
                }
                send_message(process, request)

            elif response.get("id") == 2:
                thread_id = response["result"]["thread"]["id"]
                print("Created conversation:", thread_id)

                question = {
                    "id": 3,
                    "method": "turn/start",
                    "params": {
                        "threadId": thread_id,
                        "input": [
                            {
                                "type": "text",
                                "text": INTERVIEW_PROMPT,
                            }
                        ],
                    },
                }

                turn_started_at = perf_counter()
                send_message(process, question)

            elif response.get("method") == "item/agentMessage/delta":
                print(response["params"]["delta"], end="", flush=True)

            elif response.get("method") == "turn/completed":
                turn = response["params"]["turn"]
                print("\nTurn status:", turn["status"])
                elapsed = perf_counter() - turn_started_at
                print(f"Full response time: {elapsed:.2f} seconds")

                if turn["status"] != "completed":
                    print("Turn did not succeed:", turn.get("error"))
                    break

                completed_turns += 1
                if turn["status"] == "completed":
                # if completed_turns == 1:
                    canditate_answer = input("\n Your answer:")
                    if canditate_answer.strip().lower() == "quit":
                        break

                    answer = {
                        "id": completed_turns + 3,
                        "method": "turn/start",
                        "params": {
                            "threadId": thread_id,
                            "input": [
                                {
                                    "type": "text",
                                    "text": canditate_answer,
                                }
                            ],
                        },
                    }

                    turn_started_at = perf_counter()
                    send_message(process, answer)
                else:
                    break
    finally:
        process.terminate()
        process.wait()


if __name__ == "__main__":
    main()
