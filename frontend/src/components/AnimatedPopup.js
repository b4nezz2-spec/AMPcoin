import React, { useEffect } from 'react';

const AnimatedPopup = ({ message, type = 'info', duration = 3000, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getTypeStyles = () => {
    switch(type) {
      case 'success':
        return {
          backgroundColor: 'rgba(0, 204, 102, 0.55)',
          borderColor: 'rgba(0, 204, 102, 0.7)'
        };
      case 'error':
        return {
          backgroundColor: 'rgba(255, 77, 77, 0.55)', // 55% transparent red
          borderColor: 'rgba(255, 77, 77, 0.7)'
        };
      case 'warning':
        return {
          backgroundColor: 'rgba(255, 165, 0, 0.55)',
          borderColor: 'rgba(255, 165, 0, 0.7)'
        };
      default:
        return {
          backgroundColor: 'rgba(0, 170, 255, 0.55)',
          borderColor: 'rgba(0, 170, 255, 0.7)'
        };
    }
  };

  return (
    <div className="animated-popup-overlay">
      <div className="animated-popup" style={getTypeStyles()}>
        <div className="popup-content">
          <span className="popup-dot"></span>
          <span className="popup-message">{message}</span>
        </div>
      </div>
    </div>
  );
};

export default AnimatedPopup;