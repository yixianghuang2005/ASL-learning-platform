// LoginModal.jsx — 帳號名稱 + 密碼 登入/註冊彈窗

import React, { useState } from 'react';
import { signIn, signUp } from '../services/firebaseClient';

// 帳號名稱 → 內部用的假信箱（使用者看不到）
function toEmail(username) {
  return username.trim().toLowerCase().replace(/\s+/g, '_') + '@asl-learning.app';
}

export default function LoginModal({ onClose }) {
  const [mode,     setMode]     = useState('login');   // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const u = username.trim();
    if (!u) { setError('請輸入帳號名稱'); return; }
    if (u.length < 2) { setError('帳號名稱至少 2 個字元'); return; }
    if (password.length < 6) { setError('密碼至少 6 個字元'); return; }

    setLoading(true);
    try {
      const email = toEmail(u);
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password, u);   // displayName = 帳號名稱
      }
      onClose();
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => { setMode(m); setError(''); };

  return (
    <div style={s.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        {/* 標題 */}
        <div style={s.header}>
          <h2 style={s.title}>{mode === 'login' ? '登入' : '建立帳號'}</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 表單 */}
        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>帳號名稱</label>
            <input
              style={s.input}
              type="text"
              placeholder="輸入你的帳號"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>密碼{mode === 'register' ? '（至少 6 碼）' : ''}</label>
            <input
              style={s.input}
              type="password"
              placeholder="••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <div style={s.error}>{error}</div>}

          <button
            style={{ ...s.submitBtn, opacity: loading ? 0.6 : 1 }}
            type="submit"
            disabled={loading}
          >
            {loading ? '請稍候…' : mode === 'login' ? '登入' : '建立帳號'}
          </button>
        </form>

        {/* 切換 */}
        <div style={s.switchRow}>
          {mode === 'login' ? (
            <span style={s.switchText}>
              還沒有帳號？<button style={s.switchBtn} onClick={() => switchMode('register')}>立即註冊</button>
            </span>
          ) : (
            <span style={s.switchText}>
              已有帳號？<button style={s.switchBtn} onClick={() => switchMode('login')}>回到登入</button>
            </span>
          )}
        </div>

        <p style={s.hint}>不登入也可以使用所有功能（訪客模式）</p>
      </div>
    </div>
  );
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found':        '找不到此帳號',
    'auth/wrong-password':        '密碼錯誤',
    'auth/invalid-credential':    '帳號或密碼錯誤',
    'auth/email-already-in-use':  '此帳號名稱已被使用',
    'auth/weak-password':         '密碼至少 6 個字元',
    'auth/too-many-requests':     '嘗試次數過多，請稍後再試',
    'auth/network-request-failed':'網路連線失敗',
  };
  return map[code] || '登入失敗，請再試一次';
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  modal: {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
    padding: '28px 32px', width: '100%', maxWidth: 380,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  header:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title:    { margin: 0, fontSize: 22, fontWeight: 800, color: '#f1f5f9' },
  closeBtn: { background: 'none', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer', padding: 4 },
  form:     { display: 'flex', flexDirection: 'column', gap: 16 },
  field:    { display: 'flex', flexDirection: 'column', gap: 6 },
  label:    { fontSize: 13, color: '#94a3b8', fontWeight: 600 },
  input:    {
    padding: '10px 14px', borderRadius: 8,
    background: '#0f172a', border: '1px solid #334155',
    color: '#f1f5f9', fontSize: 15, outline: 'none',
  },
  error:    {
    padding: '10px 14px', borderRadius: 8,
    background: '#450a0a', border: '1px solid #ef4444',
    color: '#fca5a5', fontSize: 13,
  },
  submitBtn: {
    padding: 12, borderRadius: 8,
    background: '#3b82f6', border: 'none',
    color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4,
  },
  switchRow: { marginTop: 20, textAlign: 'center' },
  switchText: { color: '#64748b', fontSize: 14 },
  switchBtn: {
    background: 'none', border: 'none',
    color: '#60a5fa', fontSize: 14, cursor: 'pointer', fontWeight: 700, marginLeft: 4,
  },
  hint: { textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 12, marginBottom: 0 },
};
