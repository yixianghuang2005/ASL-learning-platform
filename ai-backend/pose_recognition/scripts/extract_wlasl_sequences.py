"""
Convert videos into fixed-length MediaPipe Holistic landmark sequences.

Feature layout per frame (225 dims):
  pose       = 33 landmarks × 3 (xyz), normalized to body centre / shoulder width
  left hand  = 21 landmarks × 3, normalized to wrist / mid-finger scale
  right hand = 21 landmarks × 3, normalized to wrist / mid-finger scale
  total dim  = 99 + 63 + 63 = 225
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from tqdm import tqdm


SCRIPT_DIR = Path(__file__).resolve().parent
POSE_DIR   = SCRIPT_DIR.parent
DATA_DIR   = POSE_DIR / "data"
INPUT_DIM  = 225   # 33*3 + 21*3 + 21*3


def make_holistic():
    return mp.solutions.holistic.Holistic(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=0.45,
        min_tracking_confidence=0.45,
    )


# ── 正規化 ──────────────────────────────────────────────────────────────────

def normalize_pose(landmarks) -> np.ndarray:
    """33 pose landmarks → 99-dim, relative to shoulder midpoint / shoulder width."""
    if landmarks is None:
        return np.zeros(99, dtype=np.float32)
    pts = np.array([(lm.x, lm.y, lm.z) for lm in landmarks], dtype=np.float32)
    # 左肩=11，右肩=12
    center = (pts[11] + pts[12]) / 2.0
    scale  = float(np.linalg.norm(pts[11] - pts[12]))
    if scale < 1e-6:
        scale = 1.0
    return ((pts - center) / scale).reshape(-1).astype(np.float32)


def normalize_hand(landmarks) -> np.ndarray:
    """21 hand landmarks → 63-dim, relative to wrist / mid-finger MCP."""
    if landmarks is None:
        return np.zeros(63, dtype=np.float32)
    pts = np.array([(lm.x, lm.y, lm.z) for lm in landmarks], dtype=np.float32)
    wrist = pts[0]
    ref   = pts[9]   # middle finger MCP
    scale = float(np.linalg.norm(ref - wrist))
    if scale < 1e-6:
        return np.zeros(63, dtype=np.float32)
    return ((pts - wrist) / scale).reshape(-1).astype(np.float32)


def frame_features(result) -> tuple[np.ndarray, bool]:
    pose  = normalize_pose(result.pose_landmarks.landmark  if result.pose_landmarks  else None)
    left  = normalize_hand(result.left_hand_landmarks.landmark  if result.left_hand_landmarks  else None)
    right = normalize_hand(result.right_hand_landmarks.landmark if result.right_hand_landmarks else None)
    feat  = np.concatenate([pose, left, right]).astype(np.float32)

    has_hand = (result.left_hand_landmarks is not None or
                result.right_hand_landmarks is not None)
    return feat, has_hand


# ── 影片處理 ─────────────────────────────────────────────────────────────────

def sample_frame_indices(frame_count: int, frame_start: int, frame_end: int, seq_len: int) -> np.ndarray:
    start = max(0, frame_start - 1)
    end   = frame_count - 1 if frame_end < 0 else min(frame_count - 1, frame_end - 1)
    if end <= start:
        start, end = 0, frame_count - 1
    return np.linspace(start, end, seq_len).round().astype(int)


def extract_sequence(video_path: Path, frame_start: int, frame_end: int,
                     seq_len: int, detector) -> tuple[np.ndarray, float]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open: {video_path}")
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if n_frames <= 0:
        raise RuntimeError(f"No frames: {video_path}")

    indices  = sample_frame_indices(n_frames, frame_start, frame_end, seq_len)
    sequence = np.zeros((seq_len, INPUT_DIM), dtype=np.float32)
    valid    = 0

    for out_i, frame_i in enumerate(indices):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(frame_i))
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = detector.process(rgb)
        features, has_hand = frame_features(result)
        sequence[out_i] = features
        valid += int(has_hand)

    cap.release()
    return sequence, valid / max(1, seq_len)


def split_key(raw: str) -> str:
    return "valid" if raw == "val" else (raw if raw in {"train", "valid", "test"} else "train")


# ── 主程式 ──────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest",        type=Path,  default=DATA_DIR / "wlasl_10_words_manifest.json")
    ap.add_argument("--output",          type=Path,  default=DATA_DIR / "wlasl_words_sequences.npz")
    ap.add_argument("--sequence-length", type=int,   default=None)
    ap.add_argument("--min-valid-ratio", type=float, default=0.3)
    ap.add_argument("--limit",           type=int,   default=0)
    args = ap.parse_args()

    manifest      = json.loads(args.manifest.read_text(encoding="utf-8"))
    words         = manifest["words"]
    seq_len       = args.sequence_length or int(manifest.get("sequence_length", 30))
    label_to_id   = {w: i for i, w in enumerate(words)}

    buckets = {s: {"X": [], "y": []} for s in ("train", "valid", "test")}
    skipped = []
    detector = make_holistic()
    items    = manifest["items"][: args.limit or None]

    for item in tqdm(items, desc="Extracting sequences"):
        vpath = item.get("video_path")
        if not vpath:
            skipped.append({"video_id": item.get("video_id"), "reason": "missing_path"}); continue
        path = Path(vpath)
        if not path.exists():
            skipped.append({"video_id": item.get("video_id"), "reason": "not_found"}); continue

        try:
            seq, ratio = extract_sequence(
                path,
                int(item.get("frame_start", 1)),
                int(item.get("frame_end", -1)),
                seq_len,
                detector,
            )
        except Exception as e:
            skipped.append({"video_id": item.get("video_id"), "reason": str(e)}); continue

        if ratio < args.min_valid_ratio:
            skipped.append({"video_id": item.get("video_id"), "reason": f"low_ratio:{ratio:.2f}"}); continue

        split = split_key(item.get("split", "train"))
        buckets[split]["X"].append(seq)
        buckets[split]["y"].append(label_to_id[item["word"]])

    detector.close()

    arrays = {
        "classes":         np.array(words),
        "sequence_length": np.array(seq_len),
        "input_dim":       np.array(INPUT_DIM),
    }
    for split, data in buckets.items():
        if data["X"]:
            arrays[f"X_{split}"] = np.stack(data["X"]).astype(np.float32)
            arrays[f"y_{split}"] = np.array(data["y"], dtype=np.int64)
        else:
            arrays[f"X_{split}"] = np.zeros((0, seq_len, INPUT_DIM), dtype=np.float32)
            arrays[f"y_{split}"] = np.zeros((0,), dtype=np.int64)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.output, **arrays)
    skipped_path = args.output.with_suffix(".skipped.json")
    skipped_path.write_text(json.dumps(skipped, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Sequences written: {args.output}")
    for s in ("train", "valid", "test"):
        print(f"{s}: {arrays[f'X_{s}'].shape[0]}")
    print(f"Skipped: {skipped_path}")


if __name__ == "__main__":
    main()
