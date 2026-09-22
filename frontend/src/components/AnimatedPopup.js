import React, { useEffect, useState } from 'react';
import './AnimatedPopup.css';
import './AnimatedPopup.css';

const TYPE_META = {
  success: { icon: '✓', label: 'Success' },
  error: { icon: '✕', label: 'Error' },
  warning: { icon: '!', label: 'Warning' },
  info: { icon: 'i', label: 'Info' }
};

const AnimatedPopup = ({
  show = true,
  title,
  message,
  type = 'info',
  duration = 3200,
  onClose
}) => {
  const [closing, setClosing] = useState(false);
  const meta = TYPE_META[type] || TYPE_META.info;

  useEffect(() => {
    setClosing(false);
  }, [message, show]);

  useEffect(() => {
    if (!show) return;
    let exitTimer;
    const timer = setTimeout(() => {
      setClosing(true);
      exitTimer = setTimeout(() => {
        if (onClose) onClose();
      }, 250);
    }, duration);
    return () => {
      clearTimeout(timer);
      if (exitTimer) clearTimeout(exitTimer);
    };
  }, [duration, onClose, show, message]);

  if (!show) return null;

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      if (onClose) onClose();
    }, 250);
  };

  return (
    <div className="apop-overlay" onClick={handleClose}>
      <div
        className={`apop-card apop-${type} ${closing ? 'apop-exit' : 'apop-enter'}`}
        onClick={(e) => e.stopPropagation()}
        role="alert"
      >
        <span className="apop-glow" />
        <div className="apop-icon">{meta.icon}</div>
        <div className="apop-body">
          <div className="apop-title">{title || meta.label}</div>
          {message && <div className="apop-message">{message}</div>}
        </div>
        <button className="apop-x" onClick={handleClose} aria-label="Dismiss">×</button>
        <div
          className="apop-progress"
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>
    </div>
  );
};

export default AnimatedPopup;
