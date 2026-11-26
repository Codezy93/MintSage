PYTHON ?= python
.PHONY: train eval
train:
	$(PYTHON) -m forecasting.evaluation train

eval: build/forecasting/selection.json
	$(PYTHON) -m forecasting.evaluation eval

build/forecasting/selection.json: forecasting/evaluation.yaml forecasting/evaluation.py forecasting/baselines.py
	$(MAKE) train
