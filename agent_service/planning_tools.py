"""Read-only tools. The trusted run binds the identity and HTTPS endpoint."""

from collections.abc import Callable
from datetime import date as CalendarDate
from typing import Literal, Self
from uuid import UUID

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator

View = Literal["runway", "recurring", "budgets", "goals", "spending", "scenario"]


class PlanningScenario(BaseModel):
    model_config = ConfigDict(extra="forbid")
    purchase: float = Field(0, ge=0, le=1e10)
    date: CalendarDate | None = None
    category: str = "GENERAL_MERCHANDISE"
    detail: str = ""
    delay: int = Field(0, ge=0, le=60)
    reduction: float = Field(0, ge=0, le=100)
    bill: str = ""
    billChange: float = 0


class Runway(BaseModel):
    opening: float | None
    lowest: float | None
    crossing: CalendarDate | None
    noIncomeCrossing: CalendarDate | None
    floor: float
    allowance: float | None
    payday: CalendarDate | None
    beforePayday: float | None


class Budget(BaseModel):
    id: str
    category: str
    detail: str
    actual: float
    projected: float
    limit: float
    risk: float | None


class ScenarioResult(Runway):
    budgets: list[Budget]


class Commitment(BaseModel):
    id: str
    monthly: float
    last: float | None
    change: float | None


class Goal(BaseModel):
    id: str
    progress: float
    completion: CalendarDate | None
    onTime: bool | None


class SpendingChange(BaseModel):
    category: str
    previous: float
    recent: float
    change: float


class PlanningEvidence(BaseModel):
    ledger_id: UUID
    view: View
    as_of: CalendarDate
    currency: Literal["USD"]
    sources: list[str]
    assumptions: list[str]
    data: (
        ScenarioResult
        | Runway
        | list[Budget]
        | list[Commitment]
        | list[Goal]
        | list[SpendingChange]
    )

    @model_validator(mode="after")
    def validate_view(self) -> Self:
        contracts: dict[str, TypeAdapter] = {
            "runway": TypeAdapter(Runway),
            "scenario": TypeAdapter(ScenarioResult),
            "budgets": TypeAdapter(list[Budget]),
            "recurring": TypeAdapter(list[Commitment]),
            "goals": TypeAdapter(list[Goal]),
            "spending": TypeAdapter(list[SpendingChange]),
        }
        contracts[self.view].validate_python(self.data)
        return self


def planning_reader(endpoint: str, secret: str):
    url = httpx.URL(endpoint)
    if not secret or url.scheme != "https":
        raise ValueError("Configure an HTTPS planning endpoint and service secret")

    def read(
        user: UUID, view: View, scenario: PlanningScenario | None
    ) -> PlanningEvidence:
        body: dict[str, object] = {"view": view}
        if scenario is not None:
            body["scenario"] = scenario.model_dump(mode="json", exclude_none=True)
        response = httpx.post(
            url,
            json=body,
            timeout=20,
            follow_redirects=False,
            headers={
                "Authorization": f"Bearer {secret}",
                "X-MintSage-User": str(user),
            },
        )
        response.raise_for_status()
        evidence = PlanningEvidence.model_validate(response.json())
        if evidence.view != view:
            raise ValueError("Planning response returned a different view")
        return evidence

    return read


def planning_tools(
    user: UUID, read: Callable[[UUID, View, PlanningScenario | None], PlanningEvidence]
):
    @tool
    def inspect_finances(
        view: Literal["runway", "recurring", "budgets", "goals", "spending"],
    ) -> PlanningEvidence:
        """Read the verified user's calculated finance evidence for one topic."""
        return read(user, view, None)

    @tool
    def simulate_finances(scenario: PlanningScenario) -> PlanningEvidence:
        """Compute a hypothetical projection without applying any changes."""
        return read(user, "scenario", scenario)

    return [inspect_finances, simulate_finances]
