"""
export_words_onnx.py
====================
把 best_words_model.pt 轉成 ONNX，供前端 onnxruntime-web 推論。

使用：
    python export_words_onnx.py

產出：
    pose_recognition/models/asl_words_sequence.onnx
    pose_recognition/models/words_classes.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

SCRIPT_DIR = Path(__file__).resolve().parent
MODELS_DIR = SCRIPT_DIR.parent / "models"

sys.path.insert(0, str(SCRIPT_DIR))
from train_words_mlp import GRUClassifier, FlatMLP  # noqa: E402


def main():
    ckpt_path = MODELS_DIR / "best_words_model.pt"
    if not ckpt_path.exists():
        raise FileNotFoundError(f"找不到 {ckpt_path}，請先跑 train_words_mlp.py")

    ckpt      = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    classes   = ckpt["classes"]
    seq_len   = ckpt["seq_len"]
    input_dim = ckpt["input_dim"]
    hidden    = ckpt.get("hidden", 64)
    dropout   = ckpt.get("dropout", 0.5)
    model_type = ckpt.get("model_type", "gru")

    n_classes = len(classes)

    if model_type == "gru":
        model = GRUClassifier(input_dim, hidden=hidden, n_classes=n_classes, dropout=dropout)
    else:
        model = FlatMLP(seq_len, input_dim, n_classes=n_classes, dropout=dropout)

    model.load_state_dict(ckpt["model_state"])
    model.eval()

    onnx_path = MODELS_DIR / "asl_words_sequence.onnx"
    dummy = torch.randn(1, seq_len, input_dim)

    torch.onnx.export(
        model,
        dummy,
        onnx_path.as_posix(),
        input_names=["sequence"],
        output_names=["logits"],
        dynamic_axes={"sequence": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=13,
        do_constant_folding=True,
    )
    print(f"[OK] 匯出 ONNX: {onnx_path}")

    classes_path = MODELS_DIR / "words_classes.json"
    classes_path.write_text(
        json.dumps({"classes": classes, "seq_len": seq_len, "input_dim": input_dim},
                   ensure_ascii=False, indent=2)
    )
    print(f"[OK] 寫出類別清單: {classes_path}")
    print(f"  classes = {classes}")

    # 驗證
    try:
        import onnx, onnxruntime as ort, numpy as np
        onnx.checker.check_model(onnx.load(onnx_path.as_posix()))
        sess = ort.InferenceSession(onnx_path.as_posix(), providers=["CPUExecutionProvider"])
        x = np.random.randn(1, seq_len, input_dim).astype(np.float32)
        out = sess.run(None, {"sequence": x})[0]
        print(f"[OK] ONNX 驗證通過，輸出 shape = {out.shape}")
    except ImportError:
        print("(略過驗證，需要 onnx onnxruntime)")


if __name__ == "__main__":
    main()
