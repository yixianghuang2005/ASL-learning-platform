# 從 YOLOv8 遷移到 MediaPipe + MLP — 工作總結

**期間**：2026-05-18 ~ 2026-05-19
**作者**：義祥
**目標**：把後端 YOLOv8 物件偵測手語辨識，替換為純前端的 MediaPipe Hands + MLP 分類器

---

## TL;DR

- **舊系統**：YOLOv8m（~25.9M 參數，~50 MB）→ 後端 FastAPI → 每張影格 POST 到 8000 port
- **新系統**：MediaPipe Hands（前端，~10 MB CDN）→ MLP 分類器（**18K 參數，<100 KB**）→ 全部在瀏覽器
- **準確率**：舊 ≈ 97.6%、新 = 97.4%（測試集）；**實測手感新模型對 X 字母明顯較穩**
- **支援字母**：A-Y（共 24 字母，**不含 J、Z**——因兩者為動態手勢，2D 靜態 landmark 無法區分）

---

## 1. 為什麼換

| 面向 | YOLOv8m | MediaPipe + MLP |
|------|---------|----------------|
| 模型大小 | ~50 MB | **< 100 KB** |
| 參數量 | 25,900,000 | **18,138** |
| 需要 GPU 訓練 | 是（DirectML 補丁繞 CUDA）| 否（CPU 數分鐘） |
| 部署架構 | 前端 ↔ 後端 API | **純前端** |
| 對背景/光線敏感度 | 高 | 低（先抽特徵）|

YOLO 模型同時學「手在哪 + 是什麼字 + 有幾隻手」，對 ASL 字母分類來說是大材小用。pose-based 把「找手 + 抽特徵」交給 Google 預訓練的 MediaPipe Hands，分類器只負責「給我 21 個關節點，告訴我是哪個字母」，模型小、訓練快、可全前端部署。

---

## 2. 完整流程

```
攝影機 → MediaPipe Hands (前端 JS)
       → 21 個關節點 (x, y, z)
       → 手腕原點 + 中指掌骨尺度正規化 → 63 維特徵
       → MLP (ONNX, 瀏覽器內推論)
       → 字母預測 + 信心值
```

### 模型架構（SignMLP）

```
Input: 63 → Linear(128) → ReLU → Dropout(0.3)
            → Linear(64) → ReLU
            → Linear(24)  # 輸出 24 個字母
```

---

## 3. 訓練資料與三次實驗

### 實驗 1：原始 Roboflow 資料集（baseline）

- **來源**：原專案內 Roboflow ASL alphabet（10000 張）
- **MediaPipe 偵測率**：train 90.1%、valid 92.6%、test 89.3%
- **訓練樣本**：5019 筆（過濾偵測失敗 + J/Z + nothing）
- **結果**：Test acc **97.63%**，X recall **91.3%**（誤判為 D 7 次）

### 實驗 2：合併 UCF Roboflow Dataset（失敗，但有價值的負面結果）

- **嘗試資料集**：University of Central Florida ASL Alphabet Recognition v7（3240 張）
- **MediaPipe 偵測率**：**僅 17%**（200 張中只有 33 張可用）
- **失敗原因**：該資料集為 YOLO 訓練做了重度增強（90° 旋轉、±30° 剪切、椒鹽雜訊）
- **結論**：**pose-based 方法對輸入影像「自然性」要求遠高於物件偵測方法**
- **行動**：放棄該資料集，但保留 `extract_landmarks_yolo.py` 以供未來使用乾淨資料集

### 實驗 3：合併 SigNN Character Database（成功）

- **資料集**：SigNN Character Database（8442 張，24 個字母，自然光照）
- **MediaPipe 偵測率**：**98.1%**（8285/8442）
- **合併後訓練樣本**：13304 筆（原 5019 + SigNN 8285）
- **測試結果**：Test acc 97.38%（**測試集略降 0.25%，X recall 降至 88.0%**）
- **實測結果**：**X 字母在實際攝影機輸入下明顯比 v1 穩定**
- **學術洞察**：「**分布飄移（distribution shift）**」現象——
  - 原 test set 與原 train 同源，所以 test acc 衡量的是「對特定拍攝風格的擬合度」
  - v2 模型訓練資料更多元，雖然在原 test set 上略差，**但實際泛化能力更強**
  - 這是「test acc ≠ 真實泛化能力」的經典案例

### 詳細逐字母對比（test set 上）

| 字母 | v1 acc | v1 信心 | v2 acc | v2 信心 | Δ |
|------|-------|--------|-------|--------|---|
| X | 91.3% | 93.0% | 88.0% | 89.9% | −3.3% |
| M | 93.3% | 95.0% | 96.7% | 92.5% | **+3.4%** |
| N | 96.9% | 97.5% | 95.8% | 96.7% | −1.1% |
| S | 95.7% | 95.1% | 95.7% | 94.1% | 0 |
| Y | 95.5% | 99.4% | 95.5% | 99.6% | 0 |
| 整體 | **97.63%** | — | **97.38%** | — | −0.25% |

