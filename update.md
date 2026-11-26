# MintSage — consolidated update and implementation plan

This file consolidates all planning from the original discovery audit, engineering
upgrade plan, repository cleanup, product clarification, personal-finance expansion,
and the agent-first restructure added on 2026-11-24. It preserves steps 0–23, adds
agent-system steps 24–34, and keeps a mapping back to the original tiered proposal.

Step 0 is complete. Step 1 has app changes and a database migration, with
configured integration checks still pending. Checked items below record completed work.
Steps 2–10 were implemented and verified locally on November 25. Production build,
TypeScript, and lint passed. Session and provider checks used fixtures, and migration
checks used embedded PostgreSQL. Hosted verification and deployment remain open.

Steps 11–13 are implemented. Step 14 has local verification evidence and open hosted acceptance checks.

Steps 15–20 and 22–23 have local implementation and fixture coverage. The agent proposal workflow in step 17 remains assigned to step 29. Step 21 retains its superseded status. See the [planning assumptions and evaluation](docs/financial-planning.md).

## What changed in this revision

- MintSage becomes an **agent-first product**: agents run workflows end to end and the
  dashboard becomes a view of their outputs and the data behind them.
- The agent system is built with **LangGraph** (Python), orchestrating Gemini.
- Step 21 (grounded LLM assistant) is **superseded** by steps 24–34.
- Steps 15–18 are reframed as **typed, tested agent tools**; their requirements are unchanged.
- Delivery checkpoints are reorganized into phases, with a defined **demo cut** for the
  agentic AI co-op demo.
- Agent-specific KPIs and an evaluation suite are added (step 33).

## Architecture thesis

**Agents decide, code computes, the verifier checks, the user approves.**

- Agents choose which tools to call, in what order, and what is worth surfacing.
- All financial figures come from tested application code, never from the LLM.
- A deterministic verifier blocks any output containing a number that is not in the
  run's tool-result ledger.
- No agent moves money or changes external accounts at any autonomy level.

## Starting point and reasons for the upgrades

- The Next.js app integrates Supabase authentication, Plaid transactions, and Gemini analysis.
- The main dashboard needs configured external services; a successful build does not
  establish that the complete live workflow works.
- Forecast serving code is missing from the repository. The app expects 60 days in
  and 30 days out, while the existing offline LSTM and ARIMA experiments predict
  six and fifteen steps respectively.
- The original audit found browser-visible Plaid tokens, unprotected API routes,
  private variables with public prefixes, and an unregistered session proxy.
- The supplied SQL defines policies but does not explicitly enable RLS. The live
  database configuration remains unverified, and the original token SELECT policy
  permits browser access even if token writes are moved to the server.
- Forecasting has no established accuracy: training uses overlapping windows with a
  random split, lacks normalization and reproducible seeds, and has no baseline evaluation.
- The original one-month transaction fetch cannot populate the full 60-day forecast
  input. Date parsing and inconsistent financial treatment also need correction.
- The original audit reported vulnerable dependencies, failing lint, no automated test
  suite or CI, and unsupported UI claims. Dependency audit counts must be refreshed
  during the dependency upgrade rather than treated as current facts.
- The broken standalone chat route and confirmed dead code were removed in step 0.
  Dashboard chat remains part of the product and becomes an entry point to the agent system.
- v1 had no agentic behavior: forecasts plus an LLM chat page.

## Product definition

MintSage is a team of finance agents that watches a user's cash flow, investigates
changes, and proposes actions, with every number verified and every action approved.
It retrieves financial data from Plaid, uses Plaid's categories and subcategories,
forecasts spending, analyzes cash runway, and explains results through agents grounded
in tested calculations.

- **Primary interface:** an agent inbox of findings, proposals, and approval requests,
  plus chat. The dashboard remains as a view of agent outputs and underlying data.
- **Who starts work:** agents (on Plaid events, schedules, and thresholds) and the user (chat).
- Preserve Plaid's primary and detailed categories. Building a custom categorization
  model is outside the current scope.
- Merchant/vendor identifiers can support grouping and optional user overrides.
  Check identifier availability and stability; do not assume every transaction has one.
  Preserve original Plaid classifications alongside any overrides.
