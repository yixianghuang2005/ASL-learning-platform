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

詞彙辨識訓練（CPU，MediaPipe Holistic 225 維 GRU，使用 ASL Citizen 資料集）：
```
cd ai-backend/pose_recognition/scripts
python prepare_aslcitizen_subset.py   # → aslcitizen_manifest.json
python extract_wlasl_sequences.py     # → aslcitizen_sequences.npz（Holistic 225 維）
python train_words_mlp.py --npz aslcitizen_sequences.npz   # → best_words_model.pt
python export_words_onnx.py           # → asl_words_sequence.onnx + words_classes.json
# 手動複製 onnx + json 到 frontend/public/models/
```

## 架構

### 前端（`frontend/src/`）

```
App.jsx                    — 路由（/, /practice, /vocabulary, /profile）+ Firebase Auth 狀態
pages/
  Practice.jsx             — 兩層導航：字母區 / 詞彙區 × 各 3 個子 Tab
  Vocabulary.jsx           — 詞彙瀏覽
  Profile.jsx              — Firebase 用戶資料
components/
  PoseVideoCapture.jsx     — 字母推論元件（MediaPipe Hands + MLP）
  VideoCapture.jsx         — 舊版 YOLOv8（已停用）
  practice/
    LearnTab.jsx           — 字母學習（字母卡 + 詳細練習頁）
    QuizTab.jsx            — 字母闖關測驗
    CommunicatorTab.jsx    — 拼字溝通器
    WordLearnTab.jsx       — 詞彙學習（詞彙卡 + YouTube 示範 + 鏡頭練習）
    WordQuizTab.jsx        — 詞彙闖關（隨機 8 題，鏡頭偵測自動過關）
    WordRecognitionTab.jsx — 自由辨識（idle/recording/result 狀態機）
  WordVideoCapture.jsx     — 詞彙推論元件（MediaPipe Holistic + GRU）
utils/
  jzMotionDetector.js      — J/Z 軌跡偵測器（純規則式）
services/
  aiApiClient.js           — FastAPI 後端 HTTP 封裝（目前主路線不需要）
  firebaseClient.js        — Firebase Auth/Firestore 封裝
```

**Practice.jsx 導航結構：**
- 頂層切換：字母區 / 詞彙區
- 字母區子 Tab：📖 學習 A~Z ｜ 🎯 闖關測驗 ｜ 💬 拼字溝通器
- 詞彙區子 Tab：📚 詞彙學習 ｜ 🎯 詞彙闖關 ｜ 🧠 自由辨識

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

**目前模型：** MediaPipe Holistic 225 維 → GRU(hidden=64) → Linear(32) → ReLU → Linear(10)

**目標 10 詞**（ASL Citizen 資料集拼法）：
`hello, thankyou, please, sorry, help, yes, no, want1, like, more`

注意：資料集中是 `thankyou`（連寫）、`want1`（加數字），UI 顯示時需 mapping。

**訓練資料：** `C:\data\ASL_Citizen\ASL_Citizen\`（42.77 GB，83,399 支影片）
- 每詞約 30~32 筆，train=124 / valid=36 / test=107
- 8× 資料增強後 train=1116
- Test acc：81.3%，Val acc：91.7%

**已知問題：** like → 被偵測成 please（兩者都在胸口，30 筆樣本不足）

**下一步：** Kaggle Google ASL Signs 資料集（下載中，37.4 GB zip）
- 路徑：`C:\data\kaggle_asl\`
- 格式：預抽好的 Holistic parquet，543 landmarks（需轉換成 225 維）
- 250 詞 × 約 380 筆，目標準確率 90%+，計畫改用 Transformer 架構

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
