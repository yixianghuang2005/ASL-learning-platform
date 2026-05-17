import onnxruntime as ort
import numpy as np
import cv2

session = ort.InferenceSession('models/best.onnx', providers=['DmlExecutionProvider','CPUExecutionProvider'])
print('使用provider:', session.get_providers())

img = cv2.imread(r'dataset\asl-alphabet\train\images\A0005_png.rf.b9daeafda3d83c63ceed69badfd2a6f8.jpg')
img = cv2.resize(img, (640,640))
img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
img = np.transpose(img, (2,0,1))[None]

out = session.run(None, {session.get_inputs()[0].name: img})
pred = out[0][0].T  # (8400, 31)

scores = pred[:, 4:]
max_scores = scores.max(axis=1)
best_idx = max_scores.argmax()

print('輸出 shape:', out[0].shape)
print('最高信心值 top5:', sorted(max_scores, reverse=True)[:5])
print('超過 0.25 的數量:', (max_scores > 0.25).sum())
print('超過 0.1 的數量:', (max_scores > 0.1).sum())
print('最佳偵測 class:', scores[best_idx].argmax(), '信心值:', max_scores[best_idx])
