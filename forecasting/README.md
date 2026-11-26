# Synthetic spending evaluation

The published run uses 420 synthetic USD daily totals and seed 1701. The generator
starts at $12 per day, adds $8 on weekends and $16 on each fortnightly payday,
then adds gamma-distributed routine spending. Eight percent of days receive a
Pareto-tailed purchase. An independent 12% of days have zero spending.

From the repository root, install the evaluation requirements in a CPU environment.

```sh
python -m pip install -r forecasting/requirements-eval.txt
python -m pytest forecasting/tests
make train
make eval
```

Set `PYTHON=/path/to/python` when invoking Make to select a virtual environment.
[evaluation.yaml](evaluation.yaml) fixes the seed, horizon, fold boundaries and
model settings. Training fits all five candidates on expanding prefixes starting
at 180 days. The next four disjoint 30-day windows select a model by mean absolute
error. Evaluation refits at days 300, 330, 360 and 390, using only observations
available at each origin. It reports all five candidates with the validation
selection fixed. LSTM normalization and 14-day input windows use only the training
prefix. Its 30 predictions are recursive. ARIMA uses order (1,0,1). The rolling
baseline repeats the preceding 14-day mean.

## Held-out results

| Model | Validation MAE ($) | Final MAE ($) | Final RMSE ($) | Final MASE |
| --- | ---: | ---: | ---: | ---: |
| Last value | 12.61 | 17.29 | 24.22 | 1.148 |
| Weekly seasonal naive | 11.07 | 15.65 | 23.51 | 1.039 |
| Rolling mean | 9.20 | 11.71 | 16.86 | 0.774 |
| ARIMA | 9.00 | 10.25 | 15.97 | 0.678 |
| LSTM | 10.30 | 10.70 | 16.17 | 0.708 |

ARIMA had the lowest validation MAE. The dashboard serves the weekly baseline.
This single synthetic series provides no estimate of accuracy for linked accounts.

MAE and RMSE aggregate the 120 daily errors across final folds. MASE divides
each fold’s MAE by the mean absolute seven-day difference in its training prefix,
then averages defined folds. A zero denominator yields a null fold score. Results
include the count of defined folds. MAPE would divide by zero on zero-spending days.

Each fit emits a JSON log line with its origin and scores. Training writes the
selection and validation metrics to `build/forecasting/selection.json`. Evaluation
writes the full comparison to `build/forecasting/results.json`. Repeated CPU runs
produced byte-identical results in the tested environment.

## Uncertainty on the four final forecast origins

Each comparison pairs the candidate and last-value baseline on the same 30
target days and subtracts their per-origin MAEs. Negative values indicate
lower observed loss. Values below are USD per forecast day.

| Candidate | Mean difference | Nominal 95% block-bootstrap interval | DM statistic | Two-sided asymptotic p |
| --- | ---: | ---: | ---: | ---: |
| Weekly seasonal naive | −1.64 | [−2.34, −0.94] | −3.46 | 0.00055 |
| Rolling mean | −5.58 | [−11.36, 0.20] | −1.77 | 0.077 |
| ARIMA | −7.04 | [−14.28, 0.19] | −1.73 | 0.084 |
| LSTM | −6.59 | [−13.04, −0.14] | −1.82 | 0.069 |

The evaluation advances 30 days per origin, so final target windows do not
overlap. Keeping each entire forecast together preserves within-horizon
dependence. For 10,000 seeded circular bootstrap draws, adjacent pairs of
origins are resampled together. The percentile endpoints reflect only the four
observed origins. The comparison code increases the minimum block to the number
of origins a horizon spans when the stride is shorter. It suppresses inference
when fewer than two blocks fit.

The Diebold–Mariano statistic divides the mean paired loss difference by its
estimated standard error using Bartlett-weighted autocovariances through lag
one (block length minus one). Its normal reference distribution assumes a
weakly stationary, weakly dependent loss differential with positive long-run
variance and enough forecast origins. A degenerate variance gives no statistic
or p-value. See [Diebold and Mariano](https://doi.org/10.1080/07350015.1995.10524599).

Four origins give little information about dependence or tail probabilities.
The rolling and ARIMA intervals include zero. The LSTM interval and asymptotic
test disagree at the 5% level. Even the small weekly p-value is unreliable at
this sample size. These four exploratory, unadjusted comparisons do not
establish superiority on future spending.
