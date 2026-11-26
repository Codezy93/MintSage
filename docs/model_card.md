# Spending forecast model card

**Intended use.** Show an experimental 30-day USD net-spending estimate for
linked accounts. The serving baseline repeats the most recent seven daily
amounts. It fits each request independently and stores no learned weights.
The historical TorchScript exports have undocumented training provenance and
are separate from the deployed calculation.

**Inputs.** The dashboard uses posted USD purchases and signed refunds, with
account history and freshness checks before filling observed zero days. Transfers,
pending transactions, income, and loan repayments are excluded. The service
requires 60 consecutive UTC dates and 60 finite values. It relies on the caller
for coverage and currency provenance. Its output is a dated point estimate.

**Evaluation.** The evaluation uses 420 generated days, seed 1701, expanding
training windows and four disjoint final windows. The serving baseline recorded
MAE $15.65, RMSE $23.51 and MASE 1.039. ARIMA had the lowest validation MAE
and final MAE $10.25. Four holdout origins provide insufficient evidence for a
reliable ranking. The 45-row historical sample was excluded. See the [generator,
scores, uncertainty estimates and reproduction commands](../forecasting/README.md).

**Failure modes.** A refund, one-off purchase, payday shift or missing account in
the last week can distort all 30 projections. Stale or short history can suppress
the forecast entirely. Synthetic performance has unknown applicability to real
users. The intervals in the evaluation describe differences in average model
loss. The dashboard has no calibrated interval for an individual user's spending.