- Compute financial figures and scenarios in tested application code. Agents call those
  functions, explain results, and reference supporting records; they do not invent calculations.
- Distinguish spending, income, transfers, debt payments, and account cash movements.
- Label forecasts and spending allowances as estimates with assumptions, freshness,
  and uncertainty visible to the user.

## Original engineering plan

The original step numbers are retained so earlier discussions remain traceable.

### Step 0 — Organize files and remove dead code

Status: complete in commit `98e34f1`.

- [x] Group offline Python scripts, models, and sample data in `experiments/forecasting/`.
- [x] Move SQL definitions to `database/schema/`.
- [x] Remove the broken standalone `/chat` page and confirmed unused components/helpers.
- [x] Standardize active dashboard filenames and share one transaction type.
- [x] Remove unused dependencies and scaffold assets.
- [x] Remove deployment ZIPs from the current tree; preserve Git history.
- [x] Document the layout and add ignore rules for generated output.

Verification: dependency installation, TypeScript, Python syntax, import resolution,
and a production build with placeholder credentials passed. Models, sample data, and
SQL were preserved byte-for-byte. Lint has 16 remaining errors and zero warnings.
Live integrations were not verified.

### Step 1 — Secure Plaid token storage

- [x] Exchange and persist access tokens entirely on the server.
- [x] Remove token values from browser responses and client-side writes.
- [x] Add a migration explicitly enabling RLS and restricting database permissions.
- [x] Prevent authenticated browser clients from reading or writing the token table;
  use narrowly scoped server-only access for token operations.
- [ ] Verify anonymous, cross-user, and direct browser database access are denied.

Both Plaid routes use the verified session. The dashboard performs the connection
lookup through the server-only token store. See the README for the migration,
server secret, and integration checks.

Local verification passed for the Plaid routes with mocked providers and for
the migration in embedded PostgreSQL. Anonymous and authenticated roles were
denied reads and writes for both fixture users. The service role could read
existing rows and upsert new and existing connections. Hosted Supabase and
Plaid Sandbox verification remains pending.

### Step 2 — Protect API routes and secrets

- [x] Require verified sessions on all API routes; derive identity from the session.
- [x] Remove `NEXT_PUBLIC_` from private secrets and enforce server-only imports.
- [x] Add `.env.example` with placeholders and document each variable's purpose.
- [x] Verify unauthorized requests do not invoke paid downstream services.
- [x] Authenticate Next.js → agent-service calls; the agent service must never trust a
  user ID supplied in a request body (see step 32).

### Step 3 — Repair session handling

- [x] Move `app/proxy.ts` into `app/src/` and verify framework registration.
- [x] Replace the nonexistent `users.plaid_token` lookup with a safe connection-status check.
- [x] Verify login redirects, session refresh, logout, and API authorization behavior.

### Step 4 — Correct the financial data pipeline

- [x] Fetch sufficient history for the forecast window and every displayed summary.
- [x] Preserve account IDs, transaction IDs, dates, pending status, merchant identifiers,
  and Plaid primary/detailed categories in shared types and storage.
- [x] Handle transaction additions, modifications, removals, and pending-to-posted changes
  without duplicating records; use incremental synchronization where appropriate.
- [x] Use consistent date-only handling and explicit currency/account boundaries.
- [x] Define spending versus cash-flow rules, including refunds, internal transfers,
  credit-card purchases, and repayments. Do not count purchases and repayments twice.
- [x] Distinguish missing history, stale data, and fetch failures from real zero spending.
- [x] Verify pagination, date boundaries, duplicates, transfers, and category preservation.
- [x] Emit a sync-completed event (with changed transaction IDs) that can trigger agent runs.
- [x] Mark transactions the rules cannot classify confidently (for example, ambiguous
  transfer pairs) so the reconciliation agent can review them. Counting rules stay in code.

### Step 5 — Complete code and type cleanup

- [x] Remove the orphaned chat route, unused dashboard components, and unused dependencies.
- [x] Consolidate duplicate transaction types.
- [x] Check the expanded data pipeline for obsolete types, links, and imports.

