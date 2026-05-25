# ==========================================================================
# train_colab_transformer_v2.py — ASL 250詞 Transformer V2（目標 85–90%）
# ==========================================================================
#
# 與 V1 的主要差異：
#   1. 模型放大：d_model 256→512，層數 4→8，FFN 1024→2048（參數量 ~18M）
#   2. Conv1D front-end：先抽局部時序特徵再送 Transformer（語音辨識常用）
#   3. CLS token 分類（比 avg+max pooling 更好）
#   4. 混合精度訓練（fp16，T4/A100 速度快 1.5~2x，batch 可開 1024）
#   5. 降低過激增強：時間 dropout 40%→20%，特徵 dropout 30%→10%
#   6. 更長訓練：250 epochs，patience=40
#   7. 梯度累積：等效更大 batch（顯存有限時）
#
# 使用方式：
#   1. Colab → Runtime → T4 GPU（免費）或 A100（Colab Pro）
#   2. 確認 kaggle_sequences_250words.npz 在 Google Drive
#   3. 把下面 CELL 依序貼進 Colab Notebook 執行
#   4. 完成後下載 asl_words_sequence.onnx + words_classes.json
#   5. 覆蓋 frontend/public/models/ 裡的同名檔案
# ==========================================================================

# ── CELL 1：確認 GPU ─────────────────────────────────────────────────────────
"""
!nvidia-smi
import torch
print("CUDA:", torch.cuda.is_available())
print("GPU:", torch.cuda.get_device_name(0))
print("VRAM:", torch.cuda.get_device_properties(0).total_memory / 1e9, "GB")
"""

# ── CELL 2：掛載 Google Drive ────────────────────────────────────────────────
"""
from google.colab import drive
drive.mount('/content/drive')
"""

# ── CELL 3：Import + 設定 ────────────────────────────────────────────────────
import numpy as np
import torch
import torch.nn as nn
import json, time, math
from pathlib import Path
from torch.utils.data import DataLoader, TensorDataset
from torch.cuda.amp import autocast, GradScaler   # 混合精度
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"[device] {device}")
if device.type == 'cuda':
    print(f"  GPU: {torch.cuda.get_device_name(0)}")
    print(f"  VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

# ← 修改成你的 npz 路徑
NPZ_PATH = '/content/drive/MyDrive/kaggle_sequences_250words.npz'


# ── CELL 4：資料增強（V2：較保守，避免過度破壞訊號） ──────────────────────────
def augment(x):
    """
    x: (batch, 30, 225) GPU tensor
    時間 dropout 20%（舊 40%），特徵 dropout 10%（舊 30%），避免欠擬合
    """
    # 高斯雜訊（小幅）
    x = x + torch.randn_like(x) * 0.015
    # 縮放抖動（稍微縮小範圍）
    scale = torch.empty(x.shape[0], 1, 1, device=x.device).uniform_(0.85, 1.15)
    x = x * scale
    # 時間 dropout（20% 機率，最多 4 幀）
    if torch.rand(1) < 0.2:
        n_drop = torch.randint(1, 5, (1,)).item()
        idx = torch.randperm(x.shape[1])[:n_drop]
        x[:, idx, :] = 0
    # 特徵 dropout（10% 機率，最多 15 維）
    if torch.rand(1) < 0.1:
        n_feat = torch.randint(1, 16, (1,)).item()
        idx = torch.randperm(x.shape[2])[:n_feat]
        x[:, :, idx] = 0
    # 時間翻轉（10% 機率）
    if torch.rand(1) < 0.10:
        x = torch.flip(x, dims=[1])
    return x


# ── CELL 5：模型（Conv1D + Transformer + CLS token） ─────────────────────────
class ASLTransformerV2(nn.Module):
    """
    V2 改進：
    1. Conv1D front-end：kernel=3 的兩層卷積，抽局部時序特徵（語音辨識慣用）
    2. CLS token：可學習的分類 token，不需要手動池化
    3. 更大模型：d_model=512，8 層 Transformer
    4. DropPath 正則化（代替 dropout，更適合 Transformer）

    Input:  (batch, seq_len=30, input_dim=225)
    Output: (batch, num_classes=250)
    """
    def __init__(self, input_dim=225, d_model=512, nhead=8,
                 num_layers=8, num_classes=250, dropout=0.1, max_len=30):
        super().__init__()

        # ── Conv1D 局部特徵萃取 ──────────────────────────────────────────
        # 先把 225 維壓縮並萃取局部時序 pattern，再送 Transformer
        self.conv_front = nn.Sequential(
            nn.Conv1d(input_dim, d_model // 2, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm1d(d_model // 2),
            nn.GELU(),
            nn.Conv1d(d_model // 2, d_model, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm1d(d_model),
            nn.GELU(),
        )

        # ── CLS token（可學習的分類 token） ──────────────────────────────
        self.cls_token = nn.Parameter(torch.zeros(1, 1, d_model))
        nn.init.trunc_normal_(self.cls_token, std=0.02)

        # ── 可學習的位置編碼（長度 = max_len + 1，+1 for CLS） ───────────
        self.pos_embed = nn.Parameter(torch.zeros(1, max_len + 1, d_model))
        nn.init.trunc_normal_(self.pos_embed, std=0.02)

        # ── Transformer Encoder（Pre-Norm，更穩定） ───────────────────────
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=d_model * 4,    # 512*4 = 2048
            dropout=dropout,
            activation='gelu',
            batch_first=True,
            norm_first=True,                # Pre-Norm
        )
        self.transformer = nn.TransformerEncoder(
            encoder_layer, num_layers=num_layers,
            enable_nested_tensor=False,     # ONNX 相容
        )

        # ── 分類頭 ────────────────────────────────────────────────────────
        self.norm = nn.LayerNorm(d_model)
        self.head = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, num_classes),
        )

    def forward(self, x):
        # x: (batch, 30, 225)
        B = x.shape[0]

        # Conv1D front-end（需要 channel-first）
        x = self.conv_front(x.permute(0, 2, 1))   # (B, d_model, 30)
        x = x.permute(0, 2, 1)                     # (B, 30, d_model)

        # 加入 CLS token
        cls = self.cls_token.expand(B, -1, -1)     # (B, 1, d_model)
        x   = torch.cat([cls, x], dim=1)           # (B, 31, d_model)

        # 加入位置編碼
        x = x + self.pos_embed                     # (B, 31, d_model)

        # Transformer
        x = self.transformer(x)                    # (B, 31, d_model)

        # 取 CLS token 做分類
        cls_out = self.norm(x[:, 0])               # (B, d_model)
        return self.head(cls_out)                  # (B, 250)


