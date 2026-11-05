import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

import main
from db_test_support import use_test_database
from models import InterviewSession, InterviewState


class SessionLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.database_engine = use_test_database(self)
        main.sessions.clear()
        main.codex_processes.clear()
        main.start_locks.clear()
        main.connected_interviews.clear()
        main.interview_sockets.clear()
        self.enterContext(patch.object(main.logger, "exception"))

    async def asyncTearDown(self):
        main.sessions.clear()
        main.codex_processes.clear()
        main.start_locks.clear()
        main.connected_interviews.clear()
        main.interview_sockets.clear()

    def test_create_retrieve_and_missing_id(self):
        first = main.create_interview()
        second = main.create_interview()
        self.assertNotEqual(first.id, second.id)
        self.assertEqual(first.state, InterviewState.READY)
        self.assertIsNone(first.thread_id)
        self.assertIs(main.get_interview(first.id), first)
        with self.assertRaises(HTTPException) as raised:
            main.get_interview("missing")
        self.assertEqual(raised.exception.status_code, 404)

    def test_invalid_session_state_rejected(self):
        with self.assertRaises(ValidationError):
            InterviewSession(id="test", state="unknown")

    async def test_start_success_and_repeat_rejected(self):
        session = main.create_interview()
        process = object()
        start = AsyncMock(return_value=process)
        with patch.object(main, "start_codex", start), patch.object(main, "initialize_conversation", AsyncMock(return_value="thread-1")):
            result = await main.start_interview(session.id)
            self.assertEqual(result.state, InterviewState.ACTIVE)
            self.assertEqual(result.thread_id, "thread-1")
            saved = main.load_interview(session.id)
            self.assertEqual(saved.state, InterviewState.ACTIVE)
            self.assertEqual(saved.thread_id, "thread-1")
            self.assertIs(main.codex_processes[session.id], process)
            with self.assertRaises(HTTPException) as raised:
                await main.start_interview(session.id)
            self.assertEqual(raised.exception.status_code, 409)
        start.assert_awaited_once()

    async def test_concurrent_start_is_rejected(self):
        session = main.create_interview()
        entered = asyncio.Event()
        release = asyncio.Event()

        async def initialize(process):
            entered.set()
            await release.wait()
            return "thread-1"

        start = AsyncMock(return_value=object())
        with patch.object(main, "start_codex", start), patch.object(main, "initialize_conversation", initialize):
            first = asyncio.create_task(main.start_interview(session.id))
            try:
                await asyncio.wait_for(entered.wait(), timeout=2)
                with self.assertRaises(HTTPException) as raised:
                    await main.start_interview(session.id)
                self.assertEqual(raised.exception.status_code, 409)
            finally:
                release.set()
                await first
        start.assert_awaited_once()

    async def test_setup_failure_and_timeout_clean_up_and_allow_retry(self):
        for failure, expected_status in ((RuntimeError("setup failed"), 502), (TimeoutError(), 504)):
            with self.subTest(status=expected_status):
                session = main.create_interview()
                process = object()
                stop = AsyncMock()
                with patch.object(main, "start_codex", AsyncMock(return_value=process)), patch.object(main, "initialize_conversation", AsyncMock(side_effect=failure)), patch.object(main, "stop_codex", stop):
                    with self.assertRaises(HTTPException) as raised:
                        await main.start_interview(session.id)
                self.assertEqual(raised.exception.status_code, expected_status)
                self.assertEqual(session.state, InterviewState.READY)
                self.assertNotIn(session.id, main.codex_processes)
                self.assertFalse(main.start_locks[session.id].locked())
                stop.assert_awaited_once_with(process)
                with patch.object(main, "start_codex", AsyncMock(return_value=process)), patch.object(main, "initialize_conversation", AsyncMock(return_value="retry-thread")):
                    self.assertEqual((await main.start_interview(session.id)).thread_id, "retry-thread")

    async def test_missing_cli_returns_service_unavailable(self):
        session = main.create_interview()
        with patch.object(main, "start_codex", AsyncMock(side_effect=FileNotFoundError("codex"))):
            with self.assertRaises(HTTPException) as raised:
                await main.start_interview(session.id)
        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(session.state, InterviewState.READY)
        self.assertFalse(main.start_locks[session.id].locked())

    async def test_cancellation_cleans_up_process_and_releases_lock(self):
        session = main.create_interview()
        process = object()
        stop = AsyncMock()
        with patch.object(main, "start_codex", AsyncMock(return_value=process)), patch.object(main, "initialize_conversation", AsyncMock(side_effect=asyncio.CancelledError)), patch.object(main, "stop_codex", stop):
            with self.assertRaises(asyncio.CancelledError):
                await main.start_interview(session.id)
        stop.assert_awaited_once_with(process)
        self.assertFalse(main.start_locks[session.id].locked())
        self.assertNotIn(session.id, main.codex_processes)

    async def test_discard_is_idempotent_and_stops_pending_connection(self):
        session = main.create_interview()
        session.state = InterviewState.ACTIVE
        process = object()
        main.codex_processes[session.id] = process
        stop = AsyncMock()
        with patch.object(main, "stop_codex", stop):
            first = await main.discard_interview(session.id)
            second = await main.discard_interview(session.id)
        self.assertIs(first, second)
        self.assertEqual(first.state, InterviewState.FINISHED)
        self.assertEqual(main.load_interview(session.id).state, InterviewState.FINISHED)
        self.assertNotIn(session.id, main.codex_processes)
        stop.assert_awaited_once_with(process)
        with self.assertRaises(HTTPException) as raised:
            await main.start_interview(session.id)
        self.assertEqual(raised.exception.status_code, 409)

    async def test_finished_metadata_survives_memory_and_connection_reset(self):
        session = main.create_interview()
        with patch.object(main, "start_codex", AsyncMock(return_value=object())), patch.object(main, "initialize_conversation", AsyncMock(return_value="saved-thread")), patch.object(main, "stop_codex", AsyncMock()):
            await main.start_interview(session.id)
            await main.discard_interview(session.id)

        main.sessions.clear()
        self.database_engine.dispose()
        restored = main.get_interview(session.id)
        self.assertEqual(restored.id, session.id)
        self.assertEqual(restored.state, InterviewState.FINISHED)
        self.assertEqual(restored.thread_id, "saved-thread")

    async def test_discard_saves_finished_even_if_process_cleanup_fails(self):
        session = main.create_interview()
        session.state = InterviewState.ACTIVE
        main.codex_processes[session.id] = object()
        with patch.object(main, "stop_codex", AsyncMock(side_effect=RuntimeError("stop failed"))):
            with self.assertRaises(RuntimeError):
                await main.discard_interview(session.id)
        self.assertNotIn(session.id, main.codex_processes)
        self.assertEqual(main.load_interview(session.id).state, InterviewState.FINISHED)

    async def test_startup_recovers_active_metadata_and_rejects_resuming_it(self):
        stale = main.create_interview()
        stale.state = InterviewState.ACTIVE
        stale.thread_id = "old-thread"
        main.save_interview(stale)

        start = AsyncMock()
        with patch.object(main, "start_codex", start):
            async with main.lifespan(main.app):
                restored = main.get_interview(stale.id)
                self.assertIsNot(restored, stale)
                self.assertEqual(restored.state, InterviewState.INTERRUPTED)
                self.assertEqual(restored.thread_id, "old-thread")
                with self.assertRaises(HTTPException) as raised:
                    await main.start_interview(stale.id)
                self.assertEqual(raised.exception.status_code, 409)
        start.assert_not_awaited()

    async def test_shutdown_attempts_all_process_cleanup(self):
        first, second = object(), object()
        main.codex_processes.update(first=first, second=second)
        stop = AsyncMock(side_effect=[RuntimeError("already gone"), None])
        with patch.object(main, "stop_codex", stop):
            async with main.lifespan(main.app):
                pass
        self.assertEqual(stop.await_count, 2)
        self.assertFalse(main.codex_processes)
