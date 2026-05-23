"""
train_kaggle_gru.py
===================
用 Kaggle 250 詞資料訓練 GRU 分類模型（DirectML 相容）。

Usage:
  python train_kaggle_gru.py \
      --npz  ../data/kaggle_sequences_250words.npz \
      --epochs 60 \
      --batch  128
"""

import argparse, time, json
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from pathlib import Path

# GRU 在 DirectML 上有相容問題，強制 CPU 訓練（跟之前 10 詞版本一樣）
device = torch.device('cpu')
print("[device] CPU (GRU DirectML 不相容，使用 CPU)", flush=True)

# ── 資料增強 ──────────────────────────────────────────────────────────────────
def augment(x):
    x = x + torch.randn_like(x) * 0.01
    scale = np.random.uniform(0.9, 1.1)
    return x * scale

# ── 模型 ──────────────────────────────────────────────────────────────────────
class ASLWordGRU(nn.Module):
    def __init__(self, input_dim=225, hidden=128, num_layers=2,
                 num_classes=250, dropout=0.3):
        super().__init__()
        self.gru = nn.GRU(
            input_dim, hidden,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.head = nn.Sequential(
            nn.Linear(hidden, hidden // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden // 2, num_classes)
        )

    def forward(self, x):
        out, _ = self.gru(x)       # (B, T, hidden)
        out = out[:, -1, :]        # 取最後一幀
        return self.head(out)

# ── 訓練 ──────────────────────────────────────────────────────────────────────
def train(args):
    print("[load] 載入 npz...", flush=True)
    data    = np.load(args.npz, allow_pickle=True)
    X       = data['X'].astype(np.float32)
    y       = data['y'].astype(np.int64)
    classes = data['classes'].tolist()
    n_cls   = len(classes)
    print(f"  X={X.shape}, classes={n_cls}", flush=True)

    X_tv, X_test, y_tv, y_test = train_test_split(
        X, y, test_size=0.10, stratify=y, random_state=42)
    X_train, X_val, y_train, y_val = train_test_split(
        X_tv, y_tv, test_size=0.11, stratify=y_tv, random_state=42)
    print(f"  train={len(X_train)}, val={len(X_val)}, test={len(X_test)}", flush=True)

    def make_loader(Xa, ya, shuffle=True):
        ds = TensorDataset(torch.from_numpy(Xa), torch.from_numpy(ya))
        return DataLoader(ds, batch_size=args.batch, shuffle=shuffle, num_workers=0)

    train_loader = make_loader(X_train, y_train)
    val_loader   = make_loader(X_val,   y_val,   shuffle=False)
    test_loader  = make_loader(X_test,  y_test,  shuffle=False)

    model = ASLWordGRU(
        input_dim=225, hidden=args.hidden, num_layers=args.num_layers,
        num_classes=n_cls, dropout=args.dropout
    ).to(device)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"  參數量: {total_params:,}", flush=True)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    out_dir  = Path(__file__).parent.parent / 'models'
    out_dir.mkdir(exist_ok=True)
    best_path = out_dir / 'best_kaggle_gru.pt'
    best_val  = 0.0

    for epoch in range(1, args.epochs + 1):
        model.train()
        tloss, tcorr, ttot = 0.0, 0, 0
        t0 = time.time()

        for xb, yb in train_loader:
            xb = augment(xb)
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            logits = model(xb)
            loss   = criterion(logits, yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            tloss += loss.item() * len(yb)
            tcorr += (logits.argmax(1) == yb).sum().item()
            ttot  += len(yb)

        scheduler.step()

        model.eval()
        vcorr, vtot = 0, 0
        with torch.no_grad():
            for xb, yb in val_loader:
                xb, yb = xb.to(device), yb.to(device)
                vcorr += (model(xb).argmax(1) == yb).sum().item()
                vtot  += len(yb)

        tacc = tcorr / ttot
        vacc = vcorr / vtot
        print(f"Epoch {epoch:3d}/{args.epochs} | loss={tloss/ttot:.4f} | "
              f"train={tacc:.4f} | val={vacc:.4f} | {time.time()-t0:.1f}s", flush=True)

        if vacc > best_val:
            best_val = vacc
            torch.save({'model_state': model.state_dict(),
                        'classes': classes, 'args': vars(args)}, best_path)
            print(f"  ★ 儲存 val={vacc:.4f}", flush=True)

    # Test
    print(f"\n最佳 val={best_val:.4f}，載入做 test...", flush=True)
    ckpt = torch.load(best_path, map_location='cpu', weights_only=False)
    model.load_state_dict(ckpt['model_state'])
    model.to(device).eval()

    preds, labels = [], []
    with torch.no_grad():
        for xb, yb in test_loader:
            p = model(xb.to(device)).argmax(1).cpu().numpy()
            preds.extend(p); labels.extend(yb.numpy())

    test_acc = np.mean(np.array(preds) == np.array(labels))
    print(f"Test acc: {test_acc:.4f}", flush=True)

    runs_dir = Path(__file__).parent.parent / 'runs'
    runs_dir.mkdir(exist_ok=True)
    report = classification_report(labels, preds, target_names=classes, zero_division=0)
    (runs_dir / 'kaggle_gru_classification_report.txt').write_text(report)

    # ONNX export
    print("\n匯出 ONNX...", flush=True)
    model.cpu().eval()
    dummy = torch.zeros(1, 30, 225)
    onnx_path = out_dir / 'asl_words_sequence.onnx'
    torch.onnx.export(
        model, dummy, str(onnx_path),
        input_names=['input'], output_names=['output'],
        dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}},
        opset_version=17
    )
    print(f"ONNX: {onnx_path}", flush=True)

    classes_path = out_dir / 'words_classes.json'
    with open(classes_path, 'w', encoding='utf-8') as f:
        json.dump(classes, f, ensure_ascii=False)
    print(f"Classes: {classes_path}", flush=True)
    print(f"\n完成！複製 {onnx_path.name} + {classes_path.name} 到 frontend/public/models/", flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--npz',        default='../data/kaggle_sequences_250words.npz')
    parser.add_argument('--epochs',     type=int,   default=60)
    parser.add_argument('--batch',      type=int,   default=128)
    parser.add_argument('--hidden',     type=int,   default=128)
    parser.add_argument('--num_layers', type=int,   default=2)
    parser.add_argument('--dropout',    type=float, default=0.3)
    parser.add_argument('--lr',         type=float, default=1e-3)
    args = parser.parse_args()
    train(args)
