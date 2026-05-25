// WordQuizTab.jsx — 詞彙闖關：250 詞抽題 + 分數記錄

import React, { useState, useCallback, useEffect, useRef } from 'react';
import WordVideoCapture from '../WordVideoCapture';
import { WORD_DATA } from '../../utils/aslWordData';
import { saveQuizResult, getBestScore } from '../../services/firebaseClient';

const QUIZ_TOTAL = 8;

function drawQuestions(n) {
  return [...WORD_DATA].sort(() => Math.random() - 0.5).slice(0, n);
}

export default function WordQuizTab() {
  const [phase,     setPhase]     = useState('ready');
  const [questions, setQuestions] = useState([]);
  const [qIndex,    setQIndex]    = useState(0);
  const [score,     setScore]     = useState(0);
  const [results,   setResults]   = useState([]);
  const [best,      setBest]      = useState(() => getBestScore('word'));

  const startQuiz = () => {
    setQuestions(drawQuestions(QUIZ_TOTAL));
    setQIndex(0); setScore(0); setResults([]);
    setPhase('playing');
  };

  const handlePass = useCallback((answeredWord, skipped = false) => {
    const target    = questions[qIndex];
    const isCorrect = !skipped && answeredWord === target?.word;
    const newResults = [...results, { question: target, answered: answeredWord, correct: isCorrect, skipped }];
    const newScore   = isCorrect ? score + 1 : score;
    setResults(newResults);
    if (isCorrect) setScore(newScore);
    if (qIndex + 1 >= QUIZ_TOTAL) {
      // 存分數
      saveQuizResult({
        type: 'word',
        score: newScore,
        total: QUIZ_TOTAL,
        details: newResults.map(r => ({
          word: r.question?.word,
          display: r.question?.display,
          correct: r.correct,
          skipped: r.skipped,
        })),
      }).then(() => setBest(getBestScore('word')));
      setPhase('result');
    } else {
      setQIndex(i => i + 1);
    }
  }, [qIndex, questions, results, score]);

  if (phase === 'ready')   return <QuizReady onStart={startQuiz} best={best} />;
  if (phase === 'playing') return <QuizPlaying question={questions[qIndex]} qIndex={qIndex} total={QUIZ_TOTAL} onPass={handlePass} />;
  if (phase === 'result')  return <QuizResult score={score} total={QUIZ_TOTAL} results={results} onRestart={startQuiz} best={best} />;
}

// ── 開始畫面 ─────────────────────────────────────────────────────────────
function QuizReady({ onStart, best }) {
  return (
    <div style={s.center}>
      <div style={{ fontSize: 64 }}>🎯</div>
      <h2 style={s.title}>詞彙闖關</h2>
      <p style={s.desc}>
        從 <strong>250 個詞彙</strong>中隨機出 <strong>{QUIZ_TOTAL} 題</strong>。<br />
        對準鏡頭比出正確手勢，連續辨識一致後<strong>自動過關</strong>！
      </p>

      {/* 最佳紀錄 */}
      {best && (
        <div style={s.bestCard}>
          <span style={s.bestLabel}>🏆 個人最佳</span>
          <span style={s.bestScore}>{best.score} / {best.total}</span>
          <span style={s.bestPct}>{best.pct}%</span>
        </div>
      )}

      <div style={s.rules}>
        <div style={s.rule}>📷 需要開啟攝影機</div>
        <div style={s.rule}>🎲 從 250 詞隨機出 {QUIZ_TOTAL} 題</div>
        <div style={s.rule}>✅ 連續辨識正確自動過關</div>
        <div style={s.rule}>⏭ 不會可以跳過，不扣分</div>
      </div>
      <button style={s.startBtn} onClick={onStart}>開始闖關 →</button>
    </div>
  );
}

