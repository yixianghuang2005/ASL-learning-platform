"""
Export the ASL word temporal model to ONNX for the React frontend.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_word_sequence import WordTemporalCNN  # noqa: E402


SCRIPT_DIR = Path(__file__).resolve().parent
POSE_DIR = SCRIPT_DIR.parent
MODELS_DIR = POSE_DIR / "models"
REPO_ROOT = POSE_DIR.parent.parent
FRONTEND_MODELS_DIR = REPO_ROOT / "frontend" / "public" / "models"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, default=MODELS_DIR / "best_word_sequence.pt")
    parser.add_argument("--output", type=Path, default=MODELS_DIR / "asl_words_sequence.onnx")
    parser.add_argument("--copy-to-frontend", action="store_true")
    args = parser.parse_args()

    if not args.checkpoint.exists():
        raise FileNotFoundError(f"Checkpoint not found: {args.checkpoint}")

    checkpoint = torch.load(args.checkpoint, map_location="cpu")
    classes = checkpoint["classes"]
    input_dim = int(checkpoint["input_dim"])
    sequence_length = int(checkpoint["sequence_length"])
    channels = int(checkpoint.get("channels", 128))
    dropout = float(checkpoint.get("dropout", 0.25))

    model = WordTemporalCNN(
        input_dim=input_dim,
        n_classes=len(classes),
        channels=channels,
        dropout=dropout,
    )
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.randn(1, sequence_length, input_dim)
    torch.onnx.export(
        model,
        dummy,
        args.output.as_posix(),
        input_names=["sequence"],
        output_names=["logits"],
        dynamic_axes={"sequence": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=13,
        do_constant_folding=True,
    )

    class_meta = {
        "classes": classes,
        "sequence_length": sequence_length,
        "input_dim": input_dim,
        "model_type": "WordTemporalCNN",
    }
    classes_path = args.output.with_name("asl_words_classes.json")
    classes_path.write_text(json.dumps(class_meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"ONNX written: {args.output}")
    print(f"Classes written: {classes_path}")

    if args.copy_to_frontend:
        FRONTEND_MODELS_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.output, FRONTEND_MODELS_DIR / args.output.name)
        shutil.copy2(classes_path, FRONTEND_MODELS_DIR / classes_path.name)
        print(f"Copied to: {FRONTEND_MODELS_DIR}")


if __name__ == "__main__":
    main()
