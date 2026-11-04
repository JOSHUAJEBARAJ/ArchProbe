import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

import codex_client
import main
from models import InterviewSession, InterviewState
from scenarios import INTERVIEW_PROMPT, WRAP_UP_PROMPT


class SocketClient:
    """An in-process ASGI client; no server, network, or Codex account needed."""

    def __init__(self, interview_id):
        self.incoming = asyncio.Queue()
        self.outgoing = asyncio.Queue()
        self.incoming.put_nowait({"type": "websocket.connect"})
        path = f"/interviews/{interview_id}/ws"
        self.scope = {
            "type": "websocket",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "scheme": "ws",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": [],
            "root_path": "",
            "subprotocols": [],
            "client": ("127.0.0.1", 50000),
            "server": ("127.0.0.1", 8000),
        }
        self.task = asyncio.create_task(
            main.app(self.scope, self.incoming.get, self.outgoing.put)
        )

    async def receive(self):
        return await asyncio.wait_for(self.outgoing.get(), timeout=2)

    async def event(self):
        message = await self.receive()
        assert message["type"] == "websocket.send", message
        return json.loads(message["text"])

    def send(self, text):
        self.incoming.put_nowait({"type": "websocket.receive", "text": text})

    async def disconnect(self):
        self.incoming.put_nowait({"type": "websocket.disconnect", "code": 1000})
        await asyncio.wait_for(self.task, timeout=2)


class InterviewSocketTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        main.sessions.clear()
        main.codex_processes.clear()
        main.connected_interviews.clear()
        main.interview_sockets.clear()
        self.clients = []
        self.stop = self.enterContext(patch.object(main, "stop_codex", AsyncMock()))
        self.enterContext(patch.object(main.logger, "exception"))
        self.session = InterviewSession(
            id="interview-1", state=InterviewState.ACTIVE, thread_id="thread-1"
        )
        self.process = object()
        main.sessions[self.session.id] = self.session
        main.codex_processes[self.session.id] = self.process

    async def asyncTearDown(self):
        for client in self.clients:
            if not client.task.done():
                client.task.cancel()
        await asyncio.gather(*(client.task for client in self.clients), return_exceptions=True)
        main.sessions.clear()
        main.codex_processes.clear()
        main.connected_interviews.clear()
        main.interview_sockets.clear()

    def connect(self, interview_id="interview-1"):
        client = SocketClient(interview_id)
        self.clients.append(client)
        return client

    async def test_opening_prompt_and_answer_use_same_thread(self):
        calls = []

        async def stream(process, thread_id, text, request_id):
            calls.append((process, thread_id, text, request_id))
            yield "First "
            yield "question?"

        self.enterContext(patch.object(main, "stream_turn", stream))
        client = self.connect()
        self.assertEqual((await client.receive())["type"], "websocket.accept")
        for turn in range(2):
            self.assertEqual(await client.event(), {"type": "delta", "text": "First "})
            self.assertEqual(await client.event(), {"type": "delta", "text": "question?"})
            self.assertEqual(await client.event(), {"type": "turn_completed", "status": "completed"})
            if turn == 0:
                client.send("We use one repository.")
        await client.disconnect()
        self.assertEqual(calls, [
            (self.process, "thread-1", INTERVIEW_PROMPT, 3),
            (self.process, "thread-1", "We use one repository.", 4),
        ])
        self.assertEqual(self.session.state, InterviewState.FINISHED)
        self.assertNotIn(self.session.id, main.codex_processes)
        self.stop.assert_awaited_once_with(self.process)

    async def test_structured_answers_forward_current_compact_snapshot(self):
        calls = []

        async def stream(process, thread_id, text, request_id):
            calls.append((thread_id, text, request_id))
            yield "Question?"

        self.enterContext(patch.object(main, "stream_turn", stream))
        client = self.connect()
        await client.receive()
        await client.event()
        await client.event()

        for revision, elements in [
            (1, [{"id": "git", "type": "text", "text": "Git", "seed": 123}]),
            (2, []),
        ]:
            client.send(json.dumps({
                "type": "answer", "text": "My current design.",
                "diagram": {"revision": revision, "elements": elements},
            }))
            self.assertEqual((await client.event())["type"], "delta")
            self.assertEqual((await client.event())["type"], "turn_completed")

        await client.disconnect()
        first_snapshot = json.loads(calls[1][1].split("data):\n", 1)[1])
        latest_snapshot = json.loads(calls[2][1].split("data):\n", 1)[1])
        self.assertEqual(first_snapshot, {
            "revision": 1, "elements": [{"id": "git", "type": "text", "text": "Git"}],
        })
        self.assertEqual(latest_snapshot, {"revision": 2, "elements": []})
        self.assertEqual([(call[0], call[2]) for call in calls], [
            ("thread-1", 3), ("thread-1", 4), ("thread-1", 5),
        ])

    async def test_invalid_structured_answer_allows_retry(self):
        calls = []

        async def stream(process, thread_id, text, request_id):
            calls.append(text)
            yield "Question?"

        self.enterContext(patch.object(main, "stream_turn", stream))
        client = self.connect()
        await client.receive()
        await client.event()
        await client.event()
        for answer in [
            {"type": "answer", "text": "Design", "diagram": {"elements": [], "revision": 0}},
            {"type": "answer", "text": "   ", "diagram": {"elements": []}},
            {"type": "answer", "text": "Design", "diagram": {"elements": "invalid"}},
        ]:
            client.send(json.dumps(answer))
            self.assertEqual((await client.event())["type"], "error")
            self.assertEqual(len(calls), 1)
        client.send("A valid retry.")
        self.assertEqual((await client.event())["type"], "delta")
        self.assertEqual((await client.event())["type"], "turn_completed")
        await client.disconnect()
        self.assertEqual(calls[1], "A valid retry.")

    async def test_busy_answers_rejected_and_disconnect_cancels_generation(self):
        entered = asyncio.Event()
        cancelled = asyncio.Event()

        async def stream(*args):
            entered.set()
            try:
                await asyncio.Future()
                yield "unreachable"
            finally:
                cancelled.set()

        self.enterContext(patch.object(main, "stream_turn", stream))
        client = self.connect()
        await client.receive()
        await asyncio.wait_for(entered.wait(), timeout=2)
        client.send("Too early")
        self.assertEqual((await client.event())["type"], "error")
        await client.disconnect()
        self.assertTrue(cancelled.is_set())
        self.stop.assert_awaited_once_with(self.process)

    async def test_failure_and_timeout_close_and_clean_up(self):
        async def failing(*args):
            raise RuntimeError("Model failed")
            yield "unreachable"

        async def stalled(*args):
            await asyncio.Future()
            yield "unreachable"

        for stream in (failing, stalled):
            with self.subTest(stream=stream.__name__):
                self.session.state = InterviewState.ACTIVE
                main.codex_processes[self.session.id] = self.process
                with patch.object(main, "stream_turn", stream), patch.object(main, "CODEX_TURN_TIMEOUT", 0.01):
                    client = self.connect()
                    await client.receive()
                    self.assertEqual((await client.event())["type"], "error")
                    self.assertEqual((await client.receive())["code"], 1011)
                    await asyncio.wait_for(client.task, timeout=2)
                self.assertEqual(self.session.state, InterviewState.FINISHED)
                self.assertNotIn(self.session.id, main.codex_processes)

    async def test_invalid_session_and_second_socket_rejected(self):
        for state in (InterviewState.READY, InterviewState.FINISHED):
            self.session.state = state
            client = self.connect()
            self.assertEqual((await client.receive())["code"], 1008)
            await client.task
        self.session.state = InterviewState.ACTIVE
        for interview_id in ("missing", "interview-1"):
            if interview_id == "interview-1":
                main.connected_interviews.add(interview_id)
            client = self.connect(interview_id)
            self.assertEqual((await client.receive())["code"], 1008)
            await client.task
        self.assertEqual(self.session.state, InterviewState.ACTIVE)
        self.stop.assert_not_awaited()

    async def test_finish_streams_one_wrap_up_then_closes(self):
        calls = []

        async def stream(process, thread_id, text, request_id):
            calls.append((thread_id, text, request_id))
            yield "Summary" if text == WRAP_UP_PROMPT else "Question"

        self.enterContext(patch.object(main, "stream_turn", stream))
        client = self.connect()
        await client.receive()
        await client.event()
        await client.event()
        client.send(json.dumps({"type": "finish"}))
        client.send(json.dumps({"type": "finish"}))
        self.assertEqual(await client.event(), {"type": "wrap_up_started"})
        self.assertEqual(await client.event(), {"type": "delta", "text": "Summary"})
        self.assertEqual(await client.event(), {"type": "session_finished"})
        self.assertEqual((await client.receive())["code"], 1000)
        await asyncio.wait_for(client.task, timeout=2)
        self.assertEqual(calls, [
            ("thread-1", INTERVIEW_PROMPT, 3),
            ("thread-1", WRAP_UP_PROMPT, 4),
        ])
        self.assertEqual(self.session.state, InterviewState.FINISHED)
        self.stop.assert_awaited_once_with(self.process)

    async def test_finish_during_generation_waits_for_turn_before_wrap_up(self):
        entered = asyncio.Event()
        release = asyncio.Event()
        calls = []

        async def stream(process, thread_id, text, request_id):
            calls.append(text)
            if text == INTERVIEW_PROMPT:
                entered.set()
                await release.wait()
            yield "Response"

        self.enterContext(patch.object(main, "stream_turn", stream))
        client = self.connect()
        await client.receive()
        await asyncio.wait_for(entered.wait(), timeout=2)
        client.send(json.dumps({"type": "finish"}))
        await asyncio.sleep(0)
        release.set()
        self.assertEqual((await client.event())["type"], "delta")
        self.assertEqual((await client.event())["type"], "turn_completed")
        self.assertEqual((await client.event())["type"], "wrap_up_started")
        self.assertEqual((await client.event())["type"], "delta")
        self.assertEqual((await client.event())["type"], "session_finished")
        await client.receive()
        await asyncio.wait_for(client.task, timeout=2)
        self.assertEqual(calls, [INTERVIEW_PROMPT, WRAP_UP_PROMPT])

    async def test_blank_answer_is_rejected_without_starting_a_turn(self):
        calls = []

        async def stream(*args):
            calls.append(args)
            yield "Question"

        self.enterContext(patch.object(main, "stream_turn", stream))
        client = self.connect()
        await client.receive()
        await client.event()
        await client.event()
        client.send("   ")
        self.assertEqual((await client.event())["type"], "error")
        self.assertEqual(len(calls), 1)
        await client.disconnect()

    async def test_finish_preserves_an_already_submitted_answer(self):
        calls = []

        async def stream(process, thread_id, text, request_id):
            calls.append((text, request_id))
            yield "Response"

        self.enterContext(patch.object(main, "stream_turn", stream))
        client = self.connect()
        await client.receive()
        await client.event()
        await client.event()
        client.send("I would build once and promote the same artifact.")
        client.send(json.dumps({"type": "finish"}))
        while True:
            event = await client.event()
            if event["type"] == "session_finished":
                break
        self.assertEqual((await client.receive())["code"], 1000)
        await asyncio.wait_for(client.task, timeout=2)
        self.assertEqual(calls, [
            (INTERVIEW_PROMPT, 3),
            ("I would build once and promote the same artifact.", 4),
            (WRAP_UP_PROMPT, 5),
        ])

    async def test_failed_wrap_up_reports_error_instead_of_success(self):
        async def stream(process, thread_id, text, request_id):
            if text == WRAP_UP_PROMPT:
                raise RuntimeError("Wrap-up failed")
            yield "Question"

        self.enterContext(patch.object(main, "stream_turn", stream))
        client = self.connect()
        await client.receive()
        await client.event()
        await client.event()
        client.send(json.dumps({"type": "finish"}))
        self.assertEqual((await client.event())["type"], "wrap_up_started")
        self.assertEqual((await client.event())["type"], "error")
        self.assertEqual((await client.receive())["code"], 1011)
        await asyncio.wait_for(client.task, timeout=2)


