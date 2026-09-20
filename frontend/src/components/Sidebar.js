import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../context/AuthContext';
import AnimatedPopup from './AnimatedPopup';

const DEFAULT_AVATAR = '/default-avatar.png';

function getFallbackAvatar(user) {
  if (user?.robloxUserId) {
    return `https://www.roblox.com/headshot-thumbnail/image?userId=${user.robloxUserId}&width=420&height=420&format=png`;
  }
  return DEFAULT_AVATAR;
}

// NavLink组件 — disabled items show the "not available" popup instead of navigating
const NavLink = ({ to, label, isActive, disabled, onDisabledClick }) => {
  if (disabled) {
    return (
      <span
        className="nav-link nav-disabled"
        onClick={onDisabledClick}
        title="Not available yet"
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      to={to}
      className={`nav-link ${isActive ? 'active' : ''}`}
    >
      {label}
    </Link>
  );
};

// NavSection组件
const NavSection = ({ title, items, activePath, onDisabledClick }) => (
  <div className="nav-section">
    <h3>{title}</h3>
    {items.map((item) => (
      <NavLink
        key={item.path}
        to={item.path}
        label={item.label}
        isActive={activePath === item.path}
        disabled={!!item.disabled}
        onDisabledClick={() => onDisabledClick && onDisabledClick(item)}
      />
    ))}
  </div>
);

NavLink.propTypes = {
  to: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  isActive: PropTypes.bool.isRequired,
  disabled: PropTypes.bool,
  onDisabledClick: PropTypes.func
};

NavSection.propTypes = {
  title: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(PropTypes.shape({
    path: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired
  })).isRequired,
  activePath: PropTypes.string.isRequired,
  onDisabledClick: PropTypes.func
};

const Sidebar = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');

  const isActive = (path) => {
    return location.pathname === path;
  };

  const navItems = [
    { path: '/coinflip', label: 'Coinflip' },
    { path: '/blackjack', label: 'Blackjack', disabled: true }
  ];

  const handleDisabledClick = () => {
    setPopupMessage('Blackjack is not available yet');
    setShowPopup(true);
    setTimeout(() => setShowPopup(false), 3000);
  };

  const displayName = user?.robloxDisplayName || user?.displayName || user?.robloxUsername || 'Anonymous';
  const avatarSrc = user?.avatar || getFallbackAvatar(user);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <h1 className="logo-text">AMPcoin</h1>
        </div>
      </div>

      <nav className="sidebar-nav">
        <NavSection 
          title="Games" 
          items={navItems.slice(0, 2)} 
          activePath={location.pathname}
          onDisabledClick={handleDisabledClick}
        />

        {user?.isAdmin && (
          <NavSection
            title="Admin"
            items={[{ path: '/admin', label: 'Admin Panel' }]}
            activePath={location.pathname}
            onDisabledClick={handleDisabledClick}
          />
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <img 
            src={avatarSrc || DEFAULT_AVATAR} 
            alt={`${displayName} avatar`} 
            className="user-avatar"
            onError={(e) => {
              const fb = getFallbackAvatar(user);
              if (e.target.src !== fb) e.target.src = fb;
              else if (e.target.src !== DEFAULT_AVATAR) e.target.src = DEFAULT_AVATAR;
            }}
          />
          <div className="user-details">
            <span className="username" title={user?.robloxUsername || ''}>{displayName}</span>
          </div>
        </div>
        
        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </div>

      {showPopup && (
        <AnimatedPopup
          message={popupMessage}
          type="info"
          onClose={() => setShowPopup(false)}
        />
      )}
    </div>
  );
};

export default Sidebar;