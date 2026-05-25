# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

ASL 手語學習網站（專案叫 tsl，目前內容是 ASL 字母與詞彙，未來可能延伸台灣手語）。前端 React，後端 FastAPI，AI 推論盡量做在前端（MediaPipe + ONNX.js）。

## 硬體與框架限制

- **訓練機是 AMD RX 9060 XT，不能用 CUDA。** 所有需要 GPU 的訓練腳本必須用 `torch-directml`，不是 `torch`。
- 凡新增需要 GPU 的訓練腳本：`import torch_directml; device = torch_directml.device()`，不要寫 `cuda` 或 `mps`。
- **例外**：字母 MLP（`train_mlp.py`）資料量小，用 CPU `torch` 就夠。詞彙 GRU（`train_words_mlp.py`）也用 CPU（樣本少）。
- 推論端（瀏覽器）用 `onnxruntime-web`，不依賴 GPU。

## 常用指令

前端（Windows 環境用 `npm.cmd`，不要寫 `npm`）：
```
cd frontend
npm.cmd install
npm.cmd start          # http://localhost:3000
npm.cmd run build
```

後端：
```
cd ai-backend
uvicorn app.main:app --reload --port 8000
# Swagger UI: http://localhost:8000/docs
```

字母分類器訓練（CPU，MediaPipe Hands 63 維 MLP）：
```
cd ai-backend/pose_recognition/scripts
python extract_landmarks.py        # 抽關節點 → CSV
python train_mlp.py                # 訓練 MLP → best_mlp.pt
python export_onnx.py              # 匯出 → sign_mlp.onnx + classes.json
```

詞彙辨識訓練（CPU，Kaggle 250 詞 GRU）：
```
cd ai-backend/pose_recognition/scripts
python prepare_kaggle_dataset.py      # parquet → kaggle_sequences_250words.npz
# 注意：npz 生成後需清除 NaN：np.nan_to_num(X, nan=0.0) 再 np.savez(...)
python train_kaggle_gru.py            # → best_kaggle_gru.pt + asl_words_sequence.onnx + words_classes.json
# 手動複製 onnx + words_classes.json 到 frontend/public/models/
```

舊 ASL Citizen 10 詞 Pipeline（保留備用）：
```
python prepare_aslcitizen_subset.py   # → aslcitizen_manifest.json
python extract_wlasl_sequences.py     # → aslcitizen_sequences.npz
python train_words_mlp.py --npz aslcitizen_sequences.npz
python export_words_onnx.py
```

## 架構

### 前端（`frontend/src/`）

```
App.jsx                    — 路由（/, /practice, /asl-words, /profile）
pages/
  Practice.jsx             — 字母練習（Tab：學習A~Z / 闖關測驗 / 拼字溝通器）
  WordRecognition.jsx      — 詞彙練習（Tab：詞彙學習 / 詞彙闖關 / 自由辨識）
  Profile.jsx              — Firebase 用戶資料（尚未完整）
components/
  PoseVideoCapture.jsx     — 字母推論元件（MediaPipe Hands + MLP）
  VideoCapture.jsx         — 舊版 YOLOv8（已停用）
  WordVideoCapture.jsx     — 詞彙推論元件（MediaPipe Holistic + GRU）
  practice/
    LearnTab.jsx           — 字母學習（字母卡 + 詳細練習頁）
    QuizTab.jsx            — 字母闖關（分數紀錄 localStorage/Firestore）
    CommunicatorTab.jsx    — 拼字溝通器
    WordLearnTab.jsx       — 詞彙學習（250詞 + 搜尋 + 12類別篩選）
    WordQuizTab.jsx        — 詞彙闖關（250詞隨機出題 + 分數紀錄）
    WordRecognitionTab.jsx — 自由辨識（idle/recording/result 狀態機）
utils/
  aslWordData.js           — 250 詞資料庫（英文/中文/類別/提示，WORD_DATA/CATEGORIES）
  jzMotionDetector.js      — J/Z 軌跡偵測器（純規則式）
services/
  firebaseClient.js        — localStorage 分數 + 選配 Firebase Firestore
```

**導航結構（2025-05-25 重整後）：**
- `/practice` → 字母練習：📖 學習 A~Z ｜ 🎯 闖關測驗 ｜ 💬 拼字溝通器
- `/asl-words` → 詞彙練習：📚 詞彙學習 ｜ 🎯 詞彙闖關 ｜ 🧠 自由辨識
- `/vocabulary` → redirect 到 `/asl-words`（舊連結相容）

**`PoseVideoCapture.jsx`（字母）推論流程：**
1. MediaPipe Hands 抽 21 個關節點（63 維）
2. 每幀先餵給 `JZMotionDetector`（軌跡偵測 J、Z）
3. J/Z 沒命中時，每 2 幀做一次 ONNX MLP 推論（靜態字母 A–Y 扣 J）
4. J/Z 命中後有 1200ms hold，避免 MLP 蓋掉動態字母結果
5. 正規化：手腕原點，以中指掌骨（landmark 9）距離為尺度

