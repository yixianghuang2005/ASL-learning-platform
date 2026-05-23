"""
train_transformer.py
====================
用 Kaggle 250 詞資料訓練 Transformer 分類模型。

硬體：AMD RX 9060 XT → torch-directml
輸入：(batch, 30, 225)
輸出：250 類

Usage:
  python train_transformer.py \
      --npz  ../data/kaggle_sequences_250words.npz \
      --epochs 60 \
      --batch  64 \
      --d_model 128 \
      --nhead   4 \
      --num_layers 3
"""

import argparse, time, os, sys
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from pathlib import Path

# ── DirectML ──────────────────────────────────────────────────────────────────
try:
    import torch_directml
    device = torch_directml.device()
    print(f"[device] DirectML (AMD GPU)", flush=True)
except ImportError:
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"[device] {device}", flush=True)

# ── 資料增強 ──────────────────────────────────────────────────────────────────
def augment(x):
    """x: (B, T, D) tensor on CPU"""
    # 1. 高斯雜訊
    x = x + torch.randn_like(x) * 0.01
    # 2. 時間平移（隨機前後位移最多 3 幀）
    shift = np.random.randint(-3, 4)
    if shift > 0:
        x = torch.cat([torch.zeros_like(x[:, :shift]), x[:, :-shift]], dim=1)
    elif shift < 0:
        x = torch.cat([x[:, -shift:], torch.zeros_like(x[:, :(-shift)])], dim=1)
    # 3. 縮放抖動
    scale = np.random.uniform(0.9, 1.1)
    x = x * scale
    return x

# ── 模型 ──────────────────────────────────────────────────────────────────────
class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=30, dropout=0.1):
        super().__init__()
        self.dropout = nn.Dropout(dropout)
        pe = torch.zeros(max_len, d_model)
        pos = torch.arange(0, max_len).unsqueeze(1).float()
        div = torch.exp(torch.arange(0, d_model, 2).float() * (-np.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(pos * div)
        pe[:, 1::2] = torch.cos(pos * div)
        self.register_buffer('pe', pe.unsqueeze(0))  # (1, T, D)

    def forward(self, x):
        return self.dropout(x + self.pe[:, :x.size(1)])

class ASLTransformer(nn.Module):
    def __init__(self, input_dim=225, d_model=128, nhead=4, num_layers=3,
                 num_classes=250, dropout=0.2):
        super().__init__()
        self.proj   = nn.Linear(input_dim, d_model)
        self.pos_enc = PositionalEncoding(d_model, dropout=dropout)
        enc_layer   = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=nhead,
            dim_feedforward=d_model*4,
            dropout=dropout, batch_first=True
        )
        self.encoder = nn.TransformerEncoder(enc_layer, num_layers=num_layers)
        self.norm    = nn.LayerNorm(d_model)
        self.head    = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, num_classes)
        )

    def forward(self, x):
        # x: (B, T, 225)
        x = self.proj(x)          # (B, T, d_model)
        x = self.pos_enc(x)
        x = self.encoder(x)       # (B, T, d_model)
        x = self.norm(x)
        x = x.mean(dim=1)         # (B, d_model) global avg pool
        return self.head(x)

