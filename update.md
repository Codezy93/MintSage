# MintSage — consolidated update and implementation plan

Updated: 2026-11-15

This file consolidates all planning from the original discovery audit, engineering
upgrade plan, repository cleanup, product clarification, and personal-finance expansion.
It preserves steps 0–23 and includes a mapping back to the original tiered proposal.

Step 0 is complete in the working tree. Some cleanup items from later steps were also
completed during step 0 and are checked below; the remaining work is planned.
Saving this plan does not implement or deploy the remaining features. Verification
results below were recorded during the November 12 cleanup, not rerun on November 15.

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
  Dashboard chat remains part of the product.

## Product definition

MintSage retrieves financial data from Plaid, uses Plaid's categories and subcategories,
forecasts spending, analyzes cash runway, and explains the results through an LLM.

- Preserve Plaid's primary and detailed categories. Building a custom categorization
  model is outside the current scope.
- Merchant/vendor identifiers can support grouping and optional user overrides.
  Check identifier availability and stability; do not assume every transaction has one.
  Preserve original Plaid classifications alongside any overrides.
- Compute financial figures and scenarios in tested application code. The LLM explains
  those results and references supporting records; it does not invent calculations.
- Distinguish spending, income, transfers, debt payments, and account cash movements.
- Label forecasts and spending allowances as estimates with assumptions, freshness,
  and uncertainty visible to the user.

## Original engineering plan

The original step numbers are retained so earlier discussions remain traceable.

### Step 0 — Organize files and remove dead code

Status: complete in the working tree; not committed by this task.

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

- [ ] Exchange and persist access tokens entirely on the server.
- [ ] Remove token values from browser responses and client-side writes.
- [ ] Add a migration explicitly enabling RLS and restricting database permissions.
- [ ] Prevent authenticated browser clients from reading or writing the token table;
  use narrowly scoped server-only access for token operations.
- [ ] Verify anonymous, cross-user, and direct browser database access are denied.

### Step 2 — Protect API routes and secrets

- [ ] Require verified sessions on all API routes; derive identity from the session.
- [ ] Remove `NEXT_PUBLIC_` from private secrets and enforce server-only imports.
- [ ] Add `.env.example` with placeholders and document each variable's purpose.
- [ ] Verify unauthorized requests do not invoke paid downstream services.

### Step 3 — Repair session handling

- [ ] Move `app/proxy.ts` into `app/src/` and verify framework registration.
- [ ] Replace the nonexistent `users.plaid_token` lookup with a safe connection-status check.
- [ ] Verify login redirects, session refresh, logout, and API authorization behavior.

### Step 4 — Correct the financial data pipeline

- [ ] Fetch sufficient history for the forecast window and every displayed summary.
- [ ] Preserve account IDs, transaction IDs, dates, pending status, merchant identifiers,
  and Plaid primary/detailed categories in shared types and storage.
- [ ] Handle transaction additions, modifications, removals, and pending-to-posted changes
  without duplicating records; use incremental synchronization where appropriate.
- [ ] Use consistent date-only handling and explicit currency/account boundaries.
- [ ] Define spending versus cash-flow rules, including refunds, internal transfers,
  credit-card purchases, and repayments. Do not count purchases and repayments twice.
- [ ] Distinguish missing history, stale data, and fetch failures from real zero spending.
- [ ] Verify pagination, date boundaries, duplicates, transfers, and category preservation.

### Step 5 — Complete code and type cleanup

- [x] Remove the orphaned chat route, unused dashboard components, and unused dependencies.
- [x] Consolidate duplicate transaction types.
- [ ] Check the expanded data pipeline for obsolete types, links, and imports.

Most original step 5 work was completed in step 0; do not repeat completed deletions.

### Step 6 — Update and pin dependencies

- [ ] Upgrade vulnerable packages and verify compatibility; record remaining audit findings.
- [ ] Pin Python dependencies and provide a CPU installation option.
- [ ] Verify clean installation, TypeScript, and production build.

### Step 7 — Correct claims and explain data sharing

- [ ] Remove unsupported security, encryption, and user-count claims.
- [ ] Explain which financial information is sent to Gemini and when it is sent.
- [ ] Label experimental forecasts and avoid unsupported accuracy claims.

### Step 8 — Implement the forecast service in the repository

- [ ] Create a typed `forecasting/` Python package with fit/predict interfaces and a
  serving endpoint. Choose FastAPI or a Lambda handler during implementation.
