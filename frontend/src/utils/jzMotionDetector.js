// jzMotionDetector.js
// ─────────────────────────────────────────────────────────────────────────────
// ASL 動態字母 J、Z 的軌跡偵測器（純前端、零依賴）
//
// 為什麼：
//   ASL A-Z 中 J 和 Z 是「會動」的，靜態 MLP 分類器無法辨識，必須看連續幀
//   的軌跡。本模組維護最近 N 幀的 MediaPipe Hands landmarks，當：
//     1) 手型符合 J（"I" handshape：小指伸出）或 Z（"1" handshape：食指伸出）
//     2) 對應指尖的軌跡形狀符合 J（縱向 + 鉤尾）或 Z（兩條近水平 + 一條斜線）
//   就回報偵測結果。
//
// 用法：
//   const det = new JZMotionDetector();
//   // 每幀（在 MediaPipe Hands onResults 內呼叫）：
//   const result = det.pushFrame(landmarks, performance.now());
//   if (result) console.log(result.label, result.confidence);
//
// MediaPipe Hands landmark 索引：
//   0:WRIST  1-4:THUMB  5-8:INDEX  9-12:MIDDLE  13-16:RING  17-20:PINKY
//   每個 lm 有 {x, y, z}，xy 是 0-1 的影像座標（y 向下）。
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. 幾何/向量小工具 ───────────────────────────────────────────────────────
function dist2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function sub2D(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

// 計算一條 polyline 的總長度（用來判斷軌跡夠不夠長）
function polylineLength(points) {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += dist2D(points[i - 1], points[i]);
  return s;
}

// 把 polyline 重採樣成 n 個等距點。比直接看原始幀穩定很多，因為 MediaPipe
// 的相鄰幀位移會抖動。
function resample(points, n) {
  if (points.length < 2) return [];
  const total = polylineLength(points);
  if (total < 1e-6) return [];
  const step = total / (n - 1);
  const out = [points[0]];
  let acc = 0;
  let i = 1;
  while (out.length < n && i < points.length) {
    const seg = dist2D(points[i - 1], points[i]);
    if (acc + seg >= step) {
      const t = (step - acc) / seg;
      const p = {
        x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
        y: points[i - 1].y + t * (points[i].y - points[i - 1].y),
      };
      out.push(p);
      points = [p, ...points.slice(i)];   // 從新點繼續
      acc = 0;
      i = 1;
    } else {
      acc += seg;
      i++;
    }
  }
  while (out.length < n) out.push(points[points.length - 1]);
  return out;
}

// 軌跡的 axis-aligned bounding box
function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// ── 2. 手型判斷 ──────────────────────────────────────────────────────────────
// 「手指是否伸直」用三點共線程度判斷：MCP→PIP→TIP 越接近一直線越伸直。
// 加上「兩段長度比接近」這個檢查避免彎曲的手指被誤判（彎曲時 MCP→PIP 跟
// PIP→TIP 兩段長度差很多）。
function fingerExtension(landmarks, mcpIdx, pipIdx, tipIdx) {
  const mcp = landmarks[mcpIdx];
  const pip = landmarks[pipIdx];
  const tip = landmarks[tipIdx];
  const v1 = sub2D(pip, mcp);
  const v2 = sub2D(tip, pip);
  const n1 = Math.hypot(v1.x, v1.y);
  const n2 = Math.hypot(v2.x, v2.y);
  if (n1 < 1e-6 || n2 < 1e-6) return 0;
  // cos(夾角)：1 = 完全伸直、0 = 垂直、-1 = 反折
  const cos = (v1.x * v2.x + v1.y * v2.y) / (n1 * n2);
  // 兩段長度比應該接近（伸直的手指 PIP-TIP ≈ MCP-PIP）
  const ratio = n2 / n1;
  const ratioOk = ratio > 0.5 && ratio < 2.5 ? 1 : 0;
  return Math.max(0, cos) * ratioOk;
}

// 回傳 5 個手指的伸直度（0~1），順序：[thumb, index, middle, ring, pinky]
function fingerStates(landmarks) {
  return [
    fingerExtension(landmarks, 2, 3, 4),    // thumb
    fingerExtension(landmarks, 5, 6, 8),    // index
    fingerExtension(landmarks, 9, 10, 12),  // middle
    fingerExtension(landmarks, 13, 14, 16), // ring
    fingerExtension(landmarks, 17, 18, 20), // pinky
  ];
}

// "I" handshape：小指伸出，其他手指（除拇指）彎曲 → J 的起始手型
// 用「相對長度法」：小指 tip 到 wrist 距離 > 其他三指（index/middle/ring）×門檻
// 這比要求「每根手指完美共線」對相機角度變化更穩健。
function isHandShapeI(landmarks) {
  const wrist = landmarks[0];
  const d = {
    index:  dist2D(landmarks[8],  wrist),
    middle: dist2D(landmarks[12], wrist),
    ring:   dist2D(landmarks[16], wrist),
    pinky:  dist2D(landmarks[20], wrist),
  };
  const maxOther = Math.max(d.index, d.middle, d.ring);
  // 小指自然就比較短，所以門檻只用 1.05（小指比其他凸出 5% 就算數）
  return d.pinky > maxOther * 1.05;
}

// "1" handshape：食指伸出，其他手指（除拇指）彎曲 → Z 的起始手型
function isHandShape1(landmarks) {
  const wrist = landmarks[0];
  const d = {
    index:  dist2D(landmarks[8],  wrist),
    middle: dist2D(landmarks[12], wrist),
    ring:   dist2D(landmarks[16], wrist),
    pinky:  dist2D(landmarks[20], wrist),
  };
  const maxOther = Math.max(d.middle, d.ring, d.pinky);
  // 食指比其他三指長至少 20% 才算「明顯伸出」
  return d.index > maxOther * 1.2;
}

// ── 3. 軌跡形狀比對 ──────────────────────────────────────────────────────────
// 把軌跡正規化到單位 bbox 後計算「主要方向序列」。8 個方向碼：
//   0:右, 1:右下, 2:下, 3:左下, 4:左, 5:左上, 6:上, 7:右上
function directionCode(dx, dy) {
  const ang = Math.atan2(dy, dx);              // [-PI, PI]，y 向下
  const sector = Math.round(ang / (Math.PI / 4)) & 7;  // mod 8
  return sector;
}

// 把 N 點軌跡簡化為 K 段的主要方向序列
function dominantDirections(points, segments = 4) {
  if (points.length < 2) return [];
  const perSeg = Math.floor(points.length / segments);
  if (perSeg < 1) return [];
  const dirs = [];
  for (let s = 0; s < segments; s++) {
    const a = points[s * perSeg];
    const b = points[Math.min((s + 1) * perSeg, points.length - 1)];
    if (dist2D(a, b) < 1e-6) continue;
    dirs.push(directionCode(b.x - a.x, b.y - a.y));
  }
  return dirs;
}

// J 模板：先「下」(2) 再轉去「下/左下/左」(2,3,4) 或「下/右下/右」(2,1,0)
// 軌跡分 4 段：[下, 下, 下→側]，最後一段方向跟前兩段不同
// 為了支援左右手都做 J（鉤的方向相反），不限定鉤方向
function matchJ(points) {
  if (points.length < 8) return 0;
  const dirs = dominantDirections(points, 4);
  if (dirs.length < 3) return 0;
  // 前 2 段應該都是「往下」(方向 1, 2, 3 的範圍，主分量是 y 增加)
  let downCount = 0;
  for (let i = 0; i < Math.min(2, dirs.length); i++) {
    if ([1, 2, 3].includes(dirs[i])) downCount++;
  }
  if (downCount < 1) return 0;
  // 最後一段應該轉去側面（4=左 或 0=右）或斜上 (5,7)
  const last = dirs[dirs.length - 1];
  const turned = [0, 4, 5, 6, 7].includes(last);
  if (!turned) return 0;
  // bbox 應該縱長 > 橫長（J 是直的字母）
  const bb = bbox(points);
  if (bb.h < bb.w * 0.9) return 0;
  // 分數
  const score =
    (downCount / 2) *
    (turned ? 1 : 0) *
    Math.min(1, bb.h / (bb.w + 1e-6) / 2);
  return Math.min(1, score);
}

// Z 模板：用「軌跡 4 個分位點在 bbox 內的相對位置」判斷，比方向碼穩健很多
// Z 標準軌跡：起點左上 → 右上 → 左下 → 右下（或鏡像版：右上→左上→右下→左下）
// 真實使用者畫的 Z 三段常常都不是完全水平，但這四個關鍵位置很穩定
function matchZ(points) {
  if (points.length < 8) return 0;
  const bb = bbox(points);
  if (bb.w < 1e-4 || bb.h < 1e-4) return 0;
  // bbox 高寬比 — Z 大致接近正方，但允許扁一點
  const ratio = bb.h / bb.w;
  if (ratio > 1.8 || ratio < 0.15) return 0;

  // 取 4 個分位點（0%, 33%, 66%, 100%）
  const idxs = [
    0,
    Math.floor(points.length * 0.33),
    Math.floor(points.length * 0.66),
    points.length - 1,
  ];
  // 轉換成 bbox 內的相對座標（0~1）
  const rel = idxs.map(i => ({
    x: (points[i].x - bb.minX) / bb.w,
    y: (points[i].y - bb.minY) / bb.h,
  }));
  const [p0, p1, p2, p3] = rel;

  // 兩種模式：
  //   A) 從左上出發：p0(L,T) → p1(R,T) → p2(L,B) → p3(R,B)
  //   B) 鏡像版：   p0(R,T) → p1(L,T) → p2(R,B) → p3(L,B)
  // 「L=x<0.4」、「R=x>0.6」、「T=y<0.4」、「B=y>0.6」 — 加緩衝
  const score = (cond) => cond ? 1 : 0;
  const inL = x => x < 0.45;
  const inR = x => x > 0.55;
  const inT = y => y < 0.45;
  const inB = y => y > 0.55;

  // 模式 A 的符合度（每個點 0 或 1，最大 4 分）
  const sA =
    score(inL(p0.x) && inT(p0.y)) +
    score(inR(p1.x) && inT(p1.y)) +
    score(inL(p2.x) && inB(p2.y)) +
    score(inR(p3.x) && inB(p3.y));

  // 模式 B（鏡像）
  const sB =
    score(inR(p0.x) && inT(p0.y)) +
    score(inL(p1.x) && inT(p1.y)) +
    score(inR(p2.x) && inB(p2.y)) +
    score(inL(p3.x) && inB(p3.y));

  const best = Math.max(sA, sB);
  if (best < 3) return 0;   // 至少 4 個關鍵點中 3 個對位

  // 額外確認：x 在 0→1 和 2→3 之間移動方向相同（都向右 或 都向左）
  // 否則可能是 N 或其他形狀
  const x01 = p1.x - p0.x;
  const x23 = p3.x - p2.x;
  const xConsistent = Math.sign(x01) === Math.sign(x23) && Math.abs(x01) > 0.2 && Math.abs(x23) > 0.2;

  // 中間段 (p1→p2) 應該明顯往下（y 增加）+ 橫向反向移動（對角線）
  const diagDown = (p2.y - p1.y) > 0.3;
  const diagAcross = Math.sign(p2.x - p1.x) !== Math.sign(x01) && Math.abs(p2.x - p1.x) > 0.2;

  let s = best / 4 * 0.5;        // 位置匹配貢獻 0~0.5
  if (xConsistent) s += 0.25;
  if (diagDown && diagAcross) s += 0.25;
  return Math.min(1, s);
}

// ── 4. 主類別：JZMotionDetector ─────────────────────────────────────────────
export class JZMotionDetector {
  /**
   * @param {Object} options
   * @param {number} [options.minWindowMs=500]   - 累積至少多久才嘗試判斷
   * @param {number} [options.maxWindowMs=2000]  - 緩衝最多保留多久
   * @param {number} [options.cooldownMs=1500]   - 偵測到後的冷卻時間
   * @param {number} [options.minMotion=0.18]    - 軌跡最少要有多大位移（hand-scale 正規化）
   * @param {number} [options.confidenceThresh=0.55] - 判定門檻
   * @param {boolean} [options.debug=false]      - 是否輸出 debug 物件
   * @param {boolean} [options.mirrored=false]   - 攝影機畫面是鏡像時設 true（內部翻 x 軸）
   */
  constructor(options = {}) {
    this.minWindowMs = options.minWindowMs ?? 500;
    this.maxWindowMs = options.maxWindowMs ?? 2000;
    this.cooldownMs = options.cooldownMs ?? 1500;
    this.minMotion = options.minMotion ?? 0.12;
    this.confidenceThresh = options.confidenceThresh ?? 0.55;
    this.debug = options.debug ?? false;
    // mirrored: 影像是鏡像顯示時設 true。內部會把 x 翻轉，
    // 讓使用者可以照「面對畫面的自然方向」畫 J/Z。
    this.mirrored = options.mirrored ?? false;

    // 緩衝：每幀存 {t, handShape, indexTip, pinkyTip, scale}
    this.buffer = [];
    this.lastDetectionT = -Infinity;
  }

  reset() {
    this.buffer = [];
    this.lastDetectionT = -Infinity;
  }

  /**
   * 餵入一幀。若偵測到 J 或 Z，回傳 { label, confidence, debug? }；
   * 沒偵測到或還在累積回傳 null。
   *
   * @param {Array<{x:number,y:number,z:number}>} landmarks 21 個 MediaPipe lm
   * @param {number} t 時間戳（毫秒，例如 performance.now()）
   */
  pushFrame(landmarks, t) {
    if (!landmarks || landmarks.length < 21) {
      // 沒手 → 直接清掉緩衝（避免接上一段不連續軌跡）
      if (this.buffer.length) this.buffer = [];
      return null;
    }

    // 鏡像處理：使用者面對鏡像畫面時，他畫的方向跟 MediaPipe 座標相反。
    // 翻轉 x 軸後內部處理就跟「使用者眼中的方向」一致。
    if (this.mirrored) {
      landmarks = landmarks.map(lm => ({ x: 1 - lm.x, y: lm.y, z: lm.z }));
    }

    // 冷卻中
    if (t - this.lastDetectionT < this.cooldownMs) return null;

    const states = fingerStates(landmarks);
    const handI = isHandShapeI(landmarks);
    const hand1 = isHandShape1(landmarks);
    const handShape = handI ? 'I' : hand1 ? '1' : null;

    // 用「中指 MCP 到 wrist」當手部尺度單位，後面軌跡都正規化過
    const scale = dist2D(landmarks[9], landmarks[0]);
    if (scale < 1e-6) return null;

    // 我們不要求每幀手型都對 — 偵測初期 + 結束會有過渡幀。
    // 但完全沒有任何幀符合就不可能是 J/Z。
    this.buffer.push({
      t,
      handShape,
      indexTip: { x: landmarks[8].x, y: landmarks[8].y },
      pinkyTip: { x: landmarks[20].x, y: landmarks[20].y },
      scale,
    });

    // 砍掉過老的幀
    while (this.buffer.length && t - this.buffer[0].t > this.maxWindowMs) {
      this.buffer.shift();
    }

    // 還沒累積夠
    if (this.buffer.length < 5) return null;
    const windowMs = t - this.buffer[0].t;
    if (windowMs < this.minWindowMs) return null;

    // ── 嘗試 J：要求緩衝裡有相當比例的 "I" 手型 ──
    let jScore = 0;
    {
      const iFrames = this.buffer.filter(f => f.handShape === 'I');
      if (iFrames.length / this.buffer.length > 0.25) {
        const traj = iFrames.map(f => f.pinkyTip);
        const motion = polylineLength(traj) / scale;
        if (motion > this.minMotion) {
          const resampled = resample(traj, 16);
          jScore = matchJ(resampled);
        }
      }
    }

    // ── 嘗試 Z：要求緩衝裡有相當比例的 "1" 手型 ──
    let zScore = 0;
    {
      const oneFrames = this.buffer.filter(f => f.handShape === '1');
      if (oneFrames.length / this.buffer.length > 0.25) {
        const traj = oneFrames.map(f => f.indexTip);
        const motion = polylineLength(traj) / scale;
        if (motion > this.minMotion) {
          const resampled = resample(traj, 16);
          zScore = matchZ(resampled);
        }
      }
    }

    if (jScore < this.confidenceThresh && zScore < this.confidenceThresh) {
      return this.debug
        ? { label: null, confidence: 0, debug: { jScore, zScore, windowMs, handShape, bufLen: this.buffer.length } }
        : null;
    }

    const label = jScore >= zScore ? 'J' : 'Z';
    const confidence = Math.max(jScore, zScore);
    this.lastDetectionT = t;
    this.buffer = [];   // 偵測到就清空

    return this.debug
      ? { label, confidence, debug: { jScore, zScore, windowMs, handShape } }
      : { label, confidence };
  }

  /** 提供當前軌跡座標供 UI 視覺化（debug 用） */
  getTrajectory() {
    if (!this.buffer.length) return { tip: 'index', points: [] };
    const iCount = this.buffer.filter(f => f.handShape === 'I').length;
    const oneCount = this.buffer.filter(f => f.handShape === '1').length;
    const useIndex = oneCount >= iCount;
    return {
      tip: useIndex ? 'index' : 'pinky',
      points: this.buffer.map(f => (useIndex ? f.indexTip : f.pinkyTip)),
    };
  }
}

// 預設匯出方便 import 寫法
export default JZMotionDetector;

// 也匯出幾個內部函數給單元測試/外部視覺化
export const _internals = {
  fingerStates,
  isHandShapeI,
  isHandShape1,
  resample,
  bbox,
  matchJ,
  matchZ,
  directionCode,
  dominantDirections,
  fingerExtension,
};
