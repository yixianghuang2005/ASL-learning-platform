"""
prepare_aslcitizen_subset.py
============================
讀取 ASL Citizen 的 splits/{train,val,test}.csv，篩出目標詞彙，
輸出與 prepare_wlasl_subset.py 完全相同格式的 manifest JSON。

ASL Citizen 目錄結構：
    ASL_Citizen/
    ├── splits/
    │   ├── train.csv
    │   ├── val.csv
    │   └── test.csv
    └── videos/

使用：
    python prepare_aslcitizen_subset.py --dataset "C:\\data\\ASL_Citizen\\ASL_Citizen"
    python prepare_aslcitizen_subset.py --dataset "C:\\data\\ASL_Citizen\\ASL_Citizen" --words "hello,thankyou,yes"
    python prepare_aslcitizen_subset.py --dataset "C:\\data\\ASL_Citizen\\ASL_Citizen" --inspect
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
POSE_DIR   = SCRIPT_DIR.parent
DATA_DIR   = POSE_DIR / "data"

DEFAULT_WORDS = [
    "hello", "thankyou", "please", "sorry", "help",
    "yes", "no", "want1", "like", "more",
]

VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi"}


def find_videos_dir(dataset_dir: Path) -> Path:
    for name in ["videos", "video", "clips"]:
        d = dataset_dir / name
        if d.is_dir():
            return d
    return dataset_dir


def build_video_index(videos_dir: Path) -> dict[str, Path]:
    index: dict[str, Path] = {}
    for p in videos_dir.rglob("*"):
        if p.is_file() and p.suffix.lower() in VIDEO_EXTS:
            index[p.stem] = p
            index[p.name] = p
    return index


def load_splits(dataset_dir: Path) -> pd.DataFrame:
    splits_dir = dataset_dir / "splits"
    if not splits_dir.exists():
        print(f"[!] 找不到 splits/ 目錄於 {dataset_dir}", file=sys.stderr)
        sys.exit(1)

    frames = []
    for split_name in ["train", "val", "test"]:
        csv_path = splits_dir / f"{split_name}.csv"
        if not csv_path.exists():
            print(f"[warn] 找不到 {csv_path.name}，跳過")
            continue
        df = pd.read_csv(csv_path)
        # normalise split name: val → valid
        df["_split"] = "valid" if split_name == "val" else split_name
        frames.append(df)

    if not frames:
        print("[!] splits/ 內沒有任何 CSV", file=sys.stderr)
        sys.exit(1)

    return pd.concat(frames, ignore_index=True)


def inspect_dataset(dataset_dir: Path) -> None:
    df = load_splits(dataset_dir)
    print(f"欄位: {list(df.columns)}")
    print(f"總行數: {len(df)}")
    if "Gloss" in df.columns:
        glosses = df["Gloss"].str.lower().str.strip().unique()
        print(f"唯一詞彙數: {len(glosses)}")
        print(f"前 20 詞: {sorted(glosses)[:20]}")
    print(f"Split 分布: {dict(df['_split'].value_counts())}")


def build_manifest(
    dataset_dir: Path,
    words: list[str],
    output: Path,
    max_per_word: int = 0,
    seq_len: int = 30,
) -> dict:
    df = load_splits(dataset_dir)

    # 欄位名稱
    col_video  = next((c for c in ["Video file", "video_file", "video"] if c in df.columns), None)
    col_gloss  = next((c for c in ["Gloss", "gloss", "label"] if c in df.columns), None)
    col_signer = next((c for c in ["Participant ID", "Participant", "participant"] if c in df.columns), None)

    if not col_gloss or not col_video:
        print(f"[!] 找不到必要欄位，現有: {list(df.columns)}", file=sys.stderr)
        sys.exit(1)

    df["_gloss_norm"] = df[col_gloss].str.lower().str.strip()

    videos_dir  = find_videos_dir(dataset_dir)
    video_index = build_video_index(videos_dir)
    print(f"影片目錄: {videos_dir}  （索引 {len(video_index)} 個檔案）")

    wanted  = set(words)
    grouped = defaultdict(list)

    for _, row in df.iterrows():
        gloss = row["_gloss_norm"]
        if gloss not in wanted:
            continue
        video_key  = str(row[col_video]).strip()
        video_path = video_index.get(video_key) or video_index.get(Path(video_key).stem)
        signer     = str(row[col_signer]).strip() if col_signer else ""
        grouped[gloss].append({
            "word":        gloss,
            "split":       row["_split"],
            "video_id":    video_key,
            "video_path":  str(video_path) if video_path else None,
            "frame_start": 1,
            "frame_end":   -1,
            "url":         None,
            "bbox":        None,
            "signer_id":   signer,
        })

    items: list[dict] = []
    for word in words:
        candidates = grouped.get(word, [])
        candidates.sort(key=lambda x: (x["split"], x["video_id"]))
        if max_per_word:
            candidates = candidates[:max_per_word]
        items.extend(candidates)

    split_counts   = Counter(i["split"]  for i in items)
    word_counts    = Counter(i["word"]   for i in items)
    missing_videos = sum(1 for i in items if not i["video_path"])

    manifest = {
        "dataset":         "ASL_Citizen",
        "words":           words,
        "source_metadata": str(dataset_dir / "splits"),
        "videos_dir":      str(videos_dir),
        "sequence_length": seq_len,
        "input_dim":       136,
        "items":           items,
        "stats": {
            "total_items":    len(items),
            "missing_videos": missing_videos,
            "split_counts":   dict(split_counts),
            "word_counts":    dict(word_counts),
        },
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nManifest written: {output}")
    print(json.dumps(manifest["stats"], ensure_ascii=False, indent=2))

    print("\n各詞可用影片：")
    for word in words:
        avail   = sum(1 for i in items if i["word"] == word and i["video_path"])
        missing = sum(1 for i in items if i["word"] == word and not i["video_path"])
        print(f"  {word:<12} 可用 {avail:3d}  缺少 {missing:3d}")

    return manifest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset",      required=True, type=Path)
    ap.add_argument("--output",       type=Path, default=DATA_DIR / "aslcitizen_manifest.json")
    ap.add_argument("--words",        type=str, default=None)
    ap.add_argument("--max-per-word", type=int, default=0)
    ap.add_argument("--seq-len",      type=int, default=30)
    ap.add_argument("--inspect",      action="store_true")
    args = ap.parse_args()

    dataset_dir = args.dataset.resolve()
    if not dataset_dir.exists():
        print(f"[!] 找不到 {dataset_dir}"); sys.exit(1)

    if args.inspect:
        inspect_dataset(dataset_dir); return

    words = [w.strip().lower() for w in args.words.split(",")] \
            if args.words else DEFAULT_WORDS

    build_manifest(dataset_dir, words, args.output, args.max_per_word, args.seq_len)


if __name__ == "__main__":
    main()
