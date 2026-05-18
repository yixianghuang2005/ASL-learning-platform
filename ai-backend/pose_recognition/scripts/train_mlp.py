"""
train_mlp.py
============
吃 extract_landmarks.py 產出的 CSV，訓練一個小 MLP 做 ASL 字母分類。

預設輸入：63 維 (21 點 × xyz)
預設輸出：24 類（A-Y 中扣掉 J、Z）
        'nothing' 樣本會被自動過濾（前端用「沒偵測到手」當 nothing 訊號）。

使用：
    python train_mlp.py
    python train_mlp.py --epochs 80 --batch 128

CPU 訓練即可（資料量小，模型小），不需要 DirectML。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import LabelEncoder
from torch.utils.data import DataLoader, TensorDataset


SCRIPT_DIR = Path(__file__).resolve().parent
POSE_DIR = SCRIPT_DIR.parent          # pose_recognition/
DATA_DIR = POSE_DIR / "data"          # CSVs
MODELS_DIR = POSE_DIR / "models"
RUNS_DIR = POSE_DIR / "runs"


# --- 模型 ----------------------------------------------------------------
class SignMLP(nn.Module):
    def __init__(self, in_dim: int = 63, n_classes: int = 24, hidden=(128, 64), dropout=0.3):
        super().__init__()
        layers = []
        prev = in_dim
        for h in hidden:
            layers += [nn.Linear(prev, h), nn.ReLU(), nn.Dropout(dropout)]
            prev = h
        layers.append(nn.Linear(prev, n_classes))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x)


# --- 資料載入 ------------------------------------------------------------
def load_csv(path: Path, drop_labels=("nothing",)) -> tuple[np.ndarray, np.ndarray]:
    if not path.exists():
        raise FileNotFoundError(f"找不到 {path}，請先跑 extract_landmarks.py")
    df = pd.read_csv(path)
    if drop_labels:
        before = len(df)
        df = df[~df["label"].isin(drop_labels)].reset_index(drop=True)
        dropped = before - len(df)
        if dropped > 0:
            print(f"  {path.name}: 過濾掉 {dropped} 筆 {list(drop_labels)} 樣本")
    y = df["label"].values
    X = df.drop(columns=["label"]).values.astype(np.float32)
    return X, y


def build_loaders(batch_size: int):
    X_tr, y_tr = load_csv(DATA_DIR / "landmarks_train.csv")
    X_va, y_va = load_csv(DATA_DIR / "landmarks_valid.csv")
    X_te, y_te = load_csv(DATA_DIR / "landmarks_test.csv")

    le = LabelEncoder()
    y_tr_e = le.fit_transform(y_tr)
    y_va_e = le.transform(y_va)
    y_te_e = le.transform(y_te)

    print(f"類別 ({len(le.classes_)}): {list(le.classes_)}")
    print(f"資料量 → train: {len(X_tr)}  valid: {len(X_va)}  test: {len(X_te)}")

    def to_loader(X, y, shuffle):
        ds = TensorDataset(torch.from_numpy(X), torch.from_numpy(y).long())
        return DataLoader(ds, batch_size=batch_size, shuffle=shuffle)

    return (
        to_loader(X_tr, y_tr_e, True),
        to_loader(X_va, y_va_e, False),
        to_loader(X_te, y_te_e, False),
        le,
    )


# --- 訓練/驗證 -----------------------------------------------------------
@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    n_total, n_correct, loss_sum = 0, 0, 0.0
    all_pred, all_true = [], []
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        logits = model(x)
        loss = F.cross_entropy(logits, y, reduction="sum")
        pred = logits.argmax(dim=1)
        loss_sum += loss.item()
        n_correct += (pred == y).sum().item()
        n_total += y.size(0)
        all_pred.append(pred.cpu().numpy())
        all_true.append(y.cpu().numpy())
    return loss_sum / n_total, n_correct / n_total, np.concatenate(all_true), np.concatenate(all_pred)


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"使用裝置：{device}")

    train_loader, valid_loader, test_loader, le = build_loaders(args.batch)
    n_classes = len(le.classes_)

    model = SignMLP(in_dim=63, n_classes=n_classes, dropout=args.dropout).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=5)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    best_val_acc = 0.0
    bad_epochs = 0
    history = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        running_loss, running_correct, running_n = 0.0, 0, 0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(x)
            loss = F.cross_entropy(logits, y)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * y.size(0)
            running_correct += (logits.argmax(1) == y).sum().item()
            running_n += y.size(0)

        train_loss = running_loss / running_n
        train_acc = running_correct / running_n
        val_loss, val_acc, _, _ = evaluate(model, valid_loader, device)
        scheduler.step(val_acc)
        history.append({"epoch": epoch, "train_loss": train_loss, "train_acc": train_acc,
                         "val_loss": val_loss, "val_acc": val_acc})

        print(f"epoch {epoch:3d} | train loss {train_loss:.4f} acc {train_acc*100:5.2f}% "
              f"| val loss {val_loss:.4f} acc {val_acc*100:5.2f}%")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            bad_epochs = 0
            torch.save({
                "model_state": model.state_dict(),
                "classes": list(le.classes_),
                "in_dim": 63,
                "hidden": (128, 64),
                "dropout": args.dropout,
            }, MODELS_DIR / "best_mlp.pt")
        else:
            bad_epochs += 1
            if bad_epochs >= args.patience:
                print(f"early stop @ epoch {epoch} (best val acc {best_val_acc*100:.2f}%)")
                break

    # 載回最佳權重做 test
    ckpt = torch.load(MODELS_DIR / "best_mlp.pt", map_location=device)
    model.load_state_dict(ckpt["model_state"])
    test_loss, test_acc, y_true, y_pred = evaluate(model, test_loader, device)
    print(f"\n=== Test set ===  loss {test_loss:.4f}  acc {test_acc*100:.2f}%")

    label_indices = list(range(n_classes))
    report = classification_report(y_true, y_pred, labels=label_indices,
                                    target_names=le.classes_, digits=3, zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=label_indices)
    print(report)

    (RUNS_DIR / "history.json").write_text(json.dumps(history, indent=2))
    (RUNS_DIR / "classification_report.txt").write_text(report)
    np.savetxt(RUNS_DIR / "confusion_matrix.csv", cm, fmt="%d", delimiter=",",
               header=",".join(le.classes_), comments="")
    print(f"\n模型/紀錄存於：\n  {MODELS_DIR / 'best_mlp.pt'}\n  {RUNS_DIR}/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--dropout", type=float, default=0.3)
    ap.add_argument("--patience", type=int, default=12, help="early stopping patience")
    args = ap.parse_args()
    train(args)


if __name__ == "__main__":
    main()