class StreamTurnTests(unittest.IsolatedAsyncioTestCase):
    async def test_streams_until_completed_without_waiting_for_a_separate_ack(self):
        send = AsyncMock()
        read = AsyncMock(side_effect=[
            {"method": "account/updated", "params": {}},
            {"method": "item/agentMessage/delta", "params": {"threadId": "other", "delta": "ignore"}},
            {"method": "item/agentMessage/delta", "params": {"threadId": "thread-1", "delta": "Hello"}},
            {"id": 3, "result": {"turn": {"id": "turn-1"}}},
            {"method": "turn/completed", "params": {"threadId": "thread-1", "turn": {"status": "completed"}}},
        ])
        with patch.object(codex_client, "send_message", send), patch.object(codex_client, "read_message", read):
            chunks = [chunk async for chunk in codex_client.stream_turn(None, "thread-1", "Prompt", 3)]
        self.assertEqual(chunks, ["Hello"])
        self.assertEqual(send.await_args.args[1]["params"]["threadId"], "thread-1")

    async def test_request_error_and_failed_turn_raise(self):
        for message in (
            {"id": 3, "error": {"message": "Usage limit"}},
            {"method": "turn/completed", "params": {"turn": {"status": "failed", "error": {"message": "Model failed"}}}},
        ):
            with patch.object(codex_client, "send_message", AsyncMock()), patch.object(codex_client, "read_message", AsyncMock(return_value=message)):
                with self.assertRaises(RuntimeError):
                    async for _ in codex_client.stream_turn(None, "thread-1", "Prompt", 3):
                        pass


if __name__ == "__main__":
    unittest.main()
