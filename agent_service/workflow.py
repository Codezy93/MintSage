"""Checkpointed finance reviews. Models select reads and draft evidence-linked claims."""

import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal, TypedDict
from uuid import UUID

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from pydantic import BaseModel, Field

from agent_service.forecast_tool import forecast_tool
from agent_service.planning_tools import PlanningScenario, planning_tools
from forecasting.contract import History

ROLES = {
    "cash": ("runway", "forecast"),
    "recurring": ("recurring",),
    "anomaly": ("flags",),
    "scenario": ("scenario", "budgets"),
    "reconciliation": ("history",),
    "budget": ("spending", "budgets"),
}
Topic = Literal["cash", "recurring", "anomaly", "scenario", "reconciliation", "budget"]


class RunState(TypedDict, total=False):
    owner: str
    trigger: str
    topic: str
    event: str
    scenario: dict
    messages: list[str]
    tool: str
    ledger: list[dict]
    draft: list[dict]
    errors: list[str]
    retries: int
    action: dict
    approved: bool
    autonomy: str


class Claim(BaseModel):
    evidence: str
    label: Literal["Observed", "Forecast", "Hypothetical"]
    text: str = Field(max_length=300)


class Draft(BaseModel):
    claims: list[Claim] = Field(min_length=1, max_length=4)


class Choice(BaseModel):
    tool: str


def money(value):
    rounded = Decimal(str(value)).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
    return f"{'-' if rounded < 0 else ''}${abs(rounded):,.2f}"


def catalog(ledger):
    """Templates bind each figure to its meaning, unit, provenance and evidence class."""
    options = []
    for entry in ledger:
        view, data = entry["view"], entry["data"]

        def add(label, text, action=None):
            options.append(
                {
                    "evidence": entry["ledger_id"],
                    "label": label,
                    "text": text,
                    "action": action,
                }
            )

        if view in ("runway", "scenario"):
            label = "Hypothetical" if view == "scenario" else "Forecast"
            if data["lowest"] is not None:
                add(label, f"Lowest projected balance is {money(data['lowest'])}.")
            if data["crossing"]:
                add(
                    label,
                    f"The first projected cash-floor crossing is {data['crossing']}.",
                )
        elif view == "forecast" and data:
            add(
                "Forecast",
                f"Expected spending on {data['horizon_dates'][0]} is {money(data['forecast'][0])}.",
            )
        elif view == "recurring":
            for item in data:
                add(
                    "Forecast",
                    f"A confirmed subscription averages {money(item['monthly'])} per month.",
                )
        elif view == "flags":
            for item in data:
                add(
                    "Observed",
                    f"A possible { {'price': 'price change', 'duplicate': 'duplicate charge', 'unusual': 'unusual charge'}[item['kind']] } involves {money(item['amount'])} on {item['date']}.",
                )
        elif view == "history":
            for item in data:
                add(
                    "Observed",
                    f"A posted transaction of {money(item['amount'])} on {item['date']} needs classification.",
                )
        elif view == "budgets":
            for item in data:
                add(
                    "Forecast",
                    f"Projected category spending is {money(item['projected'])} against a {money(item['limit'])} budget.",
                )
        elif view == "spending":
            for item in data:
                category, amount = item["category"], item["recent"]
                if re.fullmatch(r"[A-Z_]{1,80}", category) and 0 < amount <= 1e10:
                    add(
                        "Hypothetical",
                        f"Proposed monthly {category} budget based on recent spending is {money(amount)}.",
                        {
                            "category": category,
                            "limit": float(
                                Decimal(str(amount)).quantize(
                                    Decimal(".01"), rounding=ROUND_HALF_UP
                                )
                            ),
                        },
                    )
    return options


def verify(draft, options):
    allowed = {(c["label"], c["evidence"], c["text"]) for c in options}
    return [
        c["text"]
        for c in draft
        if (c["label"], c["evidence"], c["text"]) not in allowed
    ]


def gemini_model():
    import os

    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        api_key=os.environ["GEMINI_API_KEY"],
        timeout=20,
        max_retries=0,
    )


