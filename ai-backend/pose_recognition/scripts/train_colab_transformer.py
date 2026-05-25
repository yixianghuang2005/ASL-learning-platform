# ==========================================================================
# train_colab_transformer.py — ASL 250詞 Transformer 訓練腳本（Colab GPU 版）
# ==========================================================================
#
# 使用方式：
#   1. Colab → Runtime → Change runtime type → T4 GPU（免費）或 A100（需要 Colab Pro）
#   2. 把 kaggle_sequences_250words.npz 上傳到 Google Drive
#   3. 新增一個 Colab Notebook，複製以下 cell 依序執行
#   4. 最後下載 asl_words_sequence.onnx + words_classes.json
#   5. 覆蓋 frontend/public/models/ 裡的同名檔案
#
# 目標準確率：85–92%（GRU 目前 69.2%）
# ==========================================================================

# ── CELL 1：確認 GPU + 安裝套件 ─────────────────────────────────────────────
"""
!nvidia-smi
import torch
print("CUDA:", torch.cuda.is_available())
print("GPU:", torch.cuda.get_device_name(0))
"""

# ── CELL 2：掛載 Google Drive ────────────────────────────────────────────────
"""
from google.colab import drive
drive.mount('/content/drive')

# 把 kaggle_sequences_250words.npz 放在 Google Drive 任意位置
# 例如 /content/drive/MyDrive/asl/kaggle_sequences_250words.npz
NPZ_PATH = '/content/drive/MyDrive/asl/kaggle_sequences_250words.npz'
# 或者直接上傳到 Colab（左側檔案面板拖拉），然後改成：
# NPZ_PATH = '/content/kaggle_sequences_250words.npz'
"""

# ── CELL 3：Import + 設定 ────────────────────────────────────────────────────
import numpy as np
import torch
import torch.nn as nn
import json, time, math
from pathlib import Path
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"[device] {device}")
if device.type == 'cuda':
    print(f"  GPU: {torch.cuda.get_device_name(0)}")
    print(f"  VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

NPZ_PATH = '/content/drive/MyDrive/asl/kaggle_sequences_250words.npz'  # ← 改成你的路徑

# ── CELL 4：資料增強 ─────────────────────────────────────────────────────────
def augment(x):
    """強化版資料增強（GPU tensor 直接操作）"""
    # 高斯雜訊
    x = x + torch.randn_like(x) * 0.02
    # 縮放抖動
    scale = torch.empty(x.shape[0], 1, 1, device=x.device).uniform_(0.8, 1.2)
    x = x * scale
    # 時間 dropout（隨機幀歸零）
    if torch.rand(1) < 0.4:
        n_drop = torch.randint(1, 6, (1,)).item()
        idx = torch.randperm(x.shape[1])[:n_drop]
        x[:, idx, :] = 0
    # 特徵 dropout
    if torch.rand(1) < 0.3:
        n_feat = torch.randint(1, 30, (1,)).item()
        idx = torch.randperm(x.shape[2])[:n_feat]
        x[:, :, idx] = 0
    # 時間翻轉（50% 機率，手語通常不翻轉但有助泛化）
    if torch.rand(1) < 0.15:
        x = torch.flip(x, dims=[1])
    return x

# ── CELL 5：模型（Transformer） ──────────────────────────────────────────────
class ASLTransformer(nn.Module):
    """
    Transformer 序列分類器
    Input:  (batch, seq_len=30, input_dim=225)
    Output: (batch, num_classes=250)

    為什麼比 GRU 好：
    - Multi-head self-attention 可以直接關注任意兩幀之間的關係
    - Pre-norm + GELU 訓練更穩定
    - 可學習的 positional embedding
    """
    def __init__(self, input_dim=225, d_model=256, nhead=8,
                 num_layers=4, num_classes=250, dropout=0.3, max_len=30):
        super().__init__()
        # 輸入投影
        self.input_proj = nn.Sequential(
            nn.Linear(input_dim, d_model),
            nn.LayerNorm(d_model),
        )
        # 可學習的位置編碼（比固定 sin/cos 更靈活）
        self.pos_embed = nn.Parameter(torch.randn(1, max_len, d_model) * 0.02)

        # Transformer Encoder（Pre-Norm 更穩定）
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=d_model * 4,   # FFN 維度
            dropout=dropout,
            activation='gelu',
            batch_first=True,
            norm_first=True,               # Pre-Norm（比 Post-Norm 訓練更穩）
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers,
                                                  enable_nested_tensor=False)

        # 分類頭（avg + max 混合池化）
        self.head = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout * 0.5),
            nn.Linear(d_model // 2, num_classes),
        )

    def forward(self, x):
        # x: (batch, 30, 225)
        x = self.input_proj(x)       # (batch, 30, d_model)
        x = x + self.pos_embed       # 加入位置資訊
        x = self.transformer(x)      # (batch, 30, d_model)
        # 混合池化：avg + max 取平均
        avg  = x.mean(dim=1)
        mx   = x.max(dim=1).values
        feat = (avg + mx) / 2        # (batch, d_model)
        return self.head(feat)       # (batch, 250)


