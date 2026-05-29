// firebaseClient.js — Firebase Auth + Firestore + localStorage 雙軌儲存
// Firebase 未設定時自動退回 localStorage（訪客模式）

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import {
  getFirestore,
  collection, addDoc, query, where, orderBy, limit, getDocs,
} from 'firebase/firestore';

// ── Firebase 設定 ──────────────────────────────────────────────────────────
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

export let auth = null;
let db   = null;

if (FIREBASE_READY) {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db   = getFirestore(app);
    console.log('[Firebase] Auth + Firestore connected');
  } catch (e) {
    console.warn('[Firebase] Init failed, using localStorage fallback:', e.message);
  }
}

// ── Auth 功能 ──────────────────────────────────────────────────────────────

/**
 * 註冊新帳號
 * @param {string} email
 * @param {string} password
 * @param {string} [displayName] 顯示名稱（可選）
 */
export async function signUp(email, password, displayName = '') {
  if (!auth) throw new Error('Firebase 未設定，請填寫 .env');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim() });
  }
  return cred.user;
}

/**
 * 登入
 */
export async function signIn(email, password) {
  if (!auth) throw new Error('Firebase 未設定，請填寫 .env');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/**
 * 登出
 */
export async function signOut() {
  if (auth) await firebaseSignOut(auth);
}

/**
 * 監聽 Auth 狀態變化
 * @param {function} callback - (user | null) => void
 * @returns unsubscribe function
 */
export function onAuthChanged(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

// ── LocalStorage 操作 ─────────────────────────────────────────────────────
const LS_KEY = 'asl_quiz_results';

function getGuestId() {
  let id = localStorage.getItem('asl_guest_id');
  if (!id) {
    id = 'guest_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('asl_guest_id', id);
  }
  return id;
}

function lsGetAll() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}

function lsSave(record) {
  const all = lsGetAll();
  all.unshift(record);
  localStorage.setItem(LS_KEY, JSON.stringify(all.slice(0, 200)));
}

// ── 闖關紀錄 API ──────────────────────────────────────────────────────────

/**
 * 儲存一次闖關結果
 */
export async function saveQuizResult({ type, score, total, details = [] }) {
  const uid = auth?.currentUser?.uid ?? getGuestId();
  const pct = Math.round((score / total) * 100);
  const record = { uid, type, score, total, pct, details, timestamp: new Date().toISOString() };

  lsSave(record);

  if (db && auth?.currentUser) {
    try {
      await addDoc(collection(db, 'quizResults'), record);
    } catch (e) {
      console.warn('[Firebase] Write failed:', e.message);
    }
  }
  return record;
}

/**
 * 取得本機最佳成績
 */
export function getBestScore(type) {
  const all = lsGetAll().filter(r => r.type === type);
  if (!all.length) return null;
  return all.reduce((best, r) => (!best || r.pct > best.pct ? r : best), null);
}

/**
 * 取得最近 N 筆
 */
export function getRecentResults(type, n = 5) {
  return lsGetAll().filter(r => r.type === type).slice(0, n);
}

/**
 * 取得所有紀錄（已登入時優先讀 Firestore）
 */
export async function getAllMyResults(type) {
  if (db && auth?.currentUser) {
    try {
      const q = query(
        collection(db, 'quizResults'),
        where('uid', '==', auth.currentUser.uid),
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

// 舊版相容 stub
export const saveProgress       = async () => {};
export const getUserStats       = async () => null;
export const getAllUserProgress  = async () => [];
export const signInWithGoogle   = async () => { throw new Error('Google 登入未啟用'); };
