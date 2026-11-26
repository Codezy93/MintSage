"""CPU-only expanding-window comparison on synthetic daily USD spending."""
import argparse
import json
from pathlib import Path

import numpy as np
import torch
import yaml
from statsmodels.tsa.arima.model import ARIMA
from torch import nn

from .baselines import Baseline

MODELS = ("naive", "weekly", "rolling", "arima", "lstm")


def synthetic(days, seed):
    rng = np.random.default_rng(seed)
    day = np.arange(days)
    usual = 12 + 8 * (day % 7 >= 5) + 16 * (day % 14 == 0)
    spending = usual + rng.gamma(2, 3, days)
    spending += (rng.random(days) < 0.08) * 20 * (1 + rng.pareto(2.5, days))
    spending[rng.random(days) < 0.12] = 0
    return np.round(spending, 2)


def folds(series, config):
    horizon = config["horizon"]
    for origin in range(config["initial_train"], len(series) - horizon + 1, horizon):
        yield series[:origin], series[origin:origin + horizon]


def windows(train, width):
    pairs = np.lib.stride_tricks.sliding_window_view(train, width + 1).copy()
    return pairs[:, :-1], pairs[:, -1]


class SpendingLSTM(nn.Module):
    def __init__(self, hidden):
        super().__init__()
        self.recurrent = nn.LSTM(1, hidden, batch_first=True)
        self.output = nn.Linear(hidden, 1)

    def forward(self, x):
        sequence, _ = self.recurrent(x.unsqueeze(-1))
        return self.output(sequence[:, -1]).squeeze(-1)


def lstm_predict(train, cfg):
    torch.manual_seed(cfg["seed"])
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    center, scale = train.mean(), train.std() or 1.0
    normalized = ((train - center) / scale).astype(np.float32)
    width = cfg["lstm_window"]
    x, y = map(torch.from_numpy, windows(normalized, width))
    model = SpendingLSTM(cfg["lstm_hidden"])
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    for _ in range(cfg["lstm_epochs"]):
        optimizer.zero_grad()
        loss = nn.functional.mse_loss(model(x), y)
        loss.backward()
        optimizer.step()
    tail = torch.tensor(normalized[-width:])
    predictions = []
    with torch.no_grad():
        for _ in range(cfg["horizon"]):
            prediction = model(tail.unsqueeze(0))
            predictions.append(prediction.item() * scale + center)
            tail = torch.cat((tail[1:], prediction))
    return predictions


def predict(name, train, cfg):
    if name == "arima":
        return ARIMA(train, order=tuple(cfg["arima_order"])).fit().forecast(cfg["horizon"])
    if name == "lstm":
        return lstm_predict(train, cfg)
    return Baseline(name, cfg["rolling_days"]).fit(train).predict(cfg["horizon"])


def metrics(train, actual, predictions):
    errors = actual - predictions
    mae = float(np.abs(errors).mean())
    scale = float(np.abs(train[7:] - train[:-7]).mean())
    return {"mae": mae, "mse": float(np.square(errors).mean()), "mase": mae / scale if scale else None}


def compare(cfg, phase):
    series = synthetic(cfg["days"], cfg["seed"])
    scores = {name: [] for name in MODELS}
    for index, (train, actual) in enumerate(folds(series, cfg)):
        if (index < cfg["validation_folds"]) != (phase == "validation"):
            continue
        for name in MODELS:
            score = metrics(train, actual, predict(name, train, cfg))
            scores[name].append(score)
            print(json.dumps({"phase": phase, "origin": len(train), "model": name, **score}))
    result = {}
    for name, rows in scores.items():
        if not rows:
            raise ValueError("Configuration must provide validation and final folds")
        scaled = [r["mase"] for r in rows if r["mase"] is not None]
        result[name] = {"mae": np.mean([r["mae"] for r in rows]),
                        "rmse": np.sqrt(np.mean([r["mse"] for r in rows])),
                        "mase": np.mean(scaled) if scaled else None,
                        "scaled_folds": len(scaled), "folds": len(rows)}
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["train", "eval"])
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("evaluation.yaml"))
    parser.add_argument("--output", type=Path, default=Path("build/forecasting"))
    args = parser.parse_args()
    cfg = yaml.safe_load(args.config.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    selection = args.output / "selection.json"
    if args.command == "train":
        results = compare(cfg, "validation")
        selected = min(results, key=lambda model: results[model]["mae"])
        selection.write_text(json.dumps({"config": cfg, "selected": selected, "validation": results}, indent=2))
    else:
        record = json.loads(selection.read_text())
        if record["config"] != cfg:
            raise ValueError("Retrain after changing the configuration")
        record["final"] = compare(cfg, "final")
        (args.output / "results.json").write_text(json.dumps(record, indent=2))
        print(json.dumps(record))


if __name__ == "__main__":
    main()
