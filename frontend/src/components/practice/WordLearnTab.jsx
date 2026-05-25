// WordLearnTab.jsx — 詞彙學習：250 詞卡片 + 搜尋/分類 + 詳細頁

import React, { useState, useMemo, useCallback } from 'react';
import WordVideoCapture from '../WordVideoCapture';
import { WORD_DATA, CATEGORIES } from '../../utils/aslWordData';

export default function WordLearnTab() {
  const [selected,    setSelected]    = useState(null); // index into filtered
  const [searchText,  setSearch]      = useState('');
  const [activeCat,   setCat]         = useState('all');

  const filtered = useMemo(() => {
    let list = WORD_DATA;
    if (activeCat !== 'all') list = list.filter(w => w.category === activeCat);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(w =>
        w.display.toLowerCase().includes(q) ||
        w.zh.includes(q) ||
        w.word.toLowerCase().includes(q)
      );
    }
    return list;
  }, [searchText, activeCat]);

  if (selected !== null && filtered[selected]) {
    return (
      <WordDetail
        data={filtered[selected]}
        index={selected}
        total={filtered.length}
        onBack={() => setSelected(null)}
        onPrev={() => setSelected(i => Math.max(0, i - 1))}
        onNext={() => setSelected(i => Math.min(filtered.length - 1, i + 1))}
      />
    );
  }

  return (
    <div style={s.root}>
      {/* 搜尋列 */}
      <div style={s.searchRow}>
        <input
          style={s.searchInput}
          placeholder="🔍 搜尋詞彙（英文或中文）..."
          value={searchText}
          onChange={e => { setSearch(e.target.value); setSelected(null); }}
        />
        <span style={s.countBadge}>{filtered.length} 個詞彙</span>
      </div>

      {/* 類別篩選 */}
      <div style={s.catRow}>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            style={{ ...s.catBtn, ...(activeCat === c.key ? s.catActive : {}) }}
            onClick={() => { setCat(c.key); setSelected(null); }}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {/* 詞彙卡片格 */}
      {filtered.length === 0 ? (
        <div style={s.empty}>找不到「{searchText}」，試試其他關鍵字</div>
      ) : (
        <div style={s.cardGrid}>
          {filtered.map((w, idx) => (
            <WordCard key={w.word} data={w} onClick={() => setSelected(idx)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 詞彙卡片 ──────────────────────────────────────────────────────────────
function WordCard({ data, onClick }) {
  const [hovered, setHovered] = useState(false);
  const catInfo = CATEGORIES.find(c => c.key === data.category);
  return (
    <button
      style={{ ...s.card, ...(hovered ? s.cardHover : {}) }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={s.catTag}>{catInfo?.emoji}</div>
      <div style={s.cardWord}>{data.display}</div>
      <div style={s.cardZh}>{data.zh}</div>
    </button>
  );
}

// ── 詳細頁 ────────────────────────────────────────────────────────────────
function WordDetail({ data, index, total, onBack, onPrev, onNext }) {
  const [practiceMode, setPractice] = useState(false);
  const [liveResult,   setLive]     = useState(null);
  const [confirmed,    setConfirmed] = useState(null);

  const handleFrame     = useCallback(r => setLive(r), []);
  const handleConfirmed = useCallback(r => setConfirmed(r), []);
  const resetPractice   = () => { setLive(null); setConfirmed(null); };
  const togglePractice  = () => { setPractice(p => !p); resetPractice(); };

  const handlePrev = () => { onPrev(); resetPractice(); setPractice(false); };
  const handleNext = () => { onNext(); resetPractice(); setPractice(false); };

  const ytUrl        = `https://www.youtube.com/results?search_query=${encodeURIComponent(data.ytSearch)}`;
  const handspeakUrl = `https://www.handspeak.com/word/search/index.php?id=${encodeURIComponent(data.word)}`;
  const isCorrect    = confirmed?.label === data.word;
  const catInfo   = CATEGORIES.find(c => c.key === data.category);

  return (
    <div style={s.detail}>
      {/* 導覽 */}
      <div style={s.nav}>
        <button style={s.navBtn} onClick={onBack}>← 返回總覽</button>
        <span style={s.navProgress}>{index + 1} / {total}</span>
        <div style={s.navArrows}>
          <button style={s.arrowBtn} onClick={handlePrev} disabled={index === 0}>‹ 上一個</button>
          <button style={s.arrowBtn} onClick={handleNext} disabled={index === total - 1}>下一個 ›</button>
        </div>
      </div>

      <div style={s.detailBody}>
        {/* 左欄 */}
        <div style={s.detailLeft}>
          <div style={s.catChip}>{catInfo?.emoji} {catInfo?.label}</div>
          <div style={s.wordBig}>{data.display}</div>
          <div style={s.wordZhBig}>{data.zh}</div>

          <div style={s.infoCard}>
            <div style={s.infoLabel}>手勢說明</div>
            <p style={s.infoText}>{data.hint}</p>
          </div>

          {/* 示範影片連結 */}
          <div style={s.ytSection}>
            <div style={s.infoLabel}>示範影片</div>
            <div style={s.videoLinks}>
              <a href={ytUrl} target="_blank" rel="noopener noreferrer" style={s.videoBtn}>
                <span style={s.videoBtnIcon}>▶</span>
                <span>
                  <div style={s.videoBtnTitle}>YouTube 搜尋</div>
                  <div style={s.videoBtnSub}>ASL {data.display} 示範影片</div>
                </span>
              </a>
              <a href={handspeakUrl} target="_blank" rel="noopener noreferrer" style={{...s.videoBtn, ...s.videoBtnGreen}}>
                <span style={s.videoBtnIcon}>🤟</span>
                <span>
                  <div style={s.videoBtnTitle}>Handspeak</div>
                  <div style={s.videoBtnSub}>查看詳細手勢動畫</div>
                </span>
              </a>
            </div>
          </div>

          <button
            style={{ ...s.practiceBtn, ...(practiceMode ? s.practiceBtnOn : {}) }}
            onClick={togglePractice}
          >
            {practiceMode ? '⏹ 停止練習' : '📷 開始練習'}
          </button>
        </div>

        {/* 右欄：鏡頭 */}
        {practiceMode && (
          <div style={s.detailRight}>
            <WordVideoCapture
              isRecording={practiceMode}
              onFrame={handleFrame}
              onConfirmed={handleConfirmed}
            />
            {liveResult && !confirmed && (
              <div style={s.liveBox}>
                目前偵測：<strong>{liveResult.label}</strong>（{(liveResult.confidence * 100).toFixed(0)}%）
              </div>
            )}
            {confirmed && (
              <div style={{ ...s.resultBox, ...(isCorrect ? s.resultCorrect : s.resultWrong) }}>
                {isCorrect
                  ? `✅ 正確！辨識到「${data.display}」（${(confirmed.confidence * 100).toFixed(0)}%）`
                  : `辨識到「${confirmed.label}」，目標是「${data.display}」，再試！`}
                <button style={s.retryBtn} onClick={resetPractice}>再試</button>
              </div>
            )}
            <p style={s.practiceHint}>
              比出「<strong>{data.display}</strong>」的手勢，系統連續辨識一致後自動確認
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 樣式 ──────────────────────────────────────────────────────────────────
const s = {
  root:        { display: 'flex', flexDirection: 'column', gap: 14 },

  searchRow:   { display: 'flex', alignItems: 'center', gap: 12 },
  searchInput: {
    flex: 1, padding: '10px 16px', borderRadius: 10,
    background: '#1e293b', border: '1px solid #334155',
    color: '#f1f5f9', fontSize: 14, outline: 'none',
  },
  countBadge:  { color: '#64748b', fontSize: 13, whiteSpace: 'nowrap' },

  catRow:      { display: 'flex', flexWrap: 'wrap', gap: 8 },
  catBtn:      {
    padding: '6px 12px', borderRadius: 20,
    background: '#1e293b', border: '1px solid #334155',
    color: '#94a3b8', fontSize: 13, cursor: 'pointer',
    transition: 'all 0.15s',
  },
  catActive:   { background: '#1e3a5f', borderColor: '#3b82f6', color: '#93c5fd' },

  empty:       { textAlign: 'center', color: '#64748b', padding: '40px 0' },

  cardGrid:    { display: 'flex', flexWrap: 'wrap', gap: 10 },
  card:        {
    flex: '1 1 120px', maxWidth: 160,
    background: '#1e293b', border: '2px solid #334155', borderRadius: 14,
    padding: '14px 12px', cursor: 'pointer', textAlign: 'center',
    display: 'flex', flexDirection: 'column', gap: 4,
    transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
  },
  cardHover:   { borderColor: '#3b82f6', transform: 'translateY(-3px)', boxShadow: '0 6px 20px rgba(59,130,246,0.2)' },
  catTag:      { fontSize: 16 },
  cardWord:    { fontSize: 17, fontWeight: 800, color: '#3b82f6' },
  cardZh:      { fontSize: 13, fontWeight: 600, color: '#cbd5e1' },

  detail:      { display: 'flex', flexDirection: 'column', gap: 20 },
  nav:         { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  navBtn:      { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '8px 14px', fontSize: 14, cursor: 'pointer' },
  navProgress: { color: '#64748b', fontSize: 14, flex: 1 },
  navArrows:   { display: 'flex', gap: 8 },
  arrowBtn:    { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '8px 14px', fontSize: 14, cursor: 'pointer' },

  detailBody:  { display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' },
  detailLeft:  { flex: '0 0 320px', display: 'flex', flexDirection: 'column', gap: 16 },
  detailRight: { flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: 12 },

  catChip:     { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 20, fontSize: 13, color: '#94a3b8', alignSelf: 'flex-start' },
  wordBig:     { fontSize: 52, fontWeight: 900, color: '#3b82f6', lineHeight: 1 },
  wordZhBig:   { fontSize: 22, fontWeight: 700, color: '#f1f5f9' },

  infoCard:    { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '14px 16px' },
  infoLabel:   { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
  infoText:    { fontSize: 14, color: '#cbd5e1', lineHeight: 1.7, margin: 0 },

  ytSection:      { display: 'flex', flexDirection: 'column', gap: 8 },
  videoLinks:     { display: 'flex', flexDirection: 'column', gap: 10 },
  videoBtn:       {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 16px', borderRadius: 12, textDecoration: 'none',
    background: '#1e3a5f', border: '1px solid #3b82f6',
    transition: 'opacity 0.15s',
  },
  videoBtnGreen:  { background: '#14532d', border: '1px solid #22c55e' },
  videoBtnIcon:   { fontSize: 22, lineHeight: 1 },
  videoBtnTitle:  { fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 2 },
  videoBtnSub:    { fontSize: 12, color: '#94a3b8' },

  practiceBtn:    { padding: '12px', background: '#1e3a5f', border: '2px solid #3b82f6', borderRadius: 10, color: '#93c5fd', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  practiceBtnOn:  { background: '#7f1d1d', borderColor: '#ef4444', color: '#fca5a5' },

  liveBox:        { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', fontSize: 14, color: '#94a3b8' },
  resultBox:      { padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  resultCorrect:  { background: '#14532d', color: '#86efac', border: '1px solid #22c55e' },
  resultWrong:    { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' },
  retryBtn:       { padding: '4px 12px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer' },
  practiceHint:   { fontSize: 13, color: '#64748b', margin: 0, textAlign: 'center' },
};
