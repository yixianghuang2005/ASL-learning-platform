// WordLearnTab.jsx — 詞彙學習：卡片總覽 + 詳細頁（含 YouTube 示範）

import React, { useState, useCallback } from 'react';
import WordVideoCapture from '../WordVideoCapture';

const ASL_WORDS = [
  { word: 'hello',    display: 'Hello',     zh: '你好',   desc: '張開手掌，從額頭旁向外揮動，像敬禮的動作。', ytSearch: 'ASL hello sign' },
  { word: 'thankyou', display: 'Thank You', zh: '謝謝',   desc: '手指輕觸嘴唇或下巴，然後向前伸出，像送出謝意。', ytSearch: 'ASL thank you sign' },
  { word: 'please',   display: 'Please',    zh: '請',     desc: '手掌貼在胸口，順時針畫圓圈。', ytSearch: 'ASL please sign' },
  { word: 'sorry',    display: 'Sorry',     zh: '對不起', desc: '握拳貼在胸口，畫圓圈，表示遺憾。', ytSearch: 'ASL sorry sign' },
  { word: 'help',     display: 'Help',      zh: '幫助',   desc: '一手握拳放在另一手掌心上，整體向上推出。', ytSearch: 'ASL help sign' },
  { word: 'yes',      display: 'Yes',       zh: '是',     desc: '握拳上下點動，像點頭的動作。', ytSearch: 'ASL yes sign' },
  { word: 'no',       display: 'No',        zh: '否',     desc: '食指和中指夾住拇指，快速開合兩次。', ytSearch: 'ASL no sign' },
  { word: 'want1',    display: 'Want',      zh: '想要',   desc: '雙手手指彎曲朝向自己，向內拉動，表示想抓取。', ytSearch: 'ASL want sign' },
  { word: 'like',     display: 'Like',      zh: '喜歡',   desc: '拇指與中指捏住胸口衣服，向外拉開伸直。', ytSearch: 'ASL like sign' },
  { word: 'more',     display: 'More',      zh: '更多',   desc: '雙手手指合攏成尖，兩手互相輕點兩次。', ytSearch: 'ASL more sign' },
];

export default function WordLearnTab() {
  const [selected, setSelected] = useState(null);

  if (selected !== null) {
    return (
      <WordDetail
        data={ASL_WORDS[selected]}
        index={selected}
        total={ASL_WORDS.length}
        onBack={() => setSelected(null)}
        onPrev={() => setSelected(i => Math.max(0, i - 1))}
        onNext={() => setSelected(i => Math.min(ASL_WORDS.length - 1, i + 1))}
      />
    );
  }

  return (
    <div style={s.grid}>
      <p style={s.gridDesc}>點擊詞彙卡片，觀看示範影片並練習 👇</p>
      <div style={s.cardGrid}>
        {ASL_WORDS.map((w, idx) => (
          <WordCard key={w.word} data={w} onClick={() => setSelected(idx)} />
        ))}
      </div>
    </div>
  );
}

function WordCard({ data, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{ ...s.card, ...(hovered ? s.cardHover : {}) }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={s.cardWord}>{data.display}</div>
      <div style={s.cardZh}>{data.zh}</div>
      <div style={s.cardDescPreview}>{data.desc.slice(0, 20)}…</div>
    </button>
  );
}