# ── CELL 6：訓練函式 ─────────────────────────────────────────────────────────
def train(npz_path, epochs=150, batch=256, lr=5e-4, dropout=0.3,
          d_model=256, nhead=8, num_layers=4, patience=25):

    # 載入資料
    print("[load] 載入資料...", flush=True)
    data    = np.load(npz_path, allow_pickle=True)
    X       = np.nan_to_num(data['X'].astype(np.float32), nan=0.0)
    y       = data['y'].astype(np.int64)
    classes = data['classes'].tolist()
    n_cls   = len(classes)
    print(f"  X={X.shape}, classes={n_cls}", flush=True)

    # 資料分割
    X_tv, X_test, y_tv, y_test = train_test_split(
        X, y, test_size=0.10, stratify=y, random_state=42)
    X_train, X_val, y_train, y_val = train_test_split(
        X_tv, y_tv, test_size=0.11, stratify=y_tv, random_state=42)
    print(f"  train={len(X_train)}, val={len(X_val)}, test={len(X_test)}", flush=True)

    def make_loader(Xa, ya, shuffle=True):
        ds = TensorDataset(torch.from_numpy(Xa), torch.from_numpy(ya))
        return DataLoader(ds, batch_size=batch, shuffle=shuffle,
                          num_workers=2, pin_memory=True)

    train_loader = make_loader(X_train, y_train)
    val_loader   = make_loader(X_val,   y_val,   shuffle=False)
    test_loader  = make_loader(X_test,  y_test,  shuffle=False)

    # 模型
    model = ASLTransformer(
        input_dim=225, d_model=d_model, nhead=nhead,
        num_layers=num_layers, num_classes=n_cls, dropout=dropout,
    ).to(device)
    total = sum(p.numel() for p in model.parameters())
    print(f"  參數量: {total:,}", flush=True)

    # 優化器 + OneCycleLR（比 CosineAnnealing 快）
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=lr,
        steps_per_epoch=len(train_loader),
        epochs=epochs,
        pct_start=0.1,          # 10% warmup
        anneal_strategy='cos',
    )
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    out_dir  = Path('/content/models')
    out_dir.mkdir(exist_ok=True)
    best_path = out_dir / 'best_transformer.pt'
    best_val  = 0.0
    no_improve = 0
    t_start   = time.time()

    print("\n開始訓練...", flush=True)
    for epoch in range(1, epochs + 1):
        model.train()
        tloss, tcorr, ttot = 0.0, 0, 0
        t0 = time.time()

        for xb, yb in train_loader:
            xb = augment(xb.to(device))
            yb = yb.to(device)
            optimizer.zero_grad()
            logits = model(xb)
            loss   = criterion(logits, yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            tloss += loss.item() * len(yb)
            tcorr += (logits.argmax(1) == yb).sum().item()
            ttot  += len(yb)

        model.eval()
        vcorr, vtot = 0, 0
        with torch.no_grad():
            for xb, yb in val_loader:
                vcorr += (model(xb.to(device)).argmax(1) == yb.to(device)).sum().item()
                vtot  += len(yb)

        tacc    = tcorr / ttot
        vacc    = vcorr / vtot
        elapsed = time.time() - t0
        total_h = (time.time() - t_start) / 3600
        lr_now  = scheduler.get_last_lr()[0]

        print(f"Epoch {epoch:3d}/{epochs} | lr={lr_now:.5f} | "
              f"loss={tloss/ttot:.4f} | train={tacc:.4f} | val={vacc:.4f} | "
              f"{elapsed:.1f}s", flush=True)

        if vacc > best_val:
            best_val = vacc
            no_improve = 0
            torch.save({'model_state': model.state_dict(),
                        'classes': classes,
                        'epoch': epoch, 'val_acc': vacc,
                        'config': dict(d_model=d_model, nhead=nhead,
                                       num_layers=num_layers, dropout=dropout)},
                       best_path)
            print(f"  ★ 新最佳 val={vacc:.4f}", flush=True)
        else:
            no_improve += 1
            if no_improve >= patience:
                print(f"早停：{patience} epoch 無改善", flush=True)
                break

    # ── 測試 ──────────────────────────────────────────────────────────────
    print(f"\n最佳 val={best_val:.4f}，載入做測試...", flush=True)
    ckpt = torch.load(best_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state'])
    model.eval()

    preds, labels = [], []
    with torch.no_grad():
        for xb, yb in test_loader:
            p = model(xb.to(device)).argmax(1).cpu().numpy()
            preds.extend(p)
            labels.extend(yb.numpy())

    test_acc = np.mean(np.array(preds) == np.array(labels))
    print(f"\n[OK] Test acc: {test_acc:.4f} ({test_acc*100:.1f}%)", flush=True)

    report = classification_report(labels, preds, target_names=classes, zero_division=0)
    report_path = Path('/content/models/transformer_report.txt')
    report_path.write_text(report, encoding='utf-8')
    print("Classification report 已儲存", flush=True)

    # ── ONNX 匯出 ─────────────────────────────────────────────────────────
    print("\n匯出 ONNX...", flush=True)
    model_cpu = ASLTransformer(
        input_dim=225, d_model=d_model, nhead=nhead,
        num_layers=num_layers, num_classes=n_cls, dropout=0.0,
    )
    model_cpu.load_state_dict(ckpt['model_state'])
    model_cpu.eval()

    dummy     = torch.zeros(1, 30, 225)
    onnx_path = out_dir / 'asl_words_sequence.onnx'
    torch.onnx.export(
        model_cpu, dummy, str(onnx_path),
        input_names=['input'], output_names=['output'],
        dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}},
        opset_version=17,
    )
    print(f"[OK] ONNX: {onnx_path} ({onnx_path.stat().st_size/1e6:.1f} MB)", flush=True)

    # ── Classes JSON ──────────────────────────────────────────────────────
    classes_path = out_dir / 'words_classes.json'
    with open(classes_path, 'w', encoding='utf-8') as f:
        json.dump(classes, f, ensure_ascii=False)
    print(f"[OK] Classes: {classes_path}", flush=True)

    print(f"\n完成！Test acc: {test_acc*100:.1f}%", flush=True)
    print("請下載 /content/models/ 裡的 asl_words_sequence.onnx + words_classes.json", flush=True)
    print("複製到 frontend/public/models/ 後重新 npm start 即可", flush=True)


# ── CELL 7：執行訓練 ─────────────────────────────────────────────────────────
if __name__ == '__main__':
    train(
        npz_path   = NPZ_PATH,
        epochs     = 150,       # 比 GRU 的 200 少，但 GPU 每 epoch 快很多
        batch      = 512,       # GPU 可以用更大 batch
        lr         = 5e-4,      # Transformer 建議 lr
        dropout    = 0.3,
        d_model    = 256,       # Transformer 隱藏維度
        nhead      = 8,         # Attention heads（d_model / nhead = 32 整除即可）
        num_layers = 4,         # Transformer 層數
        patience   = 25,        # 早停 patience
    )


# ── CELL 8：下載輸出檔案（Colab 環境） ──────────────────────────────────────
"""
from google.colab import files
files.download('/content/models/asl_words_sequence.onnx')
files.download('/content/models/words_classes.json')
files.download('/content/models/transformer_report.txt')
"""