November 25 verification covered all current API methods, denied service credentials,
verified user propagation, proxy registration, cookie forwarding, and logout success
and failure. Sync fixtures covered pagination, modifications, removals, pending
replacement, category preservation, currency and spending rules, and leap-day
boundaries. Database fixtures checked atomic cursor advancement, event creation,
stale writer rejection, and browser-role denials. The agent authentication boundary
was exercised independently pending the agent workflow implementation in step 25.

### Step 6 — Update and pin dependencies

- [x] Upgrade vulnerable packages and verify compatibility; record remaining audit findings.
- [x] Pin Python dependencies and provide a CPU installation option.
- [x] Pin LangGraph, its checkpointer, and LangChain integration packages to exact versions.
  Check published advisories for LangGraph checkpoint vulnerabilities
  (SQL injection in `langgraph-checkpoint-sqlite`; unsafe msgpack deserialization in core)
  and choose patched releases.
- [x] Verify clean installation, TypeScript, and production build.

Verified November 25, 2026 on Linux. The original lockfile reported 24 npm audit
findings (one critical, 15 high, seven moderate, one low). The updated lockfile
reported zero. Clean npm installation, lint, transaction tests, TypeScript and a
production build with placeholder configuration passed. The agent and CPU forecasting
environments passed pip dependency checks and pip-audit for the installed versions
(using the upstream Torch version for the CPU wheel). Agent imports, saved LSTM
inference, and the ARIMA example passed. PyTorch issued a legacy TorchScript warning
on Python 3.14. Direct Python pins and CPU installation instructions are in the
respective agent and experiment directories.

### Step 7 — Correct claims and explain data sharing

- [x] Remove unsupported security, encryption, and user-count claims.
- [x] Explain which financial information is sent to Gemini, by which agent, and when.
- [x] Label experimental forecasts and avoid unsupported accuracy claims.
- [x] State autonomy limits plainly: agents propose and explain; they never move money.

### Step 8 — Implement the forecast service in the repository

- [x] Create a typed `forecasting/` Python package with fit/predict interfaces and a
  serving endpoint.
- [x] Define and validate the existing 60-day input / 30-day output contract, including
  dates, currency, data sufficiency, and error responses.
- [x] Start with reproducible baselines; connect Next.js to the in-repository service.
- [x] Handle timeouts and unavailable forecasts explicitly.
- [x] Keep the historical experiments distinguishable from the serving implementation.
- [x] Expose the forecast as an agent tool (step 24).

The forecast endpoint uses FastAPI with the existing service authentication
middleware. The production model is weekly seasonal naive. The typed forecast
tool binds the authenticated user and history loader outside the model arguments.

### Step 9 — Validate inputs and add focused tests

- [x] Extract aggregation and EDA into pure TypeScript modules.
- [x] Add Zod validation for API requests and downstream responses.
- [x] Add Vitest tests for dates, financial aggregation, authorization, and service failures.
- [x] Add pytest tests for windowing, leakage prevention, shapes, and service contracts.
- [x] Replace remaining `any` types and fix lint errors.

### Step 10 — Build reproducible forecasting evaluation

- [x] Add documented, seeded synthetic data with weekly patterns, paydays, and heavy-tailed purchases.
- [x] Compare naive, weekly seasonal-naive, rolling mean, ARIMA, and LSTM forecasts.
- [x] Use expanding-window, walk-forward evaluation with training-only preprocessing
  and model selection separated from the final evaluation period.
- [x] Report MAE, RMSE, and MASE, handling zero denominators explicitly; explain why
  MAPE is unsuitable for zero-spending days.
- [x] Add YAML configuration files, fixed seeds, structured logs, and `make train` / `make eval` commands.
- [x] Publish reproducible results as synthetic-data results. The 45 sample transactions
  cannot establish predictive performance; a public dataset is an optional later choice.

Synthetic results and reproduction commands are in [forecasting/README.md](forecasting/README.md).

### Step 11 — Quantify uncertainty in model comparisons

