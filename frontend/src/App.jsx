// App.jsx — React 入口，含 Firebase Auth 狀態管理

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar      from './components/Navbar';
import LoginModal  from './components/LoginModal';
import Home        from './pages/Home';
import Practice    from './pages/Practice';
import WordRecognition from './pages/WordRecognition';
import Profile     from './pages/Profile';
import TestPose    from './pages/TestPose';
import { onAuthChanged, signOut } from './services/firebaseClient';

function App() {
  const [currentUser,  setCurrentUser]  = useState(null);
  const [authReady,    setAuthReady]    = useState(false);
  const [showLogin,    setShowLogin]    = useState(false);

  // 監聽 Firebase Auth 狀態
  useEffect(() => {
    const unsub = onAuthChanged(user => {
      setCurrentUser(user);
      setAuthReady(true);
      if (user) setShowLogin(false);   // 登入成功後自動關彈窗
    });
    return unsub;
  }, []);

  const handleLogout = async () => {
    await signOut();
    setCurrentUser(null);
  };

  // Firebase 初始化前短暫等待，避免閃爍
  if (!authReady) return null;

  return (
    <BrowserRouter>
      <Navbar
        currentUser={currentUser}
        onLogout={handleLogout}
        onLoginClick={() => setShowLogin(true)}
      />

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

      <Routes>
        <Route path="/"           element={<Home />} />
        <Route path="/practice"   element={<Practice />} />
        <Route path="/asl-words"  element={<WordRecognition />} />
        <Route path="/vocabulary" element={<Navigate to="/asl-words" replace />} />
        <Route path="/profile"    element={<Profile currentUser={currentUser} onLoginClick={() => setShowLogin(true)} />} />
        <Route path="/test-pose"  element={<TestPose />} />
        <Route path="*"           element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
