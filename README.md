# 🤟 手語心連 — AI 即時手語學習平台

> 利用 MediaPipe + ONNX 深度學習技術，讓任何人都能在瀏覽器中即時練習 ASL 美國手語。

[![SDG4](https://img.shields.io/badge/SDG4-優質教育-blue)](https://sdgs.un.org/goals/goal4)
[![SDG10](https://img.shields.io/badge/SDG10-減少不平等-orange)](https://sdgs.un.org/goals/goal10)

---

## 🎯 專案特色

- **純前端 AI 推論**：MediaPipe + ONNX.js，不需後端，低延遲即時辨識
- **字母辨識**：ASL 26 個字母（含動態手勢 J、Z）
- **詞彙辨識**：10 個常用詞彙，GRU 序列模型，81.3% 準確率
- **完整學習流程**：學習 → 闖關測驗 → 自由練習

---

## 📁 專案結構

```
tsl-learning-platform/
├── frontend/          → React 前端（MediaPipe + ONNX 推論）
│   └── public/models/ → ONNX 模型檔（sign_mlp.onnx, asl_words_sequence.onnx）
├── ai-backend/        → FastAPI 後端 + 訓練 Pipeline
│   └── pose_recognition/scripts/ → 特徵提取、訓練、匯出腳本
├── docs/              → API 規格文件
└── scripts/           → 資料前處理工具
```

---

## 🚀 本地啟動

### 前端
```bash
cd frontend
npm install
npm start
# 開啟 http://localhost:3000
```

### AI 後端（選用，推論已移至前端）
```bash
cd ai-backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

---

## 📋 開發紀錄

### Week 1（5/11）— 專案初始化
- 建立 React 前端 + FastAPI 後端腳手架
- 路由規劃：`/`、`/practice`、`/vocabulary`、`/profile`

### Week 1（5/12）— 字母辨識基礎
- 整合 ASL 26 字母資料集
- 建立快速測試腳本

### Week 2（5/17）— 專案重整
- 移除 git 追蹤的大型模型檔
- 確立前後端分離架構

### Week 2（5/18）— Practice 頁面
- 新增三個 Tab：📖 學習 A\~Z、🎯 闖關測驗、💬 拼字溝通器
- `QuizTab`：滑動窗口穩定度邏輯（15 幀窗口，10 次正確過關）
- `CommunicatorTab`：即時拼字溝通器

### Week 2（5/19）— 從 YOLOv8 遷移到純前端 MediaPipe
- 放棄 FastAPI YOLOv8 路線，改用純前端 MediaPipe Hands + ONNX MLP
- `PoseVideoCapture.jsx`：21 關節點 → 63 維 → MLP 推論
- 推論完全在瀏覽器執行，不依賴後端

### Week 3（5/20）— 動態字母 J、Z
- 靜態 MLP 無法辨識軌跡動作，新增規則式 `JZMotionDetector`
- J：「I」手型 + 縱向鉤尾軌跡；Z：「1」手型 + Z 字型軌跡

### Week 3（5/21）— 詞彙辨識完整 Pipeline

**資料集選擇：**
- WLASL（YouTube 下載）：30\~50% 連結失效，放棄
- ✅ **ASL Citizen**（Microsoft Research）：42.77 GB，83,399 支影片，下載完整

**技術演進：**
- 第一版：MediaPipe Hands 136 維 → Test acc 77.3%（缺乏身體位置資訊）
- ✅ **第二版：MediaPipe Holistic 225 維 → GRU 模型 → Test acc 81.3%**
  - 特徵：33 pose 關節 + 左右手各 21 點，含身體相對位置
  - 每詞約 30 筆，8× 資料增強

**UI 大重構（字母區 / 詞彙區）：**
- `WordLearnTab.jsx`：詞彙卡片 + YouTube 示範 + 鏡頭練習
- `WordQuizTab.jsx`：隨機 8 題，鏡頭偵測自動過關
- `WordRecognitionTab.jsx`：自由辨識模式

### Week 3（5/22）— Kaggle 資料集（進行中）
- 目標：Google ASL Signs（Kaggle 競賽資料集）
- 內容：250 個詞彙 × 380 筆，預抽好的 Holistic 特徵
- 計畫：訓練 Transformer 模型，目標準確率 90%+，詞彙擴充至 250 個

---

## 🤖 AI 模型架構

| 用途 | 特徵 | 模型 | 準確率 |
|------|------|------|--------|
| 字母辨識 | MediaPipe Hands 63 維（靜態）| MLP | ~95% |
| 動態字母 J/Z | 手腕軌跡 | 規則式偵測器 | — |
| 詞彙辨識 | MediaPipe Holistic 225 維 × 30 幀 | GRU | 81.3% |

---

## 📊 支援詞彙（目前 10 個）

`Hello` / `Thank You` / `Please` / `Sorry` / `Help` / `Yes` / `No` / `Want` / `Like` / `More`
