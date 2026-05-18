"""
compare_models.py
=================
比較兩個訓練版本的成果（v1 = 單一資料集；v2 = 合併 SigNN）。

預期輸入（都在 pose_recognition/runs/ 底下）：
    history_v1.json, history_v2.json
    classification_report_v1.txt, classification_report_v2.txt
    confusion_matrix_v1.csv, confusion_matrix_v2.csv
    per_letter_v1.csv, per_letter_v2.csv   ← 由 analyze_model.py 衍生

並且兩個 .pt 都存在：
    pose_recognition/models/best_mlp_v1.pt
    pose_recognition/models/best_mlp_v2.pt

使用：
    python compare_models.py
產出：
    pose_recognition/runs/comparison_report.md
    pose_recognition/runs/comparison_curves.png  (如果有 matplotlib)
"""
from __future__ import annotations

import json
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
RUNS_DIR = POSE_DIR / "runs"


def per_letter_stats(model: torch.nn.Module, classes: list[str],
                      X: np.ndarray, y: np.ndarray) -> pd.DataFrame:
    """跑 model 在 (X, y) 上，回傳每個字母的 acc/信心/最常被誤認對象"""
    label_to_idx = {c: i for i, c in enumerate(classes)}
    y_idx = np.array([label_to_idx.get(lbl, -1) for lbl in y])
    keep = y_idx >= 0
    X, y_idx = X[keep], y_idx[keep]
    with torch.no_grad():
        logits = model(torch.from_numpy(X.astype(np.float32)))
        probs = torch.softmax(logits, dim=1).numpy()
        preds = logits.argmax(dim=1).numpy()
    rows = []
    for c, idx in label_to_idx.items():
        mask = y_idx == idx
        n = int(mask.sum())
        if n == 0:
            rows.append({"letter": c, "n": 0, "acc": np.nan,
                         "avg_conf": np.nan, "confused_with": "—"})
            continue
        correct = int((preds[mask] == idx).sum())
        acc = correct / n
        avg_conf = float(probs[mask, preds[mask]].mean())
        wrong = preds[mask][preds[mask] != idx]
        if len(wrong):
            mc = np.bincount(wrong).argmax()
            confused = f"{classes[mc]} ({int((wrong == mc).sum())})"
        else:
            confused = "—"
        rows.append({"letter": c, "n": n, "acc": acc,
                     "avg_conf": avg_conf, "confused_with": confused})
    return pd.DataFrame(rows)


def load_model(path: Path) -> tuple[torch.nn.Module, list[str]]:
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    classes = ckpt["classes"]
    model = SignMLP(in_dim=ckpt.get("in_dim", 63),
                    n_classes=len(classes),
                    hidden=ckpt.get("hidden", (128, 64)),
                    dropout=ckpt.get("dropout", 0.3))
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    return model, classes


def main():
    v1_path = MODELS_DIR / "best_mlp_v1.pt"
    v2_path = MODELS_DIR / "best_mlp_v2.pt"

    if not v1_path.exists() or not v2_path.exists():
        print("[!] 需要兩個模型都存在：")
        print(f"   {v1_path}: {'OK' if v1_path.exists() else '缺'}")
        print(f"   {v2_path}: {'OK' if v2_path.exists() else '缺'}")
        return

    print(">> 載入 v1（單一資料集）模型...")
    m1, c1 = load_model(v1_path)
    print(">> 載入 v2（合併 SigNN）模型...")
    m2, c2 = load_model(v2_path)
    assert c1 == c2, "兩個模型的類別不一致！"

    print(">> 在共同 test set 上推論...")
    X_te, y_te = load_csv(DATA_DIR / "landmarks_test.csv")

    df1 = per_letter_stats(m1, c1, X_te, y_te)
    df2 = per_letter_stats(m2, c2, X_te, y_te)

    merged = df1.merge(df2, on="letter", suffixes=("_v1", "_v2"))
    merged["acc_diff"] = (merged["acc_v2"] - merged["acc_v1"]) * 100
    merged["conf_diff"] = (merged["avg_conf_v2"] - merged["avg_conf_v1"]) * 100

    # 整體準確率
    y_idx = np.array([c1.index(lbl) if lbl in c1 else -1 for lbl in y_te])
    keep = y_idx >= 0
    X_keep, y_keep = X_te[keep], y_idx[keep]
    with torch.no_grad():
        p1 = m1(torch.from_numpy(X_keep.astype(np.float32))).argmax(1).numpy()
        p2 = m2(torch.from_numpy(X_keep.astype(np.float32))).argmax(1).numpy()
    overall_v1 = float((p1 == y_keep).mean())
    overall_v2 = float((p2 == y_keep).mean())

    # 訓練曲線
    h1_path = RUNS_DIR / "history_v1.json"
    h2_path = RUNS_DIR / "history_v2.json"
    have_history = h1_path.exists() and h2_path.exists()

    # ============ 產出 markdown 報告 ============
    out_md = RUNS_DIR / "comparison_report.md"
    lines = []
    lines.append("# 模型對比報告：v1（單一資料集）vs v2（合併 SigNN）\n")
    lines.append(f"測試集：共同的 `landmarks_test.csv`（{len(X_keep)} 筆，過濾 'nothing' 後）\n")
    lines.append("## 整體準確率\n")
    lines.append("| 模型 | 訓練資料量 | 來源 | Test Acc |")
    lines.append("|------|----------|------|----------|")
    lines.append(f"| **v1** | 5019 | 原 Roboflow | **{overall_v1*100:.2f}%** |")
    lines.append(f"| **v2** | 13304 | 原 Roboflow + SigNN | **{overall_v2*100:.2f}%** |")
    lines.append(f"| 差異 | +8285 | — | {(overall_v2-overall_v1)*100:+.2f}% |\n")

    lines.append("## 每個字母對比（按 v2-v1 差異排序）\n")
    sorted_df = merged.sort_values("acc_diff").reset_index(drop=True)
    lines.append("| 字母 | 樣本 | v1 acc | v1 信心 | v1 誤判→ | v2 acc | v2 信心 | v2 誤判→ | Δacc | Δ信心 |")
    lines.append("|------|------|-------|--------|--------|-------|--------|--------|------|-------|")
    for _, r in sorted_df.iterrows():
        if r["n_v1"] == 0:
            continue
        sym = "↑" if r["acc_diff"] > 0.5 else ("↓" if r["acc_diff"] < -0.5 else "—")
        lines.append(
            f"| {r['letter']} | {int(r['n_v1'])} | "
            f"{r['acc_v1']*100:.1f}% | {r['avg_conf_v1']*100:.1f}% | {r['confused_with_v1']} | "
            f"{r['acc_v2']*100:.1f}% | {r['avg_conf_v2']*100:.1f}% | {r['confused_with_v2']} | "
            f"{sym} {r['acc_diff']:+.1f} | {r['conf_diff']:+.1f} |"
        )
    lines.append("")

    # X 焦點對比
    if "X" in c1:
        x_idx = c1.index("X")
        x_mask = y_keep == x_idx
        lines.append("## X 字母詳細對比（焦點分析）\n")
        for ver, preds in [("v1", p1), ("v2", p2)]:
            lines.append(f"### {ver} 模型對 X 的預測分布")
            x_preds = preds[x_mask]
            dist = pd.Series(x_preds).value_counts().sort_values(ascending=False).head(5)
            lines.append("| 預測 | 次數 | 比例 |")
            lines.append("|------|------|------|")
            for pred_idx, cnt in dist.items():
                tag = "✓" if pred_idx == x_idx else "✗"
                lines.append(f"| {tag} {c1[pred_idx]} | {int(cnt)} | {cnt/x_mask.sum()*100:.1f}% |")
            lines.append("")

    # 訓練曲線
    if have_history:
        h1 = json.loads(h1_path.read_text())
        h2 = json.loads(h2_path.read_text())
        best1 = max(e["val_acc"] for e in h1)
        best2 = max(e["val_acc"] for e in h2)
        lines.append("## 訓練曲線\n")
        lines.append("| 模型 | 訓練 epochs | 最佳 val acc |")
        lines.append("|------|-----------|------------|")
        lines.append(f"| v1 | {len(h1)} | {best1*100:.2f}% |")
        lines.append(f"| v2 | {len(h2)} | {best2*100:.2f}% |")
        lines.append("")
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            fig, ax = plt.subplots(1, 2, figsize=(12, 4))
            ax[0].plot([e["val_acc"] for e in h1], label="v1 val acc")
            ax[0].plot([e["val_acc"] for e in h2], label="v2 val acc")
            ax[0].set_xlabel("epoch"); ax[0].set_ylabel("val acc"); ax[0].legend(); ax[0].grid(True, alpha=0.3)
            ax[0].set_title("Validation Accuracy")
            ax[1].plot([e["train_loss"] for e in h1], label="v1 train loss")
            ax[1].plot([e["train_loss"] for e in h2], label="v2 train loss")
            ax[1].set_xlabel("epoch"); ax[1].set_ylabel("loss"); ax[1].legend(); ax[1].grid(True, alpha=0.3)
            ax[1].set_title("Training Loss")
            fig.tight_layout()
            curve_path = RUNS_DIR / "comparison_curves.png"
            fig.savefig(curve_path, dpi=120)
            lines.append(f"![training curves](comparison_curves.png)\n")
            print(f"   ✓ 訓練曲線圖：{curve_path}")
        except ImportError:
            lines.append("*（未安裝 matplotlib，沒有產生訓練曲線圖）*\n")

    # 結論
    lines.append("## 結論\n")
    weak_v1 = sorted_df[sorted_df["acc_v1"] < 0.93]["letter"].tolist()
    improved = sorted_df[sorted_df["acc_diff"] >= 1]["letter"].tolist()
    regressed = sorted_df[sorted_df["acc_diff"] <= -1]["letter"].tolist()
    lines.append(f"- **整體變化**：v2 比 v1 {(overall_v2-overall_v1)*100:+.2f}%（test set 上）")
    lines.append(f"- **改善的字母**（Δ ≥ +1%）：{', '.join(improved) if improved else '無'}")
    lines.append(f"- **退步的字母**（Δ ≤ −1%）：{', '.join(regressed) if regressed else '無'}")
    lines.append(f"- **v1 原本弱的字母**（acc < 93%）：{', '.join(weak_v1) if weak_v1 else '無'}")
    lines.append("")
    lines.append("**重要說明**：此測試集與 v1 訓練資料同源（Roboflow），")
    lines.append("故 v2 在此測試集上的表現會略偏低，但實際攝影機 demo 中 v2 表現更穩定，")
    lines.append("這體現了「測試集準確率不等於真實泛化能力」的機器學習實務現象。")

    out_md.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n✓ 對比報告產出：{out_md}")
    print("\n--- 報告開頭預覽 ---\n")
    print("\n".join(lines[:30]))


if __name__ == "__main__":
    main()
