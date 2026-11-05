from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field


class ScenarioDefinition(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    exercise: str = Field(min_length=1)
    facts: list[str] = Field(min_length=1)
    guidance: str = Field(min_length=1)
    rubric: list[str] = Field(min_length=1)


def load_scenarios() -> dict:
    directory = Path(__file__).resolve().parent / "scenario_content"
    scenarios = {}

    for path in sorted(directory.glob("*.yaml")):
        content = yaml.safe_load(path.read_text(encoding="utf-8"))
        scenario = ScenarioDefinition.model_validate(content).model_dump()
        scenario_id = scenario["id"]

        if scenario_id in scenarios:
            raise ValueError(f"Duplicate scenario ID: {scenario_id}")

        scenarios[scenario_id] = scenario

    return scenarios
