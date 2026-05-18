"""
extract_landmarks_folders.py
============================
針對「資料夾名稱 = 標籤」結構的資料集抽 landmark。
例如：
    SigNN Character Database/
    ├── A/  1.jpg, 2.jpg, ...
    ├── B/  ...
    └── Y/  ...

沒有 YOLO label 檔，直接餵整張圖給 MediaPipe。

使用：
    python extract_landmarks_folders.py --dataset "C:\\Users\\alan2\\OneDrive\\Desktop\\data2\\SigNN Character Database" --out landmarks_train_signn.csv
    python extract_landmarks_folders.py --dataset ... --out ... --limit 200    # 小樣本測試
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import cv2
import numpy as np

try:
    import mediapipe as mp
except ImportError:
    print("[!] 需要 mediapipe", file=sys.stderr); sys.exit(1)


SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR.parent / "data"

EXCLUDED = {"J", "Z", "nothing", "del", "space"}


def make_hands_detector():
    return mp.solutions.hands.Hands(
        static_image_mode=True,
        max_num_hands=1,
        min_detection_confidence=0.3,
        model_complexity=1,
    )


def normalize_landmarks(landmarks):
    pts = np.array([(lm.x, lm.y, lm.z) for lm in landmarks], dtype=np.float64)
    pts -= pts[0]
    scale = np.linalg.norm(pts[9])
    if scale < 1e-6:
        return None
    return (pts / scale).flatten().tolist()


def process(dataset_dir: Path, out_csv: Path, limit_per_class: int | None = None) -> dict:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    failed_csv = out_csv.with_name(out_csv.stem.replace("landmarks_", "failed_") + ".csv")

    detector = make_hands_detector()
    header = ["label"] + [f"{a}{i}" for i in range(21) for a in ("x", "y", "z")]

    n_total = n_ok = n_excluded = n_no_hand = 0
    per_class_ok: dict[str, int] = {}
    failures = []

    # 找出所有字母資料夾
    letter_dirs = sorted([d for d in dataset_dir.iterdir() if d.is_dir()])
    print(f"找到 {len(letter_dirs)} 個字母資料夾: {[d.name for d in letter_dirs]}")

    with out_csv.open("w", newline="", encoding="utf-8") as f_out:
        writer = csv.writer(f_out)
        writer.writerow(header)

        for letter_dir in letter_dirs:
            letter = letter_dir.name
            if letter in EXCLUDED:
                n_excluded += 1
                continue

            images = sorted(letter_dir.glob("*.jpg")) + sorted(letter_dir.glob("*.png"))
            if limit_per_class:
                images = images[:limit_per_class]

            n_in_class = 0
            for img_path in images:
                n_total += 1
                image = cv2.imread(str(img_path))
                if image is None:
                    failures.append((f"{letter}/{img_path.name}", "cv2_read_failed"))
                    continue

                rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                result = detector.process(rgb)

                if not result.multi_hand_landmarks:
                    n_no_hand += 1
                    failures.append((f"{letter}/{img_path.name}", f"no_hand_detected({letter})"))
                    continue

                feat = normalize_landmarks(result.multi_hand_landmarks[0].landmark)
                if feat is None:
                    failures.append((f"{letter}/{img_path.name}", "degenerate_scale"))
                    continue

                writer.writerow([letter] + feat)
                n_ok += 1
                n_in_class += 1

            per_class_ok[letter] = n_in_class
            print(f"  {letter}: {n_in_class}/{len(images)} ({n_in_class/max(1,len(images))*100:.1f}%)")

    if failures:
        with failed_csv.open("w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows([("filename", "reason"), *failures])

    detector.close()

    print(f"\n=== 總結 ===")
    print(f"  total={n_total}  ok={n_ok}  no_hand={n_no_hand}")
    print(f"  整體偵測率: {n_ok / max(1, n_total) * 100:.1f}%")
    print(f"  輸出: {out_csv}")
    return {"total": n_total, "ok": n_ok, "per_class": per_class_ok}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--out", default="landmarks_train_signn.csv")
    ap.add_argument("--limit", type=int, default=None,
                    help="每個字母最多處理幾張（測試用）")
    args = ap.parse_args()

    dataset_dir = Path(args.dataset).resolve()
    if not dataset_dir.exists():
        print(f"[!] 找不到 {dataset_dir}"); sys.exit(1)

    out_path = OUTPUT_DIR / args.out
    print(f"資料集: {dataset_dir}")
    print(f"輸出  : {out_path}")
    if args.limit:
        print(f"限制  : 每個字母最多 {args.limit} 張")
    print()
    process(dataset_dir, out_path, args.limit)


if __name__ == "__main__":
    main()
