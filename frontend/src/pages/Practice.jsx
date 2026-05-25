// Practice.jsx — 字母練習（學習 / 闖關 / 溝通器）

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
  const [activeTab,      setActiveTab]      = useState('learn');
  const [selectedLetter, setSelectedLetter] = useState(null);

  const handleTabChange = (id) => {
    setActiveTab(id);
    setSelectedLetter(null);
  };

  return (
    <div style={styles.page}>
      {/* ── Tab 列 ────────────────────────────────────────── */}
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

      {/* ── 內容區 ───────────────────────────────────────────── */}
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

  // 子 Tab 列（較小）
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
    padding: '14px 22px',
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    color: '#64748b',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'color 0.2s, border-color 0.2s',
    whiteSpace: 'nowrap',
  },
  tabActive: { color: '#3b82f6', borderBottomColor: '#3b82f6' },

  content: { padding: '24px', maxWidth: 1100, margin: '0 auto' },
};