- [ ] Define and validate the existing 60-day input / 30-day output contract, including
  dates, currency, data sufficiency, and error responses.
- [ ] Start with reproducible baselines; connect Next.js to the in-repository service.
- [ ] Handle timeouts and unavailable forecasts explicitly.
- [ ] Keep the historical experiments distinguishable from the serving implementation.

### Step 9 — Validate inputs and add focused tests

- [ ] Extract aggregation and EDA into pure TypeScript modules.
- [ ] Add Zod validation for API requests and downstream responses.
- [ ] Add Vitest tests for dates, financial aggregation, authorization, and service failures.
- [ ] Add pytest tests for windowing, leakage prevention, shapes, and service contracts.
- [ ] Replace remaining `any` types and fix lint errors.

### Step 10 — Build reproducible forecasting evaluation

- [ ] Add documented, seeded synthetic data with weekly patterns, paydays, and heavy-tailed purchases.
- [ ] Compare naive, weekly seasonal-naive, rolling mean, ARIMA, and LSTM forecasts.
- [ ] Use expanding-window, walk-forward evaluation with training-only preprocessing
  and model selection separated from the final evaluation period.
- [ ] Report MAE, RMSE, and MASE, handling zero denominators explicitly; explain why
  MAPE is unsuitable for zero-spending days.
- [ ] Add YAML configuration files, fixed seeds, structured logs, and `make train` / `make eval` commands.
- [ ] Publish reproducible results as synthetic-data results. The 45 sample transactions
  cannot establish predictive performance; a public dataset is an optional later choice.

### Step 11 — Quantify uncertainty in model comparisons

- [ ] Add block-bootstrap confidence intervals for loss differences against the naive baseline.
- [ ] Add a Diebold–Mariano comparison with assumptions and sample-size limitations documented.
- [ ] Account for serial dependence and overlapping forecast horizons.
- [ ] Report negative or inconclusive results without implying a model beats the baseline.

### Step 12 — Automate verification

- [ ] Add GitHub Actions for lint, TypeScript, Vitest, ruff, mypy, and pytest.
- [ ] Add pre-commit hooks; ensure ordinary checks require no production credentials.

### Step 13 — Complete documentation and artifact hygiene

- [ ] Expand the README with architecture, setup, environment variables, commands, and honest status.
- [ ] Add `docs/model_card.md` covering provenance, assumptions, evaluation, and failure modes.
- [x] Remove deployment archives from the current tree and ignore generated bundles.
- [x] Credit generated Next.js scaffolding and shadcn/ui components.
- [ ] Document deployment and database migration procedures once implemented.

Git history rewriting or force-pushing requires separate explicit approval.

### Step 14 — Verify the engineering foundation

- [ ] Reproduce installation and checks from a fresh checkout.
- [ ] Exercise signup, linking, dashboard, forecasting, and analysis with configured services.
- [ ] Verify tokens never reach the browser and authorization boundaries hold.
- [ ] Record checks requiring external credentials separately from checks actually performed.

## Personal-finance expansion

Build these on the secured data pipeline and tested forecast contract. Step 15 is a
core part of the original product idea; subsequent steps add user-facing capabilities.
Repeat the relevant acceptance checks after each feature, rather than waiting until
the entire expansion is finished.

### Step 15 — Cash-flow and runway engine

- [ ] Retrieve suitable account balances with timestamps; allow manual inputs for missing data.
- [ ] Keep available cash distinct from credit limits, investment value, and total net worth.
- [ ] Project daily balances from opening cash, expected inflows, and outflows.
- [ ] Define runway as time until a user-selected cash floor is crossed; support both
  expected-income and no-new-income scenarios.
- [ ] Report when the floor is not crossed within the modeled horizon, rather than
  claiming unlimited runway. Show missing-data and uncertainty limitations.
- [ ] Test account transfers and credit-card settlement timing without double counting.

### Step 16 — Bills, paydays, and subscriptions

- [ ] Evaluate access to Plaid Recurring Transactions; support user-confirmed schedules
  when the add-on or adequate history is unavailable.
- [ ] Show expected bills, income, and projected daily balances on a calendar.
- [ ] Group recurring merchants and show monthly commitments and possible price changes.
- [ ] Let users confirm subscriptions, timing, cancellations, and irregular income.
- [ ] Reconcile scheduled payments with observed transactions and forecast components
  so the same expense is not included twice.

### Step 17 — Budgets and estimated spending allowance

