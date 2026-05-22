import React from 'react';
import { Link } from 'react-router-dom';

const features = [
  {
    title: 'ASL 字母練習',
    text: 'A-Z 字母學習、即時辨識與練習回饋。',
    to: '/practice',
    action: '開始練習',
  },
  {
    title: 'ASL 詞彙辨識',
    text: '使用 MediaPipe 手部序列，銜接 WLASL 10 詞動態模型。',
    to: '/asl-words',
    action: '開啟辨識',
  },
  {
    title: '字彙資料',
    text: '整理字母與詞彙學習內容。',
    to: '/vocabulary',
    action: '查看字彙',
  },
];

const Home = () => (
  <main style={styles.page}>
    <section style={styles.hero}>
      <p style={styles.kicker}>ASL Learning Platform</p>
      <h1 style={styles.title}>ASL 學習與即時辨識平台</h1>
      <p style={styles.subtitle}>
        以 MediaPipe 手部關鍵點為核心，完成字母辨識、闖關練習、拼字溝通器，並延伸至 ASL 詞彙動態辨識。
      </p>
    </section>

    <section style={styles.grid}>
      {features.map((feature) => (
        <article key={feature.title} style={styles.card}>
          <h2 style={styles.cardTitle}>{feature.title}</h2>
          <p style={styles.cardText}>{feature.text}</p>
          <Link to={feature.to} style={styles.link}>
            {feature.action}
          </Link>
        </article>
      ))}
    </section>
  </main>
);

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#f8fafc',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    padding: '48px 24px',
  },
  hero: {
    maxWidth: 980,
    margin: '0 auto 36px',
  },
  kicker: {
    margin: '0 0 10px',
    color: '#38bdf8',
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontSize: 13,
  },
  title: {
    margin: 0,
    fontSize: 42,
    lineHeight: 1.12,
  },
  subtitle: {
    margin: '16px 0 0',
    color: '#94a3b8',
    lineHeight: 1.8,
    fontSize: 17,
    maxWidth: 760,
  },
  grid: {
    maxWidth: 980,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 8,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    minHeight: 190,
  },
  cardTitle: {
    margin: 0,
    fontSize: 20,
  },
  cardText: {
    margin: 0,
    color: '#94a3b8',
    lineHeight: 1.65,
    flex: 1,
  },
  link: {
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
    borderRadius: 6,
    background: '#2563eb',
    color: '#fff',
    textDecoration: 'none',
    fontWeight: 800,
  },
};

export default Home;
