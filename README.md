# 🤟 ASL Learning — AI 即時手語學習平台

> 利用 MediaPipe + ONNX 深度學習技術，讓任何人都能在瀏覽器中即時練習 ASL 美國手語。

[![SDG4](https://img.shields.io/badge/SDG4-優質教育-blue)](https://sdgs.un.org/goals/goal4)
[![SDG10](https://img.shields.io/badge/SDG10-減少不平等-orange)](https://sdgs.un.org/goals/goal10)

---

## 🎯 專案特色

- **純前端 AI 推論**：MediaPipe + ONNX.js，不需後端，低延遲即時辨識
- **字母辨識**：ASL 26 個字母（含動態手勢 J、Z），~95% 準確率
- **詞彙辨識**：250 個常用詞彙，GRU 序列模型，69.2% 準確率（持續提升中）
- **完整學習流程**：學習 → 闖關測驗（有分數紀錄）→ 自由練習
- **分數系統**：localStorage 儲存個人最佳，Firebase Firestore 選配

---

## 📁 專案結構

```
ASL-learning-platform/
├── frontend/                        → React 前端（MediaPipe + ONNX 推論）
│   ├── public/models/               → ONNX 模型檔
│   │   ├── sign_mlp.onnx            → 字母 MLP（63 維）
│   │   ├── classes.json             → 字母類別（26 字母）
│   │   ├── asl_words_sequence.onnx  → 詞彙 GRU（225 維 × 30 幀）
│   │   └── words_classes.json       → 詞彙類別（250 詞）
│   └── src/
│       ├── pages/
│       │   ├── Practice.jsx         → 字母練習（學習/闖關/溝通器）
│       │   └── WordRecognition.jsx  → 詞彙練習（學習/闖關/自由辨識）
│       ├── components/practice/
│       │   ├── LearnTab.jsx         → 字母學習（A~Z 卡片）
│       │   ├── QuizTab.jsx          → 字母闖關（含分數紀錄）
│       │   ├── CommunicatorTab.jsx  → 拼字溝通器
│       │   ├── WordLearnTab.jsx     → 詞彙學習（250 詞 + 搜尋 + 分類）
│       │   ├── WordQuizTab.jsx      → 詞彙闖關（250 詞隨機出題 + 分數）
│       │   └── WordRecognitionTab.jsx → 自由辨識
│       ├── utils/
│       │   ├── aslWordData.js       → 250 詞資料庫（英文/中文/類別/提示）
│       │   └── jzMotionDetector.js  → J/Z 軌跡偵測器（規則式）
│       └── services/
│           └── firebaseClient.js    → Firebase + localStorage 雙軌分數儲存
├── ai-backend/                      → FastAPI 後端 + 訓練 Pipeline
│   └── pose_recognition/scripts/
│       ├── prepare_kaggle_dataset.py   → parquet → npz 轉換
│       ├── train_kaggle_gru.py         → GRU 基線訓練（CPU）
│       ├── train_kaggle_best.py        → 改良版 GRU（CPU，69.2%）
│       └── train_colab_transformer.py  → Transformer 訓練（Colab GPU，目標 85-92%）
└── docs/                            → API 規格文件
```

---

## 🚀 本地啟動

### 前端
```bash
cd frontend
npm.cmd install        # Windows 用 npm.cmd
npm.cmd start          # 開啟 http://localhost:3000
```

### AI 後端（選用，推論已移至前端）
```bash
cd ai-backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

---

## 🤖 AI 模型架構

| 用途 | 特徵 | 模型 | 準確率 |
|------|------|------|--------|
| 字母辨識 | MediaPipe Hands 63 維（靜態）| MLP | ~95% |
| 動態字母 J/Z | 手腕軌跡 | 規則式偵測器 | — |
| 詞彙辨識（現役）| MediaPipe Holistic 225 維 × 30 幀 | GRU（hidden=256, 3層）| 69.2% |
| 詞彙辨識（開發中）| 同上 | Transformer（Colab GPU）| 目標 85–92% |

---

## 📊 支援詞彙（250 個，12 類）

Kaggle Google ASL Signs 競賽資料集，涵蓋：

| 類別 | 範例 |
|------|------|
| 🐾 動物 | cat, dog, elephant, tiger, zebra... |
| 🍎 食物 | apple, pizza, milk, chocolate... |
| 👥 人物 | mom, dad, grandma, police... |
| 🌈 顏色 | red, blue, green, yellow... |
| 🏠 家居 | home, bed, table, refrigerator... |
| 🌿 自然 | sun, rain, snow, tree... |
| 🏃 動作 | jump, dance, eat, sleep... |
| 😊 情緒 | happy, sad, mad, sick... |
| 🧍 身體 | eye, ear, nose, mouth... |
| 📦 物品 | book, car, doll, toothbrush... |
| 💬 常用 | yes, no, please, thankyou... |
| ⏰ 時間 | morning, night, tomorrow... |

---

## 📋 開發紀錄

### Week 1（5/11–5/12）— 專案初始化
- 建立 React 前端 + FastAPI 後端腳手架
- 路由規劃、ASL 26 字母資料集整合

### Week 2（5/17–5/19）— 字母辨識主線
- 從 YOLOv8 後端辨識遷移到純前端 MediaPipe Hands + ONNX MLP
- Practice 頁面：學習 A~Z ｜ 闖關測驗 ｜ 拼字溝通器

### Week 3（5/20–5/22）— 動態字母 + 詞彙辨識 + 資料集
- J/Z 動態字母規則式偵測器
- ASL Citizen 10 詞 GRU → Holistic 225 維 → 81.3%
- Kaggle ASL Signs 下載（37.4 GB），全站 TSL → ASL 更名

### Week 4（5/23）— Kaggle 250 詞訓練
- `prepare_kaggle_dataset.py`：94,477 筆序列 npz
- GRU 250 詞訓練：Test acc 62.2%（CPU，60 epochs）

### Week 4（5/24）— 模型優化
- `train_kaggle_best.py`：hidden=256, 3層, Warmup+Cosine LR, 強化增強
- 隔夜訓練結果：**Test acc 69.2%（+7%）**，早停於 Epoch 62

### Week 4（5/25）— 前端大重構 + 分數系統 + Colab 訓練腳本
- **詞彙學習頁擴充至 250 詞**：搜尋列 + 12 類別篩選，每詞含中文/提示/YouTube
- **分數機制**：字母闖關 + 詞彙闖關均新增個人最佳紀錄（localStorage + Firebase 選配）
- **導航重整**：字母練習 / 詞彙練習 分頁，移除冗餘的字彙資料頁
- **`aslWordData.js`**：250 詞完整資料庫（英文名/中文/類別/手勢說明）
- **`train_colab_transformer.py`**：Colab GPU Transformer 訓練腳本（目標 85–92%）
