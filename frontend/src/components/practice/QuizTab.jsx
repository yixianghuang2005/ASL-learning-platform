// components/practice/QuizTab.jsx — Tab 2：闖關測驗
// 題目只顯示手勢圖片，不顯示字母文字

import React, { useState, useRef, useEffect, useCallback } from 'react';
import VideoCapture from '../VideoCapture';

const ASL_LETTERS = [
  { letter: 'A', hint: '握拳，拇指放在側面' },
  { letter: 'B', hint: '四指伸直並攏，拇指向內折' },
  { letter: 'C', hint: '手指彎曲成 C 型' },
  { letter: 'D', hint: '食指朝上，其他手指與拇指圍成圓' },
  { letter: 'E', hint: '四指彎曲，拇指向內收' },
  { letter: 'F', hint: '食指與拇指形成圓，其他三指伸直' },
  { letter: 'G', hint: '食指與拇指水平指向側面' },
  { letter: 'H', hint: '食指與中指並攏水平伸出' },
  { letter: 'I', hint: '小指朝上，其他手指握拳' },
  { letter: 'J', hint: '小指朝上，畫出 J 字形軌跡' },
  { letter: 'K', hint: '食指朝上，中指斜向外，拇指夾住中指' },
  { letter: 'L', hint: '食指朝上，拇指水平伸出，像 L 型' },
  { letter: 'M', hint: '三指覆蓋拇指（拇指在食指側）' },
  { letter: 'N', hint: '兩指覆蓋拇指' },
  { letter: 'O', hint: '所有手指與拇指圍成 O 型' },
  { letter: 'P', hint: '食指向下，中指向前，拇指向上' },
  { letter: 'Q', hint: '食指向下，拇指向下' },
  { letter: 'R', hint: '食指與中指交叉' },
  { letter: 'S', hint: '握拳，拇指覆蓋在手指上' },
  { letter: 'T', hint: '拇指穿在食指與中指之間' },
  { letter: 'U', hint: '食指與中指並攏朝上' },
  { letter: 'V', hint: '食指與中指張開成 V 型' },
  { letter: 'W', hint: '食指、中指、無名指張開成 W 型' },
  { letter: 'X', hint: '食指彎曲成鉤狀' },
  { letter: 'Y', hint: '拇指與小指伸出，其他三指握拳' },
  { letter: 'Z', hint: '食指朝前，在空中畫出 Z 字軌跡' },
];

const WINDOW_SIZE    = 15;
const PASS_THRESHOLD = 10;
const MIN_CONFIDENCE = 0.55;
const QUIZ_TOTAL     = 10;

function drawQuestions(n) {
  return [...ASL_LETTERS].sort(() => Math.random() - 0.5).slice(0, n);
}

export default function QuizTab() {
  const [phase, setPhase]         = useState('ready');
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex]       = useState(0);
  const [score, setScore]         = useState(0);
  const [results, setResults]     = useState([]);

  const startQuiz = () => {
    setQuestions(drawQuestions(QUIZ_TOTAL));
    setQIndex(0);
    setScore(0);
    setResults([]);
    setPhase('playing');
  };

  const handlePass = useCallback((answeredLetter) => {
    const isCorrect = answeredLetter === questions[qIndex]?.letter;
    const newResults = [...results, {
      question: questions[qIndex]?.letter,
      answered: answeredLetter,
      correct: isCorrect,
    }];
    setResults(newResults);
    if (isCorrect) setScore(sc => sc + 1);
    if (qIndex + 1 >= QUIZ_TOTAL) {
      setPhase('result');
    } else {
      setQIndex(i => i + 1);
    }
  }, [qIndex, questions, results]);

  if (phase === 'ready')   return <QuizReady onStart={startQuiz} />;
  if (phase === 'playing') return <QuizPlaying question={questions[qIndex]} qIndex={qIndex} total={QUIZ_TOTAL} onPass={handlePass} />;
  if (phase === 'result')  return <QuizResult score={score} total={QUIZ_TOTAL} results={results} onRestart={startQuiz} />;
}

