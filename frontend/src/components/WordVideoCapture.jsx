// WordVideoCapture.jsx — 詞彙辨識鏡頭元件（MediaPipe Holistic 版）
//
// Props:
//   isRecording   {bool}    父層控制是否開始錄製
//   onConfirmed   {fn}      連續 confirmCount 次同結果且信心夠高時觸發
//   onFrame       {fn}      每次有推論結果時觸發
//   confirmCount  {number}  預設 3
//   confirmThresh {number}  預設 0.70
//
// 特徵維度：
//   V3 模型 (225維): pose(33×3) + leftHand(21×3) + rightHand(21×3)
//   V4 模型 (450維): 225 位置 + 225 速度（幀間差分）
//
// ⚠ 切換模型版本時修改 USE_VELOCITY：
//   false → 225維（目前 V3）
//   true  → 450維（V4 及之後）

import React, { useRef, useEffect, useState } from 'react';
import { Holistic } from '@mediapipe/holistic';
import { Camera }   from '@mediapipe/camera_utils';
import * as ort     from 'onnxruntime-web';

const MODEL_URL   = '/models/asl_words_sequence.onnx';
const CLASSES_URL = '/models/words_classes.json';
const SEQ_LEN     = 30;
const POS_DIM     = 225;              // pose(99) + leftHand(63) + rightHand(63)
const USE_VELOCITY = false;           // V3：225維（V4 訓練完成後改 true）
const INPUT_DIM   = USE_VELOCITY ? POS_DIM * 2 : POS_DIM;   // 225 或 450
const INFER_EVERY = 5;

// ── 特徵提取（與後端 normalize_pose / normalize_hand 對應）──────────────────

function normalizePose(landmarks) {
  if (!landmarks || landmarks.length < 13) return new Float32Array(99);
  const cx = (landmarks[11].x + landmarks[12].x) / 2;
  const cy = (landmarks[11].y + landmarks[12].y) / 2;
  const cz = (landmarks[11].z + landmarks[12].z) / 2;
  const scale = Math.sqrt(
    (landmarks[11].x - landmarks[12].x) ** 2 +
    (landmarks[11].y - landmarks[12].y) ** 2 +
    (landmarks[11].z - landmarks[12].z) ** 2,
  );
  if (scale < 1e-6) return new Float32Array(99);
  const out = new Float32Array(99);
  landmarks.forEach((lm, i) => {
    out[i * 3]     = (lm.x - cx) / scale;
    out[i * 3 + 1] = (lm.y - cy) / scale;
    out[i * 3 + 2] = (lm.z - cz) / scale;
  });
  return out;
}

function normalizeHand(landmarks) {
  if (!landmarks || landmarks.length < 21) return new Float32Array(63);
  const wrist = landmarks[0];
  const ref   = landmarks[9];
  const scale = Math.sqrt(
    (ref.x - wrist.x) ** 2 + (ref.y - wrist.y) ** 2 + (ref.z - wrist.z) ** 2,
  );
  if (scale < 1e-6) return new Float32Array(63);
  const out = new Float32Array(63);
  landmarks.forEach((lm, i) => {
    out[i * 3]     = (lm.x - wrist.x) / scale;
    out[i * 3 + 1] = (lm.y - wrist.y) / scale;
    out[i * 3 + 2] = (lm.z - wrist.z) / scale;
  });
  return out;
}

// 回傳 225 維位置特徵（buffer 永遠只存位置）
function frameFeatures(results) {
  const pose  = normalizePose(results.poseLandmarks);
  const left  = normalizeHand(results.leftHandLandmarks);
  const right = normalizeHand(results.rightHandLandmarks);
  const feat  = new Float32Array(POS_DIM);
  feat.set(pose,  0);
  feat.set(left,  99);
  feat.set(right, 162);
  return feat;
}

// 從位置 buffer 建立推論用的 flat array（支援 225 或 450 維）
function buildInputFlat(buf) {
  const flat = new Float32Array(SEQ_LEN * INPUT_DIM);
  if (!USE_VELOCITY) {
    // 225 維：直接展平
    buf.forEach((f, i) => flat.set(f, i * POS_DIM));
  } else {
    // 450 維：位置 + 速度（幀間差分，第 0 幀速度為 0）
    buf.forEach((pos, i) => {
      flat.set(pos, i * INPUT_DIM);                   // 前 225：位置
      if (i > 0) {
        const vel = new Float32Array(POS_DIM);
        for (let j = 0; j < POS_DIM; j++) vel[j] = pos[j] - buf[i - 1][j];
        flat.set(vel, i * INPUT_DIM + POS_DIM);       // 後 225：速度
      }
      // i===0 時速度為 0，Float32Array 預設全 0，不需處理
    });
  }
  return flat;
}

