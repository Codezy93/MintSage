"""Evaluate the available tool boundary using synthetic users and AI tool calls."""
import os
from datetime import date, timedelta
from uuid import UUID

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from agent_service.forecast_tool import forecast_tool
from forecasting.contract import History

ALICE = UUID(int=1)
BOB = UUID(int=2)


@pytest.mark.parametrize("user", [ALICE, BOB])
def test_model_forecast(user):
    loaded = []

    def history(owner):
        loaded.append(owner)
        return History(currency="USD", user_expenses=[float(owner.int)] * 60,
                       user_dates=[str(date(2025, 1, 1) + timedelta(days=i)) for i in range(60)]), [str(owner)]

    bound = forecast_tool(user, history)
    if os.environ.get("MINTSAGE_LIVE_EVAL") == "1":
        from langchain_google_genai import ChatGoogleGenerativeAI
        model = ChatGoogleGenerativeAI(model=os.environ["GEMINI_MODEL"], temperature=0)
        runner = model.bind_tools([bound], tool_choice=bound.name)
    else:
        response = AIMessage(content="", tool_calls=[{"name": bound.name, "args": {}, "id": "fixture"}])
        runner = FakeMessagesListChatModel(responses=[response])
    answer = runner.invoke("Call the spending forecast tool for my next 30 days.")
    call, = answer.tool_calls
    assert call["name"] == bound.name
    assert call["args"] == {}
    evidence = bound.invoke(call["args"])
    assert loaded == [user]
    assert evidence.source_ids == [str(user)]
    assert evidence.result.forecast == [float(user.int)] * 30
    assert evidence.ledger_id and evidence.assumption


def test_tool_identity_cannot_be_overridden():
    loaded = []
    def history(owner):
        loaded.append(owner)
        raise LookupError("No history for the verified user")
    with pytest.raises(LookupError):
        forecast_tool(ALICE, history).invoke({"user_id": str(BOB)})
    assert loaded == [ALICE]
