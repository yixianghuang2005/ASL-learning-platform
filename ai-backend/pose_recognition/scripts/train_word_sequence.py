"""
Train a lightweight temporal CNN for WLASL word sequences.

Input:
  pose_recognition/data/wlasl_words_sequences.npz

Output:
  pose_recognition/models/best_word_sequence.pt
  pose_recognition/models/asl_words_classes.json
  pose_recognition/runs/word_sequence_report.txt
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader, TensorDataset


SCRIPT_DIR = Path(__file__).resolve().parent
POSE_DIR = SCRIPT_DIR.parent
DATA_DIR = POSE_DIR / "data"
MODELS_DIR = POSE_DIR / "models"
RUNS_DIR = POSE_DIR / "runs"


class WordTemporalCNN(nn.Module):
    def __init__(self, input_dim: int, n_classes: int, channels: int = 128, dropout: float = 0.25):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Conv1d(input_dim, channels, kernel_size=3, padding=1),
            nn.BatchNorm1d(channels),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Conv1d(channels, channels, kernel_size=3, padding=1),
            nn.BatchNorm1d(channels),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.classifier = nn.Linear(channels, n_classes)

    def forward(self, sequence):
        x = sequence.transpose(1, 2)
        x = self.encoder(x).squeeze(-1)
        return self.classifier(x)


def load_data(path: Path):
    data = np.load(path, allow_pickle=True)
    classes = [str(item) for item in data["classes"].tolist()]
    sequence_length = int(data["sequence_length"])
    input_dim = int(data["input_dim"])
    return {
        "classes": classes,
        "sequence_length": sequence_length,
        "input_dim": input_dim,
        "X_train": data["X_train"].astype(np.float32),
        "y_train": data["y_train"].astype(np.int64),
        "X_valid": data["X_valid"].astype(np.float32),
        "y_valid": data["y_valid"].astype(np.int64),
        "X_test": data["X_test"].astype(np.float32),
        "y_test": data["y_test"].astype(np.int64),
    }


def make_loader(X, y, batch_size: int, shuffle: bool) -> DataLoader:
    dataset = TensorDataset(torch.from_numpy(X), torch.from_numpy(y).long())
    return DataLoader(dataset, batch_size=batch_size, shuffle=shuffle)


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    loss_sum = 0.0
    total = 0
    correct = 0
    preds = []
    truths = []

    for X, y in loader:
        X = X.to(device)
        y = y.to(device)
        logits = model(X)
        loss = F.cross_entropy(logits, y, reduction="sum")
        pred = logits.argmax(1)

        loss_sum += loss.item()
        total += y.numel()
        correct += (pred == y).sum().item()
        preds.append(pred.cpu().numpy())
        truths.append(y.cpu().numpy())

    return {
        "loss": loss_sum / max(1, total),
        "acc": correct / max(1, total),
        "y_true": np.concatenate(truths) if truths else np.array([], dtype=np.int64),
        "y_pred": np.concatenate(preds) if preds else np.array([], dtype=np.int64),
    }


def train(args: argparse.Namespace) -> None:
    payload = load_data(args.data)
    if len(payload["X_train"]) == 0:
        raise ValueError("Training split is empty. Check the WLASL manifest and downloaded videos.")
    if len(payload["X_valid"]) == 0:
        raise ValueError("Validation split is empty. Keep WLASL validation videos in the manifest.")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    classes = payload["classes"]
    model = WordTemporalCNN(
        input_dim=payload["input_dim"],
        n_classes=len(classes),
        channels=args.channels,
        dropout=args.dropout,
    ).to(device)

    train_loader = make_loader(payload["X_train"], payload["y_train"], args.batch, True)
    valid_loader = make_loader(payload["X_valid"], payload["y_valid"], args.batch, False)
    test_loader = make_loader(payload["X_test"], payload["y_test"], args.batch, False)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", patience=5, factor=0.5)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    best_acc = 0.0
    bad_epochs = 0
    history = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        total = 0
        correct = 0
        loss_sum = 0.0

        for X, y in train_loader:
            X = X.to(device)
            y = y.to(device)
            optimizer.zero_grad()
            logits = model(X)
            loss = F.cross_entropy(logits, y)
            loss.backward()
            optimizer.step()

            loss_sum += loss.item() * y.numel()
            total += y.numel()
            correct += (logits.argmax(1) == y).sum().item()

        train_loss = loss_sum / max(1, total)
        train_acc = correct / max(1, total)
        valid = evaluate(model, valid_loader, device)
        scheduler.step(valid["acc"])

        history.append(
            {
                "epoch": epoch,
                "train_loss": train_loss,
                "train_acc": train_acc,
                "valid_loss": valid["loss"],
                "valid_acc": valid["acc"],
            }
        )
        print(
            f"epoch {epoch:03d} | "
            f"train loss {train_loss:.4f} acc {train_acc * 100:.2f}% | "
            f"valid loss {valid['loss']:.4f} acc {valid['acc'] * 100:.2f}%"
        )

        if valid["acc"] > best_acc:
            best_acc = valid["acc"]
            bad_epochs = 0
            torch.save(
                {
                    "model_state": model.state_dict(),
                    "classes": classes,
                    "input_dim": payload["input_dim"],
                    "sequence_length": payload["sequence_length"],
                    "channels": args.channels,
                    "dropout": args.dropout,
                },
                MODELS_DIR / "best_word_sequence.pt",
            )
        else:
            bad_epochs += 1
            if bad_epochs >= args.patience:
                print(f"early stop at epoch {epoch}")
                break

    checkpoint = torch.load(MODELS_DIR / "best_word_sequence.pt", map_location=device)
    model.load_state_dict(checkpoint["model_state"])
    test = evaluate(model, test_loader, device)
    report = classification_report(
        test["y_true"],
        test["y_pred"],
        labels=list(range(len(classes))),
        target_names=classes,
        digits=3,
        zero_division=0,
    )
    matrix = confusion_matrix(test["y_true"], test["y_pred"], labels=list(range(len(classes))))

    (RUNS_DIR / "word_sequence_history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")
    (RUNS_DIR / "word_sequence_report.txt").write_text(report, encoding="utf-8")
    np.savetxt(RUNS_DIR / "word_sequence_confusion_matrix.csv", matrix, fmt="%d", delimiter=",")

    classes_payload = {
        "classes": classes,
        "sequence_length": payload["sequence_length"],
        "input_dim": payload["input_dim"],
        "model_type": "WordTemporalCNN",
    }
    (MODELS_DIR / "asl_words_classes.json").write_text(
        json.dumps(classes_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\n=== Test report ===")
    print(report)
    print(f"Saved: {MODELS_DIR / 'best_word_sequence.pt'}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DATA_DIR / "wlasl_words_sequences.npz")
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--channels", type=int, default=128)
    parser.add_argument("--dropout", type=float, default=0.25)
    parser.add_argument("--patience", type=int, default=12)
    args = parser.parse_args()
    train(args)


if __name__ == "__main__":
    main()