// ── 開始畫面 ──────────────────────────────────────────────────────
function QuizReady({ onStart }) {
  return (
    <div style={s.quizReady}>
      <div style={{ fontSize: 64 }}>🎯</div>
      <h2 style={s.title}>闖關測驗</h2>
      <p style={s.desc}>
        系統隨機出 <strong>{QUIZ_TOTAL} 題</strong>，每題顯示手勢圖片。<br />
        對準鏡頭比出正確手勢並<strong>穩定維持約 1 秒</strong>，自動過關！
      </p>
      <div style={s.rules}>
        <div style={s.rule}>📷 需要開啟攝影機</div>
        <div style={s.rule}>🎯 共 {QUIZ_TOTAL} 題，隨機不重複</div>
        <div style={s.rule}>⏱ 穩定維持手勢約 1 秒自動過關</div>
        <div style={s.rule}>🛡 抗背景干擾，偶爾誤判不影響結果</div>
      </div>
      <button style={s.startBtn} onClick={onStart}>開始闖關 →</button>
    </div>
  );
}

// ── 作答畫面 ──────────────────────────────────────────────────────
function QuizPlaying({ question, qIndex, total, onPass }) {
  const [correctCount, setCorrectCount] = useState(0);
  const [detection, setDetection]       = useState(null);
  const [flashState, setFlashState]     = useState(null);
  const [imgError, setImgError]         = useState(false);

  const windowRef = useRef([]);
  const passedRef = useRef(false);

  useEffect(() => {
    setCorrectCount(0);
    setDetection(null);
    setFlashState(null);
    setImgError(false);
    windowRef.current = [];
    passedRef.current = false;
  }, [question?.letter]);

  const handleResult = useCallback((result) => {
    if (!result || passedRef.current) return;
    if (result.confidence < MIN_CONFIDENCE) return;

    setDetection(result);
    windowRef.current.push(result.label);
    if (windowRef.current.length > WINDOW_SIZE) windowRef.current.shift();

    const count = windowRef.current.filter(l => l === question.letter).length;
    setCorrectCount(count);

    if (count >= PASS_THRESHOLD) {
      passedRef.current = true;
      setFlashState('correct');
      setTimeout(() => onPass(question.letter), 700);
    }
  }, [question, onPass]);

  const isDetecting  = !!detection;
  const isCorrectNow = detection?.label === question?.letter;
  const progressPct  = Math.min((correctCount / PASS_THRESHOLD) * 100, 100);

  return (
    <div style={{ ...s.quizPlaying, ...(flashState === 'correct' ? s.flashCorrect : {}) }}>

      {/* 整體進度條 */}
      <div style={s.quizHeader}>
        <span style={s.quizProgress}>第 {qIndex + 1} 題 / 共 {total} 題</span>
        <div style={s.quizProgressBar}>
          <div style={{ ...s.quizProgressFill, width: `${(qIndex / total) * 100}%` }} />
        </div>
      </div>

      <div style={s.quizBody}>

        {/* 左：圖片佔滿，無字母文字 */}
        <div style={s.quizLeft}>
          <div style={s.quizTarget}>
            <div style={s.quizTargetLabel}>比出這個手勢</div>

            {!imgError ? (
              <img
                src={`/asl/${question?.letter}.png`}
                alt={`ASL ${question?.letter}`}
                style={s.quizRefImg}
                onError={() => setImgError(true)}
              />
            ) : (
              // 圖片不存在時才 fallback 顯示字母
              <div style={s.quizImgFallback}>
                {question?.letter}
              </div>
            )}
          </div>

          {/* 穩定度進度條 */}
          <div style={s.quizStability}>
            <div style={s.quizStabilityRow}>
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: !isDetecting ? '#64748b' : isCorrectNow ? '#22c55e' : '#f59e0b',
              }}>
                {!isDetecting
                  ? '等待手勢...'
                  : isCorrectNow
                    ? `✅ 維持手勢！`
                    : `手勢不符，繼續調整`}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {correctCount} / {PASS_THRESHOLD}
              </span>
            </div>
            <div style={s.progressTrack}>
              <div style={{
                ...s.progressFill,
                width: `${progressPct}%`,
                background: progressPct >= 100 ? '#22c55e' : '#3b82f6',
              }} />
            </div>
            <p style={s.windowHint}>
              最近 {windowRef.current.length} 幀中，正確出現 {correctCount} 次（需 {PASS_THRESHOLD} 次）
            </p>
          </div>
        </div>

        {/* 右：鏡頭 */}
        <div style={s.quizRight}>
          <VideoCapture onResult={handleResult} />
        </div>
      </div>
    </div>
  );
}

