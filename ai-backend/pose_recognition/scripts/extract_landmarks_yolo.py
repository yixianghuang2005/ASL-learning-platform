"""
extract_landmarks_yolo.py
=========================
通用 YOLO 格式 landmark 抽取器。和 extract_landmarks.py 不同，這個版本是用：
- data.yaml 取得類別名稱清單
- label 檔（.txt）的 class id 取得實際類別（不依賴檔名）

所以可以用在任何 Roboflow / 標準 YOLO 結構的資料集。

預設排除 J、Z（動態字母）以及 'nothing'。

使用：
    python extract_landmarks_yolo.py --dataset "C:\\Users\\alan2\\OneDrive\\Desktop\\data2" --split train --out-suffix _data2
    python extract_landmarks_yolo.py --dataset ... --all --out-suffix _data2

輸出：
    pose_recognition/data/landmarks_train_data2.csv
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

try:
    import yaml
except ImportError:
    print("[!] 需要 pyyaml: pip install pyyaml", file=sys.stderr); sys.exit(1)


SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR.parent / "data"

EXCLUDED = {"J", "Z", "nothing", "del", "space"}  # 排除非靜態 / 非字母


def load_class_names(dataset_dir: Path) -> list[str]:
    yaml_path = dataset_dir / "data.yaml"
    if not yaml_path.exists():
        raise FileNotFoundError(f"找不到 {yaml_path}")
    cfg = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
    names = cfg.get("names")
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names.keys())]
    return names


def make_hands_detector():
    return mp.solutions.hands.Hands(
        static_image_mode=True,
        max_num_hands=1,
        min_detection_confidence=0.3,
        model_complexity=1,
    )


def parse_label_file(label_path: Path):
    if not label_path.exists():
        return None
    line = label_path.read_text(encoding="utf-8").strip().split("\n")[0]
    parts = line.split()
    if len(parts) < 5:
        return None
    return int(parts[0]), tuple(map(float, parts[1:5]))


def crop_with_bbox(image: np.ndarray, bbox, pad=0.20) -> np.ndarray:
    H, W = image.shape[:2]
    cx, cy, w, h = bbox
    x1 = max(0, int((cx - w/2 - pad*w) * W))
    y1 = max(0, int((cy - h/2 - pad*h) * H))
    x2 = min(W, int((cx + w/2 + pad*w) * W))
    y2 = min(H, int((cy + h/2 + pad*h) * H))
    if x2 <= x1 or y2 <= y1:
        return image
    return image[y1:y2, x1:x2]


def normalize_landmarks(landmarks):
    pts = np.array([(lm.x, lm.y, lm.z) for lm in landmarks], dtype=np.float64)
    pts -= pts[0]
    scale = np.linalg.norm(pts[9])
    if scale < 1e-6:
        return None
    return (pts / scale).flatten().tolist()


def process_split(dataset_dir: Path, class_names: list[str], split: str,
                   out_suffix: str, limit: int | None = None) -> dict:
    images_dir = dataset_dir / split / "images"
    labels_dir = dataset_dir / split / "labels"
    if not images_dir.exists():
        print(f"[!] 略過 {split}（找不到 {images_dir}）")
        return {}

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_csv = OUTPUT_DIR / f"landmarks_{split}{out_suffix}.csv"
    failed_csv = OUTPUT_DIR / f"failed_{split}{out_suffix}.csv"

    detector = make_hands_detector()
    header = ["label"] + [f"{a}{i}" for i in range(21) for a in ("x", "y", "z")]

    image_files = sorted(images_dir.glob("*.jpg")) + sorted(images_dir.glob("*.png"))
    if limit is not None:
        image_files = image_files[:limit]

    n_total = n_ok = n_excluded = n_no_hand = 0
    failures = []

    with out_csv.open("w", newline="", encoding="utf-8") as f_out:
        writer = csv.writer(f_out)
        writer.writerow(header)

        for idx, img_path in enumerate(image_files, 1):
            n_total += 1
            label_path = labels_dir / (img_path.stem + ".txt")
            parsed = parse_label_file(label_path)
            if parsed is None:
                failures.append((img_path.name, "no_label"))
                continue
            cls_id, bbox = parsed
            if cls_id >= len(class_names):
                failures.append((img_path.name, f"bad_class_id({cls_id})"))
                continue
            letter = class_names[cls_id]
            if letter in EXCLUDED:
                n_excluded += 1
                continue

            image = cv2.imread(str(img_path))
            if image is None:
                failures.append((img_path.name, "cv2_read_failed"))
                continue

            crop = crop_with_bbox(image, bbox, pad=0.20)
            rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            result = detector.process(rgb)

            if not result.multi_hand_landmarks:
                # 再用整張圖試一次
                rgb_full = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                result = detector.process(rgb_full)
                if not result.multi_hand_landmarks:
                    n_no_hand += 1
                    failures.append((img_path.name, f"no_hand_detected({letter})"))
                    continue

            feat = normalize_landmarks(result.multi_hand_landmarks[0].landmark)
            if feat is None:
                failures.append((img_path.name, "degenerate_scale"))
                continue

            writer.writerow([letter] + feat)
            n_ok += 1

            if idx % 500 == 0:
                print(f"  ...{split}{out_suffix}: {idx}/{len(image_files)} processed, ok={n_ok}")

    if failures:
        with failed_csv.open("w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows([("filename", "reason"), *failures])

    detector.close()

    return {
        "split": split,
        "total": n_total,
        "ok": n_ok,
        "excluded": n_excluded,
        "no_hand": n_no_hand,
        "output": str(out_csv),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, help="資料集根目錄（含 data.yaml）")
    ap.add_argument("--split", choices=["train", "valid", "test"], default=None)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out-suffix", default="_data2", help="輸出 CSV 後綴，預設 _data2")
    args = ap.parse_args()

    dataset_dir = Path(args.dataset).resolve()
    class_names = load_class_names(dataset_dir)

    print(f"資料集    ：{dataset_dir}")
    print(f"類別 ({len(class_names)})：{class_names}")
    print(f"排除類別  ：{sorted(EXCLUDED)}")
    print(f"輸出後綴  ：{args.out_suffix}")
    print()

    splits = ["train", "valid", "test"] if args.all else ([args.split] if args.split else ["train"])

    all_stats = []
    for s in splits:
        print(f">> 處理 {s} ...")
        stats = process_split(dataset_dir, class_names, s, args.out_suffix, limit=args.limit)
        all_stats.append(stats)
        print(f"   完成：{stats}")
        print()

    print("=" * 60)
    print("總結：")
    for s in all_stats:
        if not s:
            continue
        det_rate = s["ok"] / max(1, s["total"] - s["excluded"]) * 100
        print(f"  {s['split']:5s}  total={s['total']:5d}  ok={s['ok']:5d}  "
              f"excluded={s['excluded']:4d}  no_hand={s['no_hand']:4d}  "
              f"偵測率={det_rate:.1f}%")


if __name__ == "__main__":
    main()
