"""
merge_sequences.py
==================
合併多個 .npz 序列資料集（例如 WLASL + ASL Citizen），
輸出統一的 merged_sequences.npz 供 train_words_mlp.py 使用。

限制：所有輸入 .npz 必須有相同的 classes 清單（順序可以不同，會自動對齊）。

使用：
    python merge_sequences.py
    python merge_sequences.py --inputs wlasl_words_sequences.npz aslcitizen_sequences.npz
    python merge_sequences.py --output my_merged.npz
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR   = SCRIPT_DIR.parent / "data"

DEFAULT_INPUTS = [
    DATA_DIR / "wlasl_words_sequences.npz",
    DATA_DIR / "aslcitizen_sequences.npz",
]


def load_npz(path: Path) -> dict:
    data = np.load(path, allow_pickle=True)
    classes      = list(data["classes"])
    seq_len      = int(data["sequence_length"])
    input_dim    = int(data["input_dim"])
    return {
        "classes":   classes,
        "seq_len":   seq_len,
        "input_dim": input_dim,
        "X_train": data["X_train"], "y_train": data["y_train"],
        "X_valid": data["X_valid"], "y_valid": data["y_valid"],
        "X_test":  data["X_test"],  "y_test":  data["y_test"],
    }


def remap_labels(y: np.ndarray, src_classes: list[str], dst_classes: list[str]) -> np.ndarray:
    """把 y 中以 src_classes 索引的標籤，轉換成 dst_classes 的索引。"""
    mapping = {}
    for i, c in enumerate(src_classes):
        if c in dst_classes:
            mapping[i] = dst_classes.index(c)
    out = np.full_like(y, -1)
    for src_idx, dst_idx in mapping.items():
        out[y == src_idx] = dst_idx
    return out


def merge(inputs: list[Path], output: Path) -> None:
    datasets = []
    for p in inputs:
        if not p.exists():
            print(f"[skip] 找不到 {p}"); continue
        d = load_npz(p)
        print(f"載入 {p.name}: train={len(d['X_train'])}  valid={len(d['X_valid'])}  test={len(d['X_test'])}  classes={d['classes']}")
        datasets.append(d)

    if not datasets:
        print("[!] 沒有任何可用資料集"); return

    if len(datasets) == 1:
        print("只有一個資料集，直接複製。")
        d = datasets[0]
        np.savez_compressed(output, **{
            "classes": np.array(d["classes"]),
            "sequence_length": np.array(d["seq_len"]),
            "input_dim": np.array(d["input_dim"]),
            "X_train": d["X_train"], "y_train": d["y_train"],
            "X_valid": d["X_valid"], "y_valid": d["y_valid"],
            "X_test":  d["X_test"],  "y_test":  d["y_test"],
        })
        print(f"輸出: {output}"); return

    # 以第一個資料集的 classes 為基準
    ref_classes = datasets[0]["classes"]
    seq_len     = datasets[0]["seq_len"]
    input_dim   = datasets[0]["input_dim"]

    # 確認所有資料集 classes 一致（允許順序不同）
    for d in datasets[1:]:
        extra   = set(d["classes"]) - set(ref_classes)
        missing = set(ref_classes) - set(d["classes"])
        if extra:
            print(f"[warn] 有額外類別（將被忽略）: {extra}")
        if missing:
            print(f"[warn] 有缺少類別（該資料集無此類別）: {missing}")

    buckets = {split: {"X": [], "y": []} for split in ("train", "valid", "test")}

    for d in datasets:
        for split in ("train", "valid", "test"):
            X = d[f"X_{split}"]
            y = d[f"y_{split}"]
            if len(X) == 0:
                continue
            # 對齊類別索引
            y_mapped = remap_labels(y, d["classes"], ref_classes)
            valid_mask = y_mapped >= 0
            if not valid_mask.all():
                print(f"  [warn] {split}: 有 {(~valid_mask).sum()} 筆因類別不符被過濾")
            buckets[split]["X"].append(X[valid_mask])
            buckets[split]["y"].append(y_mapped[valid_mask])

    arrays = {
        "classes":         np.array(ref_classes),
        "sequence_length": np.array(seq_len),
        "input_dim":       np.array(input_dim),
    }
    print("\n合併後：")
    for split in ("train", "valid", "test"):
        if buckets[split]["X"]:
            X_merged = np.concatenate(buckets[split]["X"]).astype(np.float32)
            y_merged = np.concatenate(buckets[split]["y"]).astype(np.int64)
        else:
            X_merged = np.zeros((0, seq_len, input_dim), dtype=np.float32)
            y_merged = np.zeros((0,), dtype=np.int64)
        arrays[f"X_{split}"] = X_merged
        arrays[f"y_{split}"] = y_merged
        print(f"  {split}: {len(X_merged)} 筆")

    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output, **arrays)
    print(f"\n輸出: {output}")
    print(f"classes: {ref_classes}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inputs", nargs="+", type=Path, default=DEFAULT_INPUTS,
                    help="要合併的 .npz 路徑（可多個）")
    ap.add_argument("--output", type=Path, default=DATA_DIR / "merged_sequences.npz")
    args = ap.parse_args()
    merge(args.inputs, args.output)


if __name__ == "__main__":
    main()
