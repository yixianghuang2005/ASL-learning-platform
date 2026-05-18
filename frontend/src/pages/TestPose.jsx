// pages/TestPose.jsx — Pose Estimation 模型驗證頁
// 與正式 Practice Tab 並存，用來驗證 MediaPipe + MLP 新方案。

import React, { useState } from 'react';
import PoseVideoCapture from '../components/PoseVideoCapture';

export default function TestPose() {
  const [history, setHistory] = useState([]);
  const [stableLetter, setStableLetter] = useState(null);

  const handleResult = (r) => {
    setHistory(h => [
      { ...r, time: new Date().toLocaleTimeString() },
      ...h.slice(0, 14),
    ]);
    // 高信心才認為穩定
    if (r.confidence >= 0.85 && r.label !== 'nothing') {
      setStableLetter(r.label);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>🤚 Pose 辨識測試</h1>
        <p style={styles.subtitle}>
          MediaPipe Hands + MLP 純前端推論（不打後端 API）
        </p>
      </div>

      <div style={styles.grid}>
        <div style={styles.left}>
          <PoseVideoCapture onResult={handleResult} />
          <div style={styles.stableBox}>
            <div style={styles.stableLabel}>當前穩定識別</div>
            <div style={styles.stableLetter}>
              {stableLetter || '—'}
            </div>
          </div>
        </div>

        <div style={styles.right}>
          <h3 style={styles.historyTitle}>近 15 次偵測</h3>
          <ul style={styles.history}>
            {history.length === 0 && (
              <li style={styles.empty}>等待第一次偵測…</li>
            )}
            {history.map((h, i) => (
              <li key={i} style={styles.historyItem}>
                <span style={styles.time}>{h.time}</span>
                <span style={{
                  ...styles.letter,
                  color: h.label === 'nothing' ? '#64748b' : '#3b82f6',
                }}>
                  {h.label}
                </span>
                <span style={styles.conf}>
                  {(h.confidence * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>

          <div style={styles.tipBox}>
            <strong>使用提示：</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
              <li>把手放在攝影機正前方，距離 30-50 cm</li>
              <li>背景越單純越好，避免另一隻手入鏡</li>
              <li>支援 24 個字母（A-Y，扣 J、Z）</li>
              <li>沒比手勢時會顯示 "nothing"</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#f1f5f9',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    padding: '32px 24px',
  },
  header: { maxWidth: 1100, margin: '0 auto 24px' },
  title: { fontSize: 28, margin: 0 },
  subtitle: { color: '#94a3b8', marginTop: 6 },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 360px',
    gap: 24,
    maxWidth: 1100,
    margin: '0 auto',
  },
  left: {},
  right: {
    background: '#1e293b',
    borderRadius: 12,
    padding: 20,
  },
  stableBox: {
    marginTop: 16,
    padding: '20px 24px',
    background: '#1e293b',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stableLabel: { color: '#94a3b8', fontSize: 14 },
  stableLetter: {
    fontSize: 56,
    fontWeight: 700,
    color: '#3b82f6',
    letterSpacing: 2,
  },
  historyTitle: { marginTop: 0, marginBottom: 12 },
  history: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    fontFamily: "'JetBrains Mono', Consolas, monospace",
    fontSize: 13,
  },
  empty: { color: '#64748b', fontStyle: 'italic' },
  historyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #334155',
  },
  time: { color: '#94a3b8' },
  letter: { fontWeight: 700, fontSize: 16 },
  conf: { color: '#cbd5e1' },
  tipBox: {
    marginTop: 20,
    padding: '12px 14px',
    background: '#0f172a',
    borderRadius: 8,
    fontSize: 13,
    color: '#cbd5e1',
  },
};