- [x] Add block-bootstrap confidence intervals for loss differences against the naive baseline.
- [x] Add a Diebold–Mariano comparison with assumptions and sample-size limitations documented.
- [x] Account for serial dependence and overlapping forecast horizons.
- [x] Report negative or inconclusive results without implying a model beats the baseline.

### Step 12 — Automate verification

- [x] Add GitHub Actions for lint, TypeScript, Vitest, ruff, mypy, and pytest.
- [x] Run the agent evaluation suite (step 33) with mocked LLM responses in CI; run the
  live-LLM version manually or on a schedule, since it costs money and is nondeterministic.
- [x] Add pre-commit hooks; ensure ordinary checks require no production credentials.

The workflows discover tests in the agent suite directory. Current scenarios cover the forecast tool. Step 33 adds the broader suite. Hosted workflow execution remains pending.

### Step 13 — Complete documentation and artifact hygiene

- [x] Expand the README with the architecture thesis, agent graph diagram, setup,
  environment variables, commands, and honest status.
- [x] Add `docs/model_card.md` covering provenance, assumptions, evaluation, and failure modes.
- [x] Add `docs/agent_card.md` covering agents, tools, triggers, autonomy levels, data sent
  to the LLM, known failure modes, and evaluation results.
- [x] Remove deployment archives from the current tree and ignore generated bundles.
- [x] Credit generated Next.js scaffolding and shadcn/ui components.
- [x] Document deployment and database migration procedures once implemented.

Git history rewriting or force-pushing requires separate explicit approval.

### Step 14 — Verify the engineering foundation

- [x] Reproduce installation and checks from a fresh checkout.
- [ ] Exercise signup, linking, dashboard, forecasting, analysis, and agent runs with configured services.
- [ ] Verify tokens never reach the browser and authorization boundaries hold, including
  inside agent tool calls.
- [x] Record checks requiring external credentials separately from checks actually performed.

Local token, database-role and tool-authorization checks passed with fixtures.
Hosted provider and browser checks remain open. The current agent check can run
against Gemini with the forecasting tool. See [foundation verification](docs/foundation-verification.md).

## Personal-finance expansion (engines become agent tools)

Steps 15–20 keep their original requirements. Each engine must also be exposed as a
typed, tested tool (step 24) so agents can call it. Repeat the relevant acceptance
checks after each feature, rather than waiting until the entire expansion is finished.

### Step 15 — Cash-flow and runway engine

- [x] Retrieve suitable account balances with timestamps; allow manual inputs for missing data.
- [x] Keep available cash distinct from credit limits, investment value, and total net worth.
- [x] Project daily balances from opening cash, expected inflows, and outflows.
- [x] Define runway as time until a user-selected cash floor is crossed; support both
  expected-income and no-new-income scenarios.
- [x] Report when the floor is not crossed within the modeled horizon, rather than
  claiming unlimited runway. Show missing-data and uncertainty limitations.
- [x] Test account transfers and credit-card settlement timing without double counting.
- [x] Emit a threshold event when a projected balance crosses the user's cash floor.

### Step 16 — Bills, paydays, and subscriptions

- [x] Evaluate access to Plaid Recurring Transactions; support user-confirmed schedules
  when the add-on or adequate history is unavailable.
- [x] Show expected bills, income, and projected daily balances on a calendar.
- [x] Group recurring merchants and show monthly commitments and possible price changes.
- [x] Let users confirm subscriptions, timing, cancellations, and irregular income.
- [x] Reconcile scheduled payments with observed transactions and forecast components
  so the same expense is not included twice.

### Step 17 — Budgets and estimated spending allowance

- [x] Add user-defined budgets using Plaid categories and subcategories.
- [x] Show actual spending, projected month-end totals, and early overspending alerts.
- [x] Estimate discretionary spending before payday after obligations, savings
  commitments, and a chosen cash buffer, using one consistent cash-flow calculation.
- [x] Show assumptions, source freshness, and uncertainty; avoid guarantees of affordability.
- [ ] Agent-proposed budgets require the step 29 approval workflow. Today only a verified user can save a budget, and planning tools are read-only.

### Step 18 — What-if scenarios and forecast risk

