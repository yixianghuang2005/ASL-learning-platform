"""
extract_landmarks.py
====================
從 Roboflow YOLO 格式的 ASL 資料集，用 MediaPipe Hands 抽出 21 個手部關節點，
做手腕原點 + 中指掌骨尺度正規化，輸出 CSV 給 MLP 分類器訓練。

預設排除 J、Z 兩個動態字母（landmark 看不出軌跡）。

使用：
    python extract_landmarks.py --split train
    python extract_landmarks.py --split valid
    python extract_landmarks.py --split test
    或：
    python extract_landmarks.py --all
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

import cv2
import numpy as np

try:
    import mediapipe as mp
except ImportError:
    print("[!] 需要 mediapipe，請執行：pip install mediapipe", file=sys.stderr)
    sys.exit(1)


# --- 設定 -----------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent  # ai-backend/
DATASET_DIR = PROJECT_ROOT / "dataset" / "asl-alphabet"
OUTPUT_DIR = SCRIPT_DIR.parent / "data"  # pose_recognition/data/

# data.yaml 中的類別順序（27 類）
CLASS_NAMES = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "nothing",
]

# 預設排除：J、Z 是動態字母，靜態 landmark 無法區分
EXCLUDED = {"J", "Z"}


# --- MediaPipe 初始化 -----------------------------------------------------
def make_hands_detector():
    mp_hands = mp.solutions.hands
    return mp_hands.Hands(
        static_image_mode=True,
        max_num_hands=1,
        min_detection_confidence=0.3,  # 寬鬆一點，提高偵測率
        model_complexity=1,
    )


# --- 工具 -----------------------------------------------------------------
def parse_label_file(label_path: Path) -> tuple[int, tuple[float, float, float, float]] | None:
    """讀 YOLO 標註：class x_center y_center w h（normalized）。回傳第一個 bbox。"""
    if not label_path.exists():
        return None
    with label_path.open("r", encoding="utf-8") as f:
        line = f.readline().strip()
    if not line:
        return None
    parts = line.split()
    if len(parts) < 5:
        return None
    cls_id = int(parts[0])
    cx, cy, w, h = map(float, parts[1:5])
    return cls_id, (cx, cy, w, h)


def crop_with_bbox(image: np.ndarray, bbox: tuple[float, float, float, float], pad: float = 0.15) -> np.ndarray:
    """根據 YOLO normalized bbox 裁剪（多留 pad 比例做緩衝），讓 MediaPipe 更容易偵測。"""
    H, W = image.shape[:2]
    cx, cy, w, h = bbox
    x1 = max(0, int((cx - w / 2 - pad * w) * W))
    y1 = max(0, int((cy - h / 2 - pad * h) * H))
    x2 = min(W, int((cx + w / 2 + pad * w) * W))
    y2 = min(H, int((cy + h / 2 + pad * h) * H))
    if x2 <= x1 or y2 <= y1:
        return image
    return image[y1:y2, x1:x2]


def normalize_landmarks(landmarks) -> list[float] | None:
    """以手腕(0)為原點，以手腕->中指掌骨(9)的距離為尺度做正規化。回傳 63 維特徵。"""
    pts = np.array([(lm.x, lm.y, lm.z) for lm in landmarks], dtype=np.float64)  # (21, 3)
    wrist = pts[0].copy()
    pts -= wrist  # 平移到原點
    scale = np.linalg.norm(pts[9])  # 中指掌骨到手腕的歐氏距離
    if scale < 1e-6:
        return None
    pts /= scale
    return pts.flatten().tolist()


def filename_to_letter(name: str) -> str | None:
    """檔名前綴就是字母，例如 A0005_*.jpg -> 'A'，nothing0001_*.jpg -> 'nothing'。"""
    base = name.split("_")[0]
    if base.startswith("nothing"):
        return "nothing"
    if len(base) >= 1 and base[0].isalpha() and base[0].isupper():
        return base[0]
    return None


# --- 主流程 ---------------------------------------------------------------
def process_split(split: str, limit: int | None = None) -> dict:
    """處理一個 split (train/valid/test)，回傳統計。"""
    images_dir = DATASET_DIR / split / "images"
    labels_dir = DATASET_DIR / split / "labels"
    if not images_dir.exists():
        print(f"[!] 找不到 {images_dir}", file=sys.stderr)
        return {}

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_csv = OUTPUT_DIR / f"landmarks_{split}.csv"
    failed_csv = OUTPUT_DIR / f"failed_{split}.csv"

    detector = make_hands_detector()

    header = ["label"] + [f"{axis}{i}" for i in range(21) for axis in ("x", "y", "z")]

    n_total = 0
    n_excluded = 0
    n_no_hand = 0
    n_ok = 0
    failures: list[tuple[str, str]] = []  # (filename, reason)

    image_files = sorted(images_dir.glob("*.jpg")) + sorted(images_dir.glob("*.png"))
    if limit is not None:
        image_files = image_files[:limit]

    with out_csv.open("w", newline="", encoding="utf-8") as f_out:
        writer = csv.writer(f_out)
        writer.writerow(header)

        for idx, img_path in enumerate(image_files, 1):
            n_total += 1
            letter = filename_to_letter(img_path.name)
            if letter is None:
                failures.append((img_path.name, "unknown_label"))
                continue
            if letter in EXCLUDED:
                n_excluded += 1
                continue

            image = cv2.imread(str(img_path))
            if image is None:
                failures.append((img_path.name, "cv2_read_failed"))
                continue

            # 先用 YOLO bbox 裁剪手部區域（如果有 label 檔）
            label_path = labels_dir / (img_path.stem + ".txt")
            parsed = parse_label_file(label_path)
            if parsed is not None:
                _, bbox = parsed
                crop = crop_with_bbox(image, bbox, pad=0.20)
            else:
                crop = image

            # MediaPipe 是 RGB 輸入
            rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            result = detector.process(rgb)

            if not result.multi_hand_landmarks:
                # 第二次嘗試：用整張圖
                if parsed is not None:
                    rgb_full = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                    result = detector.process(rgb_full)
                if not result.multi_hand_landmarks:
                    n_no_hand += 1
                    failures.append((img_path.name, f"no_hand_detected({letter})"))
                    continue

            features = normalize_landmarks(result.multi_hand_landmarks[0].landmark)
            if features is None:
                failures.append((img_path.name, "degenerate_scale"))
                continue

            writer.writerow([letter] + features)
            n_ok += 1

            if idx % 500 == 0:
                print(f"  ...{split}: {idx}/{len(image_files)} processed, ok={n_ok}")

    # 寫失敗清單
    if failures:
        with failed_csv.open("w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows([("filename", "reason"), *failures])

    detector.close()

    stats = {
        "split": split,
        "total": n_total,
        "ok": n_ok,
        "excluded_JZ": n_excluded,
        "no_hand": n_no_hand,
        "other_failed": len(failures) - n_no_hand,
        "output": str(out_csv),
    }
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", choices=["train", "valid", "test"], default=None)
    ap.add_argument("--all", action="store_true", help="處理所有 split")
    ap.add_argument("--limit", type=int, default=None, help="只處理前 N 張（除錯用）")
    args = ap.parse_args()

    splits = ["train", "valid", "test"] if args.all else ([args.split] if args.split else ["train"])

    print(f"資料集目錄：{DATASET_DIR}")
    print(f"輸出目錄  ：{OUTPUT_DIR}")
    print(f"排除類別  ：{sorted(EXCLUDED)}")
    print()

    all_stats = []
    for s in splits:
        print(f">> 處理 {s} ...")
        stats = process_split(s, limit=args.limit)
        all_stats.append(stats)
        print(f"   完成：{stats}")
        print()

    # 印出總結
    print("=" * 60)
    print("總結：")
    for s in all_stats:
        if not s:
            continue
        det_rate = s["ok"] / max(1, s["total"] - s["excluded_JZ"]) * 100
        print(
            f"  {s['split']:5s}  total={s['total']:5d}  ok={s['ok']:5d}  "
            f"excluded(J/Z)={s['excluded_JZ']:4d}  no_hand={s['no_hand']:4d}  "
            f"偵測率={det_rate:.1f}%"
        )


if __name__ == "__main__":
    main()
