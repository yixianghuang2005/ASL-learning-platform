import React, { useEffect, useRef, useState } from 'react';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import * as ort from 'onnxruntime-web';

const MODEL_URL = '/models/asl_words_sequence.onnx';
const CLASSES_URL = '/models/asl_words_classes.json';
const DEFAULT_SEQUENCE_LENGTH = 30;
const DEFAULT_INPUT_DIM = 136;
const PREDICT_EVERY_MS = 350;

function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const sum = exps.reduce((acc, value) => acc + value, 0);
  return exps.map((value) => value / sum);
}

function normalizeHand(landmarks) {
  if (!landmarks || landmarks.length < 21) return new Array(68).fill(0);

  const wrist = landmarks[0];
  const ref = landmarks[9];
  const dx = ref.x - wrist.x;
  const dy = ref.y - wrist.y;
  const dz = (ref.z || 0) - (wrist.z || 0);
  const scale = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const out = [1, wrist.x, wrist.y, wrist.z || 0, scale];

  landmarks.forEach((point) => {
    out.push((point.x - wrist.x) / scale);
    out.push((point.y - wrist.y) / scale);
    out.push(((point.z || 0) - (wrist.z || 0)) / scale);
  });

  return out;
}

function makeFrameFeatures(handLandmarks, handedness) {
  const hands = { Left: null, Right: null };

  handLandmarks.forEach((landmarks, index) => {
    const label = handedness?.[index]?.label || handedness?.[index]?.classification?.[0]?.label;
    if (label === 'Left' || label === 'Right') {
      hands[label] = landmarks;
      return;
    }
    if (!hands.Right) hands.Right = landmarks;
    else if (!hands.Left) hands.Left = landmarks;
  });

  return [...normalizeHand(hands.Left), ...normalizeHand(hands.Right)];
}

function flattenSequence(frames, sequenceLength, inputDim) {
  const data = new Float32Array(sequenceLength * inputDim);
  frames.slice(-sequenceLength).forEach((frame, frameIndex) => {
    for (let i = 0; i < inputDim; i += 1) {
      data[frameIndex * inputDim + i] = frame[i] || 0;
    }
  });
  return data;
}

