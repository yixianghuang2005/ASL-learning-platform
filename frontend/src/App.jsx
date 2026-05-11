// App.jsx — React 入口檔
// 負責路由設定與全域 Auth 狀態管理

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Practice from './pages/Practice';
import Vocabulary from './pages/Vocabulary';
import Profile from './pages/Profile';
import { onAuthChanged, signOut } from './services/firebaseClient';

function App() {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    // 監聽 Firebase 登入狀態，任何頁面都能取得 currentUser
    const unsubscribe = onAuthChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut();
    setCurrentUser(null);
  };

  return (
    <BrowserRouter>
      <Navbar currentUser={currentUser} onLogout={handleLogout} />
      <Routes>
        <Route path="/"           element={<Home />} />
        <Route path="/practice"   element={<Practice />} />
        <Route path="/vocabulary" element={<Vocabulary />} />
        <Route path="/profile"    element={<Profile />} />
        {/* 其他路徑導回首頁 */}
        <Route path="*"           element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
