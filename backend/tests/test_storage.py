from datetime import datetime
import unittest

from sqlalchemy import event, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db_test_support import use_test_database
from db_models import DiagramRecord, FeedbackEvidenceRecord, FeedbackRecord, InterviewRecord, MessageRecord
from models import DiagramSnapshot, InterviewSession, InterviewState
from storage import delete_interview, initialize_storage, list_interviews, load_feedback, load_interview, load_messages, mark_interrupted_interviews, save_candidate_answer, save_feedback, save_interview, save_message


class StorageInitializationTests(unittest.TestCase):
    def test_creates_missing_tables_and_preserves_existing_data(self):
        engine = use_test_database(self, initialize=False)
        self.assertEqual(inspect(engine).get_table_names(), [])

        initialize_storage()
        self.assertEqual(inspect(engine).get_table_names(), ["diagrams", "feedback", "feedback_evidence", "interviews", "messages"])
        save_interview(InterviewSession(id="saved"))
        save_candidate_answer("saved", "Keep my design.", DiagramSnapshot(
            revision=1, elements=[{"id": "git", "type": "text", "text": "Git"}],
        ))
        expected_history = load_messages("saved")

        initialize_storage()
        self.assertEqual([interview["id"] for interview in list_interviews()], ["saved"])
        self.assertEqual(load_messages("saved"), expected_history)


class InterruptedInterviewRecoveryTests(unittest.TestCase):
    def test_only_active_states_change_and_history_survives_repeated_recovery(self):
        engine = use_test_database(self)
        for state in InterviewState:
            save_interview(InterviewSession(
                id=state.value, state=state, thread_id=f"thread-{state.value}",
            ))
        save_candidate_answer("active", "My unfinished design.", DiagramSnapshot(
            revision=1, elements=[{"id": "ci", "type": "text", "text": "CI"}],
        ))
        history = load_messages("active")
        summaries = {item["id"]: item for item in list_interviews()}

        mark_interrupted_interviews()
        mark_interrupted_interviews()
        engine.dispose()

        for state in InterviewState:
            saved = load_interview(state.value)
            expected = InterviewState.INTERRUPTED if state == InterviewState.ACTIVE else state
            self.assertEqual(saved.state, expected)
            self.assertEqual(saved.thread_id, f"thread-{state.value}")
        self.assertEqual(load_messages("active"), history)
        self.assertEqual(
            {item["id"]: item["created_at"] for item in list_interviews()},
            {key: item["created_at"] for key, item in summaries.items()},
        )


class MessageStorageTests(unittest.TestCase):
    def setUp(self):
        self.engine = use_test_database(self)
        save_interview(InterviewSession(id="first"))
        save_interview(InterviewSession(id="second"))

    def test_empty_message_history(self):
        self.assertEqual(load_messages("first"), [])

    def test_history_is_ordered_scoped_and_readable_after_connections_close(self):
        save_message("first", "interviewer", "What would you clarify?")
        save_message("second", "candidate", "Another interview's answer.")
        save_message("first", "candidate", "What is the release frequency?")
        save_message("first", "interviewer", "Several releases per day.")

        self.engine.dispose()
        messages = load_messages("first")
        self.assertEqual(
            [(message["role"], message["text"]) for message in messages],
            [
                ("interviewer", "What would you clarify?"),
                ("candidate", "What is the release frequency?"),
                ("interviewer", "Several releases per day."),
            ],
        )
        ids = [message["id"] for message in messages]
        self.assertEqual(ids, sorted(ids))
        self.assertEqual(len(set(ids)), 3)
        self.assertTrue(all(isinstance(message["created_at"], datetime) for message in messages))


