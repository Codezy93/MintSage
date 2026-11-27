"""Session-bound inbox. Only explicit inbox decisions can authorize a budget."""

import os
from typing import Annotated, Literal
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from langgraph.store.postgres.aio import AsyncPostgresStore
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field

from agent_service.auth import ServiceAuthentication
from agent_service.planning_tools import PlanningScenario
from agent_service.runtime import audit, database, owner_lock
from agent_service.workflow import Topic


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Start(Input):
    action: Literal["start"]
    id: UUID
    topic: Topic
    scenario: PlanningScenario | None = None


class Decide(Input):
    action: Literal["approve", "decline", "dismiss", "confirm", "reverse", "rent_split"]
    id: UUID


class Policy(Input):
    action: Literal["policy"]
    enabled: bool


class Forget(Input):
    action: Literal["forget"]
    kind: Literal["facts", "episodes"]
    id: UUID


service = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@service.get("/inbox")
async def inbox(request: Request, offset: Annotated[int, Field(ge=0)] = 0):
    owner = request.state.user_id
    async with database() as conn:
        runs = await (
            await conn.execute(
                """select id,trigger,topic,status,result,created_at from runs
            where owner_id=%s and (status<>'done' or trigger='user') order by created_at desc,id desc limit 51 offset %s""",
                (owner, offset),
            )
        ).fetchall()
        policy = await (
            await conn.execute(
                "select suppress_duplicates from policies where owner_id=%s", (owner,)
            )
        ).fetchone()
        store = AsyncPostgresStore(conn)
        memory: list[dict] = []
        more = len(runs) > 50
        for kind in ("facts", "episodes"):
            items = await store.asearch((owner, kind), limit=51, offset=offset)
            more = more or len(items) > 50
            memory.extend({"id": i.key, "kind": kind, **i.value} for i in items[:50])
        return {
            "runs": runs[:50],
            "memory": memory,
            "more": more,
            "policy": bool(policy and policy["suppress_duplicates"]),
        }


@service.post("/inbox")
async def change(
    request: Request,
    command: Annotated[Start | Decide | Policy | Forget, Field(discriminator="action")],
):
    owner = request.state.user_id
    async with database() as conn, conn.transaction():
        store = AsyncPostgresStore(conn)
        if isinstance(command, Start):
            await conn.execute(
                """insert into runs(owner_id,event_key,topic,trigger,scenario)
                values(%s,%s,%s,'user',%s) on conflict do nothing""",
                (
                    owner,
                    str(command.id),
                    command.topic,
                    Jsonb(
                        command.scenario.model_dump(mode="json", exclude_none=True)
                        if command.scenario
                        else {}
                    ),
                ),
            )
        elif isinstance(command, Policy):
            await owner_lock(conn, owner)
            await conn.execute(
                """insert into policies values(%s,%s) on conflict(owner_id)
                do update set suppress_duplicates=excluded.suppress_duplicates""",
                (owner, command.enabled),
            )
        elif isinstance(command, Forget):
            await owner_lock(conn, owner)
            await store.adelete((owner, command.kind), str(command.id))
        else:
            row = await (
                await conn.execute(
                    "select status,result,topic from runs where owner_id=%s and id=%s for update",
                    (owner, command.id),
                )
            ).fetchone()
            if not row:
                raise HTTPException(404, "Finding unavailable")
            await owner_lock(conn, owner)
            before = row["status"]
            transitions = {
                "approve": ("awaiting", "approved"),
                "decline": ("awaiting", "declined"),
                "dismiss": ("open", "dismissed"),
                "confirm": ("open", "confirmed"),
                "reverse": ("automatic", "open"),
            }
            if command.action == "rent_split":
                if (
                    row["topic"] != "reconciliation"
                    or before not in ("open", "confirmed")
                    or not row["result"].get("fact_source")
                ):
                    raise HTTPException(409, "Choose a single reconciliation finding")
                await store.aput(
                    (owner, "facts"),
                    str(command.id),
                    {
                        "classification": "rent_split",
                        "source": row["result"]["fact_source"],
                    },
                )
                return {"saved": True}
            required, after = transitions[command.action]
            if before == after:
                return {"saved": True}
            if before != required:
                raise HTTPException(409, "This finding has changed")
            await conn.execute(
                "update runs set status=%s,scheduled_at=now(),attempts=0 where owner_id=%s and id=%s",
                (after, owner, command.id),
            )
            await audit(conn, owner, command.id, command.action)
            await store.aput(
                (owner, "episodes"),
                str(command.id),
                {
                    "decision": after,
                    "topic": row["topic"],
                    "group": row["result"].get("group"),
                },
            )
    return {"saved": True}


def create_app():
    return ServiceAuthentication(service, os.environ["AGENT_SERVICE_SECRET"])