- [ ] Add user-defined budgets using Plaid categories and subcategories.
- [ ] Show actual spending, projected month-end totals, and early overspending alerts.
- [ ] Estimate discretionary spending before payday after obligations, savings
  commitments, and a chosen cash buffer, using one consistent cash-flow calculation.
- [ ] Show assumptions, source freshness, and uncertainty; avoid guarantees of affordability.

### Step 18 — What-if scenarios and forecast risk

- [ ] Support hypothetical purchases, income delays, rent changes, and spending reductions.
- [ ] Recompute projected balances, lowest balance, budget outcomes, and runway.
- [ ] Add prediction intervals and evaluate empirical coverage and calibration.
- [ ] Estimate budget-exceedance and cash-floor-crossing probabilities only when the
  underlying uncertainty method has been evaluated; explain synthetic-data limitations.
- [ ] Keep scenario edits separate from actual financial records.

### Step 19 — Savings goals

- [ ] Add goals with target amounts, dates, starting funds, and planned contributions.
- [ ] Estimate progress and completion dates under explicit scenarios.
- [ ] Integrate contributions into the cash-flow engine without treating transfers
  between owned accounts as new spending or new wealth.

### Step 20 — Unusual spending and change alerts

- [ ] Flag unusual amounts, possible duplicates, and recurring billing changes for review.
- [ ] Explain the evidence behind each flag; do not label an anomaly as confirmed fraud.
- [ ] Add dismiss/confirm controls and notification preferences to limit repeated noise.

### Step 21 — Extend the grounded LLM assistant

- [ ] Expose tested spending, budget, runway, goal, and scenario functions to the assistant.
- [ ] Answer questions such as “Why did spending increase?” and “How would this purchase
  affect my balance before payday?” with calculated results and supporting records.
- [ ] Show assumptions and distinguish observed facts from forecasts and user hypotheticals.
- [ ] Minimize shared data, enforce account authorization, and test misleading or
  instruction-like text in transaction descriptions.

### Step 22 — Debt dashboard (later)

- [ ] Evaluate Plaid Liabilities access and supported accounts; support manual entries.
- [ ] Track balances, rates, payment dates, and minimum payments where available.
- [ ] Compare repayment scenarios with explicit rate, fee, and payment assumptions.
- [ ] Incorporate debt payments into cash-flow projections consistently.

### Step 23 — Net-worth history (later)

- [ ] Track supported asset and liability balances, including user-entered items.
- [ ] Show historical snapshots, missing accounts, valuation dates, and currency assumptions.
- [ ] Keep liquid runway separate from net worth.

## Supporting work and priorities

- Add a benchmark script reporting hardware and fit/predict latency; cache loaded
  models with explicit invalidation once serving behavior is established.
- Do not add Spark or similar infrastructure merely for scale claims. Document actual
  per-user data sizes and measured constraints first.
- Prioritize steps 1–14 for a secure, reproducible foundation, then 15–18 for the main
  personal-finance release. Extend the LLM alongside each new tested capability.
- Savings goals and unusual-spending alerts follow; debt and net-worth features are later scope.

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

The original minimum recommendation was all of Tier 1, Tier 2 items 2.1, 2.3,
2.5, then 2.2, and Tier 3 items 3.1, 3.2, and 3.4. The full roadmap retains
additional engineering work and the subsequently discussed personal-finance scope.

## Delivery checkpoints

1. **Repository cleanup:** step 0, completed. Preserve existing experiments without
   presenting them as a production forecast service or an accuracy test suite.
2. **Security and data correctness:** steps 1–7. Tokens stay server-side, routes check
   identity, dates and financial records are consistent, and product claims are honest.
3. **Reproducible forecasting foundation:** steps 8–14. Serving code, meaningful tests,
   baselines, evaluation, CI, model documentation, and integration checks are available.
4. **Core personal-finance release:** steps 15–18, with relevant parts of step 21.
   Users can inspect runway, upcoming bills, budgets, and hypothetical changes.
5. **Additional planning features:** steps 19–20 and completion of step 21. Add savings
   goals, reviewable alerts, and explanations grounded in all implemented calculations.
6. **Later scope:** steps 22–23. Add debt and net-worth views when their data requirements
   and service access are established.

## Decisions and boundaries to preserve

- Use Plaid categories and subcategories; a custom category-prediction model was discussed
  and rejected. Vendor-based grouping or user-confirmed overrides remain optional.
- Retain Gemini as the current LLM integration unless a separate change is agreed.
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

Next implementation step: **Step 1 — Secure Plaid token storage**.