---

## 4. X 字母的本質限制

X 字母的食指鉤起，與 D 字母的食指挺直在 **2D 投影**下極為相似，差異主要在 **z 軸（深度）**。然而 MediaPipe Hands 的 z 座標精度遠低於 x、y，導致模型難以可靠區分 X 與 D。

**這是 2D pose-based 方法的本質瓶頸**，**無法透過更多 2D 資料解決**。未來改善方向：

1. 立體視覺（雙鏡頭）
2. 工程化特徵（手指彎曲角度）
3. 改用 3D pose 估計模型

---

## 5. 新建檔案 / 結構

```
ai-backend/
└── pose_recognition/              ⭐ 新增
    ├── scripts/
    │   ├── extract_landmarks.py            # 原資料集（檔名為標籤）
    │   ├── extract_landmarks_yolo.py       # 通用 YOLO 格式（data.yaml）
    │   ├── extract_landmarks_folders.py    # 資料夾結構（資料夾 = 標籤）
    │   ├── merge_landmarks.py              # 合併多份 CSV
    │   ├── train_mlp.py                    # PyTorch MLP 訓練
    │   ├── export_onnx.py                  # PyTorch → ONNX
    │   ├── analyze_model.py                # 每字母準確率 / 混淆分析
    │   ├── eval_saved_model.py             # 從 .pt 印 classification_report
    │   └── compare_models.py               # v1 vs v2 對比報告
    ├── data/                       # landmarks CSV（gitignore）
    ├── models/                     # best_mlp.pt, sign_mlp.onnx
    ├── runs/                       # 訓練歷史 + 對比報告
    ├── README.md                   # 流程使用說明
    ├── requirements_pose.txt       # Python 依賴
    └── colab_train.ipynb           # Colab 訓練版本（備用）

frontend/
├── public/
│   └── models/                     ⭐ 新增
│       ├── sign_mlp.onnx           # 模型檔 (~50 KB)
│       └── classes.json            # 類別清單
└── src/
    ├── components/
    │   ├── PoseVideoCapture.jsx    ⭐ 新增——MediaPipe + ONNX 推論
    │   ├── VideoCapture.jsx        ✏️ 改為轉發到 PoseVideoCapture
    │   └── VideoCapture.yolo.jsx.bak  💾 舊 YOLO 版備份
    └── pages/
        └── TestPose.jsx            ⭐ 新增——/test-pose 測試頁

docs/
└── MIGRATION_LOG.md                ⭐ 本檔
```

---

## 6. 時間軸

| 日期 | 完成項目 |
|------|---------|
| **5/18 上午** | 評估改用 pose estimation 的可行性、設計 MediaPipe + MLP 流程 |
| **5/18 下午** | 完成 `pose_recognition/` 目錄、寫好 4 個核心腳本、Python venv 環境設定 |
| **5/18 晚上** | 完成首次訓練（5019 筆 → 97.63% test acc） |
| **5/18 晚** | 完成前端 `/test-pose` 測試頁面、確認鏡頭即時辨識可運作 |
| **5/19 上午** | 嘗試合併 UCF 資料集（失敗，17% 偵測率，轉為負面實驗成果） |
| **5/19 中午** | 嘗試合併 SigNN 資料集（成功，98.1% 偵測率） |
| **5/19 下午** | 完成 v2 訓練（13304 筆 → 97.38% test acc）+ 實測比較 |
| **5/19 傍晚** | 收集對比截圖、寫 `compare_models.py`、產出對比報告 |
| **5/19 晚** | 將 `/practice` 三個 Tab 切換為新模型、設定 `.gitignore`、上傳 GitHub |

---

## 7. 取捨與決策紀錄

| 決策 | 理由 |
|------|------|
| 用 MediaPipe 而非自訓 YOLOv8-pose | Google 已訓練 21 點手部模型，自訓需大量標註工作 |
| MLP 而非 LSTM | A-Y 多為靜態手勢，不需時序資訊；MLP 訓練快、模型小 |
| 排除 J、Z | 兩者為動態手勢（軌跡），靜態 landmark 無法區分；未來可用「相似手形 + 手腕位置序列」補上 |
| 保留 v1 模型備份 | 對比實驗用 + 報告佐證 |
| 最終採用 v2 | 實測 X 比較穩、訓練資料更多元、泛化能力更好 |
| 不全站重構為 Strategy Pattern | demo 為優先，未來組員加新模型再考慮 |

---

## 8. 未來工作

1. **加入 J、Z 動態字母**：用連續 5-10 幀 landmark 軌跡 + 簡單規則或小型 LSTM
2. **改善 X 的深度問題**：嘗試在特徵中加入手指彎曲角度作為額外維度
3. **跨資料集驗證**：建立第三方 hold-out test set 作為真正的泛化能力指標
4. **多模型 Strategy Pattern**：當組員加入更多模型時重構 `recognizers/` 架構
5. **延伸到 TSL（台灣手語）**：本專案命名為 tsl-learning-platform，可作為下一階段目標