export default function WordVideoCapture({ onResult }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const handsRef = useRef(null);
  const sessionRef = useRef(null);
  const classesRef = useRef([]);
  const sequenceRef = useRef([]);
  const onResultRef = useRef(onResult);
  const mountedRef = useRef(true);
  const lastPredictAtRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelMessage, setModelMessage] = useState('loading');
  const [sequenceLength, setSequenceLength] = useState(DEFAULT_SEQUENCE_LENGTH);
  const [inputDim, setInputDim] = useState(DEFAULT_INPUT_DIM);
  const [prediction, setPrediction] = useState(null);

  useEffect(() => {
    onResultRef.current = onResult;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [session, classMeta] = await Promise.all([
          ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] }),
          fetch(CLASSES_URL).then((response) => {
            if (!response.ok) throw new Error('classes-not-found');
            return response.json();
          }),
        ]);

        if (!mountedRef.current) return;
        sessionRef.current = session;
        classesRef.current = classMeta.classes || [];
        setSequenceLength(classMeta.sequence_length || DEFAULT_SEQUENCE_LENGTH);
        setInputDim(classMeta.input_dim || DEFAULT_INPUT_DIM);
        setModelReady(true);
        setModelMessage('ready');
      } catch (error) {
        if (!mountedRef.current) return;
        setModelReady(false);
        setModelMessage('missing');
        onResultRef.current?.({ label: 'model-not-ready', confidence: 0 });
      } finally {
        if (mountedRef.current) setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    const drawFrame = (results) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx || !results.image) return;

      ctx.save();
      ctx.clearRect(0, 0, 640, 480);
      ctx.drawImage(results.image, 0, 0, 640, 480);
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = 'rgba(56,189,248,0.55)';
      ctx.lineWidth = 2;

      results.multiHandLandmarks?.forEach((landmarks) => {
        landmarks.forEach((point) => {
          ctx.beginPath();
          ctx.arc(point.x * 640, point.y * 480, 3.5, 0, 2 * Math.PI);
          ctx.fill();
        });
      });
      ctx.restore();
    };

    const runPrediction = async () => {
      if (!sessionRef.current || sequenceRef.current.length < sequenceLength) return;

      const now = performance.now();
      if (now - lastPredictAtRef.current < PREDICT_EVERY_MS) return;
      lastPredictAtRef.current = now;

      const input = flattenSequence(sequenceRef.current, sequenceLength, inputDim);
      const tensor = new ort.Tensor('float32', input, [1, sequenceLength, inputDim]);
      const inputName = sessionRef.current.inputNames?.[0] || 'sequence';

      try {
        const output = await sessionRef.current.run({ [inputName]: tensor });
        if (!mountedRef.current) return;
        const outputName = sessionRef.current.outputNames?.[0] || 'logits';
        const logits = Array.from(output[outputName].data);
        const probs = softmax(logits);
        const maxIdx = probs.indexOf(Math.max(...probs));
        const label = classesRef.current[maxIdx] || `class-${maxIdx}`;
        const confidence = probs[maxIdx] || 0;
        const next = { label, confidence, probs, source: 'asl-word-sequence' };
        setPrediction(next);
        onResultRef.current?.(next);
      } catch (error) {
        console.warn('ASL word inference failed:', error);
      }
    };

    const handleResults = (results) => {
      if (!mountedRef.current) return;
      drawFrame(results);

      if (!results.multiHandLandmarks?.length) {
        sequenceRef.current = [];
        setPrediction({ label: 'no-hand', confidence: 0 });
        onResultRef.current?.({ label: 'no-hand', confidence: 0 });
        return;
      }

      const frame = makeFrameFeatures(results.multiHandLandmarks, results.multiHandedness);
      sequenceRef.current = [...sequenceRef.current, frame].slice(-sequenceLength);

      if (!modelReady) {
        const next = { label: 'model-not-ready', confidence: 0 };
        setPrediction(next);
        onResultRef.current?.(next);
        return;
      }

      if (sequenceRef.current.length < sequenceLength) {
        const next = {
          label: 'collecting',
          confidence: 0,
          frames: sequenceRef.current.length,
          required: sequenceLength,
        };
        setPrediction(next);
        onResultRef.current?.(next);
        return;
      }

      runPrediction();
    };

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55,
    });
    hands.onResults(handleResults);
    handsRef.current = hands;

    let cancelled = false;
    const camera = new Camera(video, {
      onFrame: async () => {
        if (!mountedRef.current || cancelled) return;
        if (!video || video.readyState < 2 || !video.videoWidth) return;
        try {
          await hands.send({ image: video });
        } catch (error) {
          if (!cancelled) console.warn('MediaPipe Hands failed:', error);
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
      cameraRef.current = null;
      handsRef.current = null;
    };
  }, [ready, modelReady, sequenceLength, inputDim]);

  const overlayText = (() => {
    if (!ready) return '載入中';
    if (modelMessage === 'missing') return '等待詞彙模型';
    if (!prediction) return '等待手勢';
    if (prediction.label === 'collecting') return `${prediction.frames}/${prediction.required}`;
    if (prediction.label === 'no-hand') return '未偵測到手部';
    return `${prediction.label} ${Math.round((prediction.confidence || 0) * 100)}%`;
  })();

  return (
    <div style={styles.wrap}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={styles.video}
      />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={styles.canvas}
      />
      <div style={styles.overlay}>{overlayText}</div>
      <div style={styles.footer}>
        <span>序列長度 {sequenceRef.current.length}/{sequenceLength}</span>
        <span>{modelReady ? '模型已載入' : '模型未載入'}</span>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    position: 'relative',
    width: '100%',
    maxWidth: 760,
    aspectRatio: '4 / 3',
    background: '#020617',
    border: '1px solid #1f2937',
    borderRadius: 8,
    overflow: 'hidden',
  },
  video: {
    position: 'absolute',
    left: '-9999px',
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: 'none',
  },
  canvas: {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'cover',
  },
  overlay: {
    position: 'absolute',
    top: 14,
    left: 14,
    background: 'rgba(15,23,42,0.82)',
    border: '1px solid rgba(148,163,184,0.25)',
    borderRadius: 6,
    color: '#e0f2fe',
    padding: '8px 12px',
    fontSize: 18,
    fontWeight: 800,
  },
  footer: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    color: '#cbd5e1',
    fontSize: 13,
    background: 'rgba(15,23,42,0.74)',
    border: '1px solid rgba(148,163,184,0.2)',
    borderRadius: 6,
    padding: '8px 10px',
  },
};
