# MintSage implementation roadmap

Updated: 2026-11-12

This combines the original engineering upgrade plan with the agreed personal-finance
direction. Step 0 is complete in the working tree; all other steps remain planned.
This document records scope and sequence, not a claim that the features already work.

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

- [ ] Create a typed Python forecasting package with fit/predict interfaces and a serving endpoint.
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
- [ ] Add configuration files, fixed seeds, structured logs, and `make train` / `make eval` commands.
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
- [ ] Add a model card covering provenance, assumptions, evaluation, and failure modes.
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