class CandidateSnapshotStorageTests(unittest.TestCase):
    def setUp(self):
        self.engine = use_test_database(self)
        save_interview(InterviewSession(id="interview"))

    def test_snapshots_link_to_answers_and_preserve_empty_revisions(self):
        shape = {"id": "git", "type": "rectangle", "x": 10, "y": 20, "seed": 42}
        save_candidate_answer("interview", "Git starts the pipeline.", DiagramSnapshot(
            revision=1, elements=[shape, {"id": "removed", "isDeleted": True}],
        ))
        save_candidate_answer("interview", "I cleared the drawing.", DiagramSnapshot(
            revision=2, elements=[],
        ))
        self.engine.dispose()
        with Session(self.engine) as db:
            pairs = db.execute(
                select(MessageRecord, DiagramRecord)
                .join(DiagramRecord, DiagramRecord.message_id == MessageRecord.id)
                .order_by(MessageRecord.id)
            ).all()
            self.assertEqual(
                [(message.text, snapshot.revision, snapshot.elements) for message, snapshot in pairs],
                [("Git starts the pipeline.", 1, [shape]), ("I cleared the drawing.", 2, [])],
            )
            self.assertTrue(all(message.role == "candidate" for message, _ in pairs))

    def test_plain_answer_has_no_snapshot(self):
        save_candidate_answer("interview", "My answer without a diagram.")
        self.assertEqual(load_messages("interview")[0]["text"], "My answer without a diagram.")
        with Session(self.engine) as db:
            self.assertEqual(list(db.scalars(select(DiagramRecord))), [])

    def test_snapshot_write_failure_rolls_back_the_answer(self):
        def fail_snapshot_insert(connection, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith("INSERT INTO DIAGRAMS"):
                raise RuntimeError("Snapshot write failed")

        event.listen(self.engine, "before_cursor_execute", fail_snapshot_insert)
        self.addCleanup(event.remove, self.engine, "before_cursor_execute", fail_snapshot_insert)
        with self.assertRaisesRegex(RuntimeError, "Snapshot write failed"):
            save_candidate_answer("interview", "Must not remain saved alone.", DiagramSnapshot(
                revision=1, elements=[],
            ))

        self.assertEqual(load_messages("interview"), [])
        with Session(self.engine) as db:
            self.assertEqual(list(db.scalars(select(DiagramRecord))), [])


class FeedbackStorageTests(unittest.TestCase):
    def setUp(self):
        self.engine = use_test_database(self)
        save_interview(InterviewSession(id="interview"))

    def test_feedback_links_to_its_wrap_up_message(self):
        save_message("interview", "interviewer", "An ordinary question.")
        save_feedback("interview", "Your rollback plan was clear.")
        self.engine.dispose()
        with Session(self.engine) as db:
            feedback = db.scalar(select(FeedbackRecord))
            message = db.get(MessageRecord, feedback.message_id)
            self.assertEqual(feedback.interview_id, "interview")
            self.assertEqual(message.interview_id, "interview")
            self.assertEqual(message.role, "interviewer")
            self.assertEqual(message.text, "Your rollback plan was clear.")
        self.assertEqual(len(load_messages("interview")), 2)

    def test_duplicate_feedback_rolls_back_the_extra_message(self):
        save_feedback("interview", "Original wrap-up.")
        with self.assertRaises(IntegrityError):
            save_feedback("interview", "Duplicate wrap-up.")
        self.assertEqual([message["text"] for message in load_messages("interview")], ["Original wrap-up."])
        with Session(self.engine) as db:
            self.assertEqual(len(list(db.scalars(select(FeedbackRecord)))), 1)

    def test_evidence_accepts_only_own_candidate_answers_and_exact_revisions(self):
        save_candidate_answer("interview", "I will run tests.", DiagramSnapshot(revision=2, elements=[]))
        answer_id = load_messages("interview")[0]["id"]
        save_message("interview", "interviewer", "What about deployment?")
        question_id = load_messages("interview")[1]["id"]
        save_interview(InterviewSession(id="other"))
        save_candidate_answer("other", "Another candidate answer.")
        other_id = load_messages("other")[0]["id"]
        save_feedback("interview", (
            f"Tests were mentioned [Answer {answer_id}]. "
            f"The drawing was empty [Diagram {answer_id} revision 2]. "
            f"Repeated [Answer {answer_id}]. "
            f"Wrong revision [Diagram {answer_id} revision 9]. "
            f"Wrong interview [Answer {other_id}]. "
            f"Question [Answer {question_id}]. Missing [Answer 999999]."
        ))
        self.engine.dispose()
        feedback = load_feedback("interview")
        self.assertEqual(feedback["evidence"], [
            {"marker": f"[Answer {answer_id}]", "message_id": answer_id, "diagram_revision": None},
            {"marker": f"[Diagram {answer_id} revision 2]", "message_id": answer_id, "diagram_revision": 2},
        ])
        self.assertEqual(feedback["text"].count("[Source unavailable]"), 4)
        self.assertEqual(load_messages("interview")[-1]["text"], feedback["text"])


class InterviewDeletionTests(unittest.TestCase):
    def setUp(self):
        self.engine = use_test_database(self)
        save_interview(InterviewSession(id="keep"))
        save_candidate_answer("keep", "Keep this interview.", DiagramSnapshot(revision=1, elements=[]))
        answer_id = load_messages("keep")[0]["id"]
        save_feedback("keep", f"Keep this feedback [Answer {answer_id}].")
        self.kept_history = load_messages("keep")

    def test_deletes_only_target_interview_messages_and_snapshots(self):
        for state in (InterviewState.READY, InterviewState.FINISHED, InterviewState.INTERRUPTED):
            target = state.value
            save_interview(InterviewSession(id=target, state=state))
            save_candidate_answer(target, "Delete this answer.", DiagramSnapshot(revision=1, elements=[]))
            answer_id = load_messages(target)[0]["id"]
            save_feedback(target, f"Delete this feedback [Answer {answer_id}].")
            self.assertTrue(delete_interview(target))
            self.assertIsNone(load_interview(target))
            self.assertEqual(load_messages(target), [])
            self.assertFalse(delete_interview(target))
        self.assertEqual(load_messages("keep"), self.kept_history)
        with Session(self.engine) as db:
            self.assertEqual(len(list(db.scalars(select(DiagramRecord)))), 1)
            self.assertEqual(len(list(db.scalars(select(MessageRecord)))), 2)
            feedback = list(db.scalars(select(FeedbackRecord)))
            self.assertEqual([record.interview_id for record in feedback], ["keep"])
            self.assertEqual(len(list(db.scalars(select(FeedbackEvidenceRecord)))), 1)

    def test_active_interview_is_protected_and_missing_returns_false(self):
        save_interview(InterviewSession(id="active", state=InterviewState.ACTIVE))
        save_candidate_answer("active", "Still practicing.", DiagramSnapshot(revision=1, elements=[]))
        history = load_messages("active")
        with self.assertRaisesRegex(ValueError, "End the active interview"):
            delete_interview("active")
        self.assertEqual(load_messages("active"), history)
        self.assertEqual(load_interview("active").state, InterviewState.ACTIVE)
        self.assertFalse(delete_interview("missing"))

    def test_failed_deletion_rolls_back_snapshots_and_messages(self):
        def fail_message_delete(connection, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith("DELETE FROM MESSAGES"):
                raise RuntimeError("Delete failed")

        event.listen(self.engine, "before_cursor_execute", fail_message_delete)
        self.addCleanup(event.remove, self.engine, "before_cursor_execute", fail_message_delete)
        with self.assertRaisesRegex(RuntimeError, "Delete failed"):
            delete_interview("keep")
        self.assertEqual(load_messages("keep"), self.kept_history)
        self.assertIsNotNone(load_interview("keep"))
        with Session(self.engine) as db:
            self.assertEqual(len(list(db.scalars(select(FeedbackRecord)))), 1)
            self.assertEqual(len(list(db.scalars(select(FeedbackEvidenceRecord)))), 1)


class InterviewListingTests(unittest.TestCase):
    def setUp(self):
        self.engine = use_test_database(self)

    def test_empty_interview_list(self):
        self.assertEqual(list_interviews(), [])

    def test_newest_first_with_stable_ties_and_only_summary_fields(self):
        old = datetime(2026, 11, 1, 10)
        recent = datetime(2026, 11, 5, 10)
        with Session(self.engine) as db:
            db.add_all([
                InterviewRecord(id="old", state="finished", created_at=old),
                InterviewRecord(id="new-a", state="ready", created_at=recent),
                InterviewRecord(id="new-b", state="finished", created_at=recent),
            ])
            db.commit()

        self.engine.dispose()
        interviews = list_interviews()
        self.assertEqual(interviews, [
            {"id": "new-b", "state": "finished", "created_at": recent},
            {"id": "new-a", "state": "ready", "created_at": recent},
            {"id": "old", "state": "finished", "created_at": old},
        ])
