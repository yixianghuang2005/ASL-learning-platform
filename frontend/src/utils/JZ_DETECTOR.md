# JZ Motion Detector — ASL 動態字母 J、Z 偵測

> 為 TSL Learning Platform 補上 ASL 字母表中唯二需要動作軌跡的字母：**J** 和 **Z**。

## 為什麼需要這個

原本的 `pose_recognition` MLP 分類器只看單一幀 21 個 landmark 的相對位置，
所以資料集就已經把 J、Z 排除（classes.json 只有 24 類）。

但 J 是「畫一個鉤」、Z 是「畫 Z 字」，本質上是**軌跡**而不是手型。
這個模組透過維護最近 ~2 秒的 landmark 緩衝，分析特定指尖的移動路徑來補上這兩個字母。

## 偵測原理

```
每幀 landmarks
    │
    ├── 手型判斷
    │     ├─ I  → 小指伸出，其他彎曲 → 開始追蹤小指尖
    │     └─ 1  → 食指伸出，其他彎曲 → 開始追蹤食指尖
    │
    ├── 進入緩衝（最近 ~2s 的指尖座標）
    │
    └── 累積 ≥ 500ms 後嘗試比對
          ├─ J 模板：軌跡方向序列 ≈ [下, 下, 側向轉折]，bbox 縱長
          └─ Z 模板：軌跡方向序列 ≈ [水平 A, 對角線反向, 水平 A]，bbox 接近正方
```

關鍵技巧：

- **正規化**：用「中指 MCP → 手腕」的距離當尺度單位，所以離鏡頭遠近不影響閾值
- **重採樣**：把不等距的緩衝點重採樣成 16 個等距點，去掉 MediaPipe 的逐幀抖動
- **方向碼**：把連續位移量化成 8 個方向（右/右下/下/左下/...），再用簡單模式比對

## 檔案

- `jzMotionDetector.js` — 偵測器主類別（純 ES module，零依賴）
- `../../public/jz-demo.html` — 獨立 webcam demo，可即時調門檻
- `../components/PoseVideoCapture.jsx` — 已整合本偵測器

## 用法（最小範例）

```javascript
import JZMotionDetector from './utils/jzMotionDetector';

const detector = new JZMotionDetector();

// 在 MediaPipe Hands 的 onResults callback 內每幀呼叫：
function onHandsResult(results) {
  const lm = results.multiHandLandmarks?.[0] ?? null;
  const result = detector.pushFrame(lm, performance.now());
  if (result && result.label) {
    console.log(`偵測到 ${result.label} (信心 ${result.confidence})`);
  }
}
```

## 可調參數

```javascript
new JZMotionDetector({
  minWindowMs: 500,          // 累積至少多久才嘗試判斷
  maxWindowMs: 2000,         // 緩衝最多保留多久
  cooldownMs: 1500,          // 偵測到後的冷卻時間，避免重複觸發
  minMotion: 0.18,           // 軌跡最少要有多大位移（hand-scale 正規化）
  confidenceThresh: 0.55,    // 0-1，判定門檻；越高越難觸發但 false positive 越少
  debug: false,              // 開啟後 pushFrame 也會在沒命中時回傳 debug 物件
});
```

**調校建議**：
- 誤觸發太多 → 提高 `confidenceThresh`（試 0.65）或 `minMotion`（試 0.25）
- 漏抓太多 → 降低 `confidenceThresh`（試 0.45）或 `minMotion`（試 0.12）
- 動作太慢被砍掉 → 提高 `maxWindowMs`（試 2500）

## 與現有 MLP 流程的整合

在 `PoseVideoCapture.jsx` 中，每幀先讓 JZ 偵測器看：
1. 命中 J/Z → 直接回報，並設「停留期」`JZ_HOLD_MS=1200ms`，這段時間內 MLP 結果被忽略
2. 沒命中 → 走原本的 MLP 流程（靜態字母 A-Y 扣 J）

`onResult` callback 多了一個 `source: 'jz-motion' | 'mlp'` 欄位讓上層知道結果來源。

## 限制 / 已知問題

- **單手**：跟 MLP 一樣 `maxNumHands=1`，畫面中同時兩隻手只看到一隻
- **鏡像**：左/右手做 J 的鉤方向相反，模板兩種都接受。但「Z 的方向」會跟著
  手的位置變動 — 鏡像 webcam 比較直覺，但如果你關閉鏡像，使用者要反向畫 Z
- **動作太慢**：超過 `maxWindowMs`（預設 2 秒）的軌跡會被砍頭，建議使用者 1 秒內完成
- **連續切換**：因為有 `cooldownMs`，連續做 J 然後馬上做 Z 之間至少要間隔 1.5 秒

## 測試怎麼跑

直接用 webcam 試最快：
```
npm start
# 開 http://localhost:3000/jz-demo.html
```

Demo 頁面有即時的軌跡視覺化、J/Z 分數、可調門檻，方便除錯。

模擬測試（不需要 webcam）：
```
node /tmp/test_jz.mjs   # 在 outputs/ 裡有原始檔
```

預期通過 6/6 案例：
- J 軌跡 + I 手型 → 偵測為 J
- Z 軌跡 + 1 手型 → 偵測為 Z
- 其他情境（靜止、開掌、拳頭、單純往下）→ 不誤觸發

## 後續可能的改進

如果規則式效果不理想，下一步可以：
1. 蒐集真人錄製的 J/Z 影片
2. 抽 landmark 序列做 LSTM 訓練
3. 把整段 pose_recognition 改成「靜態 MLP + 動態 LSTM」雙頭模型

但對學習網站這種應用，規則式通常就夠用了，而且不用蒐集動態資料。
