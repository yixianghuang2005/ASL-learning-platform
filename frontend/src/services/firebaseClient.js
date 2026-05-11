// 🔥 firebaseClient.js
// 【組員 C 負責實作】
// 功能：Firebase 初始化、Auth 封裝、Firestore 操作封裝
//
// TODO 清單：
//   1. 填入 Firebase 設定，完成初始化
//   2. 實作 signInWithGoogle（Google 登入）
//   3. 實作 signOut
//   4. 實作 onAuthChanged（監聽登入狀態）
//   5. 實作 saveProgress（儲存練習紀錄）
//   6. 實作 getUserStats（讀取使用者進度）
//   7. 注意 Firestore 讀寫次數配額，批次更新優於逐筆寫入

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

// TODO: 組員 C 填入自己建立的 Firebase 專案設定
// 設定值在 Firebase Console → 專案設定 → 你的應用程式 → Firebase SDK 程式碼片段
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ── Auth ──────────────────────────────────────────────────────

/** Google 登入 */
export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  // TODO: 實作並回傳 userCredential
  throw new Error('尚未實作');
};

/** 登出 */
export const signOut = async () => {
  await firebaseSignOut(auth);
};

/** 監聽登入狀態，在 App.jsx 最外層使用 */
export const onAuthChanged = (callback) => {
  return onAuthStateChanged(auth, callback);
};

// ── Firestore：資料結構 ───────────────────────────────────────
//
// users/{uid}/
//   displayName: string
//   email: string
//   createdAt: timestamp
//
// users/{uid}/progress/{wordId}
//   practiceCount: number
//   bestAccuracy: number    (0–100)
//   lastPracticed: timestamp

/** 儲存單次練習紀錄 */
export const saveProgress = async (uid, wordId, accuracy) => {
  // TODO: 讀取舊紀錄，比較 bestAccuracy 後寫入
  // 提示：用 getDoc 先讀，再 setDoc/updateDoc 寫入
  throw new Error('尚未實作');
};

/** 讀取使用者對某個單字的練習統計 */
export const getUserStats = async (uid, wordId) => {
  // TODO: 從 users/{uid}/progress/{wordId} 讀取資料
  throw new Error('尚未實作');
};

/** 讀取使用者所有單字的進度（用於個人檔案頁） */
export const getAllUserProgress = async (uid) => {
  // TODO: 從 users/{uid}/progress 讀取所有子文件
  throw new Error('尚未實作');
};
