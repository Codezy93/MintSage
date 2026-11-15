import torch
from pathlib import Path
import matplotlib.pyplot as plt

SEQ_LEN = 6
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "lstm_6to6_ts.pt"

def load_and_predict(last_six_values, ts_path=MODEL_PATH):
    """
    last_six_values: iterable of 6 floats (most recent observations)
    returns: numpy array of 6 predicted values
    """
    if len(last_six_values) != SEQ_LEN:
        raise ValueError(f"Expected 6 input values, got {len(last_six_values)}")

    model = torch.jit.load(str(ts_path))
    model.eval()

    x = torch.tensor(last_six_values, dtype=torch.float32).view(1, SEQ_LEN, 1)
    with torch.no_grad():
        y_hat = model(x).squeeze(0).numpy()  # shape (6,)

    return y_hat

if __name__ == "__main__":
    # Demonstration input; this is not an accuracy test.
    series = [1,1,1,1,1,1]
    last_6 = series[-6:]
    forecast = load_and_predict(last_6)
    print("Last 6 values:   ", last_6)
    print("Predicted next 6:", forecast)
    plt.plot(range(len(last_6)), last_6, label='History', marker='o')
    plt.plot(range(len(last_6), len(last_6) + len(forecast)), forecast, label='Forecast', marker='x')
    plt.show()