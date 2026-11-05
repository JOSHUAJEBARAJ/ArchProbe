from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from database import engine
from db_models import DiagramRecord, FeedbackEvidenceRecord, FeedbackRecord, InterviewRecord, MessageRecord
from feedback import evidence_marker, resolve_evidence
from models import DiagramSnapshot, InterviewSession, InterviewState


def initialize_storage() -> None:
    InterviewRecord.metadata.create_all(engine)


def mark_interrupted_interviews() -> None:
    """Run at startup, before accepting interviews in this local server."""
    with Session(engine) as db:
        statement = (
            update(InterviewRecord)
            .where(InterviewRecord.state == InterviewState.ACTIVE.value)
            .values(state=InterviewState.INTERRUPTED.value)
        )
        db.execute(statement)
        db.commit()


def save_interview(interview: InterviewSession) -> None:
    record = InterviewRecord(
        id=interview.id,
        state=interview.state.value,
        thread_id=interview.thread_id,
    )

    with Session(engine) as db:
        db.merge(record)
        db.commit()


def load_interview(interview_id: str) -> InterviewSession | None:
    with Session(engine) as db:
        record = db.get(InterviewRecord, interview_id)

        if record is None:
            return None

        return InterviewSession(
            id=record.id,
            state=record.state,
            thread_id=record.thread_id,
        )


def save_message(
    interview_id: str,
    role: str,
    text: str,
) -> None:
    record = MessageRecord(
        interview_id=interview_id,
        role=role,
        text=text,
    )

    with Session(engine) as db:
        db.add(record)
        db.commit()


def save_feedback(interview_id: str, text: str) -> None:
    with Session(engine) as db:
        sources = dict(db.execute(
            select(MessageRecord.id, DiagramRecord.revision)
            .outerjoin(DiagramRecord, DiagramRecord.message_id == MessageRecord.id)
            .where(MessageRecord.interview_id == interview_id, MessageRecord.role == "candidate")
        ).all())
        text, references = resolve_evidence(text, sources)
        message = MessageRecord(
            interview_id=interview_id,
            role="interviewer",
            text=text,
        )
        db.add(message)
        db.flush()

        feedback = FeedbackRecord(
            interview_id=interview_id,
            message_id=message.id,
        )
        db.add(feedback)
        db.flush()
        db.add_all([
            FeedbackEvidenceRecord(
                feedback_id=feedback.id,
                message_id=message_id,
                diagram_revision=revision,
            )
            for message_id, revision in references
        ])
        db.commit()


def save_candidate_answer(
    interview_id: str,
    text: str,
    diagram: DiagramSnapshot | None = None,
) -> None:
    with Session(engine) as db:
        message = MessageRecord(
            interview_id=interview_id,
            role="candidate",
            text=text,
        )
        db.add(message)

        if diagram is not None:
            db.flush()

            snapshot = DiagramRecord(
                message_id=message.id,
                revision=diagram.revision,
                elements=[
                    element
                    for element in diagram.elements
                    if not element.get("isDeleted", False)
                ],
            )
            db.add(snapshot)

        db.commit()


def load_messages(interview_id: str) -> list[dict]:
    with Session(engine) as db:
        statement = (
            select(MessageRecord, DiagramRecord)
            .outerjoin(DiagramRecord, DiagramRecord.message_id == MessageRecord.id)
            .where(MessageRecord.interview_id == interview_id)
            .order_by(MessageRecord.id)
        )

        records = db.execute(statement).all()

        return [
            {
                "id": record.id,
                "role": record.role,
                "text": record.text,
                "created_at": record.created_at,
                "diagram": {
                    "revision": snapshot.revision,
                    "elements": snapshot.elements,
                } if snapshot is not None else None,
            }
            for record, snapshot in records
        ]


def load_feedback(interview_id: str) -> dict | None:
    with Session(engine) as db:
        statement = (
            select(FeedbackRecord, MessageRecord)
            .join(MessageRecord, MessageRecord.id == FeedbackRecord.message_id)
            .where(
                FeedbackRecord.interview_id == interview_id,
                MessageRecord.interview_id == interview_id,
            )
        )
        result = db.execute(statement).one_or_none()
        if result is None:
            return None

        feedback, message = result
        references = db.scalars(
            select(FeedbackEvidenceRecord)
            .where(FeedbackEvidenceRecord.feedback_id == feedback.id)
            .order_by(FeedbackEvidenceRecord.id)
        ).all()
        return {
            "id": feedback.id,
            "interview_id": feedback.interview_id,
            "message_id": message.id,
            "text": message.text,
            "created_at": message.created_at,
            "evidence": [
                {
                    "marker": evidence_marker(reference.message_id, reference.diagram_revision),
                    "message_id": reference.message_id,
                    "diagram_revision": reference.diagram_revision,
                }
                for reference in references
            ],
        }


def delete_interview(interview_id: str) -> bool:
    with Session(engine) as db:
        interview = db.get(InterviewRecord, interview_id)
        if interview is None:
            return False
        if interview.state == InterviewState.ACTIVE.value:
            raise ValueError("End the active interview before deleting it.")

        message_ids = select(MessageRecord.id).where(
            MessageRecord.interview_id == interview_id
        )
        db.execute(delete(DiagramRecord).where(DiagramRecord.message_id.in_(message_ids)))
        feedback_ids = select(FeedbackRecord.id).where(FeedbackRecord.interview_id == interview_id)
        db.execute(delete(FeedbackEvidenceRecord).where(FeedbackEvidenceRecord.feedback_id.in_(feedback_ids)))
        db.execute(delete(FeedbackRecord).where(FeedbackRecord.interview_id == interview_id))
        db.execute(delete(MessageRecord).where(MessageRecord.interview_id == interview_id))
        db.delete(interview)
        db.commit()
        return True


def list_interviews() -> list[dict]:
    with Session(engine) as db:
        statement = (
            select(InterviewRecord)
            .order_by(
                InterviewRecord.created_at.desc(),
                InterviewRecord.id.desc(),
            )
        )

        records = db.scalars(statement).all()

        return [
            {
                "id": record.id,
                "state": record.state,
                "created_at": record.created_at,
            }
            for record in records
        ]
