import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import io from 'socket.io-client';

import './App.css';
import './giveaways-notifications.css';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import CoinflipPage from './pages/CoinflipPage';
import BlackjackPage from './pages/BlackjackPage';
import JackpotPage from './pages/JackpotPage';
import WalletPage from './pages/WalletPage';
import StatsPage from './pages/StatsPage';
import ProvablyFairPage from './pages/ProvablyFairPage';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import AdminPanel from './pages/AdminPanel';
import ChatPanel from './components/ChatPanel';
import AuthProvider, { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

const BACKEND_URL = process.env.REACT_APP_API_URL || 'https://ampcoin-50q9kxt9.b4a.run';
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,
  timeout: 10000
});

function TopNav() {
  return (
    <nav className="top-nav">
      <a href="/values">💎 Values</a>
      <a href="/leaderboard">🏆 Leaderboard</a>
    </nav>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [balance, setBalance] = useState(0);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (user) {
      setBalance(user.balance);
    }
  }, [user]);

  useEffect(() => {
    socket.on('balanceUpdate', (data) => {
      if (data.userId === user?.id) {
        setBalance(data.newBalance);
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        storedUser.balance = data.newBalance;
        localStorage.setItem('user', JSON.stringify(storedUser));
      }
    });
    socket.on('onlineCountUpdate', () => {});
    return () => {
      socket.off('balanceUpdate');
      socket.off('onlineCountUpdate');
    };
  }, [user]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading AMPCOIN...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <TopNav />
      {user && <Sidebar />}
      <div className="layout-columns">
        {user && <ChatPanel socket={socket} chatOpen={true} />}
        <div className="main-content">
          {user && <Header balance={balance} setBalance={setBalance} notifications={notifications} socket={socket} />}
          <div className="page-content">
            <Routes>
              <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/coinflip" />} />
              <Route path="/register" element={<Navigate to="/login" replace />} />
              <Route path="/" element={user ? <Navigate to="/coinflip" replace /> : <Navigate to="/login" replace />} />
              <Route path="/coinflip" element={<ProtectedRoute><CoinflipPage socket={socket} setBalance={setBalance} /></ProtectedRoute>} />
              <Route path="/jackpot" element={<ProtectedRoute><JackpotPage socket={socket} setBalance={setBalance} /></ProtectedRoute>} />
              <Route path="/blackjack" element={<ProtectedRoute><JackpotPage socket={socket} setBalance={setBalance} /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute><Navigate to="/coinflip" replace /></ProtectedRoute>} />
              <Route path="/stats" element={<ProtectedRoute><StatsPage /></ProtectedRoute>} />
              <Route path="/provably-fair" element={<ProtectedRoute><ProvablyFairPage /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute adminOnly={true}><AdminPanel /></ProtectedRoute>} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
