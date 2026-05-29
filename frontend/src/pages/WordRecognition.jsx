// WordRecognition.jsx — 詞彙練習（學習 / 闖關 / 自由辨識）

import React, { useState } from 'react';
import WordLearnTab       from '../components/practice/WordLearnTab';
import WordQuizTab        from '../components/practice/WordQuizTab';
import WordRecognitionTab from '../components/practice/WordRecognitionTab';
import QuizHistoryTab     from '../components/practice/QuizHistoryTab';

const TABS = [
  { id: 'learn',   label: '📚 詞彙學習' },
  { id: 'quiz',    label: '🎯 詞彙闖關' },
  { id: 'recog',   label: '🧠 自由辨識' },
  { id: 'history', label: '📋 歷史紀錄' },
];

export default function WordRecognition() {
  const [activeTab, setActiveTab] = useState('learn');

  return (
    <div style={styles.page}>
      {/* ── Tab 列 ─────────────────────────────────────────── */}
      <div style={styles.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            style={{ ...styles.tabBtn, ...(activeTab === tab.id ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 內容區 ──────────────────────────────────────────── */}
      <div style={styles.content}>
        {activeTab === 'learn'   && <WordLearnTab />}
        {activeTab === 'quiz'    && <WordQuizTab />}
        {activeTab === 'recog'   && <WordRecognitionTab />}
        {activeTab === 'history' && <QuizHistoryTab type="word" />}
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
  content:   { padding: '24px', maxWidth: 1100, margin: '0 auto' },
};
