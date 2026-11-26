import pytest

from forecasting.comparison import compare_losses


def compare(candidate, baseline, stride=30):
    return compare_losses(candidate, baseline, horizon=30, stride=stride, seed=17)


def test_paired_direction_and_reproducibility():
    first, other = [1, 4, 2, 3], [3, 4, 6, 5]
    result = compare(first, other)
    assert result == compare(first, other)
    assert result["mean_difference"] == -2
    reverse = compare(other, first)
    assert result["dm"] == -reverse["dm"]
    assert result["ci95"] == pytest.approx([-v for v in reversed(reverse["ci95"])])


def test_degenerate_and_overlapping_origins():
    assert compare([1] * 4, [1] * 4)["p_two_sided"] is None
    overlapping = compare([1] * 10, [2] * 10, stride=1)
    assert overlapping["block"] >= 30
    assert overlapping["ci95"] is None
