"""
analyze_model.py
================
載入 best_mlp.pt，跑 test set 推論，輸出：
- 每個字母的 precision / recall / F1
- 混淆矩陣（特別標出最常被誤認的對）
- 表現最差的 5 個字母

使用：
    python analyze_model.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_mlp import SignMLP, load_csv  # noqa: E402


SCRIPT_DIR = Path(__file__).resolve().parent
POSE_DIR = SCRIPT_DIR.parent
DATA_DIR = POSE_DIR / "data"
MODELS_DIR = POSE_DIR / "models"


def main():
    ckpt_path = MODELS_DIR / "best_mlp.pt"
    if not ckpt_path.exists():
        print(f"找不到 {ckpt_path}，請先跑 train_mlp.py")
        return

    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    classes = ckpt["classes"]
    label_to_idx = {c: i for i, c in enumerate(classes)}

    model = SignMLP(in_dim=ckpt.get("in_dim", 63),
                    n_classes=len(classes),
                    hidden=ckpt.get("hidden", (128, 64)),
                    dropout=ckpt.get("dropout", 0.3))
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    # 載入 test
    X, y = load_csv(DATA_DIR / "landmarks_test.csv")
    y_idx = np.array([label_to_idx.get(lbl, -1) for lbl in y])
    keep = y_idx >= 0
    X, y_idx, y = X[keep], y_idx[keep], y[keep]

    # 推論
    with torch.no_grad():
        logits = model(torch.from_numpy(X))
        probs = torch.softmax(logits, dim=1).numpy()
        preds = logits.argmax(dim=1).numpy()

    # 整體準確率
    acc = (preds == y_idx).mean()
    print(f"\n=== 整體測試準確率：{acc*100:.2f}% ===\n")

    # 每類 precision / recall
    print("=== 每個字母表現（按 F1 排序，最差在最上）===")
    print(f"{'字母':4s} {'樣本':>5s} {'準確率':>8s} {'平均信心':>10s} {'最常被誤認成':>16s}")
    print("-" * 60)

    rows = []
    for c, idx in label_to_idx.items():
        mask = y_idx == idx
        n = mask.sum()
        if n == 0:
            continue
        correct = (preds[mask] == idx).sum()
        recall = correct / n
        avg_conf = probs[mask, preds[mask]].mean()

        # 找這個字母最常被誤認成什麼
        wrong_preds = preds[mask][preds[mask] != idx]
        if len(wrong_preds) > 0:
            most_confused_idx = np.bincount(wrong_preds).argmax()
            most_confused = classes[most_confused_idx]
            confused_count = (wrong_preds == most_confused_idx).sum()
            confused_str = f"{most_confused} ({confused_count})"
        else:
            confused_str = "—"

        rows.append((c, n, recall, avg_conf, confused_str))

    # 按準確率升冪排序
    rows.sort(key=lambda x: x[2])
    for c, n, recall, avg_conf, conf_str in rows:
        marker = " ⚠️" if recall < 0.9 else ""
        print(f"{c:4s} {n:>5d} {recall*100:>7.1f}% {avg_conf*100:>9.1f}% {conf_str:>16s}{marker}")

    # 焦點分析：特定字母
    print("\n=== X 被預測成什麼？ ===")
    if "X" in label_to_idx:
        x_idx = label_to_idx["X"]
        x_mask = y_idx == x_idx
        x_preds = preds[x_mask]
        dist = pd.Series(x_preds).value_counts().sort_values(ascending=False).head(5)
        for pred_idx, cnt in dist.items():
            tag = "✓" if pred_idx == x_idx else "✗"
            pct = cnt / x_mask.sum() * 100
            print(f"  {tag} 預測成 {classes[pred_idx]:4s}: {cnt:3d} 次 ({pct:5.1f}%)")


if __name__ == "__main__":
    main()
