// Practice.jsx — 字母練習（學習 / 闖關 / 溝通器）

import React, { useState } from 'react';
import LearnTab        from '../components/practice/LearnTab';
import QuizTab         from '../components/practice/QuizTab';
import CommunicatorTab from '../components/practice/CommunicatorTab';
import QuizHistoryTab  from '../components/practice/QuizHistoryTab';

const TABS = [
  { id: 'learn',        label: '📖 學習 A~Z' },
  { id: 'quiz',         label: '🎯 闖關測驗' },
  { id: 'communicator', label: '💬 拼字溝通器' },
  { id: 'history',      label: '📋 歷史紀錄' },
];

export default function Practice() {
  const [activeTab,      setActiveTab]      = useState('learn');
  const [selectedLetter, setSelectedLetter] = useState(null);

  const handleTabChange = (id) => {
    setActiveTab(id);
    setSelectedLetter(null);
  };

  return (
    <div style={styles.page}>
      {/* ── Tab 列 ────────────────────────────────────────── */}
      <div className="tab-bar" style={styles.tabBarBase}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={'tab-btn' + (activeTab === tab.id ? ' active' : '')}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 內容區 ───────────────────────────────────────────── */}
      <div style={styles.content}>
        {activeTab === 'learn'        && <LearnTab selectedLetter={selectedLetter} setSelectedLetter={setSelectedLetter} />}
        {activeTab === 'quiz'         && <QuizTab />}
        {activeTab === 'communicator' && <CommunicatorTab />}
        {activeTab === 'history'      && <QuizHistoryTab type="letter" />}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#f1f5f9',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    paddingBottom: 40,
  },

  // 區塊切換列（較大）
  sectionBar: {
    display: 'flex',
    background: '#0f172a',
    padding: '12px 24px 0',
    gap: 8,
    borderBottom: '1px solid #1e293b',
  },
  sectionBtn: {
    padding: '10px 28px',
    background: '#1e293b',
    border: '2px solid transparent',
    borderRadius: '10px 10px 0 0',
    color: '#64748b',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: -1,
  },
  sectionActive: {
    background: '#0f172a',
    borderColor: '#3b82f6',
    borderBottomColor: '#0f172a',
    color: '#3b82f6',
  },

  // 子 Tab 列（CSS class 控制響應式，這裡只放頁面專屬定位）
  tabBarBase: {
    borderBottom: '1px solid #1e293b',
    background: '#0f172a',
    position: 'sticky',
    top: 53,   // navbar 高度約 53px
    zIndex: 10,
  },

  content: { padding: '24px', maxWidth: 1100, margin: '0 auto', boxSizing: 'border-box' },
};