function WordDetail({ data, index, total, onBack, onPrev, onNext }) {
  const [practiceMode, setPractice] = useState(false);
  const [liveResult, setLive]       = useState(null);
  const [confirmed, setConfirmed]   = useState(null);

  const handleFrame     = useCallback(r => setLive(r), []);
  const handleConfirmed = useCallback(r => setConfirmed(r), []);

  const resetPractice = () => { setLive(null); setConfirmed(null); };
  const togglePractice = () => { setPractice(p => !p); resetPractice(); };

  // 切詞時重置
  const handlePrev = () => { onPrev(); resetPractice(); setPractice(false); };
  const handleNext = () => { onNext(); resetPractice(); setPractice(false); };

  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(data.ytSearch)}`;
  const isCorrect = confirmed?.label === data.word;

  return (
    <div style={s.detail}>
      {/* 導覽列 */}
      <div style={s.nav}>
        <button style={s.navBtn} onClick={onBack}>← 返回總覽</button>
        <span style={s.navProgress}>{index + 1} / {total}</span>
        <div style={s.navArrows}>
          <button style={s.arrowBtn} onClick={handlePrev} disabled={index === 0}>‹ 上一個</button>
          <button style={s.arrowBtn} onClick={handleNext} disabled={index === total - 1}>下一個 ›</button>
        </div>
      </div>

      <div style={s.detailBody}>
        {/* 左欄：詞彙資訊 + YouTube */}
        <div style={s.detailLeft}>
          <div style={s.wordBig}>{data.display}</div>
          <div style={s.wordZhBig}>{data.zh}</div>

          <div style={s.infoCard}>
            <div style={s.infoLabel}>手勢說明</div>
            <p style={s.infoText}>{data.desc}</p>
          </div>

          {/* YouTube 示範影片 */}
          <div style={s.ytSection}>
            <div style={s.infoLabel}>示範影片</div>
            <div style={s.ytEmbed}>
              <iframe
                src={`https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(data.ytSearch)}`}
                title={`ASL ${data.display}`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={s.ytIframe}
              />
            </div>
            <a href={ytUrl} target="_blank" rel="noopener noreferrer" style={s.ytLink}>
              在 YouTube 搜尋更多示範 →
            </a>
          </div>

          <button
            style={{ ...s.practiceBtn, ...(practiceMode ? s.practiceBtnOn : {}) }}
            onClick={togglePractice}
          >
            {practiceMode ? '⏹ 停止練習' : '📷 開始練習'}
          </button>
        </div>

        {/* 右欄：鏡頭練習 */}
        {practiceMode && (
          <div style={s.detailRight}>
            <WordVideoCapture
              isRecording={practiceMode}
              onFrame={handleFrame}
              onConfirmed={handleConfirmed}
            />

            {/* 即時候選 */}
            {liveResult && !confirmed && (
              <div style={s.liveBox}>
                目前偵測：<strong>{liveResult.label}</strong>（{(liveResult.confidence * 100).toFixed(0)}%）
              </div>
            )}

            {/* 確認結果 */}
            {confirmed && (
              <div style={{ ...s.resultBox, ...(isCorrect ? s.resultCorrect : s.resultWrong) }}>
                {isCorrect
                  ? `✅ 正確！辨識到「${data.display}」（${(confirmed.confidence * 100).toFixed(0)}%）`
                  : `辨識到「${confirmed.label}」，目標是「${data.display}」，再試一次！`}
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

const s = {
  grid:     { display: 'flex', flexDirection: 'column', gap: 16 },
  gridDesc: { color: '#94a3b8', fontSize: 14, textAlign: 'center', margin: 0 },
  cardGrid: { display: 'flex', flexWrap: 'wrap', gap: 14 },

  card: {
    flex: '1 1 140px', maxWidth: 180,
    background: '#1e293b', border: '2px solid #334155', borderRadius: 16,
    padding: '20px 16px', cursor: 'pointer', textAlign: 'center',
    display: 'flex', flexDirection: 'column', gap: 6,
    transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
  },
  cardHover:       { borderColor: '#3b82f6', transform: 'translateY(-4px)', boxShadow: '0 8px 24px rgba(59,130,246,0.25)' },
  cardWord:        { fontSize: 22, fontWeight: 800, color: '#3b82f6' },
  cardZh:          { fontSize: 16, fontWeight: 600, color: '#f1f5f9' },
  cardDescPreview: { fontSize: 11, color: '#64748b', lineHeight: 1.4 },

  detail:     { display: 'flex', flexDirection: 'column', gap: 20 },
  nav:        { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  navBtn:     { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '8px 14px', fontSize: 14, cursor: 'pointer' },
  navProgress:{ color: '#64748b', fontSize: 14, flex: 1 },
  navArrows:  { display: 'flex', gap: 8 },
  arrowBtn:   { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '8px 14px', fontSize: 14, cursor: 'pointer' },

  detailBody: { display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' },
  detailLeft: { flex: '0 0 320px', display: 'flex', flexDirection: 'column', gap: 16 },
  detailRight:{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: 12 },

  wordBig:    { fontSize: 56, fontWeight: 900, color: '#3b82f6', lineHeight: 1 },
  wordZhBig:  { fontSize: 24, fontWeight: 700, color: '#f1f5f9' },

  infoCard:   { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '14px 16px' },
  infoLabel:  { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
  infoText:   { fontSize: 14, color: '#cbd5e1', lineHeight: 1.7, margin: 0 },

  ytSection:  { display: 'flex', flexDirection: 'column', gap: 8 },
  ytEmbed:    { borderRadius: 10, overflow: 'hidden', background: '#0f172a' },
  ytIframe:   { width: '100%', height: 200, display: 'block', border: 'none' },
  ytLink:     { fontSize: 12, color: '#3b82f6', textDecoration: 'none', textAlign: 'right' },

  practiceBtn:   { padding: '12px', background: '#1e3a5f', border: '2px solid #3b82f6', borderRadius: 10, color: '#93c5fd', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  practiceBtnOn: { background: '#7f1d1d', borderColor: '#ef4444', color: '#fca5a5' },

  liveBox:       { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', fontSize: 14, color: '#94a3b8' },
  resultBox:     { padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  resultCorrect: { background: '#14532d', color: '#86efac', border: '1px solid #22c55e' },
  resultWrong:   { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' },
  retryBtn:      { padding: '4px 12px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer' },
  practiceHint:  { fontSize: 13, color: '#64748b', margin: 0, textAlign: 'center' },
};
