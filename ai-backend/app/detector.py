# detector.py
# 【組員 A 主要負責】
# YOLOv8 推論核心邏輯
#
# TODO 清單：
#   1. 載入訓練好的 best.pt 權重
#   2. 實作 predict()：base64 影格 → 解碼 → 推論 → 回傳結構化結果
#   3. 加入非極大值抑制（NMS）閾值調整（confidence_threshold, iou_threshold）
#   4. 處理沒有偵測到任何手勢的情況
#   5. 確認 class_names 與訓練時的標籤順序一致

import base64
import numpy as np
import cv2
from ultralytics import YOLO


class SignDetector:
    """YOLOv8 手語辨識器"""

    # TODO: 組員 A 替換為訓練好的完整手語標籤清單（需與 best.pt 順序一致）
    CLASS_NAMES = ["你好", "謝謝", "對不起", "我愛你", "再見"]

    def __init__(
        self,
        model_path: str = "models/best.pt",
        confidence_threshold: float = 0.5,
        iou_threshold: float = 0.45,
    ):
        """
        Args:
            model_path: YOLOv8 權重檔路徑
            confidence_threshold: 低於此值的偵測結果會被過濾
            iou_threshold: NMS 的 IoU 閾值
        """
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold

        # TODO: 載入模型
        self.model = YOLO(model_path)
        self.model.fuse()  # 融合層加速推論

    def predict(self, base64_image: str) -> list[dict]:
        """
        Args:
            base64_image: canvas.toDataURL('image/jpeg') 的輸出，包含或不含 data URI header

        Returns:
            list of { label, confidence, bbox }

        TODO:
            1. 解碼 base64 → numpy array → BGR image
            2. 執行 YOLOv8 推論
            3. 過濾低信心值結果
            4. 回傳標準化的結果格式
        """
        # Step 1: 解碼 base64 影格
        if "," in base64_image:
            base64_image = base64_image.split(",")[1]  # 去掉 data:image/jpeg;base64, 前綴

        img_bytes = base64.b64decode(base64_image)
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

        if frame is None:
            raise ValueError("無法解碼影格，請確認 base64 格式正確")

        # Step 2: TODO - 執行 YOLOv8 推論
        results = self.model.predict(
            source=frame,
            conf=self.confidence_threshold,
            iou=self.iou_threshold,
            verbose=False,
        )

        # Step 3: 解析結果
        detections = []
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()

                detections.append({
                    "label": self.CLASS_NAMES[class_id] if class_id < len(self.CLASS_NAMES) else f"class_{class_id}",
                    "confidence": round(confidence, 4),
                    "bbox": [round(x1), round(y1), round(x2), round(y2)],
                })

        return detections
