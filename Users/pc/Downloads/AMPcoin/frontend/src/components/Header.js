// Update Header.js to include proper profile navigation
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { WalletModal } from '../pages/WalletPage'; // Import the wallet modal component

const Header = ({ balance, setBalance, notifications }) => {
  const location = useLocation();
  const { user } = useAuth();
  const [showWalletModal, setShowWalletModal] = useState(false);

  // Auto-open wallet modal when on /wallet route
  React.useEffect(() => {
    if (location.pathname === '/wallet') {
      setShowWalletModal(true);
    }
  }, [location.pathname]);

  const getPageTitle = () => {
    switch(location.pathname) {
      case '/coinflip':
        return 'Coinflip';
      case '/blackjack':
        return 'Blackjack';
      case '/wallet':
        return 'Wallet';
      case '/leaderboard':
        return 'Leaderboard';
      case '/stats':
        return 'Statistics';
      case '/provably-fair':
        return 'Provably Fair';
      case '/profile':
        return 'Profile';
      case '/admin':
        return 'Admin Panel';
      default:
        return 'Dashboard';
    }
  };

  const handleWalletClick = () => {
    setShowWalletModal(true);
  };

  return (
    <header className="header">
      <div className="header-left">
        <h2>{getPageTitle()}</h2>
      </div>
      
      <div className="header-right">
        <div className="balance-display">
          {balance?.toLocaleString()} <span className="ampcoin-text">AMP</span>
        </div>
        
        <button 
          className="wallet-btn btn btn-secondary"
          onClick={handleWalletClick}
        >
          Wallet
        </button>
        
        <span className="username">{user?.displayName}</span>
        
        <img 
          src={user?.avatar || '/default-avatar.png'} 
          alt="Avatar" 
          className="user-avatar"
          onError={(e) => {
            e.target.src = '/default-avatar.png';
          }}
        />
        
        <div className="notifications">
          <span className="notification-icon">🔔</span>
          {notifications && notifications.length > 0 && (
            <span className="notification-badge">{notifications.length}</span>
          )}
        </div>
      </div>

      {/* Wallet Modal */}
      {showWalletModal && (
        <div className="modal-overlay" onClick={() => setShowWalletModal(false)}>
          <div className="wallet-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Wallet</h2>
              <button className="close-modal" onClick={() => setShowWalletModal(false)}>×</button>
            </div>
            <WalletModal onClose={() => setShowWalletModal(false)} />
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;