# Financial planning

Open **Financial plan** from the dashboard or bank-link screen. After signing in, a user can enter accounts and schedules manually. Apply the finance-planning migration before deploying the dashboard or relinking an account. It adds private settings, daily inventories, an event queue and transaction-history freshness fields. Existing connections need a successful dashboard sync to establish history coverage.

## Inputs and assumptions

- The planner uses available USD depository balances for cash, and current asset and liability balances for known net worth. A missing available balance makes runway unknown. Foreign balances appear in the inventory and are excluded from USD totals. Manual overrides take precedence until removed. If Plaid omits the institution timestamp, the planner labels the fallback date. Balance retrieval uses the cached accounts endpoint. [Plaid balance documentation](https://plaid.com/docs/balance/)
- Confirm expected income, bills and subscriptions in the schedule editor. One-time entries support irregular income. Disable a schedule to model cancellation. Set `PLAID_RECURRING_ENABLED=true` for connections with access to the Recurring Transactions add-on to receive suggestions. A suggestion affects projections after confirmation. [Plaid Transactions](https://plaid.com/docs/api/products/transactions/)
- To request supported card, student loan and mortgage terms, configure Liabilities access for the Item and set `PLAID_LIABILITIES_ENABLED=true`. Terms can also be entered manually. The repayment comparison uses a fixed APR, monthly compounding and a fixed monthly fee, with no new borrowing. Missing terms can prevent a payoff estimate. [Plaid Liabilities](https://plaid.com/docs/liabilities/)
- The calendar projects 60 days in UTC. Confirmed bills match posted charges by account, merchant and date within three days. Internal transfers are excluded. Credit purchases count toward category budgets, and scheduled debt payments draw down cash. Existing savings and monthly contributions reserve cash for a goal. Goal completion assumes the entered contributions continue.
- The additional spending allowance uses the lowest projected balance before the next confirmed payday, after the floor and reserves. Experimental scenarios apply to that same cash-flow calculation and leave settings and observations intact.
- Opening or refreshing the planner stores one inventory per user per UTC day and queues distinct threshold and spending events. History includes observed days only. Reopening the same day refreshes its snapshot. The investigator sends dates, amounts and signal types to Gemini when the user requests review. Users can confirm or dismiss reviewed findings and turn off new spending alerts.

## Local evaluation

The evaluation uses 160 seeded synthetic ledgers with eight weeks of history and 60 held-out days. Each forecast draws 200 paths by resampling complete weeks. The nominal central 80% day-30 interval covered **60%** of held-out balances. The intervals underestimate uncertainty in this experiment.

| Outcome | Mean predicted probability | Observed frequency | Brier score |
| --- | ---: | ---: | ---: |
| Cross cash floor within 60 days | 80.4% | 84.4% | 0.198 |
| Exceed current month’s budget | 69.5% | 70.6% | 0.213 |

These measurements apply to the fixture generator. Real-account calibration, shifts in spending and missed future income remain unmeasured. Probabilities require current, sufficiently long linked history. Manual-only projections show confirmed items.

From `app/`, run `REPORT_CALIBRATION=1 ./node_modules/.bin/vitest run tests/planning.test.ts --reporter=verbose` to reproduce the metrics. Run `npm test` for the planning, provider, authorization and embedded PostgreSQL checks.
