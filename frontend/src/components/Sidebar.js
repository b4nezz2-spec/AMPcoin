import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AnimatedPopup from './AnimatedPopup';
import Icon from './Icon';

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
    { path: '/coinflip', label: 'Coinflip', icon: 'coin' },
    { path: '/jackpot', label: 'Jackpot', icon: 'jackpot' },
    { path: '/trading', label: 'Trading', icon: 'eye', disabled: true },
    { action: 'values', label: 'Values', icon: 'diamond' },
  ];

  const adminItems = [
    { path: '/admin', label: 'Admin Panel', icon: 'gear' },
  ];

  return (
    <>
      <nav className="sidebar">
        <div className="sidebar-header">
          <Link to="/coinflip" className="sidebar-logo">
            <span className="logo-icon"><Icon name="fire" size={22} /></span>
            <span className="logo-text">AMPCOIN</span>
          </Link>
        </div>

        <div className="nav-section">
          {navItems.map((item) =>
            item.action === 'values' ? (
              <span
                key="values"
                className="nav-link"
                onClick={() => window.dispatchEvent(new CustomEvent('ampcoin:open-values'))}
              >
                <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
                <span className="nav-label">{item.label}</span>
              </span>
            ) : item.disabled ? (
              <span
                key={item.path}
                className="nav-link nav-disabled"
                onClick={() => handleDisabledClick(item.label)}
              >
                <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
                <span className="nav-label">{item.label}</span>
              </span>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              >
                <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
                <span className="nav-label">{item.label}</span>
              </Link>
            )
          )}
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
                <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
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
          <button className="logout-btn" onClick={logout} title="Log out"><Icon name="door" size={18} /></button>
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
