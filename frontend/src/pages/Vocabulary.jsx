// 📚 Vocabulary.jsx — 單字庫
// 所有人皆可協作；詞卡元件由組員 D 實作
// TODO:
//   1. 從 Firestore 或靜態 JSON 讀取單字清單
//   2. 顯示分類篩選（日常用語 / 數字 / 家庭 / ...）
//   3. 搜尋功能
//   4. 使用 <WordCard> 元件渲染每個單字

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WordCard from '../components/WordCard';

// 暫時使用靜態假資料，之後替換為 Firestore 資料
const MOCK_WORDS = [
  { id: '1', name: '你好', imageUrl: null, difficulty: '初級', category: '日常用語' },
  { id: '2', name: '謝謝', imageUrl: null, difficulty: '初級', category: '日常用語' },
  { id: '3', name: '對不起', imageUrl: null, difficulty: '中級', category: '日常用語' },
  { id: '4', name: '我愛你', imageUrl: null, difficulty: '初級', category: '日常用語' },
  { id: '5', name: '一', imageUrl: null, difficulty: '初級', category: '數字' },
  { id: '6', name: '二', imageUrl: null, difficulty: '初級', category: '數字' },
];

const Vocabulary = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = MOCK_WORDS.filter((w) => w.name.includes(search));

  const handlePractice = (word) => {
    navigate(`/practice?word=${word.name}`);
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>📚 單字庫</h2>

      {/* 搜尋 */}
      <input
        type="text"
        placeholder="搜尋手語單字..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', padding: 10, marginBottom: 24, boxSizing: 'border-box' }}
      />

      {/* TODO: 加入分類篩選 Tab */}

      {/* 詞卡 Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {filtered.map((word) => (
          <WordCard
            key={word.id}
            word={word}
            userStats={null} // TODO: 傳入從 Firebase 讀取的 userStats
            onPractice={handlePractice}
          />
        ))}
      </div>
    </div>
  );
};

export default Vocabulary;
