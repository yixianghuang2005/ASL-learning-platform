// 📹 VideoCapture.jsx
// 【組員 B 負責實作】
// 功能：啟動 Webcam、定時擷取影格、送往 AI API 辨識
//
// TODO 清單：
//   1. 使用 navigator.mediaDevices.getUserMedia() 啟動鏡頭
//   2. 將 <video> 畫面繪製到 <canvas> 上
//   3. 用 canvas.toDataURL('image/jpeg') 取得 base64 影格
//   4. 呼叫 aiApiClient.predict(base64Frame) 送出辨識
//   5. 將辨識結果（手語標籤 + 信心值）顯示在畫面上
//   6. 實作開始/停止辨識的控制按鈕

import React, { useRef, useEffect, useState } from 'react';
import { predictSign } from '../services/aiApiClient';

const VideoCapture = ({ onResult }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);

  // TODO: 實作啟動鏡頭
  const startCamera = async () => {
    try {
      // TODO: 用 getUserMedia 取得視訊串流，指定給 videoRef.current.srcObject
      throw new Error('尚未實作');
    } catch (err) {
      setError('無法啟動鏡頭：' + err.message);
    }
  };

  // TODO: 實作停止鏡頭
  const stopCamera = () => {
    // TODO: 停止所有媒體軌道 (videoRef.current.srcObject.getTracks())
  };

  // TODO: 實作擷取影格並送出辨識
  const captureAndPredict = async () => {
    // TODO:
    // 1. 將 video 畫面繪製到 canvas
    // 2. 取得 base64 影格
    // 3. 呼叫 predictSign(base64Frame)
    // 4. 呼叫 onResult(result) 回傳給父元件
  };

  useEffect(() => {
    let interval;
    if (isRunning) {
      startCamera();
      // 每 500ms 辨識一次
      interval = setInterval(captureAndPredict, 500);
    } else {
      stopCamera();
    }
    return () => {
      clearInterval(interval);
      stopCamera();
    };
  }, [isRunning]);

  return (
    <div className="video-capture">
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <video ref={videoRef} autoPlay playsInline width={640} height={480} />
      <canvas ref={canvasRef} width={640} height={480} style={{ display: 'none' }} />
      <button onClick={() => setIsRunning(!isRunning)}>
        {isRunning ? '⏹ 停止辨識' : '▶ 開始辨識'}
      </button>
    </div>
  );
};

export default VideoCapture;
