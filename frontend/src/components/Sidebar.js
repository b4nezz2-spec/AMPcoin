import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
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

  if (!user) return null;

  const navItems = [
    { path: '/coinflip', label: 'Coinflip' },
    { path: '/jackpot', label: 'Jackpot' },
    { path: '/trading', label: 'Trading' },
    { action: 'values', label: 'Values' },
  ];

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <Link to="/coinflip" className="sidebar-logo">
          <Logo size={30} />
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
              <span className="nav-label">{item.label}</span>
            </span>
          ) : (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="nav-label">{item.label}</span>
            </Link>
          )
        )}
        <a
          className="nav-discord"
          href="https://discord.gg/EfMgJa9qxa"
          target="_blank"
          rel="noopener noreferrer"
          title="Join our Discord"
        >
          <Icon name="discord" size={15} />
          <span className="nav-label">Discord</span>
        </a>
      </div>

      {user.isAdmin && (
        <div className="nav-section">
          <Link
            to="/admin"
            className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
          >
            <span className="nav-label">Admin</span>
          </Link>
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
        <button className="logout-btn" onClick={logout} title="Log out">Log out</button>
      </div>
    </nav>
  );
}

export default Sidebar;