**`WordVideoCapture.jsx`（詞彙）推論流程：**
1. MediaPipe Holistic 抽 33 pose + 21 左手 + 21 右手 = 75 關節點（225 維）
2. 正規化：pose 相對肩膀中點/肩寬；手部相對手腕/中指掌骨
3. 每幀推入長度 30 的序列緩衝區
4. 緩衝區滿後每幀做一次 ONNX GRU 推論
5. `confirmCount` 幀連續命中同一詞才輸出（預設 5，闖關模式 3）
6. 無手在畫面（`pose_landmarks` 為 null）時不推論，避免誤觸

### 後端（`ai-backend/`）

```
app/
  main.py       — FastAPI 路由（/health, /predict）+ CORS
  detector.py   — YOLOv8 SignDetector（舊路線，開發模式回傳假資料，可刪除）
pose_recognition/
  scripts/      — 訓練 pipeline（字母 + 詞彙）
  data/
    ASL_Citizen/ → 軟連結或說明，實際資料在 C:\data\ASL_Citizen\ASL_Citizen\
  models/
    best_mlp.pt         — 字母 MLP
    best_words_model.pt — 詞彙 GRU（Holistic 225 維，10 詞，81.3% test acc）
models/
  best.pt / best.onnx   — YOLOv8m（舊路線，保留備用）
```

### 前端模型檔（`frontend/public/models/`）

| 檔案 | 用途 |
|------|------|
| `sign_mlp.onnx` | 字母 MLP（63 維輸入） |
| `classes.json` | 字母類別 |
| `asl_words_sequence.onnx` | 詞彙 GRU（225 維 × 30 幀輸入） |
| `words_classes.json` | 詞彙類別（10 詞）|

## 詞彙辨識現況

**目前模型（Kaggle 250 詞）：** MediaPipe Holistic 225 維 → GRU(hidden=128, 2層) → Linear → 250 類
- **Test acc：62.2%，Val acc：63.1%**（250 詞，難度高）
- ONNX：`frontend/public/models/asl_words_sequence.onnx`（1MB）
- Classes：`frontend/public/models/words_classes.json`（250 詞）

**訓練資料：** `C:\data\kaggle_asl\`（56 GB，94,477 筆序列，250 詞，每詞 ~380 筆）
- Kaggle Google ASL Signs 競賽資料集
- Parquet 格式（frame, type, landmark_index, x, y, z）
- 注意：prepare_kaggle_dataset.py 生成的 npz 含大量 NaN，需用 `np.nan_to_num(X, nan=0.0)` 清除後再訓練

**DirectML 相容性問題（重要）：**
- GRU：`aten::_thnn_fused_gru_cell` 不支援 DirectML → 強制 CPU 訓練
- Transformer：反向傳播不正確 → loss 不收斂，不可用 DirectML 訓練
- 解法：序列模型一律用 CPU 訓練（`device = torch.device('cpu')`）

**舊模型（ASL Citizen 10 詞）：**
- GRU(hidden=64)，Test acc=81.3%（10 詞），每詞只有 30 筆
- Kaggle 資料沒有：help, sorry, want, more（這 4 詞只在 ASL Citizen）

## 動態字母 J、Z

J 和 Z 是動態手勢，靜態 MLP 無法分類。`JZMotionDetector`（`utils/jzMotionDetector.js`）：
- J：偵測「I」手型（小指伸出）+ 縱向軌跡 + 鉤尾
- Z：偵測「1」手型（食指伸出）+ Z 型軌跡（4 分位點比對）
- 新增動態字母時延用同一機制，不要試圖用單張影像解決

`mirrored: true` 選項處理鏡像攝影機（x 軸翻轉後與使用者視角一致）。

## 路線歷史

| 元件 | 已停用 | 目前（主） |
|------|------|------|
| 字母推論 | FastAPI YOLOv8 + `VideoCapture.jsx` | 純前端 `PoseVideoCapture.jsx`（Hands MLP）|
| 詞彙資料集 | WLASL（YouTube 連結 30~50% 失效）| ASL Citizen（完整下載）|
| 詞彙特徵 | MediaPipe Hands 136 維（左+右手）| MediaPipe Holistic 225 維（pose+hands）|
| 詞彙模型 | — | GRU → 預計升級 Transformer（Kaggle 資料）|

Kaggle 資料 parquet 格式（543 landmarks）轉換到 225 維的腳本尚未寫，待 zip 下載完成後處理。

## 約定

- Node 指令：Windows 環境用 `npm.cmd`，不要寫 `npm`
- Python 套件管理：pip，必要時加 `--break-system-packages`
- 訓練 runs 統一放 `ai-backend/pose_recognition/runs/`
- ONNX 命名：`sign_mlp.onnx`（字母）、`asl_words_sequence.onnx`（詞彙）
- 前端可載入的模型放 `frontend/public/models/`
- GPU 訓練腳本用 `torch-directml`；資料量小的腳本（字母/目前詞彙）用 CPU `torch`
