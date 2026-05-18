// Practice.jsx — ASL 學習中心（Tab 切換入口）
// 實際內容拆到 components/practice/ 資料夾

import React, { useState } from 'react';
import LearnTab        from '../components/practice/LearnTab';
import QuizTab         from '../components/practice/QuizTab';
import CommunicatorTab from '../components/practice/CommunicatorTab';

const TABS = [
  { id: 'learn',        label: '📖 學習 A~Z' },
  { id: 'quiz',         label: '🎯 闖關測驗' },
  { id: 'communicator', label: '💬 拼字溝通器' },
];

export default function Practice() {
  const [activeTab, setActiveTab]           = useState('learn');
  const [selectedLetter, setSelectedLetter] = useState(null);

  const handleTabChange = (id) => {
    setActiveTab(id);
    setSelectedLetter(null);
  };

  return (
    <div style={styles.page}>
      {/* Tab 列 */}
      <div style={styles.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            style={{ ...styles.tabBtn, ...(activeTab === tab.id ? styles.tabActive : {}) }}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 內容區 */}
      <div style={styles.content}>
        {activeTab === 'learn'        && <LearnTab selectedLetter={selectedLetter} setSelectedLetter={setSelectedLetter} />}
        {activeTab === 'quiz'         && <QuizTab />}
        {activeTab === 'communicator' && <CommunicatorTab />}
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
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #1e293b',
    background: '#0f172a',
    padding: '0 24px',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  tabBtn: {
    padding: '16px 24px',
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    color: '#64748b',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'color 0.2s, border-color 0.2s',
    whiteSpace: 'nowrap',
  },
  tabActive: { color: '#3b82f6', borderBottomColor: '#3b82f6' },
  content: { padding: '24px', maxWidth: 1100, margin: '0 auto' },
};
