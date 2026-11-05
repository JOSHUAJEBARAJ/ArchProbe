import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

import codex_client
import main
from db_test_support import use_test_database
from models import CreateInterviewRequest


class CodexModelDiscoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_selected_settings_are_validated_and_sent_to_codex(self):
        catalog = [{"model": "chosen-model", "supportedReasoningEfforts": [{"reasoningEffort": "high"}]}]
        send = AsyncMock()
        with patch.object(codex_client, "initialize_connection", AsyncMock()), patch.object(codex_client, "read_model_catalog", AsyncMock(return_value=catalog)), patch.object(codex_client, "send_message", send), patch.object(codex_client, "wait_for_response", AsyncMock(return_value={"thread": {"id": "thread-1"}})):
            result = await codex_client.initialize_conversation(object(), model="chosen-model", reasoning_effort="high")
        self.assertEqual(result, "thread-1")
        self.assertEqual(send.await_args.args[1]["params"], {
            "model": "chosen-model", "config": {"model_reasoning_effort": "high"},
        })

    async def test_invalid_model_or_effort_never_starts_a_thread(self):
        catalog = [{"model": "chosen-model", "supportedReasoningEfforts": [{"reasoningEffort": "low"}]}]
        for model, effort in [("missing", "low"), ("chosen-model", "unsupported")]:
            with self.subTest(model=model, effort=effort):
                send = AsyncMock()
                with patch.object(codex_client, "initialize_connection", AsyncMock()), patch.object(codex_client, "read_model_catalog", AsyncMock(return_value=catalog)), patch.object(codex_client, "send_message", send):
                    with self.assertRaises(ValueError):
                        await codex_client.initialize_conversation(object(), model=model, reasoning_effort=effort)
                send.assert_not_awaited()

    async def test_interview_uses_its_own_selected_settings(self):
        use_test_database(self)
        self.addCleanup(main.sessions.clear)
        self.addCleanup(main.codex_processes.clear)
        self.addCleanup(main.start_locks.clear)
        first = main.create_interview(CreateInterviewRequest(scenario_id="ci_cd", model="first-model", reasoning_effort="low"))
        second = main.create_interview(CreateInterviewRequest(scenario_id="observability", model="second-model", reasoning_effort="high"))
        initialize = AsyncMock(side_effect=["first-thread", "second-thread"])
        with patch.object(main, "start_codex", AsyncMock(side_effect=[object(), object()])), patch.object(main, "initialize_conversation", initialize):
            await main.start_interview(first.id)
            await main.start_interview(second.id)
        self.assertEqual(initialize.await_args_list[0].kwargs, {"model": "first-model", "reasoning_effort": "low"})
        self.assertEqual(initialize.await_args_list[1].kwargs, {"model": "second-model", "reasoning_effort": "high"})

    async def test_discovery_initializes_and_paginates_without_creating_a_thread(self):
        send = AsyncMock()
        responses = AsyncMock(side_effect=[
            {},
            {"data": [{"id": "first"}, {"id": "hidden", "hidden": True}], "nextCursor": "page-two"},
            {"data": [{"id": "second"}], "nextCursor": None},
        ])
        with patch.object(codex_client, "send_message", send), patch.object(codex_client, "wait_for_response", responses):
            result = await codex_client.list_codex_models(object())
        self.assertEqual(result, [{"id": "first"}, {"id": "second"}])
        requests = [call.args[1] for call in send.await_args_list]
        self.assertEqual([request["method"] for request in requests], [
            "initialize", "initialized", "model/list", "model/list",
        ])
        self.assertFalse(requests[2]["params"]["includeHidden"])
        self.assertEqual(requests[3]["params"]["cursor"], "page-two")
        self.assertNotEqual(requests[2]["id"], requests[3]["id"])

    async def test_repeated_cursor_is_rejected(self):
        responses = AsyncMock(side_effect=[{}, {"data": [], "nextCursor": "same"}, {"data": [], "nextCursor": "same"}])
        with patch.object(codex_client, "send_message", AsyncMock()), patch.object(codex_client, "wait_for_response", responses):
            with self.assertRaisesRegex(RuntimeError, "repeated"):
                await codex_client.list_codex_models(object())

    async def test_endpoint_returns_model_and_reasoning_choices_and_stops_process(self):
        process = object()
        catalog = [{
            "id": "catalog-id", "model": "selectable-model", "displayName": "Example model",
            "defaultReasoningEffort": "medium", "isDefault": True,
            "supportedReasoningEfforts": [{"reasoningEffort": "medium", "description": "Balanced"}],
        }]
        stop = AsyncMock()
        with patch.object(main, "start_codex", AsyncMock(return_value=process)), patch.object(main, "list_codex_models", AsyncMock(return_value=catalog)), patch.object(main, "stop_codex", stop):
            result = await main.get_codex_models()
        self.assertEqual(result[0].model_dump(), {
            "id": "catalog-id", "model": "selectable-model", "display_name": "Example model",
            "default_reasoning_effort": "medium", "is_default": True,
            "supported_reasoning_efforts": [{"effort": "medium", "description": "Balanced"}],
        })
        stop.assert_awaited_once_with(process)

    async def test_discovery_error_and_timeout_stop_the_process(self):
        for error, status in [(RuntimeError("private details"), 502), (TimeoutError(), 504)]:
            with self.subTest(status=status):
                process = object()
                stop = AsyncMock()
                with patch.object(main, "start_codex", AsyncMock(return_value=process)), patch.object(main, "list_codex_models", AsyncMock(side_effect=error)), patch.object(main, "stop_codex", stop), patch.object(main.logger, "exception"):
                    with self.assertRaises(HTTPException) as raised:
                        await main.get_codex_models()
                self.assertEqual(raised.exception.status_code, status)
                self.assertNotIn("private details", raised.exception.detail)
                stop.assert_awaited_once_with(process)

    async def test_missing_cli_returns_service_unavailable(self):
        stop = AsyncMock()
        with patch.object(main, "start_codex", AsyncMock(side_effect=FileNotFoundError())), patch.object(main, "stop_codex", stop):
            with self.assertRaises(HTTPException) as raised:
                await main.get_codex_models()
        self.assertEqual(raised.exception.status_code, 503)
        stop.assert_not_awaited()
