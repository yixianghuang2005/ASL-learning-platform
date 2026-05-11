// 🔗 Navbar.jsx
// 【組員 B 負責實作】
// 功能：頂部導覽列，含登入狀態顯示與頁面連結
//
// TODO 清單：
//   1. 顯示 Logo 與專案名稱
//   2. 導覽連結：首頁、練習室、單字庫、個人檔案
//   3. 右側顯示使用者頭像 / 登入按鈕（從 firebaseClient 取得 currentUser）
//   4. 登出功能

import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = ({ currentUser, onLogout }) => {
  return (
    <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#1a1a2e' }}>
      <Link to="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold', fontSize: 20 }}>
        🤟 手語心連
      </Link>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* TODO: 加入 active 狀態樣式 */}
        <Link to="/" style={{ color: '#ccc', textDecoration: 'none' }}>首頁</Link>
        <Link to="/practice" style={{ color: '#ccc', textDecoration: 'none' }}>練習室</Link>
        <Link to="/vocabulary" style={{ color: '#ccc', textDecoration: 'none' }}>單字庫</Link>
        <Link to="/profile" style={{ color: '#ccc', textDecoration: 'none' }}>個人檔案</Link>
      </div>

      <div>
        {currentUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'white' }}>{currentUser.displayName || currentUser.email}</span>
            <button onClick={onLogout}>登出</button>
          </div>
        ) : (
          // TODO: 點擊後跳轉登入頁或顯示登入 Modal
          <button>登入</button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
