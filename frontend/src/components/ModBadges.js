import React from 'react';
import './ModBadges.css';

const MOD_COLORS = {
  F: '#1f6feb', // Fly — blue
  R: '#f08800', // Ride — orange
  M: '#ff44cc', // Mega — pink
  N: '#ffcc00'  // Neon — yellow
};

const MOD_TITLES = {
  F: 'Fly (+5%)',
  R: 'Ride (+5%)',
  M: 'Mega (+20%)',
  N: 'Neon (+8%)'
};

/**
 * Little circle badges for pet modifiers.
 * Usage: <ModBadges mods={item.mods} />
 */
const ModBadges = ({ mods, size = 18 }) => {
  const clean = Array.isArray(mods) ? mods.filter((m) => MOD_COLORS[m]) : [];
  if (clean.length === 0) return null;
  return (
    <span className="mod-badges" style={{ '--mod-size': `${size}px` }}>
      {clean.map((m) => (
        <span
          key={m}
          className="mod-badge-circle"
          style={{ background: MOD_COLORS[m] }}
          title={MOD_TITLES[m]}
        >
          {m}
        </span>
      ))}
    </span>
  );
};

export default ModBadges;
