// 🏋️ Practice.jsx
// 【組員 B 主要負責】
// 功能：練習室主頁面，整合 Webcam 辨識 + 即時回饋 + 儲存紀錄（呼叫組員 C 的 Firebase 函式）
//
// TODO 清單：
//   1. 從 URL params 取得目標練習單字（例如 /practice?word=你好）
//   2. 顯示目標手語的示範圖片
//   3. 嵌入 <VideoCapture> 元件，接收辨識結果
//   4. 判斷辨識結果是否符合目標，給予視覺回饋（✅ / ❌）
//   5. 累積準確率，練習結束後呼叫 saveProgress 儲存
//   6. 顯示辨識信心值的進度條

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import VideoCapture from '../components/VideoCapture';
import { saveProgress } from '../services/firebaseClient';
// import { auth } from '../services/firebaseClient';  // 用於取得 currentUser

const Practice = () => {
  const [searchParams] = useSearchParams();
  const targetWord = searchParams.get('word') || '你好'; // 預設練習「你好」

  const [result, setResult] = useState(null);      // { label, confidence, bbox }
  const [isCorrect, setIsCorrect] = useState(null); // true / false / null

  // TODO: 接收 VideoCapture 的辨識結果，判斷是否正確
  const handleResult = (detectionResult) => {
    setResult(detectionResult);
    setIsCorrect(detectionResult.label === targetWord);

    // TODO: 達到一定準確率後，呼叫 saveProgress
    // const uid = auth.currentUser?.uid;
    // if (uid) saveProgress(uid, targetWord, detectionResult.confidence * 100);
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>🤟 練習：{targetWord}</h2>

      {/* TODO: 加入目標單字的示範圖片 */}
      <div style={{ marginBottom: 16 }}>
        <p>請對著鏡頭做出「{targetWord}」的手語動作</p>
      </div>

      <VideoCapture onResult={handleResult} />

      {/* 辨識結果回饋 */}
      {result && (
        <div style={{ marginTop: 16, padding: 12, background: isCorrect ? '#e8f5e9' : '#ffebee', borderRadius: 8 }}>
          <p>辨識結果：<strong>{result.label}</strong></p>
          <p>信心值：{(result.confidence * 100).toFixed(1)}%</p>
          <p style={{ fontSize: 24 }}>{isCorrect ? '✅ 正確！' : '❌ 再試一次'}</p>
        </div>
      )}

      {/* TODO: 加入練習統計（累積次數、準確率趨勢圖） */}
    </div>
  );
};

export default Practice;
