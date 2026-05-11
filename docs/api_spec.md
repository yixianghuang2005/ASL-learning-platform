# 📡 API 介面定義 (api_spec.md)

前端（組員 B）與 AI 後端（組員 A）之間的合約文件。
**任何一方修改介面前，請先更新此文件並知會對方。**

---

## Base URL

| 環境 | URL |
|------|-----|
| 本地開發 | `http://localhost:8000` |
| （上線後填入） | - |

---

## 端點一覽

### `GET /health`

確認後端是否在線，前端啟動時呼叫一次。

**Response 200**
```json
{
  "status": "ok",
  "model_loaded": true
}
```

---

### `POST /predict`

送入單張影格，取得手語辨識結果。

**Request Body**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

| 欄位 | 類型 | 說明 |
|------|------|------|
| `image` | string | base64 編碼的 JPEG 影格（可含 data URI header） |

**Response 200**
```json
{
  "detections": [
    {
      "label": "你好",
      "confidence": 0.872,
      "bbox": [102, 80, 305, 398]
    }
  ],
  "inference_time_ms": 43.2
}
```

| 欄位 | 類型 | 說明 |
|------|------|------|
| `detections` | array | 所有偵測到的手勢，可能為空陣列 |
| `detections[].label` | string | 辨識到的手語標籤（中文） |
| `detections[].confidence` | float | 信心值，範圍 0.0 ~ 1.0 |
| `detections[].bbox` | number[4] | 邊界框 `[x1, y1, x2, y2]`，像素座標 |
| `inference_time_ms` | float | 後端推論耗時（毫秒） |

**Response 500**
```json
{
  "detail": "推論失敗：..."
}
```

---

## 注意事項

- 前端每 **500ms** 送一次影格（可調整）
- 後端推論目標 < **200ms**（GPU），CPU 模式可能較慢
- `detections` 為空陣列代表當前畫面沒有偵測到任何手勢
- 前端應處理後端離線的情況（顯示提示而非崩潰）
