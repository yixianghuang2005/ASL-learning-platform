"""
merge_landmarks.py
==================
合併多個 landmark CSV 成一個訓練檔。
預設合併 landmarks_train.csv + landmarks_train_data2.csv → landmarks_train_merged.csv

valid / test 維持原本不變，這樣才能跟舊模型做公平比較。

使用：
    python merge_landmarks.py
    python merge_landmarks.py --inputs landmarks_train.csv landmarks_train_data2.csv --output landmarks_train_merged.csv
"""
from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

import pandas as pd


SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / "data"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inputs", nargs="+",
                    default=["landmarks_train.csv", "landmarks_train_data2.csv"])
    ap.add_argument("--output", default="landmarks_train_merged.csv")
    args = ap.parse_args()

    dfs = []
    for name in args.inputs:
        p = DATA_DIR / name
        if not p.exists():
            print(f"[!] 找不到 {p}，跳過")
            continue
        df = pd.read_csv(p)
        print(f"  讀入 {name}: {len(df)} 筆")
        print(f"      類別: {sorted(df['label'].unique().tolist())}")
        dfs.append(df)

    if not dfs:
        print("[!] 沒有任何輸入檔可合併")
        return

    merged = pd.concat(dfs, ignore_index=True)
    # 隨機打亂
    merged = merged.sample(frac=1, random_state=42).reset_index(drop=True)

    out_path = DATA_DIR / args.output
    merged.to_csv(out_path, index=False)

    print(f"\n=== 合併完成 ===")
    print(f"  輸出: {out_path}")
    print(f"  總筆數: {len(merged)}")
    print(f"  類別 ({len(merged['label'].unique())}):")
    for lbl, cnt in sorted(Counter(merged['label']).items()):
        print(f"    {lbl}: {cnt}")


if __name__ == "__main__":
    main()
