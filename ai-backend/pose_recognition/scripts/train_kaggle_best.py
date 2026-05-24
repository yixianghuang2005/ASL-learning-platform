"""
train_kaggle_best.py — 最高準確率版本
======================================
改進：
1. hidden=256，3層 GRU
2. 200 epochs + 早停（patience=30）
3. Warmup + CosineAnnealing LR
4. 更強資料增強
5. Label smoothing=0.15
6. 每 10 epoch 存一次 checkpoint
"""

import argparse, time, json
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from pathlib import Path

device = torch.device('cpu')
print("[device] CPU", flush=True)

# ── 資料增強 ──────────────────────────────────────────────────────────────────
def augment(x):
    # 高斯雜訊
    x = x + torch.randn_like(x) * 0.015
    # 縮放抖動
    x = x * np.random.uniform(0.85, 1.15)
    # 時間 dropout（隨機把某些幀歸零）
    if np.random.rand() < 0.3:
        n_drop = np.random.randint(1, 5)
        idx = np.random.choice(x.shape[1], n_drop, replace=False)
        x[:, idx, :] = 0
    # 特徵 dropout
    if np.random.rand() < 0.2:
        n_feat = np.random.randint(1, 20)
        idx = np.random.choice(x.shape[2], n_feat, replace=False)
        x[:, :, idx] = 0
    return x

# ── 模型 ──────────────────────────────────────────────────────────────────────
class ASLWordGRU(nn.Module):
    def __init__(self, input_dim=225, hidden=256, num_layers=3,
                 num_classes=250, dropout=0.4):
        super().__init__()
        self.input_norm = nn.LayerNorm(input_dim)
        self.gru = nn.GRU(
            input_dim, hidden,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.head = nn.Sequential(
            nn.LayerNorm(hidden),
            nn.Linear(hidden, hidden // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden // 2, num_classes)
        )

    def forward(self, x):
        x = self.input_norm(x)
        out, _ = self.gru(x)
        # 取最後一幀 + 平均池化混合
        last = out[:, -1, :]
        avg  = out.mean(dim=1)
        feat = (last + avg) / 2
        return self.head(feat)

# ── Warmup + Cosine LR ────────────────────────────────────────────────────────
class WarmupCosineScheduler:
    def __init__(self, optimizer, warmup_epochs, total_epochs, min_lr=1e-5):
        self.opt = optimizer
        self.warmup = warmup_epochs
        self.total  = total_epochs
        self.min_lr = min_lr
        self.base_lr = optimizer.param_groups[0]['lr']

    def step(self, epoch):
        if epoch < self.warmup:
            lr = self.base_lr * (epoch + 1) / self.warmup
        else:
            progress = (epoch - self.warmup) / (self.total - self.warmup)
            lr = self.min_lr + 0.5 * (self.base_lr - self.min_lr) * (
                1 + np.cos(np.pi * progress))
        for pg in self.opt.param_groups:
            pg['lr'] = lr
        return lr

# ── 訓練 ──────────────────────────────────────────────────────────────────────
def train(args):
    print("[load] 載入資料...", flush=True)
    data    = np.load(args.npz, allow_pickle=True)
    X       = np.nan_to_num(data['X'].astype(np.float32), nan=0.0)
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
        return DataLoader(ds, batch_size=args.batch, shuffle=shuffle,
                          num_workers=0, pin_memory=False)

    train_loader = make_loader(X_train, y_train)
    val_loader   = make_loader(X_val,   y_val,   shuffle=False)
    test_loader  = make_loader(X_test,  y_test,  shuffle=False)

    model = ASLWordGRU(
        input_dim=225, hidden=args.hidden, num_layers=args.num_layers,
        num_classes=n_cls, dropout=args.dropout
    ).to(device)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"  參數量: {total_params:,}", flush=True)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=2e-4)
    scheduler = WarmupCosineScheduler(optimizer, warmup_epochs=10,
                                       total_epochs=args.epochs, min_lr=1e-5)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.15)

    out_dir  = Path(__file__).parent.parent / 'models'
    out_dir.mkdir(exist_ok=True)
    best_path = out_dir / 'best_kaggle_gru.pt'
    best_val  = 0.0
    no_improve = 0

    t_start = time.time()

    for epoch in range(1, args.epochs + 1):
        lr = scheduler.step(epoch - 1)
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

        model.eval()
        vcorr, vtot = 0, 0
        with torch.no_grad():
            for xb, yb in val_loader:
                vcorr += (model(xb).argmax(1) == yb).sum().item()
                vtot  += len(yb)

        tacc = tcorr / ttot
        vacc = vcorr / vtot
        elapsed = time.time() - t0
        total_h = (time.time() - t_start) / 3600
        remain_h = elapsed * (args.epochs - epoch) / 3600

        print(f"Epoch {epoch:3d}/{args.epochs} | lr={lr:.5f} | "
              f"loss={tloss/ttot:.4f} | train={tacc:.4f} | val={vacc:.4f} | "
              f"{elapsed:.1f}s | 已跑{total_h:.1f}h | 剩{remain_h:.1f}h", flush=True)

        if vacc > best_val:
            best_val = vacc
            no_improve = 0
            torch.save({'model_state': model.state_dict(),
                        'classes': classes, 'args': vars(args),
                        'epoch': epoch, 'val_acc': vacc}, best_path)
            print(f"  ★ 新最佳 val={vacc:.4f}", flush=True)
        else:
            no_improve += 1
            if no_improve >= args.patience:
                print(f"早停：連續 {args.patience} epoch 無改善", flush=True)
                break

    # Test
    print(f"\n最佳 val={best_val:.4f}，載入做 test...", flush=True)
    ckpt = torch.load(best_path, map_location='cpu', weights_only=False)
    model.load_state_dict(ckpt['model_state'])
    model.eval()

    preds, labels = [], []
    with torch.no_grad():
        for xb, yb in test_loader:
            p = model(xb).argmax(1).numpy()
            preds.extend(p); labels.extend(yb.numpy())

    test_acc = np.mean(np.array(preds) == np.array(labels))
    print(f"\n🎯 Test acc: {test_acc:.4f} ({test_acc*100:.1f}%)", flush=True)

    runs_dir = Path(__file__).parent.parent / 'runs'
    runs_dir.mkdir(exist_ok=True)
    report = classification_report(labels, preds, target_names=classes, zero_division=0)
    (runs_dir / 'best_gru_classification_report.txt').write_text(report, encoding='utf-8')
    print("Report 已儲存", flush=True)

    # ONNX export
    print("\n匯出 ONNX...", flush=True)
    model.eval()
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
    print(f"\n✅ 完成！複製 onnx + words_classes.json 到 frontend/public/models/", flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--npz',        default='../data/kaggle_sequences_250words.npz')
    parser.add_argument('--epochs',     type=int,   default=200)
    parser.add_argument('--batch',      type=int,   default=256)
    parser.add_argument('--hidden',     type=int,   default=256)
    parser.add_argument('--num_layers', type=int,   default=3)
    parser.add_argument('--dropout',    type=float, default=0.4)
    parser.add_argument('--lr',         type=float, default=1e-3)
    parser.add_argument('--patience',   type=int,   default=30)
    args = parser.parse_args()
    train(args)
