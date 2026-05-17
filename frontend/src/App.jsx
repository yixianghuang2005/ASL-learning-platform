// App.jsx — React 入口檔
// 暫時跳過 Firebase，等組員 C 完成後再接回來

import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Practice from './pages/Practice';
import Vocabulary from './pages/Vocabulary';
import Profile from './pages/Profile';

// TODO: 組員 C 完成 firebaseClient.js 後，取消註解以下兩行
// import { onAuthChanged, signOut } from './services/firebaseClient';

function App() {
  const [currentUser, setCurrentUser] = useState(null);

  const handleLogout = () => {
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
        <Route path="*"           element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
