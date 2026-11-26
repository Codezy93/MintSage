"""Deterministic models for daily net spending, including refunds."""
from dataclasses import dataclass
from statistics import mean
from typing import Literal, Protocol, Self, Sequence


class Forecaster(Protocol):
    def fit(self, history: Sequence[float]) -> Self: ...
    def predict(self, horizon: int) -> list[float]: ...


@dataclass
class Baseline:
    method: Literal["naive", "weekly", "rolling"]
    window: int = 7
    pattern: tuple[float, ...] = ()

    def fit(self, history: Sequence[float]) -> Self:
        width = {"naive": 1, "weekly": 7, "rolling": self.window}[self.method]
        if width < 1 or len(history) < width:
            raise ValueError("Insufficient training history")
        tail = tuple(float(x) for x in history[-width:])
        self.pattern = (mean(tail),) if self.method == "rolling" else tail
        return self

    def predict(self, horizon: int) -> list[float]:
        if not self.pattern or horizon < 1:
            raise ValueError("Fit the model and request a positive horizon")
        return [self.pattern[i % len(self.pattern)] for i in range(horizon)]
