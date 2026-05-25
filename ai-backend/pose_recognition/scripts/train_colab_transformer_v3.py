# ==========================================================================
# train_colab_transformer_v3.py — ASL 250詞 Transformer V3（目標 80%+）
# ==========================================================================
#
# V3 核心改進（vs V2 的 67.5%）：
#   1. 修正過擬合：模型回到合理大小（d_model=256, 6層, ~5M參數）
#   2. Mixup 增強：最有效的防過擬合技術，預估 +3~5%
#   3. 速度增強：隨機重採樣序列（模擬不同手語速度），預估 +1~2%
#   4. Per-sequence 正規化：消除不同人體型/距離的影響，預估 +1~2%
#   5. CosineAnnealingWarmRestarts：多次重啟跳出局部最優
#   6. DropPath 正則化：Transformer 專用，比 dropout 更有效
#   7. 適當增強強度（V1 級別，已驗證有效）
#
# 使用方式：
#   1. Colab → T4 GPU 或 A100
#   2. 確認 kaggle_sequences_250words.npz 在 Google Drive
#   3. 把 Cell 3~8 複製到 Colab 執行
#   4. 下載 asl_words_sequence.onnx + words_classes.json
#   5. 覆蓋 frontend/public/models/
# ==========================================================================

# ── CELL 1：確認 GPU ─────────────────────────────────────────────────────────
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
"""

# ── CELL 3：Import + 設定 ────────────────────────────────────────────────────
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import json, time, math
from pathlib import Path
from torch.utils.data import DataLoader, TensorDataset
from torch.amp import autocast, GradScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"[device] {device}")
if device.type == 'cuda':
    print(f"  GPU: {torch.cuda.get_device_name(0)}")
    print(f"  VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

NPZ_PATH = '/content/drive/MyDrive/kaggle_sequences_250words.npz'  # ← 修改成你的路徑


# ── CELL 4：增強函式（含 Mixup + 速度增強） ───────────────────────────────────

def speed_augment(x, min_rate=0.8, max_rate=1.2):
    """
    速度增強：隨機重採樣序列長度，模擬不同手語速度
    x: (batch, 30, 225)，重採樣後再 resize 回 30 幀
    """
    B, T, D = x.shape
    rate = torch.empty(B, device=x.device).uniform_(min_rate, max_rate)
    out = torch.zeros_like(x)
    for i in range(B):
        new_len = max(4, int(T * rate[i].item()))
        # 重採樣到新長度
        xi = x[i].unsqueeze(0).permute(0, 2, 1)       # (1, D, T)
        xi = F.interpolate(xi, size=new_len, mode='linear', align_corners=False)
        # 再縮回 T
        xi = F.interpolate(xi, size=T, mode='linear', align_corners=False)
        out[i] = xi.squeeze(0).permute(1, 0)           # (T, D)
    return out


def augment(x):
    """
    標準增強（V1 強度，已驗證有效）
    x: (batch, 30, 225) GPU tensor
    """
    # 高斯雜訊
    x = x + torch.randn_like(x) * 0.02
    # 縮放抖動
    scale = torch.empty(x.shape[0], 1, 1, device=x.device).uniform_(0.8, 1.2)
    x = x * scale
    # 速度增強（50% 機率）
    if torch.rand(1) < 0.5:
        x = speed_augment(x)
    # 時間 dropout（30% 機率，最多 5 幀）
    if torch.rand(1) < 0.3:
        n_drop = torch.randint(1, 6, (1,)).item()
        idx = torch.randperm(x.shape[1])[:n_drop]
        x[:, idx, :] = 0
    # 特徵 dropout（20% 機率）
    if torch.rand(1) < 0.2:
        n_feat = torch.randint(1, 23, (1,)).item()
        idx = torch.randperm(x.shape[2])[:n_feat]
        x[:, :, idx] = 0
    # 時間翻轉（10%）
    if torch.rand(1) < 0.10:
        x = torch.flip(x, dims=[1])
    return x


def mixup(x, y, alpha=0.3):
    """
    Mixup：對 (x_a, x_b) 做線性插值，強迫模型學類別邊界
    alpha=0.3 是手語辨識常用值
    """
    lam = float(np.random.beta(alpha, alpha))
    lam = max(lam, 1 - lam)          # 確保主樣本比例 >= 0.5
    idx = torch.randperm(x.shape[0], device=x.device)
    x_mix = lam * x + (1 - lam) * x[idx]
    return x_mix, y, y[idx], lam


def mixup_loss(criterion, logits, y_a, y_b, lam):
    return lam * criterion(logits, y_a) + (1 - lam) * criterion(logits, y_b)


# ── CELL 5：DropPath（Transformer 專用正則化） ─────────────────────────────────
class DropPath(nn.Module):
    """
    Stochastic Depth：以機率 drop_prob 隨機跳過某個殘差連接
    比 Dropout 更適合 Transformer，ViT/DeiT 的標配
    """
    def __init__(self, drop_prob=0.0):
        super().__init__()
        self.drop_prob = drop_prob

    def forward(self, x):
        if self.drop_prob == 0.0 or not self.training:
            return x
        keep = 1 - self.drop_prob
        shape = (x.shape[0],) + (1,) * (x.ndim - 1)
        mask  = torch.rand(shape, device=x.device) < keep
        return x * mask / keep


# ── CELL 6：模型 V3（d_model=256, 6層, CLS token, DropPath） ─────────────────
class TransformerBlock(nn.Module):
    """帶 DropPath 的 Transformer Encoder 層（Pre-Norm）"""
    def __init__(self, d_model, nhead, ffn_dim, dropout=0.3, drop_path=0.0):
        super().__init__()
        self.norm1 = nn.LayerNorm(d_model)
        self.attn  = nn.MultiheadAttention(d_model, nhead, dropout=dropout,
                                            batch_first=True)
        self.norm2  = nn.LayerNorm(d_model)
        self.ffn    = nn.Sequential(
            nn.Linear(d_model, ffn_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(ffn_dim, d_model),
            nn.Dropout(dropout),
        )
        self.drop_path = DropPath(drop_path)

    def forward(self, x):
        # Self-Attention（Pre-Norm）
        h, _ = self.attn(self.norm1(x), self.norm1(x), self.norm1(x))
        x = x + self.drop_path(h)
        # FFN（Pre-Norm）
        x = x + self.drop_path(self.ffn(self.norm2(x)))
        return x


class ASLTransformerV3(nn.Module):
    """
    V3 設計原則：
    - 合理模型大小（~5M 參數）避免過擬合
    - CLS token 做分類
    - DropPath 正則化（線性增加 drop rate）
    - Per-sequence 正規化在 forward 內完成

    Input:  (batch, 30, 225)
    Output: (batch, 250)
    """
    def __init__(self, input_dim=225, d_model=256, nhead=8,
                 num_layers=6, num_classes=250, dropout=0.3,
                 drop_path_rate=0.2, max_len=30):
        super().__init__()

        # 輸入投影
        self.input_proj = nn.Sequential(
            nn.Linear(input_dim, d_model),
            nn.LayerNorm(d_model),
        )

        # CLS token + 位置編碼
        self.cls_token = nn.Parameter(torch.zeros(1, 1, d_model))
        self.pos_embed = nn.Parameter(torch.zeros(1, max_len + 1, d_model))
        nn.init.trunc_normal_(self.cls_token, std=0.02)
        nn.init.trunc_normal_(self.pos_embed, std=0.02)

        # Transformer Blocks（DropPath 線性增加）
        dpr = [x.item() for x in torch.linspace(0, drop_path_rate, num_layers)]
        self.blocks = nn.ModuleList([
            TransformerBlock(d_model, nhead,
                             ffn_dim=d_model * 4,
                             dropout=dropout,
                             drop_path=dpr[i])
            for i in range(num_layers)
        ])

        # 分類頭
        self.norm = nn.LayerNorm(d_model)
        self.head = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout * 0.5),
            nn.Linear(d_model // 2, num_classes),
        )

    def forward(self, x):
        # x: (B, 30, 225)
        B = x.shape[0]

        # Per-sequence 正規化：消除不同人體型/距離的影響
        mean = x.mean(dim=(1, 2), keepdim=True)
        std  = x.std(dim=(1, 2), keepdim=True) + 1e-6
        x    = (x - mean) / std

        # 投影到 d_model
        x = self.input_proj(x)                          # (B, 30, d_model)

        # 加入 CLS token
        cls = self.cls_token.expand(B, -1, -1)          # (B, 1, d_model)
        x   = torch.cat([cls, x], dim=1)                # (B, 31, d_model)

        # 加入位置編碼
        x = x + self.pos_embed

        # Transformer Blocks
        for blk in self.blocks:
            x = blk(x)

        # 取 CLS token 輸出分類
        cls_out = self.norm(x[:, 0])                    # (B, d_model)
        return self.head(cls_out)                       # (B, 250)


# ── CELL 7：訓練（含 Mixup + 混合精度 + WarmRestarts） ────────────────────────
def train(npz_path, epochs=300, batch=512, lr=5e-4, dropout=0.3,
          d_model=256, nhead=8, num_layers=6, patience=50,
          drop_path_rate=0.2, mixup_alpha=0.3,
          T_0=60, T_mult=2):
    """
    T_0=60, T_mult=2 → 重啟於 epoch 60, 180（共 2 次）
    patience=50 需搭配重啟使用，避免重啟前誤判早停
    """

    # 載入資料
    print("[load] 載入資料...", flush=True)
    data    = np.load(npz_path, allow_pickle=True)
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
        return DataLoader(ds, batch_size=batch, shuffle=shuffle,
                          num_workers=4, pin_memory=True, drop_last=shuffle)

    train_loader = make_loader(X_train, y_train)
    val_loader   = make_loader(X_val,   y_val,   shuffle=False)
    test_loader  = make_loader(X_test,  y_test,  shuffle=False)

    # 模型
    model = ASLTransformerV3(
        input_dim=225, d_model=d_model, nhead=nhead,
        num_layers=num_layers, num_classes=n_cls,
        dropout=dropout, drop_path_rate=drop_path_rate,
    ).to(device)
    total = sum(p.numel() for p in model.parameters())
    print(f"  參數量: {total:,}", flush=True)

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr,
                                   weight_decay=5e-4, betas=(0.9, 0.98))
    # CosineAnnealingWarmRestarts：在 T_0, T_0+T_0*T_mult, ... epoch 重啟
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer, T_0=T_0, T_mult=T_mult, eta_min=1e-6
    )
    criterion = nn.CrossEntropyLoss(label_smoothing=0.15)
    scaler    = GradScaler('cuda', enabled=(device.type == 'cuda'))

    out_dir   = Path('/content/models')
    out_dir.mkdir(exist_ok=True)
    best_path = out_dir / 'best_transformer_v3.pt'
    best_val  = 0.0
    no_improve = 0
    t_start   = time.time()

    print(f"\n開始訓練（Mixup alpha={mixup_alpha}, DropPath={drop_path_rate}）...", flush=True)
    for epoch in range(1, epochs + 1):
        model.train()
        tloss, tcorr, ttot = 0.0, 0, 0
        t0 = time.time()

        for xb, yb in train_loader:
            xb, yb = xb.to(device), yb.to(device)

            # 標準增強
            xb = augment(xb)

            # Mixup
            xb_mix, ya, yb_mix, lam = mixup(xb, yb, alpha=mixup_alpha)

            optimizer.zero_grad()
            with autocast('cuda', enabled=(device.type == 'cuda')):
                logits = model(xb_mix)
                loss   = mixup_loss(criterion, logits, ya, yb_mix, lam)

            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(optimizer)
            scaler.update()

            # 訓練準確率：用未混合的原始 xb 估算（僅供參考）
            with torch.no_grad():
                pred = model(xb).argmax(1)
            tcorr += (pred == ya).sum().item()
            tloss += loss.item() * len(ya)
            ttot  += len(ya)

        scheduler.step()

        # 驗證
        model.eval()
        vcorr, vtot = 0, 0
        with torch.no_grad():
            for xb, yb in val_loader:
                with autocast('cuda', enabled=(device.type == 'cuda')):
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
            best_val   = vacc
            no_improve = 0
            torch.save({'model_state': model.state_dict(),
                        'classes': classes,
                        'epoch': epoch, 'val_acc': vacc,
                        'config': dict(d_model=d_model, nhead=nhead,
                                       num_layers=num_layers, dropout=dropout,
                                       drop_path_rate=drop_path_rate)},
                       best_path)
            print(f"  ★ 新最佳 val={vacc:.4f}", flush=True)
        else:
            no_improve += 1
            # 重啟時重置 patience 計數，避免重啟前誤判早停
            if lr_now > 1e-4:      # 學習率還高，不早停
                no_improve = 0
            elif no_improve >= patience:
                print(f"早停：{patience} epoch 無改善（lr 已衰減至 {lr_now:.6f}）", flush=True)
                break

    # ── 測試集評估 ─────────────────────────────────────────────────────────
    print(f"\n最佳 val={best_val:.4f}，載入做測試...", flush=True)
    ckpt = torch.load(best_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state'])
    model.eval()

    preds, labels = [], []
    with torch.no_grad():
        for xb, yb in test_loader:
            with autocast('cuda', enabled=(device.type == 'cuda')):
                p = model(xb.to(device)).argmax(1).cpu().numpy()
            preds.extend(p)
            labels.extend(yb.numpy())

    test_acc = np.mean(np.array(preds) == np.array(labels))
    print(f"\n[OK] Test acc: {test_acc:.4f} ({test_acc*100:.1f}%)", flush=True)

    report = classification_report(labels, preds, target_names=classes, zero_division=0)
    (out_dir / 'transformer_v3_report.txt').write_text(report, encoding='utf-8')
    print("Classification report 已儲存", flush=True)

    # ── ONNX 匯出 ─────────────────────────────────────────────────────────
    print("\n匯出 ONNX...", flush=True)
    model_cpu = ASLTransformerV3(
        input_dim=225, d_model=d_model, nhead=nhead,
        num_layers=num_layers, num_classes=n_cls,
        dropout=0.0, drop_path_rate=0.0,    # 推論時關掉所有 dropout
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

    classes_path = out_dir / 'words_classes.json'
    with open(classes_path, 'w', encoding='utf-8') as f:
        json.dump(classes, f, ensure_ascii=False)
    print(f"[OK] Classes: {classes_path}", flush=True)

    total_min = (time.time() - t_start) / 60
    print(f"\n完成！Test acc: {test_acc*100:.1f}%，總時間 {total_min:.0f} 分鐘", flush=True)
    return test_acc


# ── CELL 8：執行訓練 ─────────────────────────────────────────────────────────
if __name__ == '__main__':
    train(
        npz_path       = NPZ_PATH,
        epochs         = 300,        # 含兩次重啟有足夠空間
        batch          = 512,
        lr             = 5e-4,
        dropout        = 0.3,
        d_model        = 256,        # 回到合理大小（~5M 參數）
        nhead          = 8,
        num_layers     = 6,          # 4→6，在正則化保護下安全擴大
        patience       = 50,
        drop_path_rate = 0.2,        # DropPath 正則化
        mixup_alpha    = 0.3,        # Mixup 強度
        T_0            = 60,         # 第一次重啟在 epoch 60
        T_mult         = 2,          # 第二次在 epoch 60+120=180
    )


# ── CELL 9：下載模型 ─────────────────────────────────────────────────────────
"""
from google.colab import files
files.download('/content/models/asl_words_sequence.onnx')
files.download('/content/models/words_classes.json')
files.download('/content/models/transformer_v3_report.txt')
"""
