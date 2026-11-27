import ast
import asyncio
from datetime import date
from uuid import uuid4

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from agent_service.planning_tools import PlanningEvidence
from agent_service.workflow import Choice, Draft, catalog, graph_for, money, verify

OWNER = uuid4()


class ScriptedModel:
    def __init__(self, corrupt=0):
        self.corrupt = corrupt
        self.calls = []

    def with_structured_output(self, schema):
        model = self

        class Bound:
            async def ainvoke(self, prompt):
                model.calls.append(prompt)
                if schema is Choice:
                    if "Completed reads: []" in prompt:
                        role = prompt.partition("Finance review: ")[2].partition(".")[0]
                        return Choice(
                            tool={
                                "cash": "runway",
                                "recurring": "recurring",
                                "scenario": "scenario",
                                "budget": "spending",
                                "anomaly": "flags",
                                "reconciliation": "history",
                            }[role]
                        )
                    return Choice(tool="finish")
                options = ast.literal_eval(
                    prompt.partition("Options: ")[2].partition(
                        ". Prior rejected claims:"
                    )[0]
                )
                item = dict(options[0])
                if model.corrupt:
                    model.corrupt -= 1
                    item["text"] = "Estimated spending is $9,999.99."
                return Draft.model_validate({"claims": [item]})

        return Bound()


def reader(owner, view, scenario):
    rows: dict = {
        "runway": {
            "opening": 125,
            "lowest": 25,
            "crossing": "2026-12-10",
            "noIncomeCrossing": None,
            "floor": 50,
            "allowance": None,
            "payday": None,
            "beforePayday": None,
        },
        "recurring": [{"id": "s", "monthly": 23, "last": 20, "change": 3}],
        "flags": [
            {
                "id": "f",
                "group": "a" * 64,
                "kind": "duplicate",
                "amount": 6,
                "date": "2026-11-25",
            }
        ],
        "history": [{"id": "ambiguous", "amount": 20, "date": "2026-11-26"}],
        "spending": [
            {
                "previous": 23,
                "recent": 55.12,
                "change": 32.12,
                "category": "FOOD_AND_DRINK",
            }
        ],
        "budgets": [],
    }
    rows["scenario"] = {**rows["runway"], "lowest": 12, "budgets": []}
    return PlanningEvidence.model_validate(
        {
            "ledger_id": uuid4(),
            "currency": "USD",
            "as_of": date.today(),
            "assumptions": ["fixture"],
            "view": view,
            "sources": ["fixture-record"],
            "data": rows[view],
        }
    )


def test_templates_reject_unsupported_numbers_dates_labels_and_context():
    entry = reader(OWNER, "runway", None).model_dump(mode="json")
    options = catalog([entry])
    claim = {k: v for k, v in options[0].items() if k != "action"}
    assert verify([claim], options) == []
    for change in (
        {"text": "Lowest projected balance is $125.00."},
        {"label": "Observed"},
        {"text": "The floor crossing is 2026-12-11."},
        {"evidence": str(uuid4())},
    ):
        assert verify([{**claim, **change}], options)
    assert money(-1234.125) == "-$1,234.13"


def test_graph_retries_then_refuses_and_scopes_reads():
    async def run():
        for topic, initial in [
            ("cash", "runway"),
            ("recurring", "recurring"),
            ("scenario", "scenario"),
            ("anomaly", "flags"),
            ("reconciliation", "history"),
        ]:
            reads = []

            def bound(owner, view, scenario):
                assert owner == OWNER
                reads.append(view)
                return reader(owner, view, scenario)

            model = ScriptedModel(1)
            result = await graph_for(InMemorySaver(), bound, model).ainvoke(
                {"owner": str(OWNER), "topic": topic, "trigger": "user", "ledger": []},
                {"configurable": {"thread_id": str(uuid4())}},
            )
            assert reads == [initial]
            assert result["draft"] and not result["errors"] and result["retries"] == 1
        result = await graph_for(InMemorySaver(), reader, ScriptedModel(9)).ainvoke(
            {"owner": str(OWNER), "topic": "cash", "trigger": "user", "ledger": []},
            {"configurable": {"thread_id": str(uuid4())}},
        )
        assert result["retries"] == 3 and not result["draft"] and not result["action"]

    asyncio.run(run())


def test_approval_checkpoint_survives_graph_recreation():
    async def run():
        saver = InMemorySaver()
        cfg = {"configurable": {"thread_id": str(uuid4())}}
        first = await graph_for(saver, reader, ScriptedModel()).ainvoke(
            {"owner": str(OWNER), "topic": "budget", "trigger": "user", "ledger": []},
            cfg,
        )
        assert first["__interrupt__"] and not first.get("approved")
        result = await graph_for(saver, reader, ScriptedModel()).ainvoke(
            Command(resume=False), cfg
        )
        assert result["approved"] is False

    asyncio.run(run())


def test_scoped_and_all_tool_routing_comparison():
    async def compare():
        for topic in (
            "cash",
            "recurring",
            "scenario",
            "budget",
            "anomaly",
            "reconciliation",
        ):
            outcomes = []
            for all_tools in (False, True):
                model = ScriptedModel()
                state = await graph_for(
                    InMemorySaver(), reader, model, compare_all_tools=all_tools
                ).ainvoke(
                    {
                        "owner": str(OWNER),
                        "topic": topic,
                        "trigger": "user",
                        "ledger": [],
                    },
                    {"configurable": {"thread_id": str(uuid4())}},
                )
                outcomes.append([(c["label"], c["text"]) for c in state["draft"]])
            assert outcomes[0] and outcomes[0] == outcomes[1]

    asyncio.run(compare())
