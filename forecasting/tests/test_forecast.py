from datetime import date, timedelta

import numpy as np
import pytest
import asyncio
import httpx
from pydantic import ValidationError

from forecasting.contract import History, project
from forecasting.evaluation import folds, metrics, windows
from forecasting.service import create_app


@pytest.fixture
def history():
    start = date(2024, 1, 1)
    return dict(currency="USD", user_dates=[(start + timedelta(days=i)).isoformat() for i in range(60)],
                user_expenses=[float(i - 58) for i in range(60)])


def test_service(monkeypatch, history):
    monkeypatch.setenv("AGENT_SERVICE_SECRET", "test-secret")
    async def check():
        transport = httpx.ASGITransport(app=create_app())
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": "Bearer test-secret", "X-MintSage-User": "00000000-0000-0000-0000-000000000001"}
            assert (await client.post("/forecast", json=history)).status_code == 401
            response = await client.post("/forecast", headers=headers, json=history)
            assert response.status_code == 200
            output = response.json()
            assert output["forecast"] == (history["user_expenses"][-7:] * 5)[:30]
            assert output["horizon_dates"][0] == "2024-03-01"
            assert output["horizon_dates"][-1] == "2024-03-30"
            invalid = await client.post("/forecast", headers=headers, json={**history, "currency": "CAD"})
            assert invalid.status_code == 422

    asyncio.run(check())


@pytest.mark.parametrize("change", ["missing", "gap", "string", "nan", "invalid-date", "unknown"])
def test_reject_invalid_history(history, change):
    if change == "missing":
        history["user_expenses"].pop()
    elif change == "gap":
        history["user_dates"][7] = history["user_dates"][8]
    elif change == "string":
        history["user_expenses"][0] = "5"
    elif change == "nan":
        history["user_expenses"][0] = float("nan")
    elif change == "invalid-date":
        history["user_dates"][0] = "2024-02-30"
    else:
        history["user_id"] = "untrusted"
    with pytest.raises(ValidationError):
        History(**history)


def test_zero_spending(history):
    history["user_expenses"] = [0] * 60
    assert project(History(**history)).forecast == [0] * 30
    assert metrics(np.ones(60), np.ones(30), np.ones(30))["mase"] is None


def test_training_windows_never_include_the_origin():
    sequence = np.arange(120)
    splits = list(folds(sequence, {"initial_train": 60, "horizon": 30}))
    assert [len(train) for train, _ in splits] == [60, 90]
    for train, actual in splits:
        x, y = windows(train, 14)
        assert x.shape == (len(train) - 14, 14)
        assert np.array_equal(x[:, -1] + 1, y)
        assert y.max() < actual.min()
        assert len(actual) == 30
