// 📹 VideoCapture.jsx — 穩定顯示版本
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { predictSign } from '../services/aiApiClient';

const VideoCapture = ({ onResult }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const isPredicting = useRef(false);
  const lastResultTimeRef = useRef(0);

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [opacity, setOpacity] = useState(1);
  const fpsRef = useRef(0);
  const [fps, setFps] = useState(0);

  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(() => {});
        };
      }
    } catch (err) {
      if (err.name === 'NotFoundError') setError('找不到鏡頭，請確認鏡頭已連接');
      else if (err.name === 'NotAllowedError') setError('請允許瀏覽器使用鏡頭權限');
      else setError('無法啟動鏡頭：' + err.message);
      setIsRunning(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const captureAndPredict = useCallback(async () => {
    if (isPredicting.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== 4) return;

    isPredicting.current = true;
    const ctx = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;
    ctx.drawImage(video, 0, 0, 640, 480);

    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    try {
      const result = await predictSign(base64);
      if (result.detections && result.detections.length > 0) {
        const filtered = result.detections.filter(d => d.label !== 'nothing');
        if (filtered.length > 0) {
          const best = filtered.reduce((a, b) => a.confidence > b.confidence ? a : b);
          setLastResult(best);
          setOpacity(1);
          lastResultTimeRef.current = Date.now();
          if (onResult) onResult(best);
        } else {
          // 沒有字母，2 秒後才淡出
          const timeSinceLast = Date.now() - lastResultTimeRef.current;
          if (timeSinceLast > 2000) {
            setOpacity(0.3);
            if (onResult) onResult(null);
          }
        }
      }
      fpsRef.current += 1;
    } catch (err) {
      console.error('辨識失敗：', err.message);
    } finally {
      isPredicting.current = false;
    }
  }, [onResult]);

  useEffect(() => {
    if (isRunning) {
      startCamera().then(() => {
        setTimeout(() => {
          intervalRef.current = setInterval(captureAndPredict, 800);
        }, 500);
      });
      const fpsTimer = setInterval(() => {
        setFps(fpsRef.current);
        fpsRef.current = 0;
      }, 1000);
      return () => clearInterval(fpsTimer);
    } else {
      clearInterval(intervalRef.current);
      stopCamera();
      setLastResult(null);
      setOpacity(1);
      isPredicting.current = false;
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, captureAndPredict]);

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      stopCamera();
    };
  }, []);

  const confColor = (c) => c >= 0.75 ? '#00FF88' : c >= 0.5 ? '#FFB300' : '#FF5252';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {error && (
        <div style={{ background: '#ffebee', border: '1px solid #f44336', borderRadius: 8, padding: '12px 20px', color: '#c62828', width: '100%' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ position: 'relative', width: 640, maxWidth: '100%' }}>
        <video ref={videoRef} width={640} height={480} autoPlay playsInline muted
          style={{ width: '100%', borderRadius: 12, background: '#1a1a2e', display: 'block', transform: 'scaleX(-1)' }} />

        {/* 手部置中提示框 */}
        {isRunning && !lastResult && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 200, height: 200,
            border: '2px dashed rgba(255,255,255,0.4)',
            borderRadius: 12,
            pointerEvents: 'none',
          }} />
        )}

        {/* 辨識結果 */}
        {isRunning && lastResult && (
          <div style={{
            position: 'absolute', top: 16, left: 16,
            background: 'rgba(0,0,0,0.85)', borderRadius: 10, padding: '10px 20px',
            opacity: opacity, transition: 'opacity 0.5s ease',
          }}>
            <span style={{ fontSize: 48, fontWeight: 'bold', color: 'white' }}>
              {lastResult.label}
            </span>
            <span style={{ marginLeft: 12, fontSize: 16, color: confColor(lastResult.confidence) }}>
              {(lastResult.confidence * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {/* 等待提示 */}
        {isRunning && !lastResult && (
          <div style={{
            position: 'absolute', top: 16, left: 16,
            background: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: '8px 16px',
            color: '#aaa', fontSize: 14,
          }}>
            將手放入框框中
          </div>
        )}

        {/* FPS */}
        {isRunning && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12,
            background: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: '4px 8px',
          }}>
            <span style={{ fontSize: 12, color: '#aaa' }}>{fps} fps</span>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <button
        onClick={() => setIsRunning(!isRunning)}
        style={{
          padding: '12px 40px', fontSize: 16, fontWeight: 'bold',
          borderRadius: 8, border: 'none', cursor: 'pointer',
          background: isRunning ? '#f44336' : '#1a1a2e', color: 'white',
        }}
      >
        {isRunning ? '⏹ 停止辨識' : '▶ 開始辨識'}
      </button>

      {!isRunning && (
        <p style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>
          點擊「開始辨識」，將手語手勢放入畫面中央框框內
        </p>
      )}
    </div>
  );
};

export default VideoCapture;
