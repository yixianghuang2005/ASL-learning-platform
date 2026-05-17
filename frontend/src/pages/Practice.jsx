// 🏋️ Practice.jsx — 字母闖關模式
import React, { useState, useRef } from 'react';
import VideoCapture from '../components/VideoCapture';

const LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M',
                 'N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

const Practice = () => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [completed, setCompleted] = useState([]);
  const [result, setLastResult] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [finished, setFinished] = useState(false);
  const cooldownRef = useRef(false);

  const targetLetter = LETTERS[currentIdx];

  const handleResult = (detection) => {
    if (!detection || cooldownRef.current) return;
    setLastResult(detection);

    if (detection.label === targetLetter && detection.confidence >= 0.6) {
      setIsCorrect(true);
      setShowSuccess(true);
      cooldownRef.current = true;

      setTimeout(() => {
        setCompleted(prev => [...prev, targetLetter]);
        const next = currentIdx + 1;
        if (next >= LETTERS.length) {
          setFinished(true);
        } else {
          setCurrentIdx(next);
          setLastResult(null);
          setIsCorrect(null);
          setShowSuccess(false);
        }
        cooldownRef.current = false;
      }, 1500);
    } else {
      setIsCorrect(false);
    }
  };

  if (finished) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 64 }}>🎉</div>
        <h2>恭喜完成所有 26 個字母！</h2>
        <p style={{ color: '#666' }}>你已成功辨識 A 到 Z 所有 ASL 手語字母</p>
        <button onClick={() => { setCurrentIdx(0); setCompleted([]); setFinished(false); }}
          style={{ marginTop: 16, padding: '12px 32px', fontSize: 16, borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer' }}>
          再玩一次
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>

      {/* 進度條 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontWeight: 'bold' }}>進度：{completed.length} / 26</span>
          <span style={{ color: '#888' }}>{((completed.length / 26) * 100).toFixed(0)}%</span>
        </div>
        <div style={{ background: '#eee', borderRadius: 8, height: 12 }}>
          <div style={{
            background: '#1a1a2e', borderRadius: 8, height: 12,
            width: `${(completed.length / 26) * 100}%`,
            transition: 'width 0.4s ease'
          }} />
        </div>
      </div>

      {/* 字母格子 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        {LETTERS.map((l, i) => (
          <div key={l} style={{
            width: 36, height: 36, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 'bold', fontSize: 14,
            background: completed.includes(l) ? '#4CAF50' : i === currentIdx ? '#1a1a2e' : '#eee',
            color: completed.includes(l) || i === currentIdx ? 'white' : '#666',
            border: i === currentIdx ? '2px solid #1a1a2e' : '2px solid transparent',
          }}>
            {completed.includes(l) ? '✓' : l}
          </div>
        ))}
      </div>

      {/* 目標字母 */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{
          fontSize: 80, fontWeight: 'bold', color: '#1a1a2e',
          lineHeight: 1, transition: 'all 0.3s'
        }}>
          {targetLetter}
        </div>
        <p style={{ color: '#888', marginTop: 4 }}>
          請比出字母「{targetLetter}」的 ASL 手勢
        </p>
      </div>

      {/* 成功動畫 */}
      {showSuccess && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'rgba(76,175,80,0.95)', borderRadius: 20, padding: '30px 60px',
          textAlign: 'center', zIndex: 999, color: 'white'
        }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <div style={{ fontSize: 32, fontWeight: 'bold' }}>{targetLetter} 正確！</div>
          <div style={{ fontSize: 16, marginTop: 8 }}>
            {currentIdx + 1 < LETTERS.length ? `下一個：${LETTERS[currentIdx + 1]}` : '完成！'}
          </div>
        </div>
      )}

      <VideoCapture onResult={handleResult} />

      {/* 即時辨識結果 */}
      {result && !showSuccess && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 8, textAlign: 'center',
          background: isCorrect ? '#e8f5e9' : '#ffebee',
          border: `1px solid ${isCorrect ? '#4CAF50' : '#ffcdd2'}`
        }}>
          辨識到：<strong style={{ fontSize: 20 }}>{result.label}</strong>
          　信心值：{(result.confidence * 100).toFixed(0)}%
          　{isCorrect ? '✅' : '❌'}
        </div>
      )}
    </div>
  );
};

export default Practice;