- [x] Support hypothetical purchases, income delays, rent changes, and spending reductions.
- [x] Recompute projected balances, lowest balance, budget outcomes, and runway.
- [x] Add prediction intervals and evaluate empirical coverage and calibration.
- [x] Estimate budget-exceedance and cash-floor-crossing probabilities only when the
  underlying uncertainty method has been evaluated; explain synthetic-data limitations.
- [x] Keep scenario edits separate from actual financial records.

### Step 19 — Savings goals

- [x] Add goals with target amounts, dates, starting funds, and planned contributions.
- [x] Estimate progress and completion dates under explicit scenarios.
- [x] Integrate contributions into the cash-flow engine without treating transfers
  between owned accounts as new spending or new wealth.

### Step 20 — Unusual spending and change alerts

- [x] Flag unusual amounts, possible duplicates, and recurring billing changes for review.
- [x] Explain the evidence behind each flag; do not label an anomaly as confirmed fraud.
- [x] Add dismiss/confirm controls and notification preferences to limit repeated noise.
- [x] Route flags to the anomaly-investigator agent (step 27) instead of surfacing them directly.

### Step 21 — Extend the grounded LLM assistant

Status: **superseded by steps 24–34.** Every requirement below carries over into the
agent system and must still be met.

- Expose tested spending, budget, runway, goal, and scenario functions → step 24.
- Answer "Why did spending increase?" and "How would this purchase affect my balance
  before payday?" with calculated results and supporting records → steps 26–27.
- Show assumptions and distinguish observed facts from forecasts and hypotheticals → step 26.
- Minimize shared data, enforce account authorization, and test instruction-like text
  in transaction descriptions → step 32.

### Step 22 — Debt dashboard (later)

- [x] Evaluate Plaid Liabilities access and supported accounts; support manual entries.
- [x] Track balances, rates, payment dates, and minimum payments where available.
- [x] Compare repayment scenarios with explicit rate, fee, and payment assumptions.
- [x] Incorporate debt payments into cash-flow projections consistently.

### Step 23 — Net-worth history (later)

- [x] Track supported asset and liability balances, including user-entered items.
- [x] Show historical snapshots, missing accounts, valuation dates, and currency assumptions.
- [x] Keep liquid runway separate from net worth.

## Agent system (steps 24–34)

Built with LangGraph in a Python service. Gemini remains the LLM, accessed through
LangChain's Google integration. Agents may be built only on tools whose underlying
steps have passed their acceptance checks.

### Agent roster

| Agent | Trigger | Owns | Tools (plan step) |
| --- | --- | --- | --- |
| Supervisor | Every run | Routing and sequencing of specialists | All specialists |
| Onboarding | First login | Interviews the user for paydays, cash floor, bills, goals; confirms each | Schedule store (16), budgets (17), goals (19) |
| Data-reconciliation | Sync event | Reviews transactions the rules flagged as ambiguous; asks the user when unsure | Sync and matching rules (4) |
| Cash-flow analyst | Sync, threshold, chat | Runway, lowest balance, cash-floor warnings | Runway (15), forecast (8) |
| Recurring-charges | Sync event | New subscriptions, price changes | Recurring tools (16) |
| Anomaly investigator | Step 20 flag | Gathers evidence and decides whether to surface a flag | Flags (20), history queries |
| Scenario planner | "What if" chat | Breaks a question into scenario runs | Scenarios (18), budgets (17) |
| Weekly briefing | Schedule | Weekly summary and upcoming risks | Read-only tools |
| Verifier | Before every output | Blocks numbers not present in the tool ledger | Deterministic checker (code, not an LLM) |

### Autonomy levels

| Level | Agent may | Example |
| --- | --- | --- |
| L0 Inform | Report | "Lowest projected balance before payday: $142" |
| L1 Propose | Suggest an action | "Create a $300 dining budget?" |
| L2 Act with approval | Execute after `interrupt()` and user approval | Creates the approved budget |
| L3 Act within policy | Auto-act inside user-set rules; logged and reversible | Auto-dismiss a duplicate alert the user has dismissed three times |

Hard boundary: no money movement, payments, cancellations with providers, or changes to
external accounts at any level. Agent "actions" only change MintSage's own records.

### Step 24 — Agent tool layer

- [ ] Wrap each engine (forecast, runway, recurring, budgets, scenarios, flags, history
  queries) as a typed tool with Pydantic input/output schemas.
- [ ] Inject `user_id` from the verified session into every tool; never accept it as an
  LLM-generated argument.
- [ ] Return every figure with a ledger ID, source records, and assumptions.
- [ ] Give each agent least-privilege access: read-only tools by default; write tools only
  for agents that propose L2 actions.
- [ ] Unit-test every tool independently of the LLM.

### Step 25 — Graph core and state

- [ ] Define the graph state: trigger, user context, messages, tool-result ledger, draft,
  verification result, pending actions, and autonomy level.
- [ ] Persist state with the LangGraph Postgres checkpointer on the existing Supabase
  Postgres instance; do not use the SQLite checkpointer in deployment.
- [ ] Apply node timeouts and a maximum step count per run.
- [ ] Verify that a run killed mid-way resumes correctly from its checkpoint.

### Step 26 — Verifier and self-correction loop

- [ ] Extract every number from a draft and match it against the run's tool ledger,
  with explicit rules for rounding, currency formatting, and dates.
- [ ] On failure, route back to the writer with the unmatched figures; after a fixed
  retry limit, return a refusal instead of an unverified answer.
- [ ] Label each statement as observed fact, forecast, or user hypothetical.
- [ ] Unit-test the verifier against seeded drafts containing invented numbers.

### Step 27 — Supervisor and specialist agents

- [ ] Implement the supervisor and the cash-flow analyst first, then the recurring-charges
  agent, anomaly investigator, and scenario planner as LangGraph subgraphs.
- [ ] Each specialist runs a tool loop (reason → call tool → observe → decide).
- [ ] Add the data-reconciliation agent after step 4 marks ambiguous transactions.
- [ ] Measure whether multiple specialists outperform a single agent with all tools on
  the evaluation suite; keep the simpler design if they do not.

### Step 28 — Proactive triggers and agent inbox

- [ ] Start agent runs from sync events (step 4), cash-floor threshold events (step 15),
  step 20 flags, and a weekly schedule.
- [ ] Use Plaid Sandbox to simulate transaction webhooks during development; confirm the
  current sandbox webhook behavior during implementation.
- [ ] Build the agent inbox UI: findings, proposals, approval requests, and dismiss/confirm controls.
- [ ] Deduplicate findings so repeated syncs do not produce repeated alerts.

### Step 29 — Human-in-the-loop approvals and autonomy policy

- [ ] Pause runs with `interrupt()` before any L2 action and resume on the user's decision.
- [ ] Wire approval requests between the inbox (Next.js) and the agent service.
- [ ] Add user-configurable L3 policies, all off by default; log and allow reversal of every
  automatic action.
- [ ] Test that no write tool executes without an approval or an enabled policy.

### Step 30 — Agent memory

- [ ] Store user-confirmed facts (for example, "this recurring payment is a rent split")
  in the LangGraph store, scoped per user.
- [ ] Record past findings and the user's decisions as episodic memory; use them to
  suppress alerts the user repeatedly dismisses.
- [ ] Let users view and delete stored agent memory.
- [ ] Never store Plaid tokens, account numbers, or raw credentials in agent memory.

### Step 31 — Onboarding and weekly-briefing agents

- [ ] Onboarding agent collects paydays, cash floor, recurring bills, budgets, and goals
  conversationally; every value requires explicit confirmation. Keep forms as a fallback.
- [ ] Weekly-briefing agent summarizes the week and upcoming risks using read-only tools,
  passing through the verifier like every other output.

### Step 32 — Agent security

- [ ] Treat merchant names and transaction descriptions as untrusted data; separate them
  from instructions in prompts.
- [ ] Build an adversarial test set of instruction-like merchant strings and measure
  injection success rate.
- [ ] Enforce authorization inside tools, not only at API routes.
- [ ] Send Gemini only the fields each agent needs; document them in the agent card.
- [ ] Authenticate service-to-service calls between Next.js and the agent service.

