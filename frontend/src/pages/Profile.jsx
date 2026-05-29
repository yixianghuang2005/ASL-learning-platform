// Profile.jsx — 個人頁：帳號資訊 + 學習紀錄

import React, { useEffect, useState } from 'react';
import { signOut, getBestScore, getRecentResults } from '../services/firebaseClient';

export default function Profile({ currentUser, onLoginClick }) {
  const [letterBest,   setLetterBest]   = useState(null);
  const [wordBest,     setWordBest]     = useState(null);
  const [letterRecent, setLetterRecent] = useState([]);
  const [wordRecent,   setWordRecent]   = useState([]);

  useEffect(() => {
    setLetterBest(getBestScore('letter'));
    setWordBest(getBestScore('word'));
    setLetterRecent(getRecentResults('letter', 5));
    setWordRecent(getRecentResults('word', 5));
  }, [currentUser]);

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div style={s.page}>
      <div style={s.content}>

        {/* ── 帳號區 ── */}
        <div style={s.card}>
          {currentUser ? (
            <div style={s.userRow}>
              <div style={s.avatar}>
                {(currentUser.displayName || currentUser.email || '?')[0].toUpperCase()}
              </div>
              <div style={s.userInfo}>
                <div style={s.userName}>
                  {currentUser.displayName || '使用者'}
                </div>
                <div style={s.userEmail}>{currentUser.email}</div>
              </div>
              <button style={s.logoutBtn} onClick={handleLogout}>登出</button>
            </div>
          ) : (
            <div style={s.guestRow}>
              <div style={s.guestIcon}>👤</div>
              <div>
                <div style={s.guestTitle}>訪客模式</div>
                <div style={s.guestSub}>成績存在本機，登入後可跨裝置查看</div>
              </div>
              <button style={s.loginBtn} onClick={onLoginClick}>登入 / 註冊</button>
            </div>
          )}
        </div>

        {/* ── 最佳紀錄 ── */}
        <div style={s.sectionTitle}>🏆 最佳成績</div>
        <div style={s.statsRow}>
          <StatCard
            label="字母闖關"
            best={letterBest}
            emoji="🔤"
            color="#3b82f6"
          />
          <StatCard
            label="詞彙闖關"
            best={wordBest}
            emoji="📚"
            color="#22c55e"
          />
        </div>

        {/* ── 最近紀錄 ── */}
        {(letterRecent.length > 0 || wordRecent.length > 0) && (
          <>
            <div style={s.sectionTitle}>📋 最近練習</div>
            <div style={s.card}>
              {letterRecent.length > 0 && (
                <>
                  <div style={s.typeHeader}>🔤 字母闖關</div>
                  {letterRecent.map((r, i) => <ResultRow key={i} r={r} />)}
                </>
              )}
              {wordRecent.length > 0 && (
                <>
                  <div style={{ ...s.typeHeader, marginTop: letterRecent.length ? 16 : 0 }}>📚 詞彙闖關</div>
                  {wordRecent.map((r, i) => <ResultRow key={i} r={r} />)}
                </>
              )}
            </div>
          </>
        )}

        {letterRecent.length === 0 && wordRecent.length === 0 && (
          <div style={s.empty}>
            <div style={{ fontSize: 48 }}>🎯</div>
            <div>還沒有練習紀錄</div>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>去字母練習或詞彙練習試試看吧！</div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── 最佳成績卡片 ──────────────────────────────────────────────────────────
function StatCard({ label, best, emoji, color }) {
  const points = best ? best.score * 10 : 0;
  return (
    <div style={{ ...s.statCard, borderColor: best ? color : '#334155' }}>
      <div style={s.statEmoji}>{emoji}</div>
      <div style={s.statLabel}>{label}</div>
      {best ? (
        <>
          <div style={{ ...s.statPct, color }}>{points} 分</div>
          <div style={s.statDetail}>{best.score} / {best.total} 題正確</div>
          <div style={s.statDate}>{formatDate(best.timestamp)}</div>
        </>
      ) : (
        <div style={s.statNone}>尚未練習</div>
      )}
    </div>
  );
}

// ── 單筆紀錄列 ────────────────────────────────────────────────────────────
function ResultRow({ r }) {
  const points   = r.score * 10;
  const good     = r.pct >= 70;
  const duration = r.duration ? `${r.duration}秒` : '';
  return (
    <div style={s.resultRow}>
      <span style={{ ...s.resultPct, color: good ? '#86efac' : '#fca5a5' }}>{points}分</span>
      <span style={s.resultDetail}>{r.score}/{r.total}題 {duration && `· ${duration}`}</span>
      <span style={s.resultDate}>{formatDate(r.timestamp)}</span>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ── 樣式 ──────────────────────────────────────────────────────────────────
const s = {
  page:    { minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: "'Segoe UI', system-ui, sans-serif", paddingBottom: 40 },
  content: { maxWidth: 720, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 },

  card: { background: '#1e293b', border: '1px solid #334155', borderRadius: 14, padding: '20px 24px' },

  // 已登入
  userRow:    { display: 'flex', alignItems: 'center', gap: 16 },
  avatar:     { width: 52, height: 52, borderRadius: '50%', background: '#1e3a5f', border: '2px solid #3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#60a5fa', flexShrink: 0 },
  userInfo:   { flex: 1, minWidth: 0 },
  userName:   { fontSize: 17, fontWeight: 700, color: '#f1f5f9', marginBottom: 2 },
  userEmail:  { fontSize: 13, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  logoutBtn:  { border: '1px solid #334155', background: 'transparent', color: '#94a3b8', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },

  // 訪客
  guestRow:   { display: 'flex', alignItems: 'center', gap: 16 },
  guestIcon:  { fontSize: 36, flexShrink: 0 },
  guestTitle: { fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 },
  guestSub:   { fontSize: 13, color: '#64748b' },
  loginBtn:   { border: '1px solid #3b82f6', background: '#1e3a5f', color: '#60a5fa', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0, marginLeft: 'auto' },

  // 區塊標題
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#94a3b8', paddingLeft: 4 },

  // 最佳成績
  statsRow:   { display: 'flex', gap: 12 },
  statCard:   { flex: 1, background: '#1e293b', border: '2px solid', borderRadius: 14, padding: '18px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  statEmoji:  { fontSize: 28 },
  statLabel:  { fontSize: 13, color: '#64748b', fontWeight: 600 },
  statPct:    { fontSize: 36, fontWeight: 900, lineHeight: 1.1 },
  statDetail: { fontSize: 13, color: '#94a3b8' },
  statDate:   { fontSize: 11, color: '#475569' },
  statNone:   { fontSize: 14, color: '#475569', marginTop: 8 },

  // 紀錄列
  typeHeader: { fontSize: 13, color: '#64748b', fontWeight: 700, marginBottom: 8 },
  resultRow:  { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #0f172a' },
  resultPct:  { fontSize: 16, fontWeight: 700, width: 48 },
  resultDetail: { fontSize: 13, color: '#94a3b8', flex: 1 },
  resultDate: { fontSize: 12, color: '#475569' },

  // 空狀態
  empty: { textAlign: 'center', padding: '48px 0', color: '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
};
