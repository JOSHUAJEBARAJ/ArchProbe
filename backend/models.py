from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class InterviewState(str, Enum):
    READY = "ready"
    ACTIVE = "active"
    FINISHED = "finished"
    INTERRUPTED = "interrupted"


class ScenarioSummary(BaseModel):
    id: str
    title: str


class CodexReasoningOption(BaseModel):
    effort: str
    description: str


class CodexModelSummary(BaseModel):
    id: str
    model: str
    display_name: str
    default_reasoning_effort: str
    supported_reasoning_efforts: list[CodexReasoningOption]
    is_default: bool


class CreateInterviewRequest(BaseModel):
    scenario_id: str = Field(min_length=1)
    model: str | None = Field(default=None, min_length=1)
    reasoning_effort: str | None = Field(default=None, min_length=1)


class InterviewSession(BaseModel):
    id: str
    scenario_id: str = "ci_cd"
    model: str | None = None
    reasoning_effort: str | None = None
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
