// components/practice/WordRecognitionTab.jsx — Tab 4：詞彙辨識
//
// 狀態機：
//   idle      → 顯示鏡頭預覽 + 「開始辨識」按鈕
//   recording → 錄製中，即時顯示候選詞 + 倒數 + 「停止」按鈕
//   result    → 顯示辨識結果 + 機率條 + 「再試一次」按鈕

import React, { useState, useCallback, useEffect, useRef } from 'react';
import WordVideoCapture from '../WordVideoCapture';

const MAX_SEC = 8; // 最長錄製秒數，超時顯示最佳猜測
const WORDS   = ['hello','thankyou','please','sorry','help','yes','no','want1','like','more'];

export default function WordRecognitionTab() {
  const [mode, setMode]         = useState('idle');     // 'idle' | 'recording' | 'result'
  const [result, setResult]     = useState(null);       // 確認的辨識結果
  const [liveResult, setLive]   = useState(null);       // 即時候選
  const [countdown, setCountdown] = useState(MAX_SEC);
  const timerRef  = useRef(null);
  const bestRef   = useRef(null); // 錄製過程中信心最高的結果

  // 清除計時器
  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startRecording = () => {
    bestRef.current = null;
    setLive(null);
    setCountdown(MAX_SEC);
    setMode('recording');

    let sec = MAX_SEC;
    timerRef.current = setInterval(() => {
      sec--;
      setCountdown(sec);
      if (sec <= 0) {
        clearTimer();
        // 時間到，用最佳猜測
        if (bestRef.current) {
          setResult(bestRef.current);
          setMode('result');
        } else {
          setMode('idle');
        }
      }
    }, 1000);
  };

  const stopRecording = () => {
    clearTimer();
    if (bestRef.current) {
      setResult(bestRef.current);
      setMode('result');
    } else {
      setMode('idle');
    }
  };

  const reset = () => {
    clearTimer();
    setMode('idle');
    setResult(null);
    setLive(null);
    bestRef.current = null;
  };

  useEffect(() => () => clearTimer(), []);

  // 每幀推論回呼（更新即時顯示 + 追蹤最佳）
  const handleFrame = useCallback((r) => {
    setLive(r);
    if (r.confidence > (bestRef.current?.confidence ?? 0)) {
      bestRef.current = r;
    }
  }, []);

  // 連續確認回呼 → 自動停止
  const handleConfirmed = useCallback((r) => {
    clearTimer();
    setResult(r);
    setMode('result');
  }, []);

  return (
    <div style={s.page}>
      <div style={s.layout}>

        {/* ── 左：鏡頭 ─────────────────────────────────────────── */}
        <div style={s.left}>
          <WordVideoCapture
            isRecording={mode === 'recording'}
            onFrame={handleFrame}
            onConfirmed={handleConfirmed}
          />

          {/* 按鈕區 */}
          <div style={s.btnRow}>
            {mode === 'idle' && (
              <button style={{ ...s.btn, ...s.btnStart }} onClick={startRecording}>
                ● 開始辨識
              </button>
            )}
            {mode === 'recording' && (
              <>
                <div style={s.countdown}>{countdown}s</div>
                <button style={{ ...s.btn, ...s.btnStop }} onClick={stopRecording}>
                  ■ 停止
                </button>
              </>
            )}
            {mode === 'result' && (
              <button style={{ ...s.btn, ...s.btnRetry }} onClick={reset}>
                ↺ 再試一次
              </button>
            )}
          </div>

          {/* 提示文字 */}
          <div style={s.hint}>
            {mode === 'idle'      && '準備好手勢後按「開始辨識」，系統會在辨識成功後自動停止'}
            {mode === 'recording' && (liveResult ? `目前候選：${liveResult.label} (${(liveResult.confidence*100).toFixed(0)}%)` : '請比出手勢…')}
            {mode === 'result'    && '辨識完成！按「再試一次」可重新辨識'}
          </div>
        </div>

        {/* ── 右：結果面板 ──────────────────────────────────────── */}
        <div style={s.right}>

          {/* idle：說明卡 */}
          {mode === 'idle' && (
            <div style={s.card}>
              <div style={s.cardTitle}>目前支援詞彙</div>
              <div style={s.wordGrid}>
                {WORDS.map(w => <span key={w} style={s.wordChip}>{w}</span>)}
              </div>
              <div style={s.cardNote}>
                共 10 個常用詞彙。比出手勢並保持穩定，系統連續辨識一致後自動顯示結果。
              </div>
            </div>
          )}

          {/* recording：即時機率條 */}
          {mode === 'recording' && (
            <div style={s.card}>
              <div style={s.cardTitle}>即時機率</div>
              {liveResult?.probs ? (
                <div style={s.probList}>
                  {WORDS.map((w, i) => (
                    <div key={w} style={s.probRow}>
                      <span style={s.probLabel}>{w}</span>
                      <div style={s.probTrack}>
                        <div style={{
                          ...s.probFill,
                          width: `${(liveResult.probs[i] * 100).toFixed(1)}%`,
                          background: w === liveResult.label ? '#fbbf24' : '#3b82f6',
                        }} />
                      </div>
                      <span style={s.probPct}>{(liveResult.probs[i]*100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={s.waiting}>等待手勢…</div>
              )}
            </div>
          )}

          {/* result：最終結果 */}
          {mode === 'result' && result && (
            <div style={{ ...s.card, borderColor: '#22c55e' }}>
              <div style={s.cardTitle}>辨識結果</div>
              <div style={s.resultWord}>{result.label}</div>
              <div style={s.resultConf}>{(result.confidence * 100).toFixed(1)}% 信心值</div>

              {result.probs && (
                <div style={s.probList}>
                  {WORDS.map((w, i) => (
                    <div key={w} style={s.probRow}>
                      <span style={s.probLabel}>{w}</span>
                      <div style={s.probTrack}>
                        <div style={{
                          ...s.probFill,
                          width: `${(result.probs[i] * 100).toFixed(1)}%`,
                          background: w === result.label ? '#22c55e' : '#334155',
                        }} />
                      </div>
                      <span style={s.probPct}>{(result.probs[i]*100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

const s = {
  page:   { display: 'flex', flexDirection: 'column' },
  layout: { display: 'flex', gap: 20, flexWrap: 'wrap' },

  left:   { flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: 10 },
  btnRow: { display: 'flex', alignItems: 'center', gap: 12 },
  hint:   { fontSize: 13, color: '#64748b', textAlign: 'center', minHeight: 20 },

  btn:      { flex: 1, padding: '14px 0', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s' },
  btnStart: { background: '#2563eb', color: '#fff' },
  btnStop:  { background: '#7f1d1d', color: '#fca5a5' },
  btnRetry: { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' },
  countdown:{ fontSize: 28, fontWeight: 800, color: '#fbbf24', minWidth: 48, textAlign: 'center' },

  right:  { flex: '1 1 300px' },

  card:       { background: '#1e293b', border: '1px solid #334155', borderRadius: 14, padding: '20px 22px' },
  cardTitle:  { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 },
  cardNote:   { fontSize: 12, color: '#475569', marginTop: 14, lineHeight: 1.6 },
  wordGrid:   { display: 'flex', flexWrap: 'wrap', gap: 8 },
  wordChip:   { padding: '4px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 20, fontSize: 13, color: '#94a3b8' },

  waiting:    { color: '#475569', fontSize: 15, padding: '20px 0' },

  resultWord: { fontSize: 52, fontWeight: 900, color: '#4ade80', marginBottom: 4, lineHeight: 1 },
  resultConf: { fontSize: 14, color: '#64748b', marginBottom: 16 },

  probList:   { display: 'flex', flexDirection: 'column', gap: 6 },
  probRow:    { display: 'flex', alignItems: 'center', gap: 8 },
  probLabel:  { fontSize: 12, color: '#94a3b8', width: 72, flexShrink: 0 },
  probTrack:  { flex: 1, height: 6, background: '#0f172a', borderRadius: 99, overflow: 'hidden' },
  probFill:   { height: '100%', borderRadius: 99, transition: 'width 0.3s ease' },
  probPct:    { fontSize: 11, color: '#64748b', width: 30, textAlign: 'right', flexShrink: 0 },
};