### Step 33 — Agent evaluation suite and KPIs

- [ ] Build seeded synthetic personas with known ground truth (paydays, subscriptions,
  price changes, anomalies, ambiguous transfers, cash-floor crossings).
- [ ] Create a scripted scenario suite of user questions and events with expected
  tool calls and expected figures computed by the engines.
- [ ] Report the technical and business KPIs listed below, with the number of scenarios
  and the model and version used.
- [ ] Label all business metrics as simulated; make no real-user claims.

### Step 34 — Trace viewer and demo packaging

- [ ] Show per-run traces in the UI: agents invoked, tools called, verifier result, approvals.
- [ ] Add tracing with LangSmith or Langfuse (choose during implementation).
- [ ] Prepare the demo script, a 2–3 minute video, and a README section stating v1
  (jointly built) versus v2 (agent system) contributions.

## KPIs

Technical:

- Task success rate on the scenario suite.
- Numeric faithfulness: share of figures in outputs traced to the tool ledger (target 100%).
- Verifier catch rate and self-correction success rate.
- Routing accuracy of the supervisor on labeled scenarios.
- Tool-selection accuracy and tool calls per task.
- Injection success rate on adversarial merchant strings (target 0%).
- Unapproved write attempts (target 0).
- Checkpoint resume success after forced interruption.
- Latency (p50/p95) and cost per run.
- Forecast MASE against seasonal-naive (from step 10).

Business (simulated on synthetic personas):

- Cash-floor crossings caught early, measured in days of warning.
- Recurring-charge changes surfaced per persona against ground truth.
- Proactive precision: share of findings acted on rather than dismissed.
- Noise reduction from memory: change in dismissal rate after preferences are learned.
- Reconciliation accuracy on ambiguous transactions.
- Autonomy distribution: share of runs ending at L0, L1, L2, and L3.
- Time-to-answer compared with manual dashboard lookup.

## Supporting work and priorities

- Add a benchmark script reporting hardware and fit/predict latency; cache loaded
  models with explicit invalidation once serving behavior is established.
- Do not add Spark or similar infrastructure merely for scale claims. Document actual
  per-user data sizes and measured constraints first.
- Do not add agents for appearance. Each agent must own a workflow and be justified by
  the evaluation in step 27.

## Plaid capability references

Confirm product access, account coverage, and current API behavior during implementation:

