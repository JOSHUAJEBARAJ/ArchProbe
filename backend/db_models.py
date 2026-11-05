from datetime import UTC, datetime

from sqlalchemy import ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base

class InterviewRecord(Base):
    __tablename__ = "interviews"

    id: Mapped[str] = mapped_column(primary_key=True)
    state: Mapped[str] = mapped_column(default="ready")
    thread_id: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(UTC)
    )

class MessageRecord(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)

    interview_id: Mapped[str] = mapped_column(
        ForeignKey("interviews.id"),
        index=True,
    )

    role: Mapped[str]
    text: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(UTC)
    )


class DiagramRecord(Base):
    __tablename__ = "diagrams"

    id: Mapped[int] = mapped_column(primary_key=True)

    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id"),
        unique=True,
    )

    revision: Mapped[int]
    elements: Mapped[list[dict]] = mapped_column(JSON)


class FeedbackRecord(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(primary_key=True)

    interview_id: Mapped[str] = mapped_column(
        ForeignKey("interviews.id"),
        unique=True,
    )

    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id"),
        unique=True,
    )


class FeedbackEvidenceRecord(Base):
    __tablename__ = "feedback_evidence"

    id: Mapped[int] = mapped_column(primary_key=True)
    feedback_id: Mapped[int] = mapped_column(ForeignKey("feedback.id"), index=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id"))
    diagram_revision: Mapped[int | None]
