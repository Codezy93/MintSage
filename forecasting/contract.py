from datetime import date, timedelta
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator

from .baselines import Baseline

Day = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]
Amount = Annotated[FiniteFloat, Field(strict=True)]


class History(BaseModel):
    model_config = ConfigDict(extra="forbid")
    currency: Literal["USD"]
    user_dates: list[Day] = Field(min_length=60, max_length=60)
    user_expenses: list[Amount] = Field(min_length=60, max_length=60)

    @model_validator(mode="after")
    def check_calendar(self):
        days = [date.fromisoformat(day) for day in self.user_dates]
        if any(b - a != timedelta(days=1) for a, b in zip(days, days[1:])):
            raise ValueError("Expected 60 consecutive observed days")
        if days[-1] > date.max - timedelta(days=30):
            raise ValueError("Forecast exceeds supported dates")
        return self


class Projection(BaseModel):
    currency: Literal["USD"]
    model: Literal["weekly-seasonal-naive"]
    forecast: list[Amount] = Field(min_length=30, max_length=30)
    horizon_dates: list[Day] = Field(min_length=30, max_length=30)


def project(history: History) -> Projection:
    last = date.fromisoformat(history.user_dates[-1])
    values = Baseline("weekly").fit(history.user_expenses).predict(30)
    return Projection(currency=history.currency, model="weekly-seasonal-naive", forecast=values,
                      horizon_dates=[(last + timedelta(days=i)).isoformat() for i in range(1, 31)])
