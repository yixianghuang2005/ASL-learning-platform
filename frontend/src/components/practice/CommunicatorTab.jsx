// components/practice/CommunicatorTab.jsx — Tab 3：拼字溝通器
// Fix 1: 換字母時清空窗口，進度條從 0 重新開始
// Fix 2: 語音朗讀轉小寫，念完整單字而非逐字母

import React, { useState, useRef, useCallback, useEffect } from 'react';
import VideoCapture from '../VideoCapture';

// ── 可調整參數 ────────────────────────────────────────────────────
const WINDOW_SIZE    = 15;   // 觀察窗口大小（幀數）
const PASS_THRESHOLD = 10;   // 窗口內需出現幾次才寫入
const MIN_CONFIDENCE = 0.55; // 信心值門檻
const COOLDOWN_MS    = 1500; // 寫入後冷卻時間（避免連續重複）

export default function CommunicatorTab() {
  const [wordBuffer, setWordBuffer]         = useState('');
  const [currentLetter, setCurrentLetter]   = useState('');
  const [correctCount, setCorrectCount]     = useState(0);
  const [justAdded, setJustAdded]           = useState(false);
  const [isSpeaking, setIsSpeaking]         = useState(false);

  // Refs
  const windowRef      = useRef([]);  // 滑動窗口（只儲存當前字母的幀）
  const accumLetterRef = useRef('');  // 目前正在累積的字母
  const cooldownRef    = useRef(false);
  const lastAddedRef   = useRef('');

  useEffect(() => {
    return () => window.speechSynthesis.cancel();
  }, []);

  // ── 核心：換字母就清窗口 ────────────────────────────────────────
  const handleResult = useCallback((result) => {
    if (!result || cooldownRef.current) return;
    if (result.confidence < MIN_CONFIDENCE) return;

    const incoming = result.label;
    setCurrentLetter(incoming);

    // ✅ Fix 1：偵測到不同字母 → 清空窗口，從頭累積
    if (incoming !== accumLetterRef.current) {
      accumLetterRef.current = incoming;
      windowRef.current      = [];
      setCorrectCount(0);
    }

    // 把這幀加入窗口
    windowRef.current.push(incoming);
    if (windowRef.current.length > WINDOW_SIZE) windowRef.current.shift();

    const count = windowRef.current.filter(l => l === incoming).length;
    setCorrectCount(count);

    // 達到門檻 → 寫入
    if (count >= PASS_THRESHOLD) {
      if (incoming === lastAddedRef.current) return; // 防重複

      setWordBuffer(prev => prev + incoming);
      lastAddedRef.current = incoming;

      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 400);

      cooldownRef.current = true;
      setTimeout(() => {
        cooldownRef.current    = false;
        lastAddedRef.current   = '';
        windowRef.current      = [];
        accumLetterRef.current = '';
        setCorrectCount(0);
      }, COOLDOWN_MS);
    }
  }, []);

  // ── 按鈕功能 ──────────────────────────────────────────────────
  const handleBackspace = () => setWordBuffer(prev => prev.slice(0, -1));

  const handleSpace = () => {
    setWordBuffer(prev => prev + ' ');
    lastAddedRef.current = ' ';
  };

  const handleClear = () => {
    setWordBuffer('');
    windowRef.current      = [];
    cooldownRef.current    = false;
    lastAddedRef.current   = '';
    accumLetterRef.current = '';
    setCurrentLetter('');
    setCorrectCount(0);
  };

  const handleSpeak = () => {
    if (!wordBuffer.trim()) return;
    window.speechSynthesis.cancel();

    // ✅ Fix 2：轉小寫讓瀏覽器念完整單字，而非逐字母
    const textToSpeak = wordBuffer.trim().toLowerCase();
    const utterance   = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang    = 'en-US';
    utterance.rate    = 0.85;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend   = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  // ── 進度條 ────────────────────────────────────────────────────
  const progressPct = Math.min((correctCount / PASS_THRESHOLD) * 100, 100);

  return (
    <div style={s.page}>
      {/* 說明列 */}
      <div style={s.infoBar}>
        💡 比出手勢並穩定約 1 秒，字母自動寫入；換下一個字母前，手勢需稍微改變或移開
      </div>

      <div style={s.layout}>

        {/* 左：鏡頭 + 偵測狀態 */}
        <div style={s.leftPanel}>
          <VideoCapture onResult={handleResult} />

          <div style={s.detectionCard}>
            <div style={s.detectionRow}>
              <div>
                <div style={s.detectionLabel}>目前偵測</div>
                <div style={s.detectionLetter}>{currentLetter || '—'}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={s.detectionLabel}>寫入進度</div>
                <div style={s.progressTrack}>
                  <div style={{
                    ...s.progressFill,
                    width: `${progressPct}%`,
                    background: progressPct >= 100 ? '#22c55e' : '#3b82f6',
                  }} />
                </div>
                <div style={s.detectionHint}>{correctCount} / {PASS_THRESHOLD} 幀</div>
              </div>
            </div>
          </div>
        </div>

        {/* 右：文字緩衝區 + 控制 */}
        <div style={s.rightPanel}>

          {/* 文字框 */}
          <div style={{ ...s.bufferBox, ...(justAdded ? s.bufferFlash : {}) }}>
            <div style={s.bufferLabel}>拼出的內容</div>
            <div style={s.bufferText}>
              {wordBuffer
                ? wordBuffer
                : <span style={s.bufferPlaceholder}>開始比手勢...</span>
              }
              <span style={s.cursor}>|</span>
            </div>
            <div style={s.charCount}>{wordBuffer.replace(/ /g, '').length} 個字母</div>
          </div>

          {/* 按鈕區 */}
          <div style={s.btnGrid}>
            <button style={{ ...s.btn, ...s.btnSecondary }} onClick={handleBackspace} disabled={!wordBuffer}>
              ⌫ 退格
            </button>
            <button style={{ ...s.btn, ...s.btnSecondary }} onClick={handleSpace}>
              ␣ 空格
            </button>
            <button style={{ ...s.btn, ...s.btnDanger }} onClick={handleClear} disabled={!wordBuffer}>
              🗑 清空
            </button>
            <button
              style={{ ...s.btn, ...s.btnSpeak, ...(isSpeaking ? s.btnSpeaking : {}) }}
              onClick={handleSpeak}
              disabled={!wordBuffer.trim()}
            >
              {isSpeaking ? '🔊 朗讀中...' : '🔊 朗讀'}
            </button>
          </div>

          {/* 快速詞彙 */}
          <div style={s.quickSection}>
            <div style={s.quickLabel}>快速詞彙</div>
            <div style={s.quickList}>
              {['HELLO', 'YES', 'NO', 'HELP', 'THANKS', 'SORRY', 'PLEASE', 'WATER'].map(w => (
                <button
                  key={w}
                  style={s.quickBtn}
                  onClick={() => { setWordBuffer(w); lastAddedRef.current = ''; }}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* 輔助鍵盤 */}
          <div style={s.keyboardSection}>
            <div style={s.quickLabel}>手動輔助輸入</div>
            <div style={s.keyboard}>
              {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => (
                <button
                  key={letter}
                  style={s.keyBtn}
                  onClick={() => { setWordBuffer(prev => prev + letter); lastAddedRef.current = letter; }}
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { display: 'flex', flexDirection: 'column', gap: 16 },
  infoBar: { background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#93c5fd', lineHeight: 1.5 },
  layout: { display: 'flex', gap: 20, flexWrap: 'wrap' },

  leftPanel: { flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: 12 },
  detectionCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '16px' },
  detectionRow: { display: 'flex', alignItems: 'center', gap: 20 },
  detectionLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 },
  detectionLetter: { fontSize: 48, fontWeight: 900, color: '#3b82f6', lineHeight: 1, width: 56, textAlign: 'center' },
  progressTrack: { height: 10, background: '#334155', borderRadius: 99, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', borderRadius: 99, transition: 'width 0.1s ease, background 0.3s' },
  detectionHint: { fontSize: 11, color: '#475569' },

  rightPanel: { flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 14 },

  bufferBox: { background: '#1e293b', border: '2px solid #3b82f6', borderRadius: 14, padding: '20px 24px', minHeight: 120, transition: 'border-color 0.2s, box-shadow 0.2s' },
  bufferFlash: { borderColor: '#22c55e', boxShadow: '0 0 20px rgba(34,197,94,0.25)' },
  bufferLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
  bufferText: { fontSize: 36, fontWeight: 700, letterSpacing: '0.08em', color: '#f1f5f9', wordBreak: 'break-all', lineHeight: 1.3, minHeight: 48 },
  bufferPlaceholder: { fontSize: 18, color: '#475569', fontWeight: 400 },
  cursor: { display: 'inline-block', color: '#3b82f6' },
  charCount: { fontSize: 12, color: '#475569', marginTop: 10, textAlign: 'right' },

  btnGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  btn: { padding: '13px 10px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.15s' },
  btnSecondary: { background: '#334155', color: '#e2e8f0' },
  btnDanger:    { background: '#7f1d1d', color: '#fca5a5' },
  btnSpeak: { background: '#3b82f6', color: '#fff', gridColumn: '1 / -1', fontSize: 16, fontWeight: 700 },
  btnSpeaking: { background: '#1d4ed8' },

  quickSection: { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '14px 16px' },
  quickLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
  quickList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  quickBtn: { padding: '6px 14px', background: '#1d4ed8', border: 'none', borderRadius: 20, color: '#bfdbfe', fontSize: 12, fontWeight: 600, cursor: 'pointer' },

  keyboardSection: { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '14px 16px' },
  keyboard: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  keyBtn: { width: 34, height: 34, background: '#334155', border: '1px solid #475569', borderRadius: 6, color: '#e2e8f0', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
};
