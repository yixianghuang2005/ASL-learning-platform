// components/practice/LearnTab.jsx — Tab 1：學習 A~Z
// 卡片大小由圖片自然尺寸決定，不強制固定寬高

import React, { useState, useEffect, useRef } from 'react';
import VideoCapture from '../VideoCapture';

const ASL_LETTERS = [
  { letter: 'A', hint: '握拳，拇指放在側面' },
  { letter: 'B', hint: '四指伸直並攏，拇指向內折' },
  { letter: 'C', hint: '手指彎曲成 C 型' },
  { letter: 'D', hint: '食指朝上，其他手指與拇指圍成圓' },
  { letter: 'E', hint: '四指彎曲，拇指向內收' },
  { letter: 'F', hint: '食指與拇指形成圓，其他三指伸直' },
  { letter: 'G', hint: '食指與拇指水平指向側面' },
  { letter: 'H', hint: '食指與中指並攏水平伸出' },
  { letter: 'I', hint: '小指朝上，其他手指握拳' },
  { letter: 'J', hint: '小指朝上，畫出 J 字形軌跡' },
  { letter: 'K', hint: '食指朝上，中指斜向外，拇指夾住中指' },
  { letter: 'L', hint: '食指朝上，拇指水平伸出，像 L 型' },
  { letter: 'M', hint: '三指覆蓋拇指（拇指在食指側）' },
  { letter: 'N', hint: '兩指覆蓋拇指' },
  { letter: 'O', hint: '所有手指與拇指圍成 O 型' },
  { letter: 'P', hint: '食指向下，中指向前，拇指向上' },
  { letter: 'Q', hint: '食指向下，拇指向下' },
  { letter: 'R', hint: '食指與中指交叉' },
  { letter: 'S', hint: '握拳，拇指覆蓋在手指上' },
  { letter: 'T', hint: '拇指穿在食指與中指之間' },
  { letter: 'U', hint: '食指與中指並攏朝上' },
  { letter: 'V', hint: '食指與中指張開成 V 型' },
  { letter: 'W', hint: '食指、中指、無名指張開成 W 型' },
  { letter: 'X', hint: '食指彎曲成鉤狀' },
  { letter: 'Y', hint: '拇指與小指伸出，其他三指握拳' },
  { letter: 'Z', hint: '食指朝前，在空中畫出 Z 字軌跡' },
];

const getImageUrl = (letter) => `/asl/${letter}.png`;

export default function LearnTab({ selectedLetter, setSelectedLetter }) {
  if (selectedLetter !== null) {
    return (
      <LetterDetail
        data={ASL_LETTERS[selectedLetter]}
        index={selectedLetter}
        total={ASL_LETTERS.length}
        onBack={() => setSelectedLetter(null)}
        onPrev={() => setSelectedLetter(i => Math.max(0, i - 1))}
        onNext={() => setSelectedLetter(i => Math.min(ASL_LETTERS.length - 1, i + 1))}
      />
    );
  }

  return <CarouselGrid onSelect={setSelectedLetter} />;
}

