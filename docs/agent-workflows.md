# Agent service and inbox

Apply the SQL migrations in filename order, including `202611260003_agent_workflows.sql`. The API and worker use a server-only `AGENT_DATABASE_URL` pointing to the application PostgreSQL database. Use a direct or session-mode connection. The setup role must be able to create tables in `agent_private`. The runtime needs that schema, read access to plan and connection owner IDs, and read/write access to finance plans. Keep the schema private.

Install `agent_service/requirements.txt` from the repository root. Set `LANGGRAPH_STRICT_MSGPACK=true`, a shared `AGENT_SERVICE_SECRET`, `GEMINI_API_KEY`, and `PLANNING_TOOL_URL` (the HTTPS URL of Next.js `/api/internal/planning`). Set `AGENT_SERVICE_URL` in Next.js to the agent HTTP service origin. Run setup once and keep both processes running.

```sh
python -m agent_service.runtime setup
uvicorn agent_service.api:create_app --factory
# In the worker process
python -m agent_service.runtime
```

Open **Agent inbox** to request reviews, approve or decline a proposed budget, confirm or dismiss findings, configure automatic duplicate dismissal, undo it, and inspect or forget saved facts and decisions. Sync changes create cash, recurring and reconciliation jobs. Saved floor and anomaly events create targeted jobs. The worker schedules a cash review once per UTC calendar week per connected or planning user.

The model receives topic names, available read choices, candidate statements and ledger IDs. Each displayed claim must match its evidence, label and complete rendered text. USD figures use half-up rounding to cents and dates use ISO calendar dates. Three unsuccessful writing attempts end the report. No model tool can write a budget. The worker checks both the persisted approval decision and the resumed checkpoint before applying it.

Six scripted fixtures compared topic-scoped reads with a single agent given all read choices. Both produced the same verified claims on all six. The runtime uses one shared specialist loop with topic-specific permissions. Live Gemini performance remains unmeasured.

## Plaid Sandbox acceptance

Set `PLAID_WEBHOOK_URL` to the public HTTPS URL of `/api/plaid/webhook` before linking a Sandbox Item. For an existing Item, update its webhook URL through Plaid. Open the dashboard to initialize Transactions Sync and associate the Item ID. From the same Sandbox environment call `/sandbox/item/fire_webhook` with the Item access token, webhook type `TRANSACTIONS`, and code `SYNC_UPDATES_AVAILABLE`. Confirm `webhook_fired`, receipt of a signed delivery, and successful sync. New agent jobs require changed or removed transactions. Replaying a notification with an unchanged cursor should leave the job count unchanged. [Plaid Sandbox API](https://plaid.com/docs/api/sandbox/) and [Transactions webhooks](https://plaid.com/docs/transactions/webhooks/).

Local checks use a signed webhook fixture, a scripted model and a disposable PostgreSQL database. Set `AGENT_TEST_POSTGRES` to a test cluster where the test role can create databases, then run `python -m pytest agent_service/tests`. The recovery test terminates a child worker and resumes its checkpoint in a second process.