// ── 結果畫面 ──────────────────────────────────────────────────────
function QuizResult({ score, total, results, onRestart }) {
  const pct     = Math.round((score / total) * 100);
  const medal   = pct === 100 ? '🏆' : pct >= 80 ? '🥇' : pct >= 60 ? '🥈' : '🥉';
  const message = pct === 100 ? '完美！全部答對！' : pct >= 80 ? '太棒了！繼續加油！' : pct >= 60 ? '不錯喔！再練習看看！' : '繼續練習，你可以的！';

  return (
    <div style={s.quizResult}>
      <div style={{ fontSize: 72 }}>{medal}</div>
      <h2 style={s.title}>{message}</h2>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={s.resultScoreNum}>{score}</span>
        <span style={{ fontSize: 24, color: '#64748b' }}> / {total}</span>
      </div>
      <div style={{ fontSize: 16, color: '#94a3b8' }}>{pct}% 正確率</div>

      <div style={s.resultList}>
        {results.map((r, i) => (
          <div key={i} style={{ ...s.resultItem, ...(r.correct ? s.resultItemOk : s.resultItemFail) }}>
            <span>{r.correct ? '✅' : '❌'}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>第 {i + 1} 題：{r.question}</span>
            {!r.correct && <span style={{ color: '#fca5a5', fontSize: 13 }}>你比的：{r.answered}</span>}
          </div>
        ))}
      </div>

      <button style={s.startBtn} onClick={onRestart}>再挑戰一次 ↺</button>
    </div>
  );
}

// ── 樣式 ──────────────────────────────────────────────────────────
const s = {
  quizReady: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '60px 20px', textAlign: 'center' },
  title: { fontSize: 28, fontWeight: 700, color: '#f1f5f9', margin: 0 },
  desc: { fontSize: 15, color: '#94a3b8', maxWidth: 420, lineHeight: 1.7, margin: 0 },
  rules: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 },
  rule: { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', fontSize: 14, color: '#cbd5e1', textAlign: 'left' },
  startBtn: { padding: '14px 40px', background: '#3b82f6', border: 'none', borderRadius: 12, color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 8 },

  quizPlaying: { display: 'flex', flexDirection: 'column', gap: 20, borderRadius: 16, padding: 4, transition: 'background 0.3s' },
  flashCorrect: { background: 'rgba(34,197,94,0.08)' },
  quizHeader: { display: 'flex', alignItems: 'center', gap: 16 },
  quizProgress: { fontSize: 14, color: '#94a3b8', whiteSpace: 'nowrap' },
  quizProgressBar: { flex: 1, height: 6, background: '#1e293b', borderRadius: 99, overflow: 'hidden' },
  quizProgressFill: { height: '100%', background: '#3b82f6', borderRadius: 99, transition: 'width 0.4s ease' },
  quizBody: { display: 'flex', gap: 24, flexWrap: 'wrap' },
  quizLeft: { flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 16 },

  // 題目卡：圖片佔滿
  quizTarget: {
    background: '#1e293b',
    border: '2px solid #334155',
    borderRadius: 16,
    overflow: 'hidden',         // 讓圖片貼邊
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
  },
  quizTargetLabel: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    padding: '12px 0 8px',
  },
  quizRefImg: {
    width: '100%',              // 佔滿卡片寬度
    aspectRatio: '1 / 1',      // 正方形
    objectFit: 'cover',
    display: 'block',
  },
  // 圖片讀取失敗時才顯示字母 fallback
  quizImgFallback: {
    width: '100%',
    aspectRatio: '1 / 1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 100,
    fontWeight: 900,
    color: '#3b82f6',
    background: '#0f172a',
  },

  quizStability: { background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '14px 16px' },
  quizStabilityRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  progressTrack: { height: 10, background: '#334155', borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99, transition: 'width 0.1s ease, background 0.3s' },
  windowHint: { fontSize: 11, color: '#475569', margin: '8px 0 0', textAlign: 'center' },
  quizRight: { flex: '1 1 400px' },

  quizResult: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 20px', textAlign: 'center' },
  resultScoreNum: { fontSize: 64, fontWeight: 900, color: '#3b82f6', lineHeight: 1 },
  resultList: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 400 },
  resultItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, fontSize: 14 },
  resultItemOk:   { background: '#14532d', border: '1px solid #22c55e' },
  resultItemFail: { background: '#450a0a', border: '1px solid #ef4444' },
};
