// PoseVideoCapture.jsx — 純前端 Pose Estimation 推論（不需要後端）
//
// 流程：
//   攝影機 → MediaPipe Hands 抽 21 個關節點
//     ├─ 給 JZMotionDetector 看（軌跡式偵測 J、Z 兩個動態字母）
//     └─ 沒命中時 → 正規化 → ONNX MLP 分類器（靜態字母 A-Y 扣 J）
//
// 依賴：
//   npm install @mediapipe/hands @mediapipe/camera_utils onnxruntime-web

import React, { useRef, useEffect, useState } from 'react';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import * as ort from 'onnxruntime-web';
import JZMotionDetector from '../utils/jzMotionDetector';

const MODEL_URL = '/models/sign_mlp.onnx';
const CLASSES_URL = '/models/classes.json';

// J/Z 偵測到後在畫面上停留的時間（毫秒）。這段時間內 MLP 的結果會被忽略，
// 避免動作結束的瞬間 MLP 又跳回某個靜態字母蓋掉 J/Z。
const JZ_HOLD_MS = 1200;

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
  const onResultRef    = useRef(onResult);
  const lastLabelRef   = useRef(null);
  const lastConfRef    = useRef(0);
  const frameCountRef  = useRef(0);
  const jzDetectorRef  = useRef(null);
  const jzHoldUntilRef = useRef(0);

  const [ready, setReady]           = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [error, setError]           = useState(null);

  useEffect(() => { onResultRef.current = onResult; });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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

  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current;
    if (!video) return;

    jzDetectorRef.current = new JZMotionDetector({ mirrored: true });
    jzHoldUntilRef.current = 0;

    const handleHandsResult = (results) => {
      if (!mountedRef.current) return;

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

      const now = performance.now();

      if (!results.multiHandLandmarks?.length) {
        jzDetectorRef.current?.pushFrame(null, now);
        if (now < jzHoldUntilRef.current) return;
        if (lastLabelRef.current !== 'nothing') {
          lastLabelRef.current = 'nothing';
          lastConfRef.current = 0;
          setPrediction({ label: 'nothing', confidence: 0 });
          onResultRef.current?.({ label: 'nothing', confidence: 0 });
        }
        return;
      }

      const landmarks = results.multiHandLandmarks[0];

      // 1) J/Z 偵測器（每幀都餵）
      const jzResult = jzDetectorRef.current?.pushFrame(landmarks, now);
      if (jzResult && jzResult.label) {
        jzHoldUntilRef.current = now + JZ_HOLD_MS;
        lastLabelRef.current = jzResult.label;
        lastConfRef.current = jzResult.confidence;
        setPrediction({ label: jzResult.label, confidence: jzResult.confidence });
        onResultRef.current?.({
          label: jzResult.label,
          confidence: jzResult.confidence,
          source: 'jz-motion',
        });
        return;
      }

      if (now < jzHoldUntilRef.current) return;

      // 2) MLP（負責靜態字母）— 每 2 幀跑一次
      frameCountRef.current = (frameCountRef.current + 1) % 2;
      if (frameCountRef.current !== 0) return;

      const features = normalizeLandmarks(landmarks);
      if (!features || !sessionRef.current) return;

      (async () => {
        try {
          const tensor = new ort.Tensor('float32', features, [1, 63]);
          const output = await sessionRef.current.run({ landmarks: tensor });
          if (!mountedRef.current) return;
          if (performance.now() < jzHoldUntilRef.current) return;
          const logits = Array.from(output.logits.data);
          const probs = softmax(logits);
          const maxIdx = probs.indexOf(Math.max(...probs));
          const label = classesRef.current[maxIdx];
          const confidence = probs[maxIdx];
          const labelChanged = label !== lastLabelRef.current;
          const confChanged  = Math.abs(confidence - lastConfRef.current) > 0.05;
          if (labelChanged || confChanged) {
            lastLabelRef.current = label;
            lastConfRef.current  = confidence;
            setPrediction({ label, confidence });
            onResultRef.current?.({ label, confidence, probs, source: 'mlp' });
          }
        } catch (e) {
          if (mountedRef.current) console.warn('ONNX 推論失敗：', e);
        }
      })();
    };

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
  }, [ready]);

  return (
    <div style={{ position: 'relative', width: 640, height: 480 }}>
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
        {error ? '⚠️ ' + error
         : !ready ? '模型載入中…'
         : prediction ? prediction.label + '  (' + (prediction.confidence * 100).toFixed(1) + '%)'
         : '請將手放入畫面'}
      </div>
    </div>
  );
}
