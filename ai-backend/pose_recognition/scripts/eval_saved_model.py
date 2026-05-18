"""
eval_saved_model.py
===================
載入一個存好的 .pt 模型，在 landmarks_test.csv 上跑評估，
印出和 train_mlp.py 結尾完全一樣格式的 classification_report。

用途：拍對比截圖時不用重訓，直接從存好的模型印報表。

使用：
    python eval_saved_model.py --model models\best_mlp_v1.pt
    python eval_saved_model.py --model models\best_mlp_v2.pt
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from sklearn.metrics import classification_report

sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_mlp import SignMLP, load_csv  # noqa: E402


SCRIPT_DIR = Path(__file__).resolve().parent
POSE_DIR = SCRIPT_DIR.parent
DATA_DIR = POSE_DIR / "data"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="模型路徑，例如 models\\best_mlp_v2.pt")
    ap.add_argument("--test-csv", default=str(DATA_DIR / "landmarks_test.csv"))
    args = ap.parse_args()

    model_path = Path(args.model)
    if not model_path.is_absolute():
        model_path = POSE_DIR / args.model

    if not model_path.exists():
        print(f"[!] 找不到 {model_path}")
        return

    print(f"載入模型：{model_path}")
    ckpt = torch.load(model_path, map_location="cpu", weights_only=False)
    classes = ckpt["classes"]
    model = SignMLP(in_dim=ckpt.get("in_dim", 63),
                    n_classes=len(classes),
                    hidden=ckpt.get("hidden", (128, 64)),
                    dropout=ckpt.get("dropout", 0.3))
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    # 載入 test set
    X, y = load_csv(Path(args.test_csv))
    label_to_idx = {c: i for i, c in enumerate(classes)}
    y_idx = np.array([label_to_idx[lbl] for lbl in y if lbl in label_to_idx])
    keep_mask = np.array([lbl in label_to_idx for lbl in y])
    X = X[keep_mask]

    # 推論
    with torch.no_grad():
        x_t = torch.from_numpy(X.astype(np.float32))
        y_t = torch.from_numpy(y_idx).long()
        logits = model(x_t)
        loss = F.cross_entropy(logits, y_t, reduction="sum").item() / len(y_t)
        preds = logits.argmax(dim=1).numpy()
    acc = (preds == y_idx).mean()

    # 印出和 train_mlp.py 結尾相同格式
    print(f"\n=== Test set ===  loss {loss:.4f}  acc {acc*100:.2f}%")
    label_indices = list(range(len(classes)))
    report = classification_report(y_idx, preds,
                                    labels=label_indices,
                                    target_names=classes,
                                    digits=3, zero_division=0)
    print(report)


if __name__ == "__main__":
    main()
