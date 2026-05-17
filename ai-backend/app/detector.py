# detector.py — ONNX Runtime + DirectML 推論
import base64
import numpy as np
import cv2
import onnxruntime as ort

class SignDetector:
    CLASS_NAMES = ["A","B","C","D","E","F","G","H","I","J","K","L","M",
                   "N","O","P","Q","R","S","T","U","V","W","X","Y","Z","nothing"]

    def __init__(
        self,
        model_path: str = "models/best.onnx",
        confidence_threshold: float = 0.25,
        iou_threshold: float = 0.45,
    ):
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.input_size = 640

        providers = ['DmlExecutionProvider', 'CPUExecutionProvider']
        try:
            self.session = ort.InferenceSession(model_path, providers=providers)
            used = self.session.get_providers()[0]
            print(f"✅ ONNX 推論使用：{used}")
        except Exception as e:
            print(f"⚠️ DirectML 失敗，改用 CPU：{e}")
            self.session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])

        self.input_name = self.session.get_inputs()[0].name

    def preprocess(self, frame):
        img = cv2.resize(frame, (self.input_size, self.input_size))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = img.astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))
        img = np.expand_dims(img, axis=0)
        return img

    def postprocess(self, output, orig_w, orig_h):
        predictions = output[0][0].T  # (8400, 31)
        boxes = predictions[:, :4]
        scores = predictions[:, 4:]

        class_ids = np.argmax(scores, axis=1)
        confidences = scores[np.arange(len(scores)), class_ids]

        mask = confidences >= self.confidence_threshold
        boxes = boxes[mask]
        confidences = confidences[mask]
        class_ids = class_ids[mask]

        if len(boxes) == 0:
            return []

        scale_x = orig_w / self.input_size
        scale_y = orig_h / self.input_size
        x1 = boxes[:, 0] - boxes[:, 2] / 2
        y1 = boxes[:, 1] - boxes[:, 3] / 2
        x2 = boxes[:, 0] + boxes[:, 2] / 2
        y2 = boxes[:, 1] + boxes[:, 3] / 2

        # bbox 已經是 640 座標系，不需要再乘以 scale
        # 只有當原圖不是 640 時才需要縮放
        x1 = x1 * orig_w / self.input_size
        y1 = y1 * orig_h / self.input_size
        x2 = x2 * orig_w / self.input_size
        y2 = y2 * orig_h / self.input_size

        detections = []
        for i in range(len(x1)):
            cid = int(class_ids[i])
            detections.append({
                "label": self.CLASS_NAMES[cid] if cid < len(self.CLASS_NAMES) else f"class_{cid}",
                "confidence": round(float(confidences[i]), 4),
                "bbox": [round(float(x1[i])), round(float(y1[i])),
                         round(float(x2[i])), round(float(y2[i]))],
            })
        return detections

    def predict(self, base64_image: str) -> list[dict]:
        if "," in base64_image:
            base64_image = base64_image.split(",")[1]
        img_bytes = base64.b64decode(base64_image)
        frame = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
        if frame is None or frame.size == 0:
            raise ValueError("無法解碼影格")

        orig_h, orig_w = frame.shape[:2]
        tensor = self.preprocess(frame)
        outputs = self.session.run(None, {self.input_name: tensor})
        return self.postprocess(outputs, orig_w, orig_h)
