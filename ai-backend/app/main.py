# main.py
# 【組員 A 主要負責】
# FastAPI 路由定義
#
# TODO 清單：
#   1. 實作 POST /predict 路由，接收 base64 影格，呼叫 detector.py 取得結果
#   2. 加入 CORS 設定（允許 React 前端跨域請求）
#   3. 實作 GET /health 路由（前端用來確認後端是否在線）
#   4. 加入 Request 驗證（Pydantic model）
#   5. 加入 logging，記錄每次推論的耗時

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.detector import SignDetector
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="手語心連 AI API",
    description="YOLOv8 手語辨識推論 API",
    version="0.1.0",
)

# CORS 設定：允許前端跨域呼叫
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # TODO: 上線後改為正式網域
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化偵測器（只載入一次模型）
# TODO: 組員 A 確認 models/best.pt 路徑正確
try:
    detector = SignDetector(model_path="models/best.pt")
    logger.info("YOLOv8 模型載入成功")
except Exception as e:
    logger.warning(f"模型載入失敗（開發模式）：{e}")
    detector = None


# ── Request / Response Schema ──────────────────────────────────

class PredictRequest(BaseModel):
    image: str  # base64 編碼的 JPEG 影格


class Detection(BaseModel):
    label: str       # 辨識到的手語標籤
    confidence: float  # 信心值 0.0 ~ 1.0
    bbox: list[float]  # [x1, y1, x2, y2]，像素座標


class PredictResponse(BaseModel):
    detections: list[Detection]
    inference_time_ms: float


# ── 路由 ────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    """前端用來確認後端是否在線"""
    return {"status": "ok", "model_loaded": detector is not None}


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest):
    """
    接收 base64 影格，回傳手語辨識結果

    Request body:
        image (str): base64 編碼的 JPEG 影格

    Response:
        detections: 偵測到的所有手勢
        inference_time_ms: 推論耗時（毫秒）
    """
    if detector is None:
        # 開發模式：回傳假資料
        logger.warning("使用假資料（模型未載入）")
        return PredictResponse(
            detections=[Detection(label="你好", confidence=0.87, bbox=[100, 80, 300, 400])],
            inference_time_ms=0.0,
        )

    start = time.time()
    try:
        # TODO: 組員 A 實作 detector.predict()
        detections = detector.predict(request.image)
        elapsed = (time.time() - start) * 1000
        logger.info(f"推論完成：{len(detections)} 個偵測，耗時 {elapsed:.1f}ms")
        return PredictResponse(detections=detections, inference_time_ms=elapsed)
    except Exception as e:
        logger.error(f"推論失敗：{e}")
        raise HTTPException(status_code=500, detail=f"推論失敗：{str(e)}")
