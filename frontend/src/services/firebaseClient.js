// firebaseClient.js — Firebase + localStorage 雙軌儲存
// Firebase 未設定時自動退回 localStorage（訪客模式）

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

// ── Firebase 設定（從 .env 讀取） ──────────────────────────────────────────
const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

const FIREBASE_READY = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey !== 'your_api_key_here'
);

let db = null;

if (FIREBASE_READY) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log('[Firebase] Firestore connected');
  } catch (e) {
    console.warn('[Firebase] Init failed, using localStorage fallback:', e.message);
  }
}

// ── 訪客 ID（localStorage 持久化） ────────────────────────────────────────
function getGuestId() {
  let id = localStorage.getItem('asl_guest_id');
  if (!id) {
    id = 'guest_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('asl_guest_id', id);
  }
  return id;
}

// ── LocalStorage 操作 ─────────────────────────────────────────────────────
const LS_KEY = 'asl_quiz_results';

function lsGetAll() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}

function lsSave(record) {
  const all = lsGetAll();
  all.unshift(record);
  // 只保留最近 200 筆
  localStorage.setItem(LS_KEY, JSON.stringify(all.slice(0, 200)));
}

// ── 公開 API ──────────────────────────────────────────────────────────────

/**
 * 儲存一次闖關結果
 * @param {'letter'|'word'} type - 字母或詞彙闖關
 * @param {number} score - 答對題數
 * @param {number} total - 總題數
 * @param {Array}  details - 每題結果
 */
export async function saveQuizResult({ type, score, total, details = [] }) {
  const pct = Math.round((score / total) * 100);
  const record = {
    guestId:   getGuestId(),
    type,
    score,
    total,
    pct,
    details,
    timestamp: new Date().toISOString(),
  };

  // 1. 一定存 localStorage
  lsSave(record);

  // 2. 有 Firebase 也存 Firestore
  if (db) {
    try {
      await addDoc(collection(db, 'quizResults'), record);
    } catch (e) {
      console.warn('[Firebase] Write failed:', e.message);
    }
  }

  return record;
}

/**
 * 取得本機的最佳成績
 * @param {'letter'|'word'} type
 * @returns {{ score, total, pct, timestamp } | null}
 */
export function getBestScore(type) {
  const all = lsGetAll().filter(r => r.type === type);
  if (!all.length) return null;
  return all.reduce((best, r) => (!best || r.pct > best.pct ? r : best), null);
}

/**
 * 取得最近 N 筆紀錄
 * @param {'letter'|'word'} type
 * @param {number} n
 */
export function getRecentResults(type, n = 5) {
  return lsGetAll().filter(r => r.type === type).slice(0, n);
}

/**
 * 取得所有紀錄（Firestore 或 localStorage）
 * 目前未整合帳號，只回傳本機訪客資料
 */
export async function getAllMyResults(type) {
  if (db) {
    try {
      const guestId = getGuestId();
      const q = query(
        collection(db, 'quizResults'),
        where('guestId', '==', guestId),
        where('type', '==', type),
        orderBy('timestamp', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data());
    } catch (e) {
      console.warn('[Firebase] Read failed, using localStorage:', e.message);
    }
  }
  return getRecentResults(type, 50);
}

// ── 舊版相容 stub（Profile.jsx 用到） ──────────────────────────────────────
export const auth               = null;
export const signInWithGoogle   = async () => {};
export const signOut            = async () => {};
export const onAuthChanged      = (cb) => { cb(null); return () => {}; };
export const saveProgress       = async () => {};
export const getUserStats       = async () => null;
export const getAllUserProgress  = async () => [];