// ── 水平捲動輪播 ──────────────────────────────────────────────────
function CarouselGrid({ onSelect }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft]   = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 360, behavior: 'smooth' });
  };

  return (
    <div style={s.carouselWrapper}>
      <p style={s.gridDesc}>點擊手勢圖片，開始練習 👇</p>

      {canScrollLeft && (
        <button style={{ ...s.arrowOverlay, left: 0 }} onClick={() => scroll(-1)}>‹</button>
      )}

      <div
        ref={scrollRef}
        style={s.scrollContainer}
        onScroll={updateScrollState}
      >
        {ASL_LETTERS.map((item, idx) => (
          <CarouselCard key={item.letter} data={item} onClick={() => onSelect(idx)} />
        ))}
      </div>

      {canScrollRight && (
        <button style={{ ...s.arrowOverlay, right: 0 }} onClick={() => scroll(1)}>›</button>
      )}

      {/* 字母快速跳轉列 */}
      <div style={s.jumpBar}>
        {ASL_LETTERS.map((item, idx) => (
          <button key={item.letter} style={s.jumpBtn} onClick={() => onSelect(idx)}>
            {item.letter}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 單張卡片：寬高跟著圖片走 ─────────────────────────────────────
function CarouselCard({ data, onClick }) {
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered]   = useState(false);

  return (
    <button
      style={{ ...s.card, ...(hovered ? s.cardHover : {}) }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!imgError ? (
        <>
          {/* 圖片：自然尺寸，最大限制避免過大 */}
          <img
            src={getImageUrl(data.letter)}
            alt={`ASL ${data.letter}`}
            style={s.cardImg}
            onError={() => setImgError(true)}
          />
          {/* Hover 遮罩 */}
          {hovered && (
            <div style={s.hoverMask}>
              <span style={s.hoverLetter}>{data.letter}</span>
              <span style={s.hoverHint}>{data.hint}</span>
            </div>
          )}
        </>
      ) : (
        // 圖片不存在：顯示字母佔位
        <div style={s.cardFallback}>{data.letter}</div>
      )}

      {/* 底部字母標籤 */}
      <div style={s.cardFooter}>
        <span style={s.cardFooterLetter}>{data.letter}</span>
      </div>
    </button>
  );
}

// ── 詳細練習頁 ────────────────────────────────────────────────────
function LetterDetail({ data, index, total, onBack, onPrev, onNext }) {
  const [imgError, setImgError]     = useState(false);
  const [practiceMode, setPractice] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [correct, setCorrect]       = useState(false);

  useEffect(() => {
    setImgError(false); setPractice(false); setLastResult(null); setCorrect(false);
  }, [data.letter]);

  const handleResult = (detection) => {
    if (!detection) return;
    setLastResult(detection);
    setCorrect(detection.label === data.letter && detection.confidence >= 0.75);
  };

  return (
    <div style={s.detail}>
      <div style={s.detailNav}>
        <button style={s.navBtn} onClick={onBack}>← 返回總覽</button>
        <span style={s.navProgress}>{index + 1} / {total}</span>
        <div style={s.navArrows}>
          <button style={s.arrowBtn} onClick={onPrev} disabled={index === 0}>‹ 上一個</button>
          <button style={s.arrowBtn} onClick={onNext} disabled={index === total - 1}>下一個 ›</button>
        </div>
      </div>

      <div style={s.detailBody}>
        <div style={s.detailLeft}>
          <div style={s.detailLetterBig}>{data.letter}</div>
          {!imgError
            ? <img src={getImageUrl(data.letter)} alt={`ASL ${data.letter}`} style={s.detailImg} onError={() => setImgError(true)} />
            : <div style={s.detailImgFallback}>{data.letter}</div>
          }
          <div style={s.hintCard}>
            <div style={s.hintLabel}>手勢說明</div>
            <p style={s.hintCardText}>{data.hint}</p>
          </div>
          <button
            style={{ ...s.practiceToggle, ...(practiceMode ? s.practiceToggleOn : {}) }}
            onClick={() => setPractice(p => !p)}
          >
            {practiceMode ? '⏹ 停止練習' : '📷 開始練習'}
          </button>
        </div>

        {practiceMode && (
          <div style={s.detailRight}>
            <VideoCapture onResult={handleResult} />
            {lastResult && (
              <div style={{ ...s.resultBox, ...(correct ? s.resultCorrect : s.resultWrong) }}>
                {correct
                  ? `✅ 正確！辨識到 ${lastResult.label}（${Math.round(lastResult.confidence * 100)}%）`
                  : `偵測到：${lastResult.label}（${Math.round(lastResult.confidence * 100)}%）— 繼續調整手勢`}
              </div>
            )}
            <p style={s.practiceHint}>將手勢對準鏡頭，系統辨識是否為 <strong>{data.letter}</strong></p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 樣式 ──────────────────────────────────────────────────────────
const s = {
  carouselWrapper: { position: 'relative' },
  gridDesc: { color: '#94a3b8', fontSize: 14, marginBottom: 16, textAlign: 'center' },

  arrowOverlay: {
    position: 'absolute',
    top: '40%',
    transform: 'translateY(-50%)',
    zIndex: 5,
    width: 40, height: 40,
    background: 'rgba(59,130,246,0.85)',
    border: 'none', borderRadius: '50%',
    color: '#fff', fontSize: 22,
    cursor: 'pointer',
  },

  scrollContainer: {
    display: 'flex',
    gap: 14,
    overflowX: 'auto',
    paddingBottom: 12,
    paddingLeft: 8,
    paddingRight: 8,
    scrollbarWidth: 'thin',
    scrollbarColor: '#334155 transparent',
    WebkitOverflowScrolling: 'touch',
    alignItems: 'flex-start',  // 讓不同高度的卡片靠頂對齊
  },

  // 卡片：不設固定寬高，由圖片撐開
  card: {
    flex: '0 0 auto',           // 不壓縮、不放大，保持 auto 寬度
    background: '#1e293b',
    border: '2px solid #334155',
    borderRadius: 14,
    overflow: 'hidden',
    cursor: 'pointer',
    display: 'inline-flex',
    flexDirection: 'column',
    position: 'relative',
    transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
    padding: 0,
    maxWidth: 240,              // 最大寬度，避免圖片過大
  },
  cardHover: {
    borderColor: '#3b82f6',
    transform: 'translateY(-4px)',
    boxShadow: '0 8px 24px rgba(59,130,246,0.25)',
  },

  // 圖片：自然尺寸顯示，寬度撐開卡片
  cardImg: {
    display: 'block',
    width: '100%',              // 填滿卡片寬度（卡片寬由圖片原始比例決定）
    height: 'auto',             // 高度自動，保持原始比例
    objectFit: 'contain',
  },

  // 圖片不存在的 fallback
  cardFallback: {
    width: 160,
    height: 160,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 56,
    fontWeight: 900,
    color: '#3b82f6',
    background: '#0f172a',
  },

  // 底部字母標籤
  cardFooter: {
    padding: '6px 10px',
    background: '#1e293b',
    textAlign: 'center',
  },
  cardFooterLetter: {
    fontSize: 18,
    fontWeight: 900,
    color: '#3b82f6',
  },

  // Hover 遮罩
  hoverMask: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(15,23,42,0.80)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  hoverLetter: {
    fontSize: 48,
    fontWeight: 900,
    color: '#3b82f6',
    lineHeight: 1,
  },
  hoverHint: {
    fontSize: 12,
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 1.5,
  },

  // 字母快速跳轉列
  jumpBar: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 16, justifyContent: 'center' },
  jumpBtn: { width: 32, height: 32, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', fontSize: 13, fontWeight: 700, cursor: 'pointer' },

  // 詳細頁
  detail: { display: 'flex', flexDirection: 'column', gap: 20 },
  detailNav: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  navBtn: { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '8px 14px', fontSize: 14, cursor: 'pointer' },
  navProgress: { color: '#64748b', fontSize: 14, flex: 1 },
  navArrows: { display: 'flex', gap: 8 },
  arrowBtn: { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '8px 14px', fontSize: 14, cursor: 'pointer' },
  detailBody: { display: 'flex', gap: 24, flexWrap: 'wrap' },
  detailLeft: { flex: '0 0 220px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 },
  detailLetterBig: { fontSize: 72, fontWeight: 900, color: '#3b82f6', lineHeight: 1 },
  detailImg: { width: 160, height: 160, objectFit: 'contain', background: '#fff', borderRadius: 16, padding: 8 },
  detailImgFallback: { fontSize: 80, width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', borderRadius: 16, color: '#3b82f6', fontWeight: 900 },
  hintCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '14px 16px', width: '100%' },
  hintLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
  hintCardText: { fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, margin: 0 },
  practiceToggle: { width: '100%', padding: '12px', background: '#1e3a5f', border: '2px solid #3b82f6', borderRadius: 10, color: '#93c5fd', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  practiceToggleOn: { background: '#7f1d1d', borderColor: '#ef4444', color: '#fca5a5' },
  detailRight: { flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: 12 },
  resultBox: { padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600 },
  resultCorrect: { background: '#14532d', color: '#86efac', border: '1px solid #22c55e' },
  resultWrong: { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' },
  practiceHint: { fontSize: 13, color: '#64748b', margin: 0, textAlign: 'center' },
};
