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
    <nav style={styles.nav}>
      <Link to="/" style={styles.brand}>
        ASL Learning
      </Link>

      <div style={styles.links}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({
              ...styles.link,
              ...(isActive ? styles.activeLink : {}),
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <div style={styles.auth}>
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
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 20,
    padding: '12px 24px',
    background: '#111827',
    borderBottom: '1px solid #1f2937',
    position: 'sticky',
    top: 0,
    zIndex: 20,
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },
  brand: {
    color: '#f8fafc',
    textDecoration: 'none',
    fontWeight: 900,
    fontSize: 18,
    whiteSpace: 'nowrap',
  },
  links: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  link: {
    color: '#cbd5e1',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 700,
    padding: '8px 10px',
    borderRadius: 6,
  },
  activeLink: {
    color: '#e0f2fe',
    background: '#1e293b',
  },
  auth: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    minWidth: 76,
    justifyContent: 'flex-end',
  },
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