// ── 作答畫面 ─────────────────────────────────────────────────────────────
function QuizPlaying({ question, qIndex, total, onPass }) {
  const [liveResult, setLive]   = useState(null);
  const [flash,      setFlash]  = useState(null);
  const [showHint,   setHint]   = useState(false);
  const [isRecording, setRec]   = useState(true);
  const passedRef                = useRef(false);

  useEffect(() => {
    setLive(null); setFlash(null); setHint(false);
    setRec(true); passedRef.current = false;
  }, [question?.word]);

  const handleFrame = useCallback(r => {
    if (!passedRef.current) setLive(r);
  }, []);

  const handleConfirmed = useCallback(r => {
    if (passedRef.current) return;
    if (r.label === question?.word) {
      passedRef.current = true;
      setFlash('correct');
      setRec(false);
      setTimeout(() => onPass(r.label), 800);
    }
  }, [question, onPass]);

  const handleSkip = () => {
    passedRef.current = true;
    setRec(false);
    onPass(null, true);
  };

  const isCorrectNow = liveResult?.label === question?.word;

  return (
    <div style={{ ...s.playing, ...(flash === 'correct' ? s.flashCorrect : {}) }}>
      {/* 進度 */}
      <div style={s.header}>
        <span style={s.progress}>第 {qIndex + 1} 題 / 共 {total} 題</span>
        <div style={s.progressBar}>
          <div style={{ ...s.progressFill, width: `${(qIndex / total) * 100}%` }} />
        </div>
        <button style={s.skipBtn} onClick={handleSkip}>跳過 ⏭</button>
      </div>

      <div style={s.body}>
        {/* 左：題目 */}
        <div style={s.left}>
          <div style={s.questionCard}>
            <div style={s.questionLabel}>比出這個詞彙的手勢</div>
            <div style={s.questionWord}>{question?.display}</div>
            <div style={s.questionZh}>{question?.zh}</div>
          </div>

          <button style={s.hintBtn} onClick={() => setHint(h => !h)}>
            {showHint ? '隱藏提示' : '💡 顯示提示'}
          </button>
          {showHint && <div style={s.hintBox}>{question?.hint}</div>}

          <div style={s.liveStatus}>
            {!liveResult
              ? <span style={{ color: '#64748b' }}>等待手勢…</span>
              : isCorrectNow
                ? <span style={{ color: '#22c55e', fontWeight: 700 }}>✅ 正確！維持手勢…</span>
                : <span style={{ color: '#f59e0b' }}>偵測到：{liveResult.label}（{(liveResult.confidence * 100).toFixed(0)}%）</span>
            }
          </div>
        </div>

        {/* 右：鏡頭 */}
        <div style={s.right}>
          <WordVideoCapture
            isRecording={isRecording}
            onFrame={handleFrame}
            onConfirmed={handleConfirmed}
            confirmCount={3}
            confirmThresh={0.75}
          />
        </div>
      </div>
    </div>
  );
}

// ── 結果畫面 ─────────────────────────────────────────────────────────────
function QuizResult({ score, total, results, onRestart, best }) {
  const pct     = Math.round((score / total) * 100);
  const medal   = pct === 100 ? '🏆' : pct >= 75 ? '🥇' : pct >= 50 ? '🥈' : '🥉';
  const message = pct === 100 ? '完美！全部答對！' : pct >= 75 ? '太棒了！' : pct >= 50 ? '不錯喔，繼續練習！' : '繼續加油！';
  const isNewBest = best && best.score === score && best.pct === pct;

  return (
    <div style={s.center}>
      <div style={{ fontSize: 72 }}>{medal}</div>
      <h2 style={s.title}>{message}</h2>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={s.scoreNum}>{score}</span>
        <span style={{ fontSize: 24, color: '#64748b' }}> / {total}</span>
      </div>
      <div style={{ fontSize: 16, color: '#94a3b8' }}>{pct}% 正確率</div>

      {/* 最佳紀錄標記 */}
      {isNewBest && (
        <div style={s.newBestBadge}>🎉 新個人最佳！</div>
      )}
      {best && !isNewBest && (
        <div style={s.bestCard}>
          <span style={s.bestLabel}>🏆 個人最佳</span>
          <span style={s.bestScore}>{best.score} / {best.total}</span>
          <span style={s.bestPct}>{best.pct}%</span>
        </div>
      )}

      <div style={s.resultList}>
        {results.map((r, i) => (
          <div key={i} style={{ ...s.resultItem, ...(r.correct ? s.itemOk : r.skipped ? s.itemSkip : s.itemFail) }}>
            <span>{r.correct ? '✅' : r.skipped ? '⏭' : '❌'}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>
              {r.question?.display}（{r.question?.zh}）
            </span>
            {!r.correct && !r.skipped && r.answered &&
              <span style={{ fontSize: 12, opacity: 0.7 }}>辨識到：{r.answered}</span>}
            {r.skipped && <span style={{ fontSize: 12, opacity: 0.7 }}>已跳過</span>}
          </div>
        ))}
      </div>

      <button style={s.startBtn} onClick={onRestart}>再挑戰一次 ↺</button>
    </div>
  );
}

