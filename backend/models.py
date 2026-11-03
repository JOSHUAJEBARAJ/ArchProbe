from enum import Enum
from pydantic import BaseModel

class InterviewState(str, Enum):
    READY = "ready"
    ACTIVE = "active"
    FINISHED = "finished"

class InterviewSession(BaseModel):
    id: str 
    state: InterviewState = InterviewState.READY
    thread_id: str | None = None 
