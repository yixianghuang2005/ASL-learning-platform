"""
prepare_kaggle_dataset.py  (v2 - vectorized, fast)
====================================================
把 Kaggle Google ASL Signs parquet 轉成 225 維 npz。

Usage:
  python prepare_kaggle_dataset.py
      --data_dir  C:/data/kaggle_asl
      --out_npz   kaggle_sequences_250words.npz
      --seq_len   30
      --words     ""   (空 = 全部 250 詞)
"""

import argparse, sys, time
import numpy as np
import pandas as pd
from pathlib import Path

POSE_N  = 33
HAND_N  = 21
SEQ_LEN = 30
DIM     = POSE_N*3 + HAND_N*3 + HAND_N*3  # 225

def log(msg):
    print(msg, flush=True)

def parquet_to_sequence(path, seq_len):
    """回傳 (seq_len, 225) float32，失敗回傳 None。向量化版本。"""
    try:
        df = pd.read_parquet(path)
    except Exception:
        return None

    frames = sorted(df['frame'].unique())
    if not frames:
        return None

    result = np.zeros((len(frames), DIM), dtype=np.float32)

    for fi, fid in enumerate(frames):
        fdf = df[df['frame'] == fid]

        def get_xyz(ltype, n):
            sub = fdf[fdf['type'] == ltype][['landmark_index','x','y','z']]
            arr = np.zeros((n, 3), dtype=np.float32)
            if not sub.empty:
                idx = sub['landmark_index'].values.clip(0, n-1).astype(int)
                arr[idx, 0] = sub['x'].values
                arr[idx, 1] = sub['y'].values
                arr[idx, 2] = sub['z'].values
            return arr

        pose  = get_xyz('pose',       POSE_N)
        lhand = get_xyz('left_hand',  HAND_N)
        rhand = get_xyz('right_hand', HAND_N)

        # 正規化 pose
        ls, rs = pose[11], pose[12]
        center = (ls + rs) / 2.0
        scale  = np.linalg.norm(ls - rs) + 1e-6
        pose_n = (pose - center) / scale

        # 正規化 hand
        def norm_hand(h):
            wrist = h[0]; ref = h[9]
            s = np.linalg.norm(ref - wrist) + 1e-6
            return (h - wrist) / s

        lhand_n = norm_hand(lhand)
        rhand_n = norm_hand(rhand)

        result[fi] = np.concatenate([pose_n.flatten(), lhand_n.flatten(), rhand_n.flatten()])

    # 均勻取樣 or zero-pad 到 seq_len
    n = len(result)
    if n >= seq_len:
        idx = np.linspace(0, n-1, seq_len, dtype=int)
        result = result[idx]
    else:
        pad = np.zeros((seq_len - n, DIM), dtype=np.float32)
        result = np.vstack([result, pad])

    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data_dir', default=r'C:\data\kaggle_asl')
    parser.add_argument('--out_npz',  default='kaggle_sequences_250words.npz')
    parser.add_argument('--seq_len',  type=int, default=SEQ_LEN)
    parser.add_argument('--words',    default='')
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    df = pd.read_csv(data_dir / 'train.csv')
    log(f"train.csv: {len(df)} 筆，{df['sign'].nunique()} 詞")

    if args.words:
        targets = [w.strip().lower() for w in args.words.split(',')]
        df = df[df['sign'].str.lower().isin(targets)]
        log(f"過濾後: {len(df)} 筆")

    classes  = sorted(df['sign'].unique().tolist())
    label_map = {c: i for i, c in enumerate(classes)}
    log(f"類別數: {len(classes)}")

    X, y   = [], []
    total  = len(df)
    done   = 0
    t0     = time.time()

    for sign, grp in df.groupby('sign'):
        ok = 0
        for _, row in grp.iterrows():
            pq_path = data_dir / row['path']
            seq = parquet_to_sequence(str(pq_path), args.seq_len)
            if seq is not None:
                X.append(seq)
                y.append(label_map[sign])
                ok += 1
            done += 1

        elapsed = time.time() - t0
        speed   = done / elapsed if elapsed > 0 else 0
        remain  = (total - done) / speed if speed > 0 else 0
        log(f"  [{done}/{total}] {sign}: {ok} 筆 | {speed:.0f} 筆/s | 剩餘 {remain/60:.1f} 分鐘")

    X = np.array(X, dtype=np.float32)
    y = np.array(y, dtype=np.int64)
    log(f"\nX: {X.shape}, y: {y.shape}")

    out = Path(args.out_npz)
    if not out.is_absolute():
        out = Path(__file__).parent.parent / 'data' / out

    np.savez(out, X=X, y=y, classes=np.array(classes))
    log(f"儲存完成: {out}")


if __name__ == '__main__':
    main()
