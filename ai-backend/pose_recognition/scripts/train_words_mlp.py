"""
train_words_mlp.py
==================
吃 wlasl_words_sequences.npz，訓練詞彙辨識模型。
資料形狀：(N, 30, 136) 的時序 landmark 序列。

模型選項：
  --model flat  展平序列 → MLP（樣本極少時較穩定）
  --model gru   GRU 時序模型（預設，能捕捉動作軌跡）

使用：
    python train_words_mlp.py
    python train_words_mlp.py --model flat --epochs 150
    python train_words_mlp.py --augment 10 --epochs 300
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader, TensorDataset

SCRIPT_DIR = Path(__file__).resolve().parent
POSE_DIR   = SCRIPT_DIR.parent
DATA_DIR   = POSE_DIR / "data"
MODELS_DIR = POSE_DIR / "models"
RUNS_DIR   = POSE_DIR / "runs"


# ── 資料增強 ────────────────────────────────────────────────────────────────

def augment_sequence(X: np.ndarray, noise_std=0.015, shift_max=3, drop_prob=0.08) -> np.ndarray:
    """對單筆 (T, F) 序列做隨機增強。"""
    X = X.copy()
    # 高斯雜訊
    X += np.random.randn(*X.shape).astype(np.float32) * noise_std
    # 時間軸位移（循環）
    shift = np.random.randint(-shift_max, shift_max + 1)
    if shift != 0:
        X = np.roll(X, shift, axis=0)
    # 隨機幀遮罩（模擬遮擋）
    mask = np.random.random(X.shape[0]) < drop_prob
    X[mask] = 0.0
    return X


def build_augmented(X: np.ndarray, y: np.ndarray, times: int) -> tuple[np.ndarray, np.ndarray]:
    """把訓練集增強 times 倍（原始 + times 份增強）。"""
    xs, ys = [X], [y]
    for _ in range(times):
        aug = np.stack([augment_sequence(x) for x in X])
        xs.append(aug)
        ys.append(y)
    return np.concatenate(xs), np.concatenate(ys)


# ── 模型 ────────────────────────────────────────────────────────────────────

class GRUClassifier(nn.Module):
    def __init__(self, input_dim=136, hidden=64, n_classes=10, dropout=0.5):
        super().__init__()
        self.gru = nn.GRU(input_dim, hidden, num_layers=1, batch_first=True)
        self.head = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(hidden, 32),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(32, n_classes),
        )

    def forward(self, x):           # x: (B, T, F)
        _, h = self.gru(x)          # h: (1, B, hidden)
        return self.head(h.squeeze(0))


class FlatMLP(nn.Module):
    def __init__(self, seq_len=30, input_dim=136, n_classes=10, dropout=0.5):
        super().__init__()
        in_dim = seq_len * input_dim
        self.net = nn.Sequential(
            nn.Flatten(),
            nn.Linear(in_dim, 256),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 64),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(64, n_classes),
        )

    def forward(self, x):
        return self.net(x)


# ── 訓練工具 ────────────────────────────────────────────────────────────────

@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    loss_sum, n_correct, n_total = 0.0, 0, 0
    all_pred, all_true = [], []
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        logits = model(x)
        loss_sum += F.cross_entropy(logits, y, reduction="sum").item()
        pred = logits.argmax(1)
        n_correct += (pred == y).sum().item()
        n_total   += y.size(0)
        all_pred.extend(pred.cpu().tolist())
        all_true.extend(y.cpu().tolist())
    return loss_sum / n_total, n_correct / n_total, all_true, all_pred


# ── 主程式 ──────────────────────────────────────────────────────────────────

def train(args):
    npz_path = Path(args.npz) if args.npz else DATA_DIR / "wlasl_words_sequences.npz"
    if not npz_path.exists():
        print(f"[!] 找不到 {npz_path}，請先跑 extract_wlasl_sequences.py"); sys.exit(1)

    data    = np.load(npz_path, allow_pickle=True)
    classes = list(data["classes"])
    n_classes = len(classes)
    seq_len   = int(data["sequence_length"])
    input_dim = int(data["input_dim"])

    X_tr = data["X_train"].astype(np.float32)
    y_tr = data["y_train"].astype(np.int64)
    X_va = data["X_valid"].astype(np.float32)
    y_va = data["y_valid"].astype(np.int64)
    X_te = data["X_test"].astype(np.float32)
    y_te = data["y_test"].astype(np.int64)

    print(f"類別 ({n_classes}): {classes}")
    print(f"資料量 → train: {len(X_tr)}  valid: {len(X_va)}  test: {len(X_te)}")

    if args.augment > 0:
        X_tr, y_tr = build_augmented(X_tr, y_tr, args.augment)
        print(f"增強後 train: {len(X_tr)}")

    def to_loader(X, y, shuffle):
        ds = TensorDataset(torch.from_numpy(X), torch.from_numpy(y))
        return DataLoader(ds, batch_size=args.batch, shuffle=shuffle)

    train_loader = to_loader(X_tr, y_tr, True)
    valid_loader = to_loader(X_va, y_va, False)
    test_loader  = to_loader(X_te, y_te, False)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"使用裝置：{device}  模型：{args.model}")

    if args.model == "gru":
        model = GRUClassifier(input_dim, hidden=64, n_classes=n_classes, dropout=args.dropout).to(device)
    else:
        model = FlatMLP(seq_len, input_dim, n_classes=n_classes, dropout=args.dropout).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-3)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=8)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    best_val_acc = 0.0
    bad_epochs   = 0
    history      = []
    ckpt_path    = MODELS_DIR / "best_words_model.pt"

    for epoch in range(1, args.epochs + 1):
        model.train()
        run_loss, run_correct, run_n = 0.0, 0, 0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(x)
            loss   = F.cross_entropy(logits, y)
            loss.backward()
            optimizer.step()
            run_loss    += loss.item() * y.size(0)
            run_correct += (logits.argmax(1) == y).sum().item()
            run_n       += y.size(0)

        tr_loss = run_loss / run_n
        tr_acc  = run_correct / run_n
        va_loss, va_acc, _, _ = evaluate(model, valid_loader, device)
        scheduler.step(va_acc)
        history.append({"epoch": epoch, "train_acc": tr_acc, "val_acc": va_acc})

        if epoch % 10 == 0 or epoch == 1:
            print(f"epoch {epoch:3d} | train {tr_acc*100:5.1f}% | val {va_acc*100:5.1f}%")

        if va_acc > best_val_acc:
            best_val_acc = va_acc
            bad_epochs   = 0
            torch.save({
                "model_state": model.state_dict(),
                "model_type":  args.model,
                "classes":     classes,
                "seq_len":     int(seq_len),
                "input_dim":   int(input_dim),
                "hidden":      64,
                "dropout":     args.dropout,
            }, ckpt_path)
        else:
            bad_epochs += 1
            if bad_epochs >= args.patience:
                print(f"Early stop @ epoch {epoch}（best val acc {best_val_acc*100:.1f}%）")
                break

    # 載回最佳模型做 test
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt["model_state"])
    te_loss, te_acc, y_true, y_pred = evaluate(model, test_loader, device)

    print(f"\n=== Test ===  acc {te_acc*100:.1f}%  (best val {best_val_acc*100:.1f}%)")
    if len(set(y_true)) > 1:
        labels = list(range(n_classes))
        report = classification_report(y_true, y_pred, labels=labels,
                                       target_names=classes, digits=3, zero_division=0)
        cm = confusion_matrix(y_true, y_pred, labels=labels)
        print(report)
        (RUNS_DIR / "words_classification_report.txt").write_text(report)
        np.savetxt(RUNS_DIR / "words_confusion_matrix.csv", cm, fmt="%d", delimiter=",",
                   header=",".join(classes), comments="")

    (RUNS_DIR / "words_history.json").write_text(json.dumps(history, indent=2))
    print(f"\n模型存於：{ckpt_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model",    choices=["gru", "flat"], default="gru")
    ap.add_argument("--epochs",   type=int,   default=200)
    ap.add_argument("--batch",    type=int,   default=16)
    ap.add_argument("--lr",       type=float, default=1e-3)
    ap.add_argument("--dropout",  type=float, default=0.5)
    ap.add_argument("--augment",  type=int,   default=5,
                    help="訓練資料增強倍數（0=關閉）")
    ap.add_argument("--patience", type=int,   default=30)
    ap.add_argument("--npz",      type=str,   default=None,
                    help="指定 .npz 路徑（預設用 wlasl_words_sequences.npz）")
    args = ap.parse_args()
    train(args)


if __name__ == "__main__":
    main()
