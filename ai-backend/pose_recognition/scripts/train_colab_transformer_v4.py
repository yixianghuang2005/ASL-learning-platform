# ==========================================================================
# train_colab_transformer_v4.py — ASL 250詞 Transformer V4（目標 80~85%）
# ==========================================================================
#
# 與 V3 的主要差異：
#   輸入維度 225 → 450（位置 + 速度特徵）
#   需搭配 prepare_kaggle_dataset_v2.py 產生的 npz 使用
#
# 其餘架構與 V3 相同（d_model=256, 6層, Mixup, DropPath, WarmRestarts）
# ==========================================================================

# ── CELL 1：確認 GPU ─────────────────────────────────────────────────────────
"""
!nvidia-smi
import torch
print("CUDA:", torch.cuda.is_available())
"""

# ── CELL 2：掛載 Google Drive ────────────────────────────────────────────────
"""
from google.colab import drive
drive.mount('/content/drive')
"""

# ── CELL 3：Import ───────────────────────────────────────────────────────────
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import json, time
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

# ← V2 npz（450維，位置+速度）
NPZ_PATH = '/content/drive/MyDrive/kaggle_sequences_250words_v2.npz'
INPUT_DIM = 450   # 225位置 + 225速度


# ── CELL 4：增強（與 V3 相同）────────────────────────────────────────────────
def speed_augment(x, min_rate=0.8, max_rate=1.2):
    B, T, D = x.shape
    rate = torch.empty(B, device=x.device).uniform_(min_rate, max_rate)
    out  = torch.zeros_like(x)
    for i in range(B):
        new_len = max(4, int(T * rate[i].item()))
        xi = x[i].unsqueeze(0).permute(0, 2, 1)
        xi = F.interpolate(xi, size=new_len, mode='linear', align_corners=False)
        xi = F.interpolate(xi, size=T,       mode='linear', align_corners=False)
        out[i] = xi.squeeze(0).permute(1, 0)
    return out

def augment(x):
    x = x + torch.randn_like(x) * 0.02
    scale = torch.empty(x.shape[0], 1, 1, device=x.device).uniform_(0.8, 1.2)
    x = x * scale
    if torch.rand(1) < 0.5:
        x = speed_augment(x)
    if torch.rand(1) < 0.3:
        n_drop = torch.randint(1, 6, (1,)).item()
        idx = torch.randperm(x.shape[1])[:n_drop]
        x[:, idx, :] = 0
    if torch.rand(1) < 0.2:
        n_feat = torch.randint(1, 46, (1,)).item()   # 450維對應更多特徵
        idx = torch.randperm(x.shape[2])[:n_feat]
        x[:, :, idx] = 0
    if torch.rand(1) < 0.10:
        x = torch.flip(x, dims=[1])
    return x

def mixup(x, y, alpha=0.3):
    lam = float(np.random.beta(alpha, alpha))
    lam = max(lam, 1 - lam)
    idx = torch.randperm(x.shape[0], device=x.device)
    return lam * x + (1 - lam) * x[idx], y, y[idx], lam

def mixup_loss(criterion, logits, y_a, y_b, lam):
    return lam * criterion(logits, y_a) + (1 - lam) * criterion(logits, y_b)


# ── CELL 5：DropPath ─────────────────────────────────────────────────────────
class DropPath(nn.Module):
    def __init__(self, drop_prob=0.0):
        super().__init__()
        self.drop_prob = drop_prob
    def forward(self, x):
        if self.drop_prob == 0.0 or not self.training:
            return x
        keep  = 1 - self.drop_prob
        shape = (x.shape[0],) + (1,) * (x.ndim - 1)
        mask  = torch.rand(shape, device=x.device) < keep
        return x * mask / keep


# ── CELL 6：模型 V4（input_dim=450）─────────────────────────────────────────
class TransformerBlock(nn.Module):
    def __init__(self, d_model, nhead, ffn_dim, dropout=0.3, drop_path=0.0):
        super().__init__()
        self.norm1     = nn.LayerNorm(d_model)
        self.attn      = nn.MultiheadAttention(d_model, nhead, dropout=dropout, batch_first=True)
        self.norm2     = nn.LayerNorm(d_model)
        self.ffn       = nn.Sequential(
            nn.Linear(d_model, ffn_dim), nn.GELU(), nn.Dropout(dropout),
            nn.Linear(ffn_dim, d_model), nn.Dropout(dropout),
        )
        self.drop_path = DropPath(drop_path)

    def forward(self, x):
        h, _ = self.attn(self.norm1(x), self.norm1(x), self.norm1(x))
        x = x + self.drop_path(h)
        x = x + self.drop_path(self.ffn(self.norm2(x)))
        return x


