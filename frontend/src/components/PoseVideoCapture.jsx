// 📹 PoseVideoCapture.jsx — 純前端 Pose Estimation 推論（不需要後端）
//
// 流程：攝影機 → MediaPipe Hands 抽 21 個關節點 → 正規化 → ONNX MLP 分類器 → 字母
//
// 依賴：
//   npm install @mediapipe/hands @mediapipe/camera_utils onnxruntime-web

import React, { useRef, useEffect, useState } from 'react';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import * as ort from 'onnxruntime-web';

const MODEL_URL = '/models/sign_mlp.onnx';
const CLASSES_URL = '/models/classes.json';

// 與後端 normalize_landmarks 完全對應的正規化（手腕原點 + 中指掌骨尺度）
function normalizeLandmarks(landmarks) {
  const wrist = landmarks[0];
  const shifted = landmarks.map(lm => ({
    x: lm.x - wrist.x,
    y: lm.y - wrist.y,
    z: lm.z - wrist.z,
  }));
  const ref = shifted[9];
  const scale = Math.sqrt(ref.x * ref.x + ref.y * ref.y + ref.z * ref.z);
  if (scale < 1e-6) return null;
  const flat = new Float32Array(63);
  shifted.forEach((p, i) => {
    flat[i * 3]     = p.x / scale;
    flat[i * 3 + 1] = p.y / scale;
    flat[i * 3 + 2] = p.z / scale;
  });
  return flat;
}

function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}

export default function PoseVideoCapture({ onResult }) {
  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const cameraRef      = useRef(null);
  const handsRef       = useRef(null);
  const sessionRef     = useRef(null);
  const classesRef     = useRef([]);
  const mountedRef     = useRef(true);
  const onResultRef    = useRef(onResult);   // ★ 用 ref 包住 callback，避免父元件 re-render 觸發 MediaPipe 重建
  const lastLabelRef   = useRef(null);       // ★ 節流：只在預測「真的變了」時才更新 state
  const lastConfRef    = useRef(0);
  const frameCountRef  = useRef(0);          // ★ 跳幀計數器

  const [ready, setReady]           = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [error, setError]           = useState(null);

  // 每次 prop 變動，更新 ref 內的最新 callback（不影響 effect）
  useEffect(() => { onResultRef.current = onResult; });

  // 元件掛載狀態
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 載入 ONNX 模型 + 類別清單（只跑一次）
  useEffect(() => {
    (async () => {
      try {
        const [session, classesRes] = await Promise.all([
          ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] }),
          fetch(CLASSES_URL).then(r => r.json()),
        ]);
        if (!mountedRef.current) return;
        sessionRef.current = session;
        classesRef.current = classesRes.classes;
        setReady(true);
      } catch (e) {
        console.error(e);
        if (mountedRef.current) setError(`模型載入失敗: ${e.message}`);
      }
    })();
  }, []);

  // 初始化 MediaPipe Hands + Camera（只依賴 ready，不依賴 onResult）
  useEffect(() => {
    if (!ready) return;

    const video = videoRef.current;
    if (!video) return;

    // ───── MediaPipe 結果處理 ─────
    const handleHandsResult = (results) => {
      if (!mountedRef.current) return;

      // 繪製偵測到的手到 canvas
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && results.image) {
        try {
          ctx.save();
          ctx.clearRect(0, 0, 640, 480);
          ctx.drawImage(results.image, 0, 0, 640, 480);
          if (results.multiHandLandmarks?.length) {
            ctx.fillStyle = '#00ff88';
            for (const lm of results.multiHandLandmarks[0]) {
              ctx.beginPath();
              ctx.arc(lm.x * 640, lm.y * 480, 4, 0, 2 * Math.PI);
              ctx.fill();
            }
          }
          ctx.restore();
        } catch (_) {}
      }

      // ★ 沒手 = nothing。只在「上一幀不是 nothing」時才通知，省掉每幀重繪
      if (!results.multiHandLandmarks?.length) {
        if (lastLabelRef.current !== 'nothing') {
          lastLabelRef.current = 'nothing';
          lastConfRef.current = 0;
          setPrediction({ label: 'nothing', confidence: 0 });
          onResultRef.current?.({ label: 'nothing', confidence: 0 });
        }
        return;
      }

      // ★ 跳幀：MLP 推論很便宜（~36K FLOPs），但 React 重繪很貴。
      //    每 2 幀才跑一次 ONNX，把推論率降到 ~15 fps，畫面照樣 30 fps
      frameCountRef.current = (frameCountRef.current + 1) % 2;
      if (frameCountRef.current !== 0) return;

      const features = normalizeLandmarks(results.multiHandLandmarks[0]);
      if (!features || !sessionRef.current) return;

      (async () => {
        try {
          const tensor = new ort.Tensor('float32', features, [1, 63]);
          const output = await sessionRef.current.run({ landmarks: tensor });
          if (!mountedRef.current) return;
          const logits = Array.from(output.logits.data);
          const probs = softmax(logits);
          const maxIdx = probs.indexOf(Math.max(...probs));
          const label = classesRef.current[maxIdx];
          const confidence = probs[maxIdx];

          // ★ 節流：只在「字母變了」或「信心變動 > 5%」時才更新 state
          const labelChanged = label !== lastLabelRef.current;
          const confChanged  = Math.abs(confidence - lastConfRef.current) > 0.05;
          if (labelChanged || confChanged) {
            lastLabelRef.current = label;
            lastConfRef.current  = confidence;
            setPrediction({ label, confidence });
            onResultRef.current?.({ label, confidence, probs });
          }
        } catch (e) {
          if (mountedRef.current) console.warn('ONNX 推論失敗：', e);
        }
      })();
    };

    // ───── 建立 MediaPipe Hands ─────
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    hands.onResults(handleHandsResult);
    handsRef.current = hands;

    let cancelled = false;
    const camera = new Camera(video, {
      onFrame: async () => {
        if (!mountedRef.current || cancelled) return;
        if (!video || video.readyState < 2 || !video.videoWidth) return;
        if (!handsRef.current) return;
        try {
          await handsRef.current.send({ image: video });
        } catch (e) {
          if (mountedRef.current && !cancelled) console.warn('MediaPipe send error:', e);
        }
      },
      width: 640,
      height: 480,
    });
    camera.start();
    cameraRef.current = camera;

    return () => {
      cancelled = true;
      try { camera.stop(); } catch (_) {}
      try { hands.close(); } catch (_) {}
      handsRef.current = null;
      cameraRef.current = null;
    };
  }, [ready]);   // ★ 只依賴 ready，不會被父元件 re-render 觸發重建

  return (
    <div style={{ position: 'relative', width: 640, height: 480 }}>
      {/* 不用 display:none，改成放在畫面外（保留 width/height）*/}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={{ width: '100%', borderRadius: 12, background: '#222' }}
      />
      <div style={{
        position: 'absolute', top: 12, left: 12, padding: '6px 12px',
        background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 6, fontSize: 18,
      }}>
        {error ? `⚠️ ${error}`
         : !ready ? '模型載入中…'
         : prediction ? `${prediction.label}  (${(prediction.confidence * 100).toFixed(1)}%)`
         : '請將手放入畫面'}
      </div>
    </div>
  );
}
