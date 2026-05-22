// Practice.jsx — 學習中心（字母區 / 詞彙區）

import React, { useState } from 'react';
import LearnTab           from '../components/practice/LearnTab';
import QuizTab            from '../components/practice/QuizTab';
import CommunicatorTab    from '../components/practice/CommunicatorTab';
import WordLearnTab       from '../components/practice/WordLearnTab';
import WordQuizTab        from '../components/practice/WordQuizTab';
import WordRecognitionTab from '../components/practice/WordRecognitionTab';

const SECTIONS = [
  { id: 'letters', label: '✋ 字母' },
  { id: 'words',   label: '🔤 詞彙' },
];

const LETTER_TABS = [
  { id: 'learn',        label: '📖 學習 A~Z' },
  { id: 'quiz',         label: '🎯 闖關測驗' },
  { id: 'communicator', label: '💬 拼字溝通器' },
];

const WORD_TABS = [
  { id: 'word-learn', label: '📚 詞彙學習' },
  { id: 'word-quiz',  label: '🎯 詞彙闖關' },
  { id: 'word-recog', label: '🧠 自由辨識' },
];

export default function Practice() {
  const [section, setSection]           = useState('letters');
  const [letterTab, setLetterTab]       = useState('learn');
  const [wordTab, setWordTab]           = useState('word-learn');
  const [selectedLetter, setSelectedLetter] = useState(null);

  const handleSectionChange = (id) => {
    setSection(id);
    setSelectedLetter(null);
  };

  const tabs    = section === 'letters' ? LETTER_TABS : WORD_TABS;
  const activeTab = section === 'letters' ? letterTab : wordTab;
  const setTab  = section === 'letters' ? setLetterTab : setWordTab;

  const handleTabChange = (id) => {
    setTab(id);
    setSelectedLetter(null);
  };

  return (
    <div style={styles.page}>
      {/* ── 區塊切換（字母 / 詞彙）─────────────────────────── */}
      <div style={styles.sectionBar}>
        {SECTIONS.map(sec => (
          <button
            key={sec.id}
            style={{ ...styles.sectionBtn, ...(section === sec.id ? styles.sectionActive : {}) }}
            onClick={() => handleSectionChange(sec.id)}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* ── 子 Tab 列 ────────────────────────────────────────── */}
      <div style={styles.tabBar}>
        {tabs.map(tab => (
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
        {/* 字母區 */}
        {section === 'letters' && letterTab === 'learn'        && <LearnTab selectedLetter={selectedLetter} setSelectedLetter={setSelectedLetter} />}
        {section === 'letters' && letterTab === 'quiz'         && <QuizTab />}
        {section === 'letters' && letterTab === 'communicator' && <CommunicatorTab />}

        {/* 詞彙區 */}
        {section === 'words' && wordTab === 'word-learn' && <WordLearnTab />}
        {section === 'words' && wordTab === 'word-quiz'  && <WordQuizTab />}
        {section === 'words' && wordTab === 'word-recog' && <WordRecognitionTab />}
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
