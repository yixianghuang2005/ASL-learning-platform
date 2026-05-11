// 🃏 WordCard.jsx
// 【組員 D 負責實作】
// 功能：顯示手語單字的詞卡，包含示範圖片、文字說明、練習按鈕
//
// TODO 清單：
//   1. 顯示手語單字名稱（中文）
//   2. 顯示示範圖片或 GIF
//   3. 顯示難度標籤（初級 / 中級 / 進階）
//   4. 加入「開始練習」按鈕，導向 Practice 頁並帶入目標單字
//   5. 顯示使用者的練習次數與最佳準確率（從 Firebase 讀取）

import React from 'react';

// Props 說明：
//   word: { id, name, imageUrl, difficulty, category }
//   userStats: { practiceCount, bestAccuracy }  ← 由組員 C 提供 Firebase 資料
const WordCard = ({ word, userStats, onPractice }) => {
  const difficultyColor = {
    初級: '#4CAF50',
    中級: '#FF9800',
    進階: '#F44336',
  };

  return (
    <div className="word-card" style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
      {/* TODO: 替換為實際圖片 */}
      <div
        style={{
          width: '100%',
          height: 160,
          background: '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {word?.imageUrl ? (
          <img src={word.imageUrl} alt={word.name} style={{ maxHeight: '100%' }} />
        ) : (
          <span style={{ color: '#999' }}>📷 示範圖片（待上傳）</span>
        )}
      </div>

      <h3>{word?.name || '單字名稱'}</h3>

      {/* 難度標籤 */}
      <span
        style={{
          background: difficultyColor[word?.difficulty] || '#999',
          color: 'white',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 12,
        }}
      >
        {word?.difficulty || '初級'}
      </span>

      {/* TODO: 從 Firebase 讀取使用者練習紀錄後顯示 */}
      <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
        <span>練習次數：{userStats?.practiceCount ?? '-'}</span>
        <br />
        <span>最佳準確率：{userStats?.bestAccuracy ? `${userStats.bestAccuracy}%` : '-'}</span>
      </div>

      <button
        onClick={() => onPractice?.(word)}
        style={{ marginTop: 12, width: '100%', padding: '8px 0' }}
      >
        🤟 開始練習
      </button>
    </div>
  );
};

export default WordCard;
