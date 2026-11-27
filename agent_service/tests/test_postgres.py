"""Integration tests create and remove a uniquely named database on a test cluster."""

import asyncio
import os
import sys
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from fastapi import HTTPException, Request
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres.aio import AsyncPostgresStore
from psycopg import sql
from psycopg.conninfo import make_conninfo
from psycopg.types.json import Jsonb

from agent_service.api import Decide, Forget, Policy, Start, change, inbox
from agent_service.runtime import complete, database, process, setup, weekly
from agent_service.tests.test_workflow import ScriptedModel, reader

ROOT = Path(__file__).resolve().parents[2]
DSN = os.getenv("AGENT_TEST_POSTGRES", "")
pytestmark = pytest.mark.skipif(
    not DSN, reason="Set AGENT_TEST_POSTGRES to a disposable PostgreSQL cluster"
)


@pytest.fixture
def workflow_db(monkeypatch):
    name = "mint_agent_" + uuid4().hex
    with psycopg.connect(DSN, autocommit=True) as admin:
        admin.execute(
            sql.SQL("create database {} template template0 encoding 'UTF8'").format(
                sql.Identifier(name)
            )
        )
        try:
            dsn = make_conninfo(DSN, dbname=name)
            monkeypatch.setenv("AGENT_DATABASE_URL", dsn)
            with psycopg.connect(dsn, autocommit=True) as db:
                for role in ["anon", "authenticated", "service_role"]:
                    if not db.execute(
                        "select 1 from pg_roles where rolname=%s", (role,)
                    ).fetchone():
                        db.execute(
                            sql.SQL("create role {}").format(sql.Identifier(role))
                        )
                db.execute(
                    "create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql as 'select null::uuid'"
                )
                for path in [
                    ROOT / "database/schema/users.sql",
                    ROOT / "database/schema/plaid_tokens.sql",
                    *sorted((ROOT / "database/migrations").glob("*.sql")),
                ]:
                    db.execute(path.read_text())
            asyncio.run(setup())
            yield
        finally:
            admin.execute(
                sql.SQL("drop database {} with (force)").format(sql.Identifier(name))
            )


def test_jobs_approval_policy_memory_and_recovery(workflow_db):
    async def exercise():
        alice, bob = uuid4(), uuid4()
        req = Request({"type": "http", "state": {"user_id": str(alice)}})
        other = Request({"type": "http", "state": {"user_id": str(bob)}})
        async with database() as db, database() as checkpoint:
            saver = AsyncPostgresSaver(checkpoint)
            await db.execute("insert into auth.users values(%s),(%s)", (alice, bob))
            await change(req, Start(action="start", id=uuid4(), topic="budget"))

            async def job():
                return await (
                    await db.execute(
                        "select * from runs where owner_id=%s and topic='budget'",
                        (alice,),
                    )
                ).fetchone()

            first = await job()
            rid = first["id"]
            child = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "agent_service.tests.test_postgres", str(rid)
            )
            assert await asyncio.wait_for(child.wait(), 30) == 75

            def no_reread(*args):
                raise AssertionError("completed read was replayed")

            async with db.transaction():
                await process(
                    db,
                    AsyncPostgresSaver(checkpoint),
                    first,
                    no_reread,
                    ScriptedModel(),
                )
            assert (await job())["status"] == "awaiting"
            assert not await (
                await db.execute("select * from public.finance_plans")
            ).fetchone()
            with pytest.raises(HTTPException):
                await change(other, Decide(action="approve", id=rid))
            await change(req, Decide(action="approve", id=rid))
            async with db.transaction():
                await process(db, saver, await job(), no_reread, ScriptedModel())
            assert (await job())["status"] == "done"
            budgets = (
                await (
                    await db.execute(
                        "select settings from public.finance_plans where owner_id=%s",
                        (alice,),
                    )
                ).fetchone()
            )["settings"]["budgets"]
            assert len(budgets) == 1 and budgets[0]["limit"] == 55.12
            await weekly(db)
            await weekly(db)
            assert (
                await (
                    await db.execute(
                        "select count(*) n from runs where trigger='weekly'"
                    )
                ).fetchone()
            )["n"] == 1
            await db.execute(
                "insert into public.transaction_sync_events(user_id,changed_transaction_ids) values(%s,array['a'])",
                (alice,),
            )
            assert (
                await (
                    await db.execute("select count(*) n from runs where trigger='sync'")
                ).fetchone()
            )["n"] == 3
            store = AsyncPostgresStore(db)

            async def finding(topic, view, source):
                row = await (
                    await db.execute(
                        "insert into runs(owner_id,event_key,topic,trigger) values(%s,%s,%s,'event') returning *",
                        (alice, str(uuid4()), topic),
                    )
                ).fetchone()
                e = reader(alice, view, None).model_dump(mode="json")
                e["sources"] = [source]
                from agent_service.workflow import catalog

                claim = catalog([e])[0]
                async with db.transaction():
                    await complete(
                        db,
                        store,
                        row,
                        {
                            "draft": [
                                {k: v for k, v in claim.items() if k != "action"}
                            ],
                            "ledger": [e],
                        },
                        False,
                    )
                return row["id"]

            for i in range(3):
                duplicate = await finding("anomaly", "flags", str(i))
                await change(req, Decide(action="dismiss", id=duplicate))
            first_open = await finding("anomaly", "flags", "policy-off")
            assert (
                await (
                    await db.execute(
                        "select status from runs where id=%s", (first_open,)
                    )
                ).fetchone()
            )["status"] == "open"
            await change(req, Policy(action="policy", enabled=True))
            auto = await finding("anomaly", "flags", "policy-on")
            assert (
                await (
                    await db.execute("select status from runs where id=%s", (auto,))
                ).fetchone()
            )["status"] == "automatic"
            await change(req, Decide(action="reverse", id=auto))
            assert (
                await (
                    await db.execute(
                        "select count(*) n from action_log where run_id=%s", (auto,)
                    )
                ).fetchone()
            )["n"] == 2
            amb = await finding("reconciliation", "history", "unclassified")
            await change(req, Decide(action="rent_split", id=amb))
            assert any(
                m.get("classification") == "rent_split"
                for m in (await inbox(req))["memory"]
            )
            assert (await inbox(other))["memory"] == []
            await change(req, Forget(action="forget", kind="facts", id=amb))
            assert not (await store.aget((str(alice), "facts"), str(amb)))
            await db.execute(
                "insert into public.finance_events(owner_id,event_key,destination,evidence) values(%s,'f','anomaly-investigator',%s)",
                (alice, Jsonb({})),
            )
            assert await (
                await db.execute(
                    "select 1 from runs where event='f' and topic='anomaly'"
                )
            ).fetchone()

    asyncio.run(exercise())


if __name__ == "__main__":

    class StoppedWorker(ScriptedModel):
        def with_structured_output(self, schema):
            if schema.__name__ == "Draft":
                os._exit(75)
            return super().with_structured_output(schema)

    async def stop_mid_run():
        async with database() as db, database() as checkpoints, db.transaction():
            job = await (
                await db.execute("select * from runs where id=%s", (sys.argv[1],))
            ).fetchone()
            await process(
                db, AsyncPostgresSaver(checkpoints), job, reader, StoppedWorker()
            )

    asyncio.run(stop_mid_run())