# ── 訓練 ──────────────────────────────────────────────────────────────────────
def train(args):
    # 載入資料
    print("[load] 載入 npz...", flush=True)
    data    = np.load(args.npz, allow_pickle=True)
    X       = data['X'].astype(np.float32)   # (N, 30, 225)
    y       = data['y'].astype(np.int64)
    classes = data['classes'].tolist()
    n_cls   = len(classes)
    print(f"  X={X.shape}, classes={n_cls}", flush=True)

    # 分割
    X_tv, X_test, y_tv, y_test = train_test_split(
        X, y, test_size=0.10, stratify=y, random_state=42)
    X_train, X_val, y_train, y_val = train_test_split(
        X_tv, y_tv, test_size=0.11, stratify=y_tv, random_state=42)
    print(f"  train={len(X_train)}, val={len(X_val)}, test={len(X_test)}", flush=True)

    # DataLoader
    def make_loader(Xa, ya, shuffle=True):
        ds = TensorDataset(torch.from_numpy(Xa), torch.from_numpy(ya))
        return DataLoader(ds, batch_size=args.batch, shuffle=shuffle, num_workers=0)

    train_loader = make_loader(X_train, y_train)
    val_loader   = make_loader(X_val,   y_val,   shuffle=False)
    test_loader  = make_loader(X_test,  y_test,  shuffle=False)

    # 模型
    model = ASLTransformer(
        input_dim=225, d_model=args.d_model, nhead=args.nhead,
        num_layers=args.num_layers, num_classes=n_cls, dropout=args.dropout
    ).to(device)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"  參數量: {total_params:,}", flush=True)

    # Optimizer + Scheduler
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    # 輸出目錄
    out_dir = Path(__file__).parent.parent / 'models'
    out_dir.mkdir(exist_ok=True)
    best_path = out_dir / 'best_transformer.pt'

    best_val_acc = 0.0
    history = []

    for epoch in range(1, args.epochs + 1):
        # ── Train ──
        model.train()
        train_loss, train_correct, train_total = 0.0, 0, 0
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
            train_loss    += loss.item() * len(yb)
            train_correct += (logits.argmax(1) == yb).sum().item()
            train_total   += len(yb)

        scheduler.step()

        # ── Val ──
        model.eval()
        val_correct, val_total = 0, 0
        with torch.no_grad():
            for xb, yb in val_loader:
                xb, yb = xb.to(device), yb.to(device)
                preds = model(xb).argmax(1)
                val_correct += (preds == yb).sum().item()
                val_total   += len(yb)

        train_acc = train_correct / train_total
        val_acc   = val_correct   / val_total
        elapsed   = time.time() - t0

        print(f"Epoch {epoch:3d}/{args.epochs} | "
              f"loss={train_loss/train_total:.4f} | "
              f"train={train_acc:.4f} | val={val_acc:.4f} | "
              f"{elapsed:.1f}s", flush=True)

        history.append({'epoch': epoch, 'train_acc': train_acc, 'val_acc': val_acc})

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save({'model_state': model.state_dict(),
                        'classes': classes,
                        'args': vars(args)}, best_path)
            print(f"  ★ 儲存最佳模型 val_acc={val_acc:.4f}", flush=True)

    # ── Test ──
    print(f"\n最佳 val_acc={best_val_acc:.4f}，載入最佳模型做 test...", flush=True)
    ckpt = torch.load(best_path, map_location='cpu', weights_only=False)
    model.load_state_dict(ckpt['model_state'])
    model.to(device).eval()

    all_preds, all_labels = [], []
    with torch.no_grad():
        for xb, yb in test_loader:
            xb = xb.to(device)
            preds = model(xb).argmax(1).cpu().numpy()
            all_preds.extend(preds)
            all_labels.extend(yb.numpy())

    test_acc = np.mean(np.array(all_preds) == np.array(all_labels))
    print(f"Test acc: {test_acc:.4f}", flush=True)

    # 儲存 report
    runs_dir = Path(__file__).parent.parent / 'runs'
    runs_dir.mkdir(exist_ok=True)
    report = classification_report(
        all_labels, all_preds,
        target_names=classes, zero_division=0
    )
    (runs_dir / 'transformer_classification_report.txt').write_text(report)
    print("Report 已儲存", flush=True)

    # ── ONNX export ──
    print("\n匯出 ONNX...", flush=True)
    model.cpu().eval()
    dummy = torch.zeros(1, 30, 225)
    onnx_path = out_dir / 'asl_transformer.onnx'
    torch.onnx.export(
        model, dummy, str(onnx_path),
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}},
        opset_version=17
    )
    print(f"ONNX 儲存：{onnx_path}", flush=True)

    # classes json
    import json
    classes_path = out_dir / 'transformer_classes.json'
    with open(classes_path, 'w', encoding='utf-8') as f:
        json.dump(classes, f, ensure_ascii=False)
    print(f"Classes 儲存：{classes_path}", flush=True)
    print("\n完成！複製 onnx + classes 到 frontend/public/models/ 即可使用", flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--npz',        default='../data/kaggle_sequences_250words.npz')
    parser.add_argument('--epochs',     type=int,   default=60)
    parser.add_argument('--batch',      type=int,   default=64)
    parser.add_argument('--d_model',    type=int,   default=128)
    parser.add_argument('--nhead',      type=int,   default=4)
    parser.add_argument('--num_layers', type=int,   default=3)
    parser.add_argument('--dropout',    type=float, default=0.2)
    parser.add_argument('--lr',         type=float, default=1e-3)
    args = parser.parse_args()
    train(args)