- [Transactions and recurring-transaction support](https://plaid.com/docs/transactions/)
- [Transaction fields and API contracts](https://plaid.com/docs/api/products/transactions/)
- [Account balances](https://plaid.com/docs/balance/)
- [Liabilities](https://plaid.com/docs/liabilities/)

## Original tiered proposal — traceability

The stepwise plan reorganizes the original proposal without dropping its requirements.
The original effort labels were rough estimates, not delivery commitments.

| Original item | Planned work | Consolidated steps |
| --- | --- | --- |
| Tier 1.1 | Keep Plaid access tokens server-side | 1 |
| Tier 1.2 | Server-only secrets and `.env.example` | 2 |
| Tier 1.3 | Session authorization on every API route | 2 |
| Tier 1.4 | Register proxy and correct connection lookup | 3 |
| Tier 1.5 | Correct claims and disclose LLM data sharing | 7 |
| Tier 1.6 | Remove broken chat, dead components, and unused packages | 0, 5 |
| Tier 1.7 | Correct history length and date handling | 4 |
| Tier 1.8 | Resolve vulnerable dependencies and pin Python with CPU option | 6 |
| Tier 1.9 | README with architecture, setup, environment, and status | 13 |
| Tier 2.1 | In-repository forecasting package and matching service contract | 8 |
| Tier 2.2 | Pure TS analytics, Vitest, and shared transaction type | 0, 5, 9 |
| Tier 2.3 | Pytest, no-leakage checks, shape/contract tests, fixed seeds | 9, 10 |
| Tier 2.4 | Zod input validation, lint fixes, removal of `any` | 9 |
| Tier 2.5 | CI and pre-commit hooks | 12 |
| Tier 2.6 | YAML training configuration, logging, train/eval commands | 10 |
| Tier 2.7 | Remove deployment ZIPs and ignore generated artifacts | 0, 13 |
| Tier 3.1 | Walk-forward comparison of five forecast methods | 10 |
| Tier 3.2 | Block-bootstrap confidence intervals and Diebold–Mariano test | 11 |
| Tier 3.3 | Prediction intervals, coverage/calibration, budget-exceedance risk | 18 |
| Tier 3.4 | Model card | 13 |
| Tier 3.5 | Measured fit/predict latency and loaded-model caching | Supporting work |
| Tier 3.6 | Explain actual scale; avoid unnecessary distributed infrastructure | Supporting work |
| Step 21 (2026-11-15 plan) | Grounded LLM assistant | 24–34 |

The original minimum recommendation was all of Tier 1, Tier 2 items 2.1, 2.3,
2.5, then 2.2, and Tier 3 items 3.1, 3.2, and 3.4. The full roadmap retains
additional engineering work, the personal-finance scope, and the agent system.

## Delivery phases

1. **Repository cleanup:** step 0, completed.
2. **Foundation:** steps 1–7. Tokens stay server-side, routes check identity, dates and
   financial records are consistent, dependencies are pinned, and claims are honest.
3. **Tools:** steps 8, 15, 16, 18, and 24. Engines are tested and exposed as typed tools.
4. **Agent core:** steps 25–27 (supervisor, cash-flow analyst, verifier first).
5. **Proactive layer:** steps 20, 28, and the recurring-charges and anomaly agents.
6. **Autonomy and memory:** steps 29–30.
7. **Onboarding and briefing:** steps 17, 19, and 31.
8. **Proof:** steps 9–14 and 32–34, with tests and evaluation added alongside each
   earlier phase rather than only at the end.
9. **Later scope:** steps 22–23.

### Demo cut (agentic AI co-op demo)

Include:

- Steps 1–4 (core) and 6–7.
- Step 8 with the seasonal-naive baseline only; steps 10–11 deferred.
- Steps 15, 16 (user-confirmed schedules), and 18 (basic scenarios, no probabilities).
- Steps 24–27 with the supervisor, cash-flow analyst, recurring-charges agent, and
  anomaly investigator.
- Step 28, using simulated Plaid Sandbox events.
- Step 29 for L2 approvals only.
- Steps 32–34, with an evaluation suite of at least 30 scenarios.

Defer: onboarding and weekly-briefing agents, L3 policies, agent memory, budgets and
goals beyond what scenarios require, statistical forecast comparisons, debt, and net worth.

## Decisions and boundaries to preserve

Confirmed:

- Use Plaid categories and subcategories; a custom category-prediction model was discussed
  and rejected. Vendor-based grouping or user-confirmed overrides remain optional.
- Retain Gemini as the LLM integration unless a separate change is agreed.
- Build the agent system with LangGraph.
- Runway needs cash balances and expected income as well as spending history; account
  credit limits must not be treated as cash available to fund living expenses.
- Keep actual transactions, scheduled commitments, forecasts, and hypothetical scenarios
  distinguishable, and reconcile them to prevent double counting.
- Recurring transaction and liability integrations depend on product access and account
  coverage. Confirm these during implementation and support explicit manual inputs.
- A public evaluation dataset is optional and has not been selected. Document synthetic
  generator parameters and make no real-user performance claim from synthetic results.
- New feature completion requires appropriate checks and updated documentation, not just
  an interface or a successful compilation.
- Do not rewrite Git history or force-push as part of ordinary cleanup. That remains a
  separate action requiring explicit approval.

Agent-system boundaries:

- Agents never compute financial figures; they call tested tools.
- No output reaches the user without passing the verifier.
- No agent moves money or changes external accounts at any autonomy level.
- Write actions require approval (L2) or an explicit user-enabled policy (L3).
- `user_id` always comes from the verified session, never from model output.

Proposed, pending confirmation:

- FastAPI as the host for the future agent graph. The forecast endpoint uses FastAPI.
- LangSmith or Langfuse for tracing.
