# main.py — FastAPI 路由（ONNX 版本）
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.detector import SignDetector
import time, logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="手語心連 AI API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    detector = SignDetector(model_path="models/best.onnx")
    logger.info("ONNX 模型載入成功")
except Exception as e:
    logger.warning(f"模型載入失敗（開發模式）：{e}")
    detector = None


class PredictRequest(BaseModel):
    image: str

class Detection(BaseModel):
    label: str
    confidence: float
    bbox: list[float]

class PredictResponse(BaseModel):
    detections: list[Detection]
    inference_time_ms: float


@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": detector is not None}


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest):
    if detector is None:
        return PredictResponse(
            detections=[Detection(label="A", confidence=0.87, bbox=[100, 80, 300, 400])],
            inference_time_ms=0.0,
        )
    start = time.time()
    try:
        detections = detector.predict(request.image)
        elapsed = (time.time() - start) * 1000
        logger.info(f"推論完成：{len(detections)} 筆，耗時 {elapsed:.1f}ms")
        return PredictResponse(detections=detections, inference_time_ms=elapsed)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
