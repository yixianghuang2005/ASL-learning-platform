import React, { useMemo, useState } from 'react';
import WordVideoCapture from '../components/WordVideoCapture';

const TARGET_WORDS = [
  'hello',
  'thank you',
  'please',
  'sorry',
  'help',
  'yes',
  'no',
  'want',
  'like',
  'eat',
];

export default function WordRecognition() {
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const resultText = useMemo(() => {
    if (!result) return '等待手勢';
    if (result.label === 'model-not-ready') return '模型尚未匯入';
    if (result.label === 'collecting') return `收集中 ${result.frames}/${result.required}`;
    if (result.label === 'no-hand') return '未偵測到手部';
    return `${result.label} (${Math.round(result.confidence * 100)}%)`;
  }, [result]);

  const handleResult = (next) => {
    setResult(next);
    if (!next || !next.label || next.confidence < 0.65) return;
    if (['model-not-ready', 'collecting', 'no-hand'].includes(next.label)) return;

    setHistory((items) => {
      const head = items[0];
      if (head && head.label === next.label && Date.now() - head.time < 1500) {
        return items;
      }
      return [{ ...next, time: Date.now() }, ...items].slice(0, 5);
    });
  };

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.kicker}>ASL Words</p>
          <h1 style={styles.title}>ASL 詞彙辨識</h1>
          <p style={styles.subtitle}>
            MediaPipe 擷取連續手部關鍵點，詞彙模型使用 WLASL 10 個常見單字訓練。
          </p>
        </div>
        <div style={styles.statusPanel}>
          <span style={styles.statusLabel}>目前結果</span>
          <strong style={styles.statusValue}>{resultText}</strong>
        </div>
      </section>

      <section style={styles.layout}>
        <div style={styles.cameraColumn}>
          <WordVideoCapture onResult={handleResult} />
        </div>

        <aside style={styles.sidePanel}>
          <div>
            <h2 style={styles.panelTitle}>第一版詞彙</h2>
            <div style={styles.wordGrid}>
              {TARGET_WORDS.map((word) => (
                <span key={word} style={styles.wordChip}>{word}</span>
              ))}
            </div>
          </div>

          <div>
            <h2 style={styles.panelTitle}>最近辨識</h2>
            {history.length === 0 ? (
              <p style={styles.emptyText}>尚無紀錄</p>
            ) : (
              <div style={styles.historyList}>
                {history.map((item) => (
                  <div key={`${item.label}-${item.time}`} style={styles.historyItem}>
                    <span>{item.label}</span>
                    <strong>{Math.round(item.confidence * 100)}%</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#f8fafc',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    padding: '28px 24px 48px',
  },
  header: {
    maxWidth: 1160,
    margin: '0 auto 24px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 20,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  kicker: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    margin: '0 0 8px',
  },
  title: {
    fontSize: 34,
    lineHeight: 1.15,
    margin: 0,
  },
  subtitle: {
    margin: '10px 0 0',
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 1.7,
    maxWidth: 620,
  },
  statusPanel: {
    minWidth: 220,
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 8,
    padding: '14px 16px',
  },
  statusLabel: {
    display: 'block',
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6,
  },
  statusValue: {
    display: 'block',
    color: '#e0f2fe',
    fontSize: 22,
    lineHeight: 1.25,
  },
  layout: {
    maxWidth: 1160,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    gap: 20,
    alignItems: 'start',
  },
  cameraColumn: {
    minWidth: 0,
  },
  sidePanel: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 8,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  panelTitle: {
    margin: '0 0 12px',
    fontSize: 17,
  },
  wordGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  wordChip: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 6,
    color: '#cbd5e1',
    padding: '7px 10px',
    fontSize: 14,
    fontWeight: 700,
  },
  emptyText: {
    color: '#64748b',
    margin: 0,
    fontSize: 14,
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  historyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 6,
    padding: '10px 12px',
    color: '#cbd5e1',
    fontSize: 14,
  },
};
