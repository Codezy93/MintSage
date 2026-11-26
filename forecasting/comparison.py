"""Paired loss comparisons across ordered forecast origins."""
from math import ceil, erfc, sqrt

import numpy as np


def compare_losses(candidate, reference, *, horizon: int, stride: int, seed: int):
    """Compare aligned per-origin MAEs. Negative differences favor the candidate."""
    if horizon < 1 or stride < 1:
        raise ValueError("Horizon and stride must be positive")
    candidate = np.asarray(candidate, dtype=float)
    reference = np.asarray(reference, dtype=float)
    if candidate.ndim != 1 or reference.shape != candidate.shape or not candidate.size:
        raise ValueError("Expected matching nonempty per-origin losses")
    diff = candidate - reference
    if not np.isfinite(diff).all():
        raise ValueError("Expected finite losses")
    n = len(diff)
    block = max(2, ceil(horizon / stride), ceil(n ** (1 / 3)))
    result = dict(origins=n, block=block, mean_difference=float(diff.mean()),
                  ci95=None, dm=None, p_two_sided=None)
    if n < 2 * block:
        return result
    rng = np.random.default_rng(seed)
    starts = rng.integers(n, size=(10000, ceil(n / block)))
    indices = ((starts[:, :, None] + np.arange(block)) % n).reshape(10000, -1)[:, :n]
    result["ci95"] = np.quantile(diff[indices].mean(axis=1), [0.025, 0.975]).tolist()
    centered = diff - diff.mean()
    variance = centered @ centered / n
    for lag in range(1, block):
        covariance = centered[lag:] @ centered[:-lag] / n
        variance += 2 * (1 - lag / block) * covariance
    if variance > 0:
        dm = float(diff.mean() / sqrt(variance / n))
        result.update(dm=dm, p_two_sided=erfc(abs(dm) / sqrt(2)))
    return result
