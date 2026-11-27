# Dashboard assistant and forecast tool

| Component | Trigger and data | Current capability |
| --- | --- | --- |
| Dashboard assistant | After a successful dashboard forecast, then on each submitted question. Gemini receives the question, income, spending, net totals, average daily net, volatility and trend, statistics for up to five categories, and forecast mean and trend when available. | Explains calculated summaries and suggests actions. No write tools. |
| Forecast tool | A trusted caller binds a verified user UUID and a history loader before giving the tool to a model. It takes no model-generated arguments. | Returns the deterministic forecast, ledger ID, source references and assumption. Its own computation makes no Gemini call. |
| Planning tools and chat | The trusted caller binds the verified owner. The planner computes spending, budgets, runway, goals, subscriptions and hypothetical outcomes. | The two supported spending-change and pre-payday purchase questions return calculated evidence directly. Tool calls are read-only. |
| Anomaly investigator | On requested review, Gemini receives candidate indices, flag types, dates and amounts. | Selects candidates for human review. The planner displays the underlying computed evidence. |
| Agent inbox | Sync, weekly, threshold and user-requested reviews. Gemini selects from evidence-linked claims. | Verified findings, approved budgets, reversible duplicate dismissal and user-scoped memory. See the [workflow guide](agent-workflows.md). |

The HTTP service checks a shared credential and user UUID. The history loader
must scope database reads to that user. Raw tokens and bank accounts have no
place in a model prompt. Users can include personal data in their own questions.

The current assistant operates at the inform/suggest level. It cannot transfer
money, modify external accounts, or execute proposed budgets. Gemini can
misinterpret a category, follow misleading text, or produce unsupported numbers.
Deterministic verification of assistant prose is pending.

**Evaluation.** Two synthetic identities receive different fixture spending
histories. CI runs a mocked model call, checks the tool name and empty arguments,
then verifies all 30 values and the source and ledger fields. A separate test
confirms that a caller-supplied identity cannot change the user passed to storage. These checks exercise
the implemented tool path. Routing accuracy, numeric faithfulness of generated
prose, and multi-agent task success remain unmeasured. The manual live workflow
uses a selected Gemini model on synthetic inputs and incurs provider cost.
