import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import io from 'socket.io-client';

import './App.css';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import CoinflipPage from './pages/CoinflipPage';
import BlackjackPage from './pages/BlackjackPage';
import WalletPage from './pages/WalletPage';
import StatsPage from './pages/StatsPage';
import ProvablyFairPage from './pages/ProvablyFairPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import AdminPanel from './pages/AdminPanel';
import ChatPanel from './components/ChatPanel';
import AuthProvider, { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Initialize socket connection - make sure it connects to port 5000
const BACKEND_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  withCredentials: true
});

function AppContent() {
  const { user, loading, login, register, refreshUser } = useAuth();
  const [balance, setBalance] = useState(0);
  const [notifications, setNotifications] = useState([]); // Add this line

  useEffect(() => {
    if (user) {
      setBalance(user.balance);
    }
  }, [user]);

  // Listen for balance updates
  useEffect(() => {
    socket.on('balanceUpdate', (data) => {
      if (data.userId === user?.id) {
        setBalance(data.newBalance);
        // Update user balance in local storage as well
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        storedUser.balance = data.newBalance;
        localStorage.setItem('user', JSON.stringify(storedUser));
      }
    });

    // Listen for online user count updates
    socket.on('onlineCountUpdate', (data) => {
      // Update online user count in chat panel
    });

    return () => {
      socket.off('balanceUpdate');
      socket.off('onlineCountUpdate');
    };
  }, [user]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading AMPcoin...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {user && <Sidebar />}
      <div className={`main-content ${user ? 'with-sidebar' : ''}`}>
        {user && <Header balance={balance} setBalance={setBalance} notifications={notifications} socket={socket} />}
        <div className="page-content">
          <Routes>
            <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/coinflip" />} />
            <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/coinflip" />} />
            <Route 
              path="/" 
              element={
                user ? (
                  <Navigate to="/coinflip" replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              } 
            />
            <Route 
              path="/coinflip" 
              element={
                <ProtectedRoute>
                  <CoinflipPage socket={socket} setBalance={setBalance} />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/blackjack" 
              element={
                <ProtectedRoute>
                  <BlackjackPage socket={socket} setBalance={setBalance} />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/wallet" 
              element={
                <ProtectedRoute>
                  <Navigate to="/coinflip" replace />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/stats" 
              element={
                <ProtectedRoute>
                  <StatsPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/provably-fair" 
              element={
                <ProtectedRoute>
                  <ProvablyFairPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute adminOnly={true}>
                  <AdminPanel />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </div>
      </div>
      {user && <ChatPanel socket={socket} />}
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