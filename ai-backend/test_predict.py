"""
test_predict.py — 快速測試辨識腳本
使用方式：
  python test_predict.py
  python test_predict.py --image C:/Users/student/Desktop/test.jpg
"""

import base64
import requests
import argparse
import os

API_URL = "http://localhost:8000/predict"

def predict(image_path):
    if not os.path.exists(image_path):
        print(f"❌ 找不到圖片：{image_path}")
        return

    with open(image_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()

    print(f"📤 送出圖片：{image_path}")
    r = requests.post(API_URL, json={'image': b64})
    result = r.json()

    if not result['detections']:
        print("❌ 沒有偵測到任何手語")
        return

    print(f"\n🎯 辨識結果：")
    for d in result['detections']:
        print(f"   字母：{d['label']}  信心值：{d['confidence']*100:.1f}%")
    print(f"   推論耗時：{result['inference_time_ms']:.1f}ms")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', default=r'C:\Users\student\Desktop\test.jpg')
    args = parser.parse_args()
    predict(args.image)
