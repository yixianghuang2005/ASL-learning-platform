// 👤 Profile.jsx
// 【組員 C 主要負責】
// 功能：個人檔案頁，顯示使用者資訊 + 學習進度追蹤
//
// TODO 清單：
//   1. 讀取 Firebase Auth 的 currentUser 資訊
//   2. 呼叫 getAllUserProgress 取得所有單字練習紀錄
//   3. 顯示整體學習進度（已解鎖單字數 / 總單字數）
//   4. 顯示每個單字的練習次數與最佳準確率
//   5. 實作登出按鈕
//   6. 未登入狀態跳轉到登入頁

import React, { useEffect, useState } from 'react';
import { auth, signOut, getAllUserProgress } from '../services/firebaseClient';

const Profile = () => {
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      // TODO: 跳轉到登入頁
      setLoading(false);
      return;
    }
    setUser(currentUser);

    // TODO: 呼叫 getAllUserProgress 取得進度資料
    // getAllUserProgress(currentUser.uid).then(data => {
    //   setProgress(data);
    //   setLoading(false);
    // });

    // 暫時使用假資料
    setProgress([
      { wordId: '你好', practiceCount: 12, bestAccuracy: 92 },
      { wordId: '謝謝', practiceCount: 5, bestAccuracy: 75 },
      { wordId: '對不起', practiceCount: 0, bestAccuracy: 0 },
    ]);
    setLoading(false);
  }, []);

  const handleLogout = async () => {
    await signOut();
    // TODO: 跳轉到首頁
  };

  if (loading) return <p>載入中...</p>;

  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <p>請先登入以查看個人檔案</p>
        {/* TODO: 加入 Google 登入按鈕 */}
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <img src={user.photoURL} alt="頭像" style={{ width: 64, height: 64, borderRadius: '50%' }} />
        <div>
          <h2>{user.displayName}</h2>
          <p style={{ color: '#666' }}>{user.email}</p>
        </div>
        <button onClick={handleLogout} style={{ marginLeft: 'auto' }}>登出</button>
      </div>

      <h3>📊 學習進度</h3>
      {/* TODO: 改為視覺化進度條或圖表 */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>單字</th>
            <th>練習次數</th>
            <th>最佳準確率</th>
          </tr>
        </thead>
        <tbody>
          {progress.map((item) => (
            <tr key={item.wordId}>
              <td>{item.wordId}</td>
              <td>{item.practiceCount}</td>
              <td>{item.bestAccuracy ? `${item.bestAccuracy}%` : '未練習'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Profile;