// ── 樣式 ──────────────────────────────────────────────────────────────────
const s = {
  center:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '40px 20px', textAlign: 'center' },
  title:     { fontSize: 28, fontWeight: 700, color: '#f1f5f9', margin: 0 },
  desc:      { fontSize: 15, color: '#94a3b8', maxWidth: 420, lineHeight: 1.7, margin: 0 },

  bestCard:  { display: 'flex', alignItems: 'center', gap: 12, background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '10px 20px' },
  bestLabel: { fontSize: 13, color: '#64748b' },
  bestScore: { fontSize: 20, fontWeight: 700, color: '#f1f5f9' },
  bestPct:   { fontSize: 14, color: '#3b82f6', fontWeight: 600 },

  newBestBadge: { background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)', color: '#fff', padding: '8px 20px', borderRadius: 20, fontSize: 14, fontWeight: 700 },

  rules:     { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 },
  rule:      { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', fontSize: 14, color: '#cbd5e1', textAlign: 'left' },
  startBtn:  { padding: '14px 40px', background: '#3b82f6', border: 'none', borderRadius: 12, color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 8 },

  playing:      { display: 'flex', flexDirection: 'column', gap: 20, borderRadius: 16, padding: 4, transition: 'background 0.3s' },
  flashCorrect: { background: 'rgba(34,197,94,0.08)' },
  header:       { display: 'flex', alignItems: 'center', gap: 12 },
  progress:     { fontSize: 14, color: '#94a3b8', whiteSpace: 'nowrap' },
  progressBar:  { flex: 1, height: 6, background: '#1e293b', borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', background: '#3b82f6', borderRadius: 99, transition: 'width 0.4s ease' },
  skipBtn:      { padding: '6px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },

  body:          { display: 'flex', gap: 24, flexWrap: 'wrap' },
  left:          { flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 12 },
  right:         { flex: '1 1 400px' },

  questionCard:  { background: '#1e293b', border: '2px solid #334155', borderRadius: 16, padding: '24px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 },
  questionLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' },
  questionWord:  { fontSize: 40, fontWeight: 900, color: '#3b82f6', lineHeight: 1 },
  questionZh:    { fontSize: 20, fontWeight: 600, color: '#f1f5f9' },

  hintBtn:   { background: 'none', border: '1px solid #334155', borderRadius: 8, color: '#64748b', fontSize: 13, padding: '8px 12px', cursor: 'pointer' },
  hintBox:   { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#cbd5e1', lineHeight: 1.6 },
  liveStatus:{ background: '#0f172a', borderRadius: 10, padding: '12px 14px', fontSize: 14, textAlign: 'center', minHeight: 44 },

  scoreNum:   { fontSize: 64, fontWeight: 900, color: '#3b82f6', lineHeight: 1 },
  resultList: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 440 },
  resultItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, fontSize: 14 },
  itemOk:     { background: '#14532d', border: '1px solid #22c55e' },
  itemFail:   { background: '#450a0a', border: '1px solid #ef4444' },
  itemSkip:   { background: '#1e293b', border: '1px solid #334155' },
};
