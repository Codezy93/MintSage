"""Durable job processing and user-scoped actions. The worker runs separately from HTTP."""

import asyncio
import hashlib
import os
from contextlib import asynccontextmanager

import httpx
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres.aio import AsyncPostgresStore
from langgraph.types import Command
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from agent_service.planning_tools import planning_reader
from agent_service.workflow import InsufficientHistory, gemini_model, graph_for


@asynccontextmanager
async def database():
    conn = await AsyncConnection.connect(
        os.environ["AGENT_DATABASE_URL"],
        autocommit=True,
        prepare_threshold=0,
        row_factory=dict_row,
        options="-c search_path=agent_private,pg_catalog -c lock_timeout=5000",
    )
    async with conn:
        yield conn


async def setup():
    async with database() as conn:
        await AsyncPostgresSaver(conn).setup()
        await AsyncPostgresStore(conn).setup()


async def weekly(conn):
    await conn.execute("""insert into runs(owner_id,event_key,trigger,topic)
        select owner,'week:'||to_char(now() at time zone 'UTC','IYYY-IW'),'weekly','cash' from
        (select owner_id as owner from public.finance_plans union select id from public.plaid_tokens) u
        on conflict do nothing""")


def load_reader(event):
    read = planning_reader(
        os.environ["PLANNING_TOOL_URL"], os.environ["AGENT_SERVICE_SECRET"], event
    )

    def bound(user, view, scenario):
        try:
            return read(user, view, scenario)
        except httpx.HTTPStatusError as exc:
            if view == "forecast_history" and exc.response.status_code == 422:
                raise InsufficientHistory() from exc
            raise

    return bound


async def owner_lock(conn, owner):
    await conn.execute(
        "select pg_advisory_xact_lock(hashtextextended(%s,0))", (str(owner),)
    )


async def apply_budget(conn, owner, run_id, proposal):
    """Runs in the same transaction as completing the approved job."""
    row = await (
        await conn.execute(
            "select settings from public.finance_plans where owner_id=%s for update",
            (owner,),
        )
    ).fetchone()
    settings = dict(row["settings"]) if row else {}
    budgets = list(settings.get("budgets", []))
    if len(budgets) >= 100 or any(
        b["category"] == proposal["category"] and not b.get("detail") for b in budgets
    ):
        return "A budget already covers this category or the plan is full."
    budgets.append(
        {
            "id": str(run_id),
            "category": proposal["category"],
            "detail": "",
            "limit": proposal["limit"],
        }
    )
    settings["budgets"] = budgets
    if row:
        await conn.execute(
            "update public.finance_plans set settings=%s,revision=revision+1 where owner_id=%s",
            (Jsonb(settings), owner),
        )
    else:
        await conn.execute(
            "insert into public.finance_plans(owner_id,settings) values(%s,%s)",
            (owner, Jsonb(settings)),
        )
    await audit(conn, owner, run_id, "approved_budget")
    return "Approved budget created."


async def audit(conn, owner, rid, action):
    await conn.execute(
        "insert into action_log(owner_id,run_id,action) values(%s,%s,%s)",
        (owner, rid, action),
    )


