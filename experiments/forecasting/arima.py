import numpy as np
from statsmodels.tsa.arima.model import ARIMA
import matplotlib.pyplot as plt

def forecast_next_15(event):
    history = event['history']
    order=(1, 1, 1)
    """
    Fit an ARIMA model on the given history and forecast the next 15 values.

    Parameters
    ----------
    history : list of floats
        Time-ordered series (e.g., last 15 days of expenses).
    order : (p, d, q)
        ARIMA hyperparameters. With very short series, keep these small.

    Returns
    -------
    list of floats
        Forecasted next 15 values.
    """
    if len(history) < 5:
        raise ValueError("Need at least 5 points to fit a tiny ARIMA model.")

    y = np.asarray(history, dtype=float)

    model = ARIMA(y, order=order)
    fitted = model.fit()

    forecast = fitted.forecast(steps=15)
    forecast = [float(round(x, 2)) for x in forecast]
    return forecast

if __name__ == "__main__":
    # Example usage
    example_event = {
        'history': [100.0, 102.5, 101.0, 103.5, 104.0, 105.5, 107.0, 106.5, 108.0, 109.5, 110.37, 111.24, 112.1, 112.97, 113.84]
    }
    plt.plot(example_event['history'], range(0, 15), label='History', marker='o')
    forecasted_values = forecast_next_15(example_event)
    plt.plot(forecasted_values, range(15, 30), label='Forecast', marker='x')
    print("Forecasted next 15 values:", forecasted_values)
    plt.legend()
    plt.title("ARIMA Forecasting Example")
    plt.show()