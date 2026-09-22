import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AnimatedPopup from './AnimatedPopup';

const DEFAULT_AVATAR = '/default-avatar.png';

function getFallbackAvatar(user) {
  if (user?.robloxUserId) {
    return `https://www.roblox.com/headshot-thumbnail/image?userId=${user.robloxUserId}&width=420&height=420&format=png`;
  }
  return DEFAULT_AVATAR;
}

function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonName, setComingSoonName] = useState('');

  if (!user) return null;

  const handleDisabledClick = (name) => {
    setComingSoonName(name);
    setShowComingSoon(true);
  };

  const navItems = [
    { path: '/coinflip', label: 'Coinflip', icon: '🪙' },
    { path: '/jackpot', label: 'Jackpot', icon: '🎰' },
    { path: '/trading', label: 'Trading', icon: '👀', disabled: true },
  ];

  const adminItems = [
    { path: '/admin', label: 'Admin Panel', icon: '⚙️' },
  ];

  return (
    <>
      <nav className="sidebar">
        <div className="sidebar-logo">
          <Link to="/coinflip">
            <span className="logo-icon">🔥</span>
            <span className="logo-text">AMPCOIN</span>
          </Link>
        </div>

        <div className="nav-section">
          {navItems.map((item) => (
            item.disabled ? (
              <span
                key={item.path}
                className="nav-link nav-disabled"
                onClick={() => handleDisabledClick(item.label)}
                title="Not available yet"
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </span>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>
            )
          ))}
        </div>

        {user.isAdmin && (
          <div className="nav-section">
            <h3>Admin</h3>
            {adminItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="sidebar-footer">
          <div className="user-info">
            <img
              src={user.avatar || getFallbackAvatar(user)}
              alt={user.displayName || user.robloxUsername}
              className="user-avatar"
              onError={(e) => { e.target.src = getFallbackAvatar(user); }}
            />
            <div className="user-details">
              <span className="user-name">{user.displayName || user.robloxUsername}</span>
              {user.isAdmin && <span className="admin-badge">Admin</span>}
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>🚪</button>
        </div>
      </nav>

      <AnimatedPopup
        show={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        title="Coming Soon"
        message={`${comingSoonName} is not available yet! Check back later.`}
        type="info"
      />
    </>
  );
}

export default Sidebar;