# ── CELL 6：訓練函式（含混合精度） ───────────────────────────────────────────
def train(npz_path, epochs=250, batch=1024, lr=3e-4, dropout=0.1,
          d_model=512, nhead=8, num_layers=8, patience=40,
          accum_steps=1):
    """
    accum_steps: 梯度累積步數（顯存不足時設 2 或 4，等效 batch*accum_steps）
    """

    # 載入資料
    print("[load] 載入資料...", flush=True)
    data    = np.load(npz_path, allow_pickle=True)
    X       = np.nan_to_num(data['X'].astype(np.float32), nan=0.0)
    y       = data['y'].astype(np.int64)
    classes = data['classes'].tolist()
    n_cls   = len(classes)
    print(f"  X={X.shape}, classes={n_cls}", flush=True)

    # 資料分割（與 V1 相同比例）
    X_tv, X_test, y_tv, y_test = train_test_split(
        X, y, test_size=0.10, stratify=y, random_state=42)
    X_train, X_val, y_train, y_val = train_test_split(
        X_tv, y_tv, test_size=0.11, stratify=y_tv, random_state=42)
    print(f"  train={len(X_train)}, val={len(X_val)}, test={len(X_test)}", flush=True)

    def make_loader(Xa, ya, shuffle=True):
        ds = TensorDataset(torch.from_numpy(Xa), torch.from_numpy(ya))
        return DataLoader(ds, batch_size=batch, shuffle=shuffle,
                          num_workers=4, pin_memory=True, drop_last=shuffle)

    train_loader = make_loader(X_train, y_train)
    val_loader   = make_loader(X_val,   y_val,   shuffle=False)
    test_loader  = make_loader(X_test,  y_test,  shuffle=False)

    # 建立模型
    model = ASLTransformerV2(
        input_dim=225, d_model=d_model, nhead=nhead,
        num_layers=num_layers, num_classes=n_cls, dropout=dropout,
    ).to(device)
    total = sum(p.numel() for p in model.parameters())
    print(f"  參數量: {total:,}", flush=True)

    # 優化器（OneCycleLR）
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr,
                                   weight_decay=2e-4, betas=(0.9, 0.98))
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=lr,
        steps_per_epoch=max(1, len(train_loader) // accum_steps),
        epochs=epochs,
        pct_start=0.1,
        anneal_strategy='cos',
    )
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    # 混合精度 scaler
    scaler = GradScaler(enabled=(device.type == 'cuda'))

    out_dir   = Path('/content/models')
    out_dir.mkdir(exist_ok=True)
    best_path = out_dir / 'best_transformer_v2.pt'
    best_val  = 0.0
    no_improve = 0
    t_start   = time.time()

    print("\n開始訓練（混合精度 fp16）...", flush=True)
    for epoch in range(1, epochs + 1):
        model.train()
        tloss, tcorr, ttot = 0.0, 0, 0
        t0 = time.time()
        optimizer.zero_grad()

        for step, (xb, yb) in enumerate(train_loader):
            xb = augment(xb.to(device))
            yb = yb.to(device)

            with autocast(enabled=(device.type == 'cuda')):
                logits = model(xb)
                loss   = criterion(logits, yb) / accum_steps

            scaler.scale(loss).backward()

            if (step + 1) % accum_steps == 0:
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad()
                scheduler.step()

            tloss += loss.item() * accum_steps * len(yb)
            tcorr += (logits.argmax(1) == yb).sum().item()
            ttot  += len(yb)

        # 驗證（不用 amp）
        model.eval()
        vcorr, vtot = 0, 0
        with torch.no_grad():
            for xb, yb in val_loader:
                with autocast(enabled=(device.type == 'cuda')):
                    out = model(xb.to(device))
                vcorr += (out.argmax(1) == yb.to(device)).sum().item()
                vtot  += len(yb)

        tacc    = tcorr / ttot
        vacc    = vcorr / vtot
        elapsed = time.time() - t0
        lr_now  = optimizer.param_groups[0]['lr']

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

    # ── 測試集評估 ─────────────────────────────────────────────────────────
    print(f"\n最佳 val={best_val:.4f}，載入做測試...", flush=True)
    ckpt = torch.load(best_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state'])
    model.eval()

    preds, labels = [], []
    with torch.no_grad():
        for xb, yb in test_loader:
            with autocast(enabled=(device.type == 'cuda')):
                p = model(xb.to(device)).argmax(1).cpu().numpy()
            preds.extend(p)
            labels.extend(yb.numpy())

    test_acc = np.mean(np.array(preds) == np.array(labels))
    print(f"\n[OK] Test acc: {test_acc:.4f} ({test_acc*100:.1f}%)", flush=True)

    report = classification_report(labels, preds, target_names=classes, zero_division=0)
    (out_dir / 'transformer_v2_report.txt').write_text(report, encoding='utf-8')
    print("Classification report 已儲存", flush=True)

    # ── ONNX 匯出 ─────────────────────────────────────────────────────────
    print("\n匯出 ONNX...", flush=True)
    model_cpu = ASLTransformerV2(
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
    size_mb = onnx_path.stat().st_size / 1e6
    print(f"[OK] ONNX: {onnx_path} ({size_mb:.1f} MB)", flush=True)

    # ── Classes JSON ──────────────────────────────────────────────────────
    classes_path = out_dir / 'words_classes.json'
    with open(classes_path, 'w', encoding='utf-8') as f:
        json.dump(classes, f, ensure_ascii=False)
    print(f"[OK] Classes: {classes_path}", flush=True)

    print(f"\n完成！Test acc: {test_acc*100:.1f}%", flush=True)
    return test_acc


# ── CELL 7：執行訓練 ─────────────────────────────────────────────────────────
if __name__ == '__main__':
    train(
        npz_path    = NPZ_PATH,
        epochs      = 250,      # 更長訓練
        batch       = 1024,     # fp16 讓 batch 可以開大（T4 約 1024，A100 可到 2048）
        lr          = 3e-4,     # 大模型用稍小 lr
        dropout     = 0.1,      # 大模型 dropout 可以低
        d_model     = 512,      # 256 → 512
        nhead       = 8,        # 512/8 = 64 head_dim
        num_layers  = 8,        # 4 → 8 層
        patience    = 40,       # 更有耐心
        accum_steps = 1,        # 顯存夠用時設 1；不夠時設 2
    )


# ── CELL 8：下載模型 ─────────────────────────────────────────────────────────
"""
from google.colab import files
files.download('/content/models/asl_words_sequence.onnx')
files.download('/content/models/words_classes.json')
files.download('/content/models/transformer_v2_report.txt')
"""
