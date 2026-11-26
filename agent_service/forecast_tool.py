"""Build a read-only forecast tool for one authenticated run."""
from collections.abc import Callable
from uuid import UUID, uuid4

from langchain_core.tools import tool
from pydantic import BaseModel

from forecasting.contract import History, Projection, project


class ForecastEvidence(BaseModel):
    ledger_id: UUID
    source_ids: list[str]
    assumption: str
    result: Projection


def forecast_tool(verified_user: UUID, load_history: Callable[[UUID], tuple[History, list[str]]]):
    @tool
    def forecast_spending() -> ForecastEvidence:
        """Estimate the next 30 days from the current user's observed spending."""
        history, source_ids = load_history(verified_user)
        return ForecastEvidence(ledger_id=uuid4(), source_ids=source_ids,
                                assumption="The last seven days of net spending repeat weekly.",
                                result=project(history))

    return forecast_spending
