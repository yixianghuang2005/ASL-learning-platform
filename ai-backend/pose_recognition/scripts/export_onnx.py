"""
export_onnx.py
==============
把 best_mlp.pt 轉成 ONNX，供前端用 onnxruntime-web 直接在瀏覽器跑。

使用：
    python export_onnx.py
產出：
    pose_recognition/models/sign_mlp.onnx
    pose_recognition/models/classes.json   ← 類別順序，前端要對應 index
"""
from __future__ import annotations

import json
from pathlib import Path

import torch

# 重用訓練腳本裡的模型定義
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_mlp import SignMLP  # noqa: E402


SCRIPT_DIR = Path(__file__).resolve().parent
MODELS_DIR = SCRIPT_DIR.parent / "models"


def main():
    ckpt_path = MODELS_DIR / "best_mlp.pt"
    if not ckpt_path.exists():
        raise FileNotFoundError(f"找不到 {ckpt_path}，請先跑 train_mlp.py")

    ckpt = torch.load(ckpt_path, map_location="cpu")
    classes = ckpt["classes"]
    in_dim = ckpt.get("in_dim", 63)
    hidden = ckpt.get("hidden", (128, 64))
    dropout = ckpt.get("dropout", 0.3)

    model = SignMLP(in_dim=in_dim, n_classes=len(classes), hidden=hidden, dropout=dropout)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    onnx_path = MODELS_DIR / "sign_mlp.onnx"
    dummy = torch.randn(1, in_dim)

    torch.onnx.export(
        model,
        dummy,
        onnx_path.as_posix(),
        input_names=["landmarks"],
        output_names=["logits"],
        dynamic_axes={"landmarks": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=13,
        do_constant_folding=True,
    )
    print(f"✓ 匯出 ONNX: {onnx_path}")

    # 同時寫一份類別清單給前端
    classes_path = MODELS_DIR / "classes.json"
    classes_path.write_text(json.dumps({"classes": classes, "in_dim": in_dim}, ensure_ascii=False, indent=2))
    print(f"✓ 寫出類別清單: {classes_path}")
    print(f"  classes = {classes}")

    # 簡單驗證：載入 ONNX 跑一次推論
    try:
        import onnx, onnxruntime as ort
        onnx.checker.check_model(onnx.load(onnx_path.as_posix()))
        sess = ort.InferenceSession(onnx_path.as_posix(), providers=["CPUExecutionProvider"])
        import numpy as np
        x = np.random.randn(1, in_dim).astype(np.float32)
        out = sess.run(None, {"landmarks": x})[0]
        print(f"✓ ONNX 推論驗證通過，輸出 shape = {out.shape}")
    except ImportError:
        print("(略過 ONNX 驗證，若要驗證請 pip install onnx onnxruntime)")


if __name__ == "__main__":
    main()
