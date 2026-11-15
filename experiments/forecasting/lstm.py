import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader, random_split
import numpy as np

SEQ_LEN = 6     # input length
HORIZON = 6     # how many steps to predict

class SixInSixOutDataset(Dataset):
    def __init__(self, series: np.ndarray):
        """
        series: 1D numpy array of your time series, e.g. daily expenses
        """
        series = np.asarray(series, dtype=np.float32)
        if series.ndim != 1:
            raise ValueError("series must be 1D (univariate time series)")

        self.inputs = []
        self.targets = []

        max_start = len(series) - (SEQ_LEN + HORIZON) + 1
        if max_start <= 0:
            raise ValueError("Series too short for given SEQ_LEN and HORIZON")

        for i in range(max_start):
            x = series[i:i + SEQ_LEN]                   # 6 inputs
            y = series[i + SEQ_LEN:i + SEQ_LEN + HORIZON]  # next 6 outputs
            self.inputs.append(x)
            self.targets.append(y)

        self.inputs = np.stack(self.inputs)   # (N, 6)
        self.targets = np.stack(self.targets) # (N, 6)

    def __len__(self):
        return len(self.inputs)

    def __getitem__(self, idx):
        # LSTM expects (batch, seq_len, input_size), so we add an input_size=1 dim
        x = self.inputs[idx][..., None]  # (6, 1)
        y = self.targets[idx]            # (6,)
        return torch.from_numpy(x), torch.from_numpy(y)


# -----------------------------
# Model: LSTM → Linear(6)
# -----------------------------
class LSTM6to6(nn.Module):
    def __init__(self, input_size=1, hidden_size=64, num_layers=2, dropout=0.1):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.fc = nn.Linear(hidden_size, HORIZON)  # maps last hidden → 6 outputs

    def forward(self, x):
        """
        x: (batch, seq_len=6, input_size=1)
        returns: (batch, 6) predicted next 6 numbers
        """
        out, _ = self.lstm(x)
        last_hidden = out[:, -1, :]  # (batch, hidden)
        y = self.fc(last_hidden)     # (batch, 6)
        return y


# -----------------------------
# Training loop
# -----------------------------
def train_lstm_6to6(series, num_epochs=20, batch_size=32, lr=1e-3, device=None):
    """
    series: 1D numpy array or list of floats
    returns: trained PyTorch model
    """
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    dataset = SixInSixOutDataset(series)
    n_train = max(1, int(0.8 * len(dataset)))
    n_val = len(dataset) - n_train
    train_ds, val_ds = random_split(dataset, [n_train, n_val])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size) if n_val > 0 else None

    model = LSTM6to6().to(device)
    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    for epoch in range(num_epochs):
        model.train()
        train_loss = 0.0
        for xb, yb in train_loader:
            xb = xb.to(device)  # (B, 6, 1)
            yb = yb.to(device)  # (B, 6)

            optimizer.zero_grad()
            pred = model(xb)
            loss = criterion(pred, yb)
            loss.backward()
            optimizer.step()

            train_loss += loss.item() * xb.size(0)

        train_loss /= len(train_loader.dataset)

        if val_loader is not None and len(val_loader.dataset) > 0:
            model.eval()
            val_loss = 0.0
            with torch.no_grad():
                for xb, yb in val_loader:
                    xb = xb.to(device)
                    yb = yb.to(device)
                    pred = model(xb)
                    loss = criterion(pred, yb)
                    val_loss += loss.item() * xb.size(0)
            val_loss /= len(val_loader.dataset)
            print(f"Epoch {epoch+1}/{num_epochs}  train_loss={train_loss:.4f}  val_loss={val_loss:.4f}")
        else:
            print(f"Epoch {epoch+1}/{num_epochs}  train_loss={train_loss:.4f}")

    return model


# -----------------------------
# Save for production
# -----------------------------
def save_for_production(model, checkpoint_path="lstm_6to6_state.pt", ts_path="lstm_6to6_ts.pt"):
    """
    - checkpoint_path: standard PyTorch state_dict (for re-training / fine-tuning)
    - ts_path: TorchScript model (for serving in production)
    """
    # 1) classic state_dict
    torch.save(model.state_dict(), checkpoint_path)

    # 2) TorchScript (loadable in non-Python runtimes, or simple production services)
    model_cpu = model.cpu().eval()
    example_input = torch.randn(1, SEQ_LEN, 1)  # (batch=1, seq_len=6, input_size=1)
    traced = torch.jit.trace(model_cpu, example_input)
    traced.save(ts_path)

    print(f"Saved state_dict to {checkpoint_path}")
    print(f"Saved TorchScript model to {ts_path}")