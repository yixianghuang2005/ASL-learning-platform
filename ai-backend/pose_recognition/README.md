# Pose Recognition — MediaPipe Hands + MLP 分類器

從 YOLOv8 物件偵測遷移到 **Pose Estimation** 的訓練流程。
與舊的 `asl_recognition/` (YOLO) 並存，可雙模型 A/B 比較。

## 為什麼換這條路線

| 方面 | YOLOv8m（舊） | MediaPipe + MLP（新） |
|------|--------------|----------------------|
| 模型大小 | ~50 MB | < 100 KB |
| 參數量 | ~25.9M | 18K |
| 推論需 GPU | 是（DirectML 補丁） | 否（瀏覽器 wasm 就跑） |
| 訓練時間 | 數小時 | 數分鐘 |
| 部署 | 後端 API call | **純前端** |
| 對背景/光線敏感 | 敏感 | 不敏感（先抽特徵） |

## 目錄結構

```
pose_recognition/
├── scripts/
│   ├── extract_landmarks.py   # 把圖片轉成 landmark CSV
│   ├── train_mlp.py           # 訓練 MLP 分類器
│   └── export_onnx.py         # 匯出 ONNX 供前端用
├── data/                      # 抽好的 landmarks_*.csv
├── models/                    # best_mlp.pt, sign_mlp.onnx, classes.json
└── runs/                      # history.json, confusion_matrix.csv, classification_report.txt
```

## 安裝

```powershell
# 在專案根目錄
pip install mediapipe opencv-python-headless pandas scikit-learn onnx onnxruntime
# torch 已經有了（YOLOv8 訓練時裝過）
```

## 三步驟訓練

### 1. 抽 landmarks（一次性，跑完就有 CSV）

```powershell
cd ai-backend
python pose_recognition/scripts/extract_landmarks.py --all
# 或分開跑：
python pose_recognition/scripts/extract_landmarks.py --split train
python pose_recognition/scripts/extract_landmarks.py --split valid
python pose_recognition/scripts/extract_landmarks.py --split test

# 想先驗證流程：
python pose_recognition/scripts/extract_landmarks.py --split train --limit 100
```

預期輸出：
- `pose_recognition/data/landmarks_train.csv` 等三檔
- `pose_recognition/data/failed_*.csv`（MediaPipe 偵測不到手的圖片清單）

J、Z 兩個動態字母會被自動排除（靜態 landmark 無法區分軌跡）。
若偵測率 < 85%，可能要回頭看是不是有圖片手太靠邊/部分裁切。

### 2. 訓練 MLP

```powershell
python pose_recognition/scripts/train_mlp.py
# 或調超參：
python pose_recognition/scripts/train_mlp.py --epochs 100 --batch 64 --lr 5e-4
```

CPU 跑就好（資料量小、模型小）。預期 5-10 分鐘內完成。
產出：
- `models/best_mlp.pt` — PyTorch 權重
- `runs/history.json`、`runs/classification_report.txt`、`runs/confusion_matrix.csv`

預期準確率：**靜態字母（A-Y 扣 J）+ nothing 應該能到 95%+**。
若某些字母（例如 M/N/S 手形相近）特別低，可看混淆矩陣判斷。

### 3. 匯出 ONNX

```powershell
python pose_recognition/scripts/export_onnx.py
```

產出：
- `models/sign_mlp.onnx`
- `models/classes.json`

## 前端整合

把這兩個檔案複製到 frontend：
```powershell
copy pose_recognition\models\sign_mlp.onnx ..\frontend\public\models\
copy pose_recognition\models\classes.json ..\frontend\public\models\
```

前端範例：`frontend/src/components/PoseVideoCapture.jsx`（已寫好參考實作）

需要安裝：
```powershell
cd ..\frontend
npm install onnxruntime-web
# @mediapipe/hands 已在 package.json 內
```

整個推論在瀏覽器跑，**完全不需要呼叫後端 API**。

## 已知限制 & 後續方向

- **J、Z 排除中**：兩者是動態手勢，現階段不支援。可選方案：
  - 簡單版：偵測手形相似的 I/字母，再看連續幀手腕位置軌跡
  - 正規版：之後若要支援，改成 LSTM 吃連續 landmark 序列（要重蒐連續影片資料）
- **單手限制**：目前 `max_num_hands=1`，只認最明顯的那隻手
- **正面視角假設**：訓練資料都是正面手勢，側面/旋轉角度大時準確率會掉
- **左右手**：MediaPipe 會自動判左右手，但分類器目前不分。若要區分可在特徵裡多加一個 `handedness` flag

## 模型大小對比

| 模型 | 檔案大小 | 推論延遲（瀏覽器 CPU） |
|------|---------|---------------------|
| YOLOv8m best.pt | ~50 MB | 不能在瀏覽器跑 |
| sign_mlp.onnx | < 100 KB | < 1 ms |
| MediaPipe Hands（前處理）| ~10 MB | 約 20-30 ms/幀 |

實際前端瓶頸是 MediaPipe Hands 本身，不是 MLP。
