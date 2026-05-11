// 🏠 Home.jsx — 首頁
// 所有人皆可協作
// TODO: 設計首頁 Hero 區、功能介紹、快速開始按鈕

import React from 'react';
import { Link } from 'react-router-dom';

const Home = () => (
  <div style={{ padding: 40, textAlign: 'center' }}>
    <h1>🤟 手語心連</h1>
    <p style={{ fontSize: 18, color: '#555', maxWidth: 600, margin: '0 auto 32px' }}>
      利用 AI 即時辨識，讓學習中文手語變得直觀又有趣
    </p>
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
      <Link to="/practice">
        <button style={{ padding: '12px 32px', fontSize: 16 }}>開始練習</button>
      </Link>
      <Link to="/vocabulary">
        <button style={{ padding: '12px 32px', fontSize: 16 }}>瀏覽單字庫</button>
      </Link>
    </div>
    {/* TODO: 加入功能介紹卡片（即時辨識、進度追蹤、SDGs 說明） */}
  </div>
);

export default Home;
