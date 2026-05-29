// QuizHistoryTab.jsx — 測驗歷史紀錄（字母 / 詞彙共用）

import React, { useState, useEffect } from 'react';
import { getRecentResults } from '../../services/firebaseClient';

/**
 * @param {'letter'|'word'} type
 */
export default function QuizHistoryTab({ type }) {
  const [records,    setRecords]  = useState([]);
  const [expandedId, setExpanded] = useState(null);

  useEffect(() => {
    setRecords(getRecentResults(type, 50));
  }, [type]);

  if (records.length === 0) {
    return (
      <div style={s.empty}>
        <div style={{ fontSize: 48 }}>📋</div>
        <div style={{ fontSize: 16, color: '#94a3b8' }}>還沒有測驗紀錄</div>
        <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
          完成一次{type === 'letter' ? '字母' : '詞彙'}闖關後就會顯示在這裡
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span style={s.headerTitle}>📋 測驗歷史</span>
        <span style={s.headerCount}>{records.length} 筆紀錄</span>
      </div>

      <div style={s.list}>
        {records.map((r, i) => {
          const id       = r.timestamp + i;
          const expanded = expandedId === id;
          const points   = (r.points != null) ? r.points : r.score * 10;
          const good     = r.pct >= 70;

          return (
            <div key={id} style={s.card}>
              {/* ── 摘要列 ── */}
              <button style={s.summary} onClick={() => setExpanded(expanded ? null : id)}>
                {/* 分數 */}
                <div style={{ ...s.points, color: good ? '#86efac' : '#fca5a5' }}>
                  {points}分
                </div>

                {/* 中間：題數 + 時間 */}
                <div style={s.meta}>
                  <span style={s.metaScore}>{r.score}/{r.total} 題正確（{r.pct}%）</span>
                  <span style={s.metaTime}>
                    🕐 {formatDate(r.timestamp)}
                    {r.duration ? `　⏱ ${formatDuration(r.duration)}` : ''}
                  </span>
                </div>

                {/* 展開箭頭 */}
                <span style={{ ...s.arrow, transform: expanded ? 'rotate(180deg)' : 'none' }}>▼</span>
              </button>

              {/* ── 展開：每題詳情 ── */}
              {expanded && (
                <div style={s.detail}>
                  {(r.details || []).map((d, j) => (
                    <div key={j} style={{ ...s.detailRow, ...(d.correct ? s.detailOk : d.timedOut ? s.detailTimeout : d.skipped ? s.detailSkip : s.detailFail) }}>
                      <span style={s.detailIcon}>
                        {d.correct ? '✅' : d.timedOut ? '⏱' : d.skipped ? '⏭' : '❌'}
                      </span>
                      {type === 'letter' ? (
                        <>
                          <span style={s.detailQ}>第 {j + 1} 題：<strong>{d.letter}</strong></span>
                          {!d.correct && !d.timedOut && d.answered &&
                            <span style={s.detailA}>你比：{d.answered}</span>}
                          {d.timedOut && <span style={s.detailA}>超時</span>}
                        </>
                      ) : (
                        <>
                          <span style={s.detailQ}>
                            第 {j + 1} 題：<strong>{d.display || d.word}</strong>
                            {d.zh ? <span style={{ color: '#64748b', fontWeight: 400 }}>（{d.zh}）</span> : ''}
                          </span>
                          {d.timedOut && <span style={s.detailA}>超時</span>}
                          {d.skipped  && <span style={s.detailA}>跳過</span>}
                          {!d.correct && !d.timedOut && !d.skipped && d.answered &&
                            <span style={s.detailA}>辨識：{d.answered}</span>}
                        </>
                      )}
                      <span style={s.detailPts}>{d.correct ? '+10分' : '0分'}</span>
                    </div>
                  ))}

                  {/* 小計 */}
                  <div style={s.subtotal}>
                    合計 <strong>{points}</strong> / {r.total * 10} 分
                    {r.duration ? `　用時 ${formatDuration(r.duration)}` : ''}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 工具函式 ─────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(sec) {
  if (sec < 60) return `${sec} 秒`;
  return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
}

// ── 樣式 ─────────────────────────────────────────────────────────────────
const s = {
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 8, padding: '64px 20px', textAlign: 'center',
  },
  root:   { display: 'flex', flexDirection: 'column', gap: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' },
  headerTitle: { fontSize: 16, fontWeight: 700, color: '#f1f5f9' },
  headerCount: { fontSize: 13, color: '#475569' },

  list: { display: 'flex', flexDirection: 'column', gap: 8 },

  card: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
    overflow: 'hidden',
  },
  summary: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 16,
    padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
    textAlign: 'left',
  },

  points:    { fontSize: 22, fontWeight: 900, minWidth: 60 },
  meta:      { flex: 1, display: 'flex', flexDirection: 'column', gap: 3 },
  metaScore: { fontSize: 14, color: '#f1f5f9', fontWeight: 600 },
  metaTime:  { fontSize: 12, color: '#64748b' },
  arrow:     { fontSize: 12, color: '#475569', transition: 'transform 0.2s', flexShrink: 0 },

  detail: {
    borderTop: '1px solid #334155',
    padding: '12px 18px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  detailRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', borderRadius: 8, fontSize: 14,
  },
  detailOk:      { background: '#14532d22', border: '1px solid #22c55e44' },
  detailFail:    { background: '#450a0a22', border: '1px solid #ef444444' },
  detailTimeout: { background: '#43140722', border: '1px solid #f9731644' },
  detailSkip:    { background: '#1e293b', border: '1px solid #334155' },

  detailIcon: { fontSize: 16, flexShrink: 0 },
  detailQ:    { flex: 1, color: '#e2e8f0' },
  detailA:    { fontSize: 12, color: '#94a3b8' },
  detailPts:  { fontSize: 12, color: '#64748b', minWidth: 36, textAlign: 'right' },

  subtotal: {
    marginTop: 4, paddingTop: 10,
    borderTop: '1px solid #334155',
    fontSize: 13, color: '#94a3b8', textAlign: 'right',
  },
};
