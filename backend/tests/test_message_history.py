import asyncio
from datetime import datetime
import json
import unittest

from sqlalchemy import delete
from sqlalchemy.orm import Session

from db_test_support import use_test_database
from db_models import InterviewRecord
import main
from models import DiagramSnapshot, InterviewSession, InterviewState
from storage import save_candidate_answer, save_feedback, save_interview, save_message


class MessageHistoryEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = use_test_database(self)
        for collection in (main.sessions, main.start_locks, main.codex_processes, main.connected_interviews, main.interview_sockets):
            collection.clear()
            self.addCleanup(collection.clear)
        save_interview(InterviewSession(id="first"))
        save_interview(InterviewSession(id="second"))

    async def get(self, path):
        return await self.request("GET", path)

    async def request(self, method, path, payload=None):
        """Exercise HTTP routing and JSON serialization without a running server."""
        incoming = asyncio.Queue()
        body = json.dumps(payload).encode() if payload is not None else b""
        incoming.put_nowait({"type": "http.request", "body": body, "more_body": False})
        outgoing = []

        async def send(message):
            outgoing.append(message)

        scope = {
            "type": "http", "asgi": {"version": "3.0"},
            "http_version": "1.1", "method": method, "scheme": "http",
            "path": path, "raw_path": path.encode(), "query_string": b"",
            "root_path": "", "headers": [(b"content-type", b"application/json")] if payload is not None else [],
            "client": ("127.0.0.1", 50000), "server": ("127.0.0.1", 8000),
        }
        await asyncio.wait_for(main.app(scope, incoming.get, send), timeout=3)
        status = next(message["status"] for message in outgoing if message["type"] == "http.response.start")
        body = b"".join(message.get("body", b"") for message in outgoing if message["type"] == "http.response.body")
        return status, json.loads(body) if body else None

    async def test_create_interview_accepts_each_known_scenario(self):
        for scenario_id in ("ci_cd", "observability"):
            status, session = await self.request("POST", "/interviews", {"scenario_id": scenario_id})
            self.assertEqual(status, 201)
            self.assertEqual(session["scenario_id"], scenario_id)
            self.assertEqual(session["state"], "ready")
            self.assertEqual(main.sessions[session["id"]].scenario_id, scenario_id)
            status, retrieved = await self.get(f"/interviews/{session['id']}")
            self.assertEqual(status, 200)
            self.assertEqual(retrieved["scenario_id"], scenario_id)

    async def test_create_interview_rejects_bad_scenarios_before_saving(self):
        for payload in ({"scenario_id": "missing"}, {"scenario_id": ""}, {}):
            status, _ = await self.request("POST", "/interviews", payload)
            self.assertEqual(status, 422)
        self.assertEqual(main.sessions, {})
        _, interviews = await self.get("/interviews")
        self.assertEqual(len(interviews), 2)

    async def test_create_interview_without_body_keeps_ci_cd_default(self):
        status, session = await self.request("POST", "/interviews")
        self.assertEqual(status, 201)
        self.assertEqual(session["scenario_id"], "ci_cd")

    async def test_scenario_catalog_returns_ids_and_display_titles(self):
        status, scenarios = await self.get("/scenarios")
        self.assertEqual(status, 200)
        self.assertEqual(scenarios, [
            {"id": "ci_cd", "title": "Design a CI/CD pipeline"},
            {"id": "observability", "title": "Design an observability platform"},
        ])

    async def test_delete_removes_cached_interview_and_saved_history(self):
        save_candidate_answer("first", "My drawing.", DiagramSnapshot(revision=1, elements=[]))
        main.get_interview("first")
        self.assertEqual(await self.request("DELETE", "/interviews/first"), (204, None))
        self.assertNotIn("first", main.sessions)
        self.assertEqual((await self.get("/interviews/first"))[0], 404)
        self.assertEqual((await self.get("/interviews/first/messages"))[0], 404)
        status, interviews = await self.get("/interviews")
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in interviews], ["second"])
        self.assertEqual((await self.request("DELETE", "/interviews/first"))[0], 404)

    async def test_delete_rejects_active_running_or_busy_interviews(self):
        save_interview(InterviewSession(id="first", state=InterviewState.ACTIVE))
        self.assertEqual((await self.request("DELETE", "/interviews/first"))[0], 409)

        save_interview(InterviewSession(id="first", state=InterviewState.FINISHED))
        main.codex_processes["first"] = object()
        self.assertEqual((await self.request("DELETE", "/interviews/first"))[0], 409)
        main.codex_processes.clear()

        lock = main.start_locks["first"]
        async with lock:
            self.assertEqual((await self.request("DELETE", "/interviews/first"))[0], 409)
        self.assertEqual((await self.get("/interviews/first"))[0], 200)

    async def test_feedback_is_absent_for_unassessed_sessions_and_unknown_returns_404(self):
        save_message("first", "interviewer", "An ordinary response, not registered feedback.")
        for state in (InterviewState.READY, InterviewState.INTERRUPTED, InterviewState.FINISHED):
            save_interview(InterviewSession(id="first", state=state))
            main.sessions.clear()
            self.assertEqual(await self.get("/interviews/first/feedback"), (200, None))
        self.assertEqual(
            await self.get("/interviews/missing/feedback"),
            (404, {"detail": "Interview not found"}),
        )

    async def test_saved_feedback_is_scoped_serialized_and_removed_with_interview(self):
        save_feedback("first", "First interview wrap-up.")
        save_feedback("second", "Second interview wrap-up.")
        main.sessions.clear()
        self.engine.dispose()
        status, feedback = await self.get("/interviews/first/feedback")
        self.assertEqual(status, 200)
        self.assertEqual(feedback["interview_id"], "first")
        self.assertEqual(feedback["text"], "First interview wrap-up.")
        self.assertIsInstance(datetime.fromisoformat(feedback["created_at"]), datetime)
        _, messages = await self.get("/interviews/first/messages")
        self.assertEqual(feedback["message_id"], messages[0]["id"])
        self.assertEqual(await self.request("DELETE", "/interviews/first"), (204, None))
        self.assertEqual((await self.get("/interviews/first/feedback"))[0], 404)
        _, other = await self.get("/interviews/second/feedback")
        self.assertEqual(other["text"], "Second interview wrap-up.")

    async def test_feedback_api_exposes_validated_answer_and_snapshot_references(self):
        save_candidate_answer("first", "Run tests before production.", DiagramSnapshot(revision=3, elements=[]))
        _, history = await self.get("/interviews/first/messages")
        message_id = history[0]["id"]
        save_feedback("first", f"Test gate [Answer {message_id}]. Empty drawing [Diagram {message_id} revision 3].")
        main.sessions.clear()
        self.engine.dispose()
        status, feedback = await self.get("/interviews/first/feedback")
        self.assertEqual(status, 200)
        self.assertEqual(feedback["evidence"], [
            {"marker": f"[Answer {message_id}]", "message_id": message_id, "diagram_revision": None},
            {"marker": f"[Diagram {message_id} revision 3]", "message_id": message_id, "diagram_revision": 3},
        ])

    async def test_existing_empty_interview_and_unknown_interview(self):
        self.assertEqual(await self.get("/interviews/first/messages"), (200, []))
        self.assertEqual(
            await self.get("/interviews/missing/messages"),
            (404, {"detail": "Interview not found"}),
        )

    async def test_interview_list_returns_saved_summaries_newest_first(self):
        with Session(self.engine) as db:
            db.get(InterviewRecord, "first").created_at = datetime(2026, 11, 1)
            db.get(InterviewRecord, "second").created_at = datetime(2026, 11, 5)
            db.commit()
        main.sessions.clear()
        self.engine.dispose()

        status, interviews = await self.get("/interviews")
        self.assertEqual(status, 200)
        self.assertEqual([interview["id"] for interview in interviews], ["second", "first"])
        for interview in interviews:
            self.assertEqual(set(interview), {"id", "state", "created_at"})
            self.assertEqual(interview["state"], "ready")
            self.assertIsInstance(datetime.fromisoformat(interview["created_at"]), datetime)

    async def test_interview_list_can_be_empty(self):
        with Session(self.engine) as db:
            db.execute(delete(InterviewRecord))
            db.commit()
        self.assertEqual(await self.get("/interviews"), (200, []))

    async def test_saved_history_is_scoped_ordered_and_serialized_after_reset(self):
        save_message("first", "interviewer", "What are your requirements?")
        save_message("second", "candidate", "A different interview.")
        save_message("first", "candidate", "Several deployments per day.")
        main.sessions.clear()
        self.engine.dispose()

        status, messages = await self.get("/interviews/first/messages")
        self.assertEqual(status, 200)
        self.assertEqual(
            [(message["role"], message["text"]) for message in messages],
            [
                ("interviewer", "What are your requirements?"),
                ("candidate", "Several deployments per day."),
            ],
        )
        self.assertLess(messages[0]["id"], messages[1]["id"])
        for message in messages:
            self.assertEqual(set(message), {"id", "role", "text", "created_at", "diagram"})
            self.assertIsNone(message["diagram"])
            self.assertIsInstance(datetime.fromisoformat(message["created_at"]), datetime)

    async def test_history_includes_each_answers_snapshot_without_crossing_interviews(self):
        shape = {"id": "git", "type": "text", "text": "Git → CI", "x": 10, "y": 20}
        save_message("first", "interviewer", "Describe your pipeline.")
        save_candidate_answer("first", "My initial drawing.", DiagramSnapshot(
            revision=1, elements=[shape],
        ))
        save_candidate_answer("second", "Another drawing.", DiagramSnapshot(
            revision=1, elements=[{"id": "other", "type": "text", "text": "Other"}],
        ))
        save_candidate_answer("first", "I cleared the canvas.", DiagramSnapshot(
            revision=2, elements=[],
        ))
        save_candidate_answer("first", "A plain answer without a snapshot.")
        main.sessions.clear()
        self.engine.dispose()

        status, messages = await self.get("/interviews/first/messages")
        self.assertEqual(status, 200)
        self.assertEqual(
            [(message["text"], message["diagram"]) for message in messages],
            [
                ("Describe your pipeline.", None),
                ("My initial drawing.", {"revision": 1, "elements": [shape]}),
                ("I cleared the canvas.", {"revision": 2, "elements": []}),
                ("A plain answer without a snapshot.", None),
            ],
        )
