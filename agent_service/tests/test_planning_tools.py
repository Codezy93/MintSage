from datetime import date
from uuid import uuid4

from agent_service.planning_tools import (
    PlanningEvidence,
    Runway,
    ScenarioResult,
    planning_tools,
)


def test_read_and_simulation_keep_identity_bound_to_the_run():
    owner = uuid4()
    calls = []

    def read(user, view, scenario):
        calls.append((user, view, scenario))
        runway = Runway(
            opening=None,
            lowest=None,
            crossing=None,
            noIncomeCrossing=None,
            floor=0,
            allowance=None,
            payday=None,
            beforePayday=None,
        )
        return PlanningEvidence(
            ledger_id=uuid4(),
            view=view,
            as_of=date(2026, 11, 26),
            currency="USD",
            sources=[],
            assumptions=[],
            data=ScenarioResult(**runway.model_dump(), budgets=[])
            if view == "scenario"
            else runway
            if view == "runway"
            else [],
        )

    inspect, simulate = planning_tools(owner, read)
    for view in ("runway", "recurring", "budgets", "goals", "spending"):
        assert inspect.invoke({"view": view, "user": str(uuid4())}).view == view
    assert simulate.invoke({"scenario": {"purchase": 12}}).view == "scenario"
    assert all(call[0] == owner for call in calls)
    assert calls[-1][2].purchase == 12
