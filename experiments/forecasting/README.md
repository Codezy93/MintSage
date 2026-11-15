# Offline forecasting experiments

These are the original exploratory scripts, grouped together for clarity.
They are not the forecast service used by the web app and do not implement
its 60-day input / 30-day output contract.

| Path | Purpose | Former location |
| --- | --- | --- |
| `lstm.py` | Six-input, six-output LSTM training and export helpers | `train/forecast6.py` |
| `arima.py` | ARIMA experiment with a 15-step forecast and plotting demo | `train/forecast15.py` |
| `examples/predict_lstm.py` | Saved-model prediction and plotting demo; no test assertions | `test/forecast6.py` |
| `models/` | Existing state dictionary and TorchScript exports | `models/` |
| `data/transactions.csv` | Original 45-row sample; not loaded by the scripts or app | `data/transactions.csv` |
| `requirements.txt` | Original, unpinned Python dependencies | `lib/requirements.txt` |

From the repository root, in a Python environment with the required packages:

```sh
python experiments/forecasting/arima.py
python experiments/forecasting/examples/predict_lstm.py
```

The prediction example locates its saved model relative to its own file,
so it can also be run from another working directory. Both examples display
plots; use `MPLBACKEND=Agg` when running without a display.

`lstm.py` exposes `train_lstm_6to6` and `save_for_production`; it has no training
CLI. Pass explicit output paths to the export helper to choose where new
models are written. Its default export paths remain relative to the current
working directory.

Known limitations are retained for subsequent forecasting work: overlapping
windows use a random validation split, inputs are not normalized, training
is not seeded, and saved-model training provenance is undocumented. These
artifacts are not evidence of forecasting accuracy. Dependency pinning and
a CPU installation option are also pending. New model exports and deployment
archives are ignored; the two existing model artifacts remain tracked.
