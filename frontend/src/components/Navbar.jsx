import React from 'react';
import { Link, NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: '首頁', end: true },
  { to: '/practice', label: '字母練習' },
  { to: '/asl-words', label: '詞彙練習' },
  { to: '/profile', label: '個人頁' },
];

export default function Navbar({ currentUser, onLogout, onLoginClick }) {
  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        ASL Learning
      </Link>

      <div className="navbar-links">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => 'navbar-link' + (isActive ? ' active' : '')}
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <div className="navbar-auth">
        {currentUser ? (
          <>
            <span style={s.userName}>
              {currentUser.displayName || currentUser.email?.split('@')[0]}
            </span>
            <button style={s.authButton} onClick={onLogout}>登出</button>
          </>
        ) : (
          <button style={{ ...s.authButton, ...s.loginBtn }} onClick={onLoginClick}>
            登入
          </button>
        )}
      </div>
    </nav>
  );
}

const s = {
  userName: {
    color: '#94a3b8',
    fontSize: 13,
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  authButton: {
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#cbd5e1',
    borderRadius: 6,
    padding: '7px 14px',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  },
  loginBtn: {
    borderColor: '#3b82f6',
    color: '#60a5fa',
  },
};