function softmax(arr) {
  const max  = Math.max(...arr);
  const exps = arr.map(v => Math.exp(v - max));
  const sum  = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}

// ── 元件 ──────────────────────────────────────────────────────────────────

export default function WordVideoCapture({
  isRecording   = false,
  onConfirmed   = null,
  onFrame       = null,
  confirmCount  = 3,
  confirmThresh = 0.70,
  singleShot    = false,   // true = 累積 30 幀後單次推論，自動停止
}) {
  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const sessionRef     = useRef(null);
  const classesRef     = useRef([]);
  const bufferRef      = useRef([]);
  const frameCountRef  = useRef(0);
  const streakRef      = useRef({ label: null, count: 0 });
  const confirmedRef   = useRef(false);
  const mountedRef     = useRef(true);
  const onConfirmedRef = useRef(onConfirmed);
  const onFrameRef     = useRef(onFrame);

  const [ready, setReady]   = useState(false);
  const [error, setError]   = useState(null);
  const [bufLen, setBufLen] = useState(0);
  const [live, setLive]     = useState(null);

  useEffect(() => { onConfirmedRef.current = onConfirmed; });
  useEffect(() => { onFrameRef.current = onFrame; });
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    bufferRef.current    = [];
    frameCountRef.current = 0;
    streakRef.current    = { label: null, count: 0 };
    confirmedRef.current = false;
    setBufLen(0);
    setLive(null);
  }, [isRecording]);

  // 載入 ONNX 模型
  useEffect(() => {
    (async () => {
      try {
        const [session, classesRes] = await Promise.all([
          ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] }),
          fetch(CLASSES_URL).then(r => r.json()),
        ]);
        if (!mountedRef.current) return;
        sessionRef.current = session;
        classesRef.current = Array.isArray(classesRes) ? classesRes : classesRes.classes;
        setReady(true);
      } catch (e) {
        if (mountedRef.current) setError(`模型載入失敗: ${e.message}`);
      }
    })();
  }, []);

  // MediaPipe Holistic + Camera
  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current;
    if (!video) return;

    const handleResults = (results) => {
      if (!mountedRef.current) return;

      // 畫布：畫攝影機畫面 + pose skeleton
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && results.image) {
        try {
          ctx.save();
          ctx.clearRect(0, 0, 640, 480);
          ctx.drawImage(results.image, 0, 0, 640, 480);

          // 畫手部關節點
          const drawDots = (lms, color) => {
            if (!lms) return;
            ctx.fillStyle = color;
            lms.forEach(lm => {
              ctx.beginPath();
              ctx.arc(lm.x * 640, lm.y * 480, 4, 0, 2 * Math.PI);
              ctx.fill();
            });
          };
          drawDots(results.leftHandLandmarks,  '#00ff88');
          drawDots(results.rightHandLandmarks, '#ff8800');

          // 畫上半身 pose 關節點（只畫手腕以上）
          if (results.poseLandmarks) {
            ctx.fillStyle = '#60a5fa';
            [11,12,13,14,15,16].forEach(i => {
              const lm = results.poseLandmarks[i];
              ctx.beginPath();
              ctx.arc(lm.x * 640, lm.y * 480, 5, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
          ctx.restore();
        } catch (_) {}
      }

      if (!isRecording || confirmedRef.current) return;

      const hasHand = results.leftHandLandmarks || results.rightHandLandmarks;
      if (!hasHand) {
        if (singleShot) {
          // singleShot 模式：手暫時消失就暫停，不清空已累積的幀
          return;
        }
        bufferRef.current = [];
        setBufLen(0);
        streakRef.current = { label: null, count: 0 };
        return;
      }

      bufferRef.current.push(frameFeatures(results));
      if (bufferRef.current.length > SEQ_LEN) bufferRef.current.shift();
      setBufLen(bufferRef.current.length);

      // ── singleShot 模式：剛滿 30 幀時做一次推論，立即確認 ─────────────────
      if (singleShot) {
        if (bufferRef.current.length < SEQ_LEN) return;
        if (confirmedRef.current) return;   // 已確認，不重複
        const buf = bufferRef.current.slice();
        confirmedRef.current = true;        // 先鎖住，避免重複觸發
        ;(async () => {
          try {
            const flat   = buildInputFlat(buf);
            const tensor = new ort.Tensor('float32', flat, [1, SEQ_LEN, INPUT_DIM]);
            const output = await sessionRef.current.run({ input: tensor });
            if (!mountedRef.current) return;
            const rawData = output.output?.data ?? output.logits?.data ?? Object.values(output)[0].data;
            const probs   = softmax(Array.from(rawData));
            const maxIdx  = probs.indexOf(Math.max(...probs));
            const label   = classesRef.current[maxIdx];
            const conf    = probs[maxIdx];
            setLive({ label, confidence: conf, probs });
            onConfirmedRef.current?.({ label, confidence: conf, probs });
          } catch (e) { console.error('ONNX 推論失敗：', e); }
        })();
        return;
      }

      // ── 連續辨識模式（原邏輯）────────────────────────────────────────────────
      frameCountRef.current = (frameCountRef.current + 1) % INFER_EVERY;
      if (frameCountRef.current !== 0) return;
      if (bufferRef.current.length < SEQ_LEN) return;

      const buf = bufferRef.current.slice();
      ;(async () => {
        try {
          const flat   = buildInputFlat(buf);
          const tensor = new ort.Tensor('float32', flat, [1, SEQ_LEN, INPUT_DIM]);
          const feeds  = { input: tensor };
          const output = await sessionRef.current.run(feeds);
          if (!mountedRef.current || !isRecording || confirmedRef.current) return;

          const rawData = output.output?.data ?? output.logits?.data ?? Object.values(output)[0].data;
          const probs   = softmax(Array.from(rawData));
          const maxIdx  = probs.indexOf(Math.max(...probs));
          const label   = classesRef.current[maxIdx];
          const conf    = probs[maxIdx];

          setLive({ label, confidence: conf, probs });
          onFrameRef.current?.({ label, confidence: conf, probs });

          const streak = streakRef.current;
          if (label === streak.label && conf >= confirmThresh) {
            streak.count++;
            if (streak.count >= confirmCount) {
              confirmedRef.current = true;
              onConfirmedRef.current?.({ label, confidence: conf, probs });
            }
          } else {
            streakRef.current = { label, count: conf >= confirmThresh ? 1 : 0 };
          }
        } catch (e) {
          if (mountedRef.current) console.warn('ONNX 推論失敗：', e);
        }
      })();
    };

    const holistic = new Holistic({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}`,
    });
    holistic.setOptions({
      modelComplexity:          1,
      smoothLandmarks:          true,
      minDetectionConfidence:   0.45,
      minTrackingConfidence:    0.45,
      refineFaceLandmarks:      false,
    });
    holistic.onResults(handleResults);

    let cancelled = false;
    const camera = new Camera(video, {
      onFrame: async () => {
        if (!mountedRef.current || cancelled) return;
        if (!video || video.readyState < 2 || !video.videoWidth) return;
        try { await holistic.send({ image: video }); } catch (_) {}
      },
      width: 640, height: 480,
    });
    camera.start();

    return () => {
      cancelled = true;
      try { camera.stop(); }   catch (_) {}
      try { holistic.close(); } catch (_) {}
    };
  }, [ready, isRecording, confirmCount, confirmThresh]);

  const progress = Math.min(Math.round((bufLen / SEQ_LEN) * 100), 100);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <video ref={videoRef} playsInline muted autoPlay
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      <canvas ref={canvasRef} width={640} height={480}
        style={{ width: '100%', borderRadius: 12, background: '#1a1a2e', display: 'block' }}
      />

      <div style={s.overlay}>
        {error     ? <span style={{ color: '#f87171' }}>⚠ {error}</span>
         : !ready  ? <span style={{ color: '#94a3b8' }}>模型載入中…</span>
         : !isRecording ? <span style={{ color: '#475569' }}>準備就緒</span>
         : live    ? <span style={{ color: '#fbbf24', fontWeight: 700 }}>{live.label} {(live.confidence * 100).toFixed(0)}%</span>
         :            <span style={{ color: '#94a3b8' }}>{bufLen < SEQ_LEN ? `累積 ${bufLen}/${SEQ_LEN} 幀` : '辨識中…'}</span>
        }
      </div>

      {ready && isRecording && (
        <div style={s.progressTrack}>
          <div style={{ ...s.progressFill, width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

const s = {
  overlay: {
    position: 'absolute', top: 12, left: 12,
    padding: '6px 14px',
    background: 'rgba(0,0,0,0.65)',
    color: '#fff', borderRadius: 8, fontSize: 18,
    backdropFilter: 'blur(4px)',
  },
  progressTrack: {
    height: 4, background: '#1e293b', borderRadius: 99,
    overflow: 'hidden', marginTop: 6,
  },
  progressFill: {
    height: '100%', background: '#3b82f6',
    borderRadius: 99, transition: 'width 0.1s ease',
  },
};
