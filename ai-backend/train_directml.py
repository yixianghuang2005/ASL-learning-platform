import torch
import torch_directml
from ultralytics import YOLO
import torch.utils.data._utils.pin_memory as pin_memory_utils

# 1. 初始化 DirectML 裝置
dml = torch_directml.device()
print(f"🚀 強制啟動顯卡：{dml} (AMD RX 9060 XT)")

# 2. 核心攔截：徹底廢掉 pin_memory 功能
# 因為 DirectML 不需要也不支援 CUDA 的 pin_memory 邏輯
def disable_pin_memory(data, device=None):
    return data

pin_memory_utils.pin_memory = disable_pin_memory

# 3. 欺騙行為補丁
torch.cuda.is_available = lambda: True
torch.cuda.device = lambda *args: dml
torch.cuda.current_device = lambda: 0
torch.cuda.get_device_name = lambda x: "AMD Radeon RX 9060 XT"
torch.cuda.is_bf16_supported = lambda: False # DirectML 對 bf16 支援度不一

# 4. 建立模型
model = YOLO('yolov8m.pt')

# 5. 開始訓練
if __name__ == '__main__':
    results = model.train(
        data=r'dataset\asl-alphabet\data.yaml',
        epochs=150,
        imgsz=640,
        batch=4,           # 如果顯存 (VRAM) 夠大可以調回 8
        device='cpu',      # 邏輯上用 cpu，運算會被我們的補丁導向 dml
        amp=False,         # 關閉混合精度，這對 DirectML 穩定性至關重要
        workers=0,         # 必須為 0，否則多線程會抓不到裝置
        project='asl_recognition',
        name='rx9060xt_fix',
        # 優化器建議
        optimizer='AdamW', # AdamW 在 DirectML 下通常比 SGD 穩一點
        plots=True
    )