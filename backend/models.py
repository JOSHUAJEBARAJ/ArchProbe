from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class InterviewState(str, Enum):
    READY = "ready"
    ACTIVE = "active"
    FINISHED = "finished"
    INTERRUPTED = "interrupted"


class InterviewSession(BaseModel):
    id: str
    state: InterviewState = InterviewState.READY
    thread_id: str | None = None


class SavedInterview(BaseModel):
    id: str
    state: InterviewState
    created_at: datetime


class DiagramSnapshot(BaseModel):
    revision: int = Field(default=1, ge=1)
    elements: list[dict[str, Any]]


class InterviewAnswer(BaseModel):
    type: Literal["answer"]
    text: str = Field(min_length=1)
    diagram: DiagramSnapshot


class SavedMessage(BaseModel):
    id: int
    role: Literal["candidate", "interviewer"]
    text: str
    created_at: datetime
    diagram: DiagramSnapshot | None = None


class FeedbackEvidence(BaseModel):
    marker: str
    message_id: int
    diagram_revision: int | None = None


class SavedFeedback(BaseModel):
    id: int
    interview_id: str
    message_id: int
    text: str
    created_at: datetime
    evidence: list[FeedbackEvidence] = Field(default_factory=list)
