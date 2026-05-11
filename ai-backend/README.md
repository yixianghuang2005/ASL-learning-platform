# 🤖 AI Backend — FastAPI + YOLOv8

**主要負責人：組員 A（AI 工程師）**

---

## 📁 目錄結構

```
ai-backend/
├── models/
│   └── best.pt          ← 訓練好的 YOLOv8 權重（不要 commit 進 Git！）
├── app/
│   ├── main.py          ← 【組員 A】FastAPI 路由定義
│   └── detector.py      ← 【組員 A】YOLOv8 推論核心
└── requirements.txt     ← Python 依賴清單
```

> ⚠️ `models/best.pt` 檔案太大，請加入 `.gitignore`，改用 Google Drive 或 Git LFS 共享。

---

## 🚀 啟動方式

```bash
cd ai-backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Swagger UI（互動式 API 文件）：`http://localhost:8000/docs`

---

## 📡 API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/health` | 確認後端在線與模型載入狀態 |
| POST | `/predict` | 送入影格，取得辨識結果 |

詳細規格見 `../docs/api_spec.md`

---

## 🏋️ 模型訓練說明

1. 資料集由組員 D 提供，格式說明見 `../docs/dataset_guide.md`
2. 訓練命令範例：
   ```bash
   yolo detect train data=dataset.yaml model=yolov8n.pt epochs=100 imgsz=640
   ```
3. 訓練完成後將 `runs/detect/train/weights/best.pt` 複製到 `models/`

---

## ⚙️ 環境需求

- Python 3.10+
- 建議：NVIDIA GPU + CUDA（否則推論會較慢）
- 若使用 CPU 推論，ultralytics 仍可運行，但每次約 200–500ms