async def complete(conn, store, job, state, paused):
    owner, rid = job["owner_id"], job["id"]
    claims = state.get("draft", [])
    ledger = state.get("ledger", [])
    used = {c["evidence"] for c in claims}
    result = {
        "claims": claims,
        "sources": [
            {
                "id": e["ledger_id"],
                "sources": e["sources"],
                "assumptions": e["assumptions"],
            }
            for e in ledger
            if e["ledger_id"] in used
        ],
        "proposal": state.get("action") or None,
    }
    status = "open" if claims else "done"
    if paused:
        status = "awaiting"
    elif result["proposal"]:
        status = "done"
        if job["status"] == "approved" and state.get("approved") is True:
            result["message"] = await apply_budget(conn, owner, rid, result["proposal"])
        else:
            result["message"] = "Proposal declined."
    elif not claims:
        result["message"] = (
            "No verified finding."
            if not state.get("errors")
            else "The figures could not be verified."
        )
    if job["topic"] == "reconciliation" and claims:
        history: list[dict] = next((e["data"] for e in ledger if e["view"] == "history"), [])
        if len(history) == 1:
            result["fact_source"] = hashlib.sha256(
                history[0]["id"].encode()
            ).hexdigest()
            known = await store.asearch(
                (str(owner), "facts"), filter={"source": result["fact_source"]}, limit=1
            )
            if known:
                status = "done"
    if claims and job["trigger"] != "user" and status == "open":
        # Equivalent evidence on repeated syncs should not produce a new inbox card.
        signature = hashlib.sha256(
            repr(
                (
                    job["topic"],
                    [c["text"] for c in claims],
                    sorted({s for e in result["sources"] for s in e["sources"]}),
                )
            ).encode()
        ).hexdigest()
        previous = await (
            await conn.execute(
                "select 1 from runs where owner_id=%s and result->>'signature'=%s and id<>%s limit 1",
                (owner, signature, rid),
            )
        ).fetchone()
        result["signature"] = signature
        if previous:
            status = "done"
    if job["topic"] == "anomaly" and claims:
        flags: list[dict] = next((e["data"] for e in ledger if e["view"] == "flags"), [])
        if len(flags) == 1 and flags[0]["kind"] == "duplicate":
            group = flags[0]["group"]
            result["group"] = group
            policy = await (
                await conn.execute(
                    "select suppress_duplicates from policies where owner_id=%s",
                    (owner,),
                )
            ).fetchone()
            if status == "open" and policy and policy["suppress_duplicates"]:
                dismissed = await store.asearch(
                    (str(owner), "episodes"),
                    filter={"group": group, "decision": "dismissed"},
                    limit=3,
                )
                if len(dismissed) >= 3:
                    status = "automatic"
                    await audit(conn, owner, rid, "auto_dismiss_duplicate")
    await conn.execute(
        "update runs set result=%s,status=%s where id=%s and owner_id=%s",
        (Jsonb(result), status, rid, owner),
    )


async def process(conn, saver, job, reader, model):
    graph = graph_for(saver, reader, model)
    config = {
        "configurable": {"thread_id": f"{job['owner_id']}:{job['id']}"},
        "recursion_limit": 28,
    }
    checkpoint = await graph.aget_state(config)
    arg: dict | Command | None = None
    if not checkpoint.values:
        arg = {
            "owner": str(job["owner_id"]),
            "trigger": job["trigger"],
            "topic": job["topic"],
            "scenario": job["scenario"],
            "ledger": [],
        }
    elif checkpoint.interrupts and job["status"] in ("approved", "declined"):
        arg = Command(resume=job["status"] == "approved")
    if arg is not None or (checkpoint.next and not checkpoint.interrupts):
        await graph.ainvoke(arg, config, durability="sync")
    checkpoint = await graph.aget_state(config)
    await owner_lock(conn, job["owner_id"])
    await complete(
        conn,
        AsyncPostgresStore(conn),
        job,
        checkpoint.values,
        bool(checkpoint.interrupts),
    )


async def work_once(conn, saver, model):
    async with conn.transaction():
        job = await (
            await conn.execute("""select * from runs where status in ('queued','approved','declined')
             and scheduled_at<=now() order by scheduled_at for update skip locked limit 1""")
        ).fetchone()
        if not job:
            return False
        try:
            async with conn.transaction():
                await process(conn, saver, job, load_reader(job["event"]), model)
        except Exception as exc:
            import logging

            logging.getLogger(__name__).warning(
                "Agent run %s failed (%s)", job["id"], type(exc).__name__
            )
            await conn.execute(
                """update runs set attempts=attempts+1, scheduled_at=now()+interval '30 seconds',
                status=case when attempts>=4 then 'failed' else status end where id=%s""",
                (job["id"],),
            )
    return True


async def worker():
    model = gemini_model()
    async with database() as conn, database() as checkpoints:
        saver = AsyncPostgresSaver(checkpoints)
        loop = asyncio.get_running_loop()
        next_week_check = 0.0
        while True:
            if loop.time() >= next_week_check:
                await weekly(conn)
                next_week_check = loop.time() + 60
            if not await work_once(conn, saver, model):
                await asyncio.sleep(2)


if __name__ == "__main__":
    import sys

    asyncio.run(setup() if sys.argv[1:] == ["setup"] else worker())