def graph_for(saver, reader, model, *, compare_all_tools=False):
    """The caller binds reader and owner; no specialist sees a write capability."""

    def specialist():

        async def reason(state):
            role = state["topic"]
            allowed = (
                tuple(dict.fromkeys(v for group in ROLES.values() for v in group))
                if compare_all_tools
                else ROLES[role]
            )
            used = {e["view"] for e in state.get("ledger", [])}
            remaining = [v for v in allowed if v not in used]
            if not used and not compare_all_tools:
                return {"tool": allowed[0]}
            if not remaining:
                return {"tool": "finish"}
            choice = await model.with_structured_output(Choice).ainvoke(
                f"Finance review: {role}. Completed reads: {sorted(used)}. Choose one additional read from {remaining} or finish."
            )
            return {"tool": choice.tool if choice.tool in remaining else "finish"}

        async def observe(state):
            owner = UUID(state["owner"])
            view = state["tool"]
            if not compare_all_tools and view not in ROLES[state["topic"]]:
                raise ValueError("Read outside specialist scope")
            inspect, simulate = planning_tools(owner, reader)
            if view == "forecast":

                def load(user):
                    result = reader(user, "forecast_history", None)
                    return History.model_validate(result.data), result.sources

                try:
                    evidence = await forecast_tool(owner, load).ainvoke({})
                    entry = {
                        "ledger_id": str(evidence.ledger_id),
                        "view": "forecast",
                        "sources": evidence.source_ids,
                        "assumptions": [evidence.assumption],
                        "data": evidence.result.model_dump(mode="json"),
                    }
                except InsufficientHistory:
                    return {"tool": "finish"}
            elif view == "scenario":
                evidence = await simulate.ainvoke(
                    {
                        "scenario": PlanningScenario.model_validate(
                            state.get("scenario", {})
                        )
                    }
                )
                entry = evidence.model_dump(mode="json")
            else:
                evidence = await inspect.ainvoke({"view": view})
                entry = evidence.model_dump(mode="json")
            return {"ledger": [*state.get("ledger", []), entry]}

        sub = StateGraph(RunState)
        sub.add_node("reason", reason, timeout=30)
        sub.add_node("observe", observe, timeout=30)
        sub.add_edge(START, "reason")
        sub.add_conditional_edges(
            "reason", lambda s: END if s["tool"] == "finish" else "observe"
        )
        sub.add_conditional_edges(
            "observe", lambda s: END if s["tool"] == "finish" else "reason"
        )
        return sub.compile()

    async def writer(state):
        options = catalog(state["ledger"])
        if not options:
            return {"draft": [], "errors": []}
        permitted = [
            {k: c[k] for k in ("label", "text", "evidence")} for c in options[:100]
        ]
        prompt = f"Select the most relevant supported statements for {state['topic']}. Copy their labels, text and evidence IDs exactly. Options: {permitted}. Prior rejected claims: {state.get('errors', [])}"
        response = await model.with_structured_output(Draft).ainvoke(prompt)
        return {"draft": [c.model_dump() for c in response.claims]}

    async def verifier(state):
        options = catalog(state["ledger"])
        errors = verify(state["draft"], options)
        action: dict = {}
        if not errors and state["topic"] == "budget":
            for claim in state["draft"]:
                action = next(
                    (
                        c["action"]
                        for c in options
                        if c["text"] == claim["text"] and c["action"]
                    ),
                    {},
                )
                if action:
                    break
        return {
            "errors": errors,
            "action": action,
            "autonomy": "L2" if action else "L0",
            "retries": state.get("retries", 0) + int(bool(errors)),
        }

    def approval(state):
        answer = interrupt({"budget": state["action"]})
        return {"approved": answer is True}

    g = StateGraph(RunState)

    async def supervise(state):
        return {
            "messages": [f"Review requested by {state['trigger']}."],
            "autonomy": "L0",
        }

    g.add_node("supervisor", supervise, timeout=5)
    g.add_edge(START, "supervisor")
    g.add_node("specialist", specialist())
    g.add_edge("supervisor", "specialist")
    g.add_edge("specialist", "writer")
    g.add_node("writer", writer, timeout=30)
    g.add_node("verifier", verifier, timeout=5)
    g.add_node("approval", approval)
    g.add_edge("writer", "verifier")
    g.add_conditional_edges(
        "verifier",
        lambda s: (
            ("writer" if s["retries"] < 3 else "refuse")
            if s["errors"]
            else "approval"
            if s["action"]
            else END
        ),
    )

    async def refuse(state):
        return {
            "draft": [],
            "action": {},
            "messages": ["The evidence did not support a verified answer."],
        }

    g.add_node("refuse", refuse, timeout=5)
    g.add_edge("refuse", END)
    g.add_edge("approval", END)
    return g.compile(checkpointer=saver)


class InsufficientHistory(Exception):
    """A forecast requires a complete series."""