class ASLTransformerV4(nn.Module):
    """
    V4：與 V3 相同架構，但 input_dim=450（位置+速度）
    Input:  (batch, 30, 450)
    Output: (batch, 250)
    """
    def __init__(self, input_dim=450, d_model=256, nhead=8,
                 num_layers=6, num_classes=250, dropout=0.3,
                 drop_path_rate=0.2, max_len=30):
        super().__init__()
        self.input_proj = nn.Sequential(
            nn.Linear(input_dim, d_model),
            nn.LayerNorm(d_model),
        )
        self.cls_token = nn.Parameter(torch.zeros(1, 1, d_model))
        self.pos_embed = nn.Parameter(torch.zeros(1, max_len + 1, d_model))
        nn.init.trunc_normal_(self.cls_token, std=0.02)
        nn.init.trunc_normal_(self.pos_embed, std=0.02)

        dpr = [x.item() for x in torch.linspace(0, drop_path_rate, num_layers)]
        self.blocks = nn.ModuleList([
            TransformerBlock(d_model, nhead, d_model * 4, dropout, dpr[i])
            for i in range(num_layers)
        ])
        self.norm = nn.LayerNorm(d_model)
        self.head = nn.Sequential(
            nn.Linear(d_model, d_model // 2), nn.GELU(),
            nn.Dropout(dropout * 0.5),
            nn.Linear(d_model // 2, num_classes),
        )

    def forward(self, x):
        B = x.shape[0]
        # Per-sequence 正規化
        mean = x.mean(dim=(1, 2), keepdim=True)
        std  = x.std(dim=(1, 2), keepdim=True) + 1e-6
        x    = (x - mean) / std
        # 投影
        x = self.input_proj(x)
        # CLS token
        cls = self.cls_token.expand(B, -1, -1)
        x   = torch.cat([cls, x], dim=1)
        x   = x + self.pos_embed
        # Transformer
        for blk in self.blocks:
            x = blk(x)
        return self.head(self.norm(x[:, 0]))


# ── CELL 7：訓練 ─────────────────────────────────────────────────────────────
def train(npz_path, epochs=300, batch=512, lr=5e-4, dropout=0.3,
          d_model=256, nhead=8, num_layers=6, patience=50,
          drop_path_rate=0.2, mixup_alpha=0.3, T_0=60, T_mult=2):

    print("[load] 載入資料...", flush=True)
    data    = np.load(npz_path, allow_pickle=True)
    X       = np.nan_to_num(data['X'].astype(np.float32), nan=0.0)
    y       = data['y'].astype(np.int64)
    classes = data['classes'].tolist()
    n_cls   = len(classes)
    print(f"  X={X.shape}, classes={n_cls}", flush=True)
    assert X.shape[2] == INPUT_DIM, f"期望 {INPUT_DIM} 維，得到 {X.shape[2]} 維（請用 v2 npz）"

    X_tv, X_test, y_tv, y_test = train_test_split(X, y, test_size=0.10, stratify=y, random_state=42)
    X_train, X_val, y_train, y_val = train_test_split(X_tv, y_tv, test_size=0.11, stratify=y_tv, random_state=42)
    print(f"  train={len(X_train)}, val={len(X_val)}, test={len(X_test)}", flush=True)

    def make_loader(Xa, ya, shuffle=True):
        ds = TensorDataset(torch.from_numpy(Xa), torch.from_numpy(ya))
        return DataLoader(ds, batch_size=batch, shuffle=shuffle,
                          num_workers=4, pin_memory=True, drop_last=shuffle)

    train_loader = make_loader(X_train, y_train)
    val_loader   = make_loader(X_val,   y_val,   shuffle=False)
    test_loader  = make_loader(X_test,  y_test,  shuffle=False)

    model = ASLTransformerV4(
        input_dim=INPUT_DIM, d_model=d_model, nhead=nhead,
        num_layers=num_layers, num_classes=n_cls,
        dropout=dropout, drop_path_rate=drop_path_rate,
    ).to(device)
    total = sum(p.numel() for p in model.parameters())
    print(f"  參數量: {total:,}", flush=True)

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=5e-4, betas=(0.9, 0.98))
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer, T_0=T_0, T_mult=T_mult, eta_min=1e-6)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.15)
    scaler    = GradScaler('cuda', enabled=(device.type == 'cuda'))

    out_dir   = Path('/content/models')
    out_dir.mkdir(exist_ok=True)
    best_path = out_dir / 'best_transformer_v4.pt'
    best_val  = 0.0
    no_improve = 0
    t_start   = time.time()

    print(f"\n開始訓練（input_dim=450, Mixup={mixup_alpha}, DropPath={drop_path_rate}）...", flush=True)
    for epoch in range(1, epochs + 1):
        model.train()
        tloss, tcorr, ttot = 0.0, 0, 0
        t0 = time.time()

        for xb, yb in train_loader:
            xb, yb = xb.to(device), yb.to(device)
            xb = augment(xb)
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

            with torch.no_grad():
                pred = model(xb).argmax(1)
            tcorr += (pred == ya).sum().item()
            tloss += loss.item() * len(ya)
            ttot  += len(ya)

        scheduler.step()

        model.eval()
        vcorr, vtot = 0, 0
        with torch.no_grad():
            for xb, yb in val_loader:
                with autocast('cuda', enabled=(device.type == 'cuda')):
                    out = model(xb.to(device))
                vcorr += (out.argmax(1) == yb.to(device)).sum().item()
                vtot  += len(yb)

        tacc = tcorr / ttot
        vacc = vcorr / vtot
        lr_now = optimizer.param_groups[0]['lr']
        print(f"Epoch {epoch:3d}/{epochs} | lr={lr_now:.5f} | "
              f"loss={tloss/ttot:.4f} | train={tacc:.4f} | val={vacc:.4f} | "
              f"{time.time()-t0:.1f}s", flush=True)

        if vacc > best_val:
            best_val = vacc
            no_improve = 0
            torch.save({'model_state': model.state_dict(), 'classes': classes,
                        'epoch': epoch, 'val_acc': vacc,
                        'config': dict(input_dim=INPUT_DIM, d_model=d_model,
                                       nhead=nhead, num_layers=num_layers)},
                       best_path)
            print(f"  ★ 新最佳 val={vacc:.4f}", flush=True)
        else:
            no_improve += 1
            if lr_now > 1e-4:
                no_improve = 0
            elif no_improve >= patience:
                print(f"早停：{patience} epoch 無改善", flush=True)
                break

    # 測試
    print(f"\n最佳 val={best_val:.4f}，載入做測試...", flush=True)
    ckpt = torch.load(best_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state'])
    model.eval()

    preds, labels = [], []
    with torch.no_grad():
        for xb, yb in test_loader:
            with autocast('cuda', enabled=(device.type == 'cuda')):
                p = model(xb.to(device)).argmax(1).cpu().numpy()
            preds.extend(p); labels.extend(yb.numpy())

    test_acc = np.mean(np.array(preds) == np.array(labels))
    print(f"\n[OK] Test acc: {test_acc:.4f} ({test_acc*100:.1f}%)", flush=True)

    report = classification_report(labels, preds, target_names=classes, zero_division=0)
    (out_dir / 'transformer_v4_report.txt').write_text(report, encoding='utf-8')

    # ONNX 匯出
    print("\n匯出 ONNX...", flush=True)
    model_cpu = ASLTransformerV4(
        input_dim=INPUT_DIM, d_model=d_model, nhead=nhead,
        num_layers=num_layers, num_classes=n_cls, dropout=0.0, drop_path_rate=0.0,
    )
    model_cpu.load_state_dict(ckpt['model_state'])
    model_cpu.eval()

    dummy     = torch.zeros(1, 30, INPUT_DIM)
    onnx_path = out_dir / 'asl_words_sequence.onnx'
    torch.onnx.export(
        model_cpu, dummy, str(onnx_path),
        input_names=['input'], output_names=['output'],
        dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}},
        opset_version=17,
    )
    print(f"[OK] ONNX: {onnx_path} ({onnx_path.stat().st_size/1e6:.1f} MB)", flush=True)

    with open(out_dir / 'words_classes.json', 'w', encoding='utf-8') as f:
        json.dump(classes, f, ensure_ascii=False)
    print(f"[OK] Classes saved", flush=True)

    print(f"\n完成！Test acc: {test_acc*100:.1f}%，"
          f"總時間 {(time.time()-t_start)/60:.0f} 分鐘", flush=True)
    return test_acc


# ── CELL 8：執行 ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    train(
        npz_path       = NPZ_PATH,
        epochs         = 300,
        batch          = 512,
        lr             = 5e-4,
        dropout        = 0.3,
        d_model        = 256,
        nhead          = 8,
        num_layers     = 6,
        patience       = 50,
        drop_path_rate = 0.2,
        mixup_alpha    = 0.3,
        T_0            = 60,
        T_mult         = 2,
    )


# ── CELL 9：下載 ─────────────────────────────────────────────────────────────
"""
from google.colab import files
files.download('/content/models/asl_words_sequence.onnx')
files.download('/content/models/words_classes.json')
files.download('/content/models/transformer_v4_report.txt')
"""
