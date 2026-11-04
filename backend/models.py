from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class InterviewState(str, Enum):
    READY = "ready"
    ACTIVE = "active"
    FINISHED = "finished"


class InterviewSession(BaseModel):
    id: str
    state: InterviewState = InterviewState.READY
    thread_id: str | None = None


class DiagramSnapshot(BaseModel):
    revision: int = Field(default=1, ge=1)
    elements: list[dict[str, Any]]


class InterviewAnswer(BaseModel):
    type: Literal["answer"]
    text: str = Field(min_length=1)
    diagram: DiagramSnapshot
