import React from 'react';
import { Link, NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: '首頁', end: true },
  { to: '/practice', label: '字母練習' },
  { to: '/asl-words', label: '詞彙練習' },
  { to: '/profile', label: '個人頁' },
];

const Navbar = ({ currentUser, onLogout }) => {
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
            <span style={styles.userName}>{currentUser.displayName || currentUser.email}</span>
            <button style={styles.authButton} onClick={onLogout}>登出</button>
          </>
        ) : (
          <button style={styles.authButton}>登入</button>
        )}
      </div>
    </nav>
  );
};

const styles = {
  userName: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  authButton: {
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#cbd5e1',
    borderRadius: 6,
    padding: '8px 12px',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

export default Navbar;
