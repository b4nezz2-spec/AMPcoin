import React, { useState } from 'react';
import AnimatedPopup from './AnimatedPopup';
import './CreateCoinflipModal.css';

const CreateCoinflipModal = ({ onClose, onCreated, userId, socket, setBalance, userInventory }) => {
  const [selectedQty, setSelectedQty] = useState({}); // stackKey -> units selected
  const [selectedSide, setSelectedSide] = useState('heads');
  const [searchTerm, setSearchTerm] = useState('');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('value_desc');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null); // { message, type } custom popup
  const [limitationsOn, setLimitationsOn] = useState(false);
  const [maxJoinPets, setMaxJoinPets] = useState(5);
  const [limitMenuOpen, setLimitMenuOpen] = useState(false);

  const showNotice = (message, type = 'info') => {
    setNotice({ message, type });
  };

  // Use the passed inventory prop instead of fetching separately
  const inventory = userInventory || [];

  const stackKeyOf = (item) => item.itemId || item.id;
  const stackQtyOf = (item) => Math.max(1, parseInt(item.quantity || 1, 10) || 1);

  // Per-unit toggle: clicking an unselected tile adds one unit,
  // clicking a selected tile removes that unit and the ones after it.
  const toggleUnit = (stackKey, tileIdx) => {
    setSelectedQty((prev) => {
      const cur = prev[stackKey] || 0;
      const next = tileIdx < cur ? tileIdx : cur + 1;
      const stack = inventory.find((i) => stackKeyOf(i) === stackKey);
      const max = stack ? stackQtyOf(stack) : next;
      const clamped = Math.min(next, max);
      const n = { ...prev };
      if (clamped <= 0) delete n[stackKey];
      else n[stackKey] = clamped;
      return n;
    });
  };

  const clearStack = (stackKey) => {
    setSelectedQty((prev) => {
      const n = { ...prev };
      delete n[stackKey];
      return n;
    });
  };

  // Selected stacks with their chosen unit counts
  const selectedEntries = inventory
    .filter((item) => (selectedQty[stackKeyOf(item)] || 0) > 0)
    .map((item) => ({ item, qty: selectedQty[stackKeyOf(item)] }));
  const selectedCount = selectedEntries.reduce((s, e) => s + e.qty, 0);

  const getTotalValue = () => {
    return selectedEntries.reduce((sum, e) => sum + ((e.item.value || e.item.details?.value || 0) * e.qty), 0);
  };

  const handleCreateCoinflip = async () => {
    if (selectedCount === 0) {
      showNotice('Please select at least one item to bet', 'warning');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/coinflip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          selectedItems: selectedEntries.map(({ item, qty }) => ({
            itemId: item.itemId || item.id,
            name: item.details?.name || item.name,
            quantity: qty,
            value: item.value || item.details?.value || 0
          })),
          sideChosen: selectedSide,
          maxJoinPets: limitationsOn ? (maxJoinPets === 0 ? null : maxJoinPets) : null
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        // Backend already broadcasts newCoinflip + inventoryUpdate via socket
        // The onCreated callback inserts it into the lobby immediately for the creator

        // Guarantee the new bet posts in the current list even if the
        // socket event is missed (parent inserts it + refetches).
        if (onCreated) {
          try { onCreated(data); } catch (e) { console.error('onCreated handler failed:', e); }
        }

        // Update user balance
        if (setBalance) {
          const totalWagered = getTotalValue();
          setBalance(prev => prev - totalWagered);
        }

        onClose();
      } else {
        if (response.status === 429) {
          showNotice('Too many requests — slow down a few seconds and try again.', 'error');
        } else {
          showNotice(data.message || 'Failed to create coinflip', 'error');
        }
      }
    } catch (error) {
      console.error('Error creating coinflip:', error);
      showNotice('Error creating coinflip', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getRarityClass = (rarity) => {
    switch(rarity) {
      case 'common': return 'rarity-common';
      case 'rare': return 'rarity-rare';
      case 'epic': return 'rarity-epic';
      case 'legendary': return 'rarity-legendary';
      case 'mythic': return 'rarity-mythic';
      default: return 'rarity-common';
    }
  };

  // Filter and sort inventory
  let filteredInventory = [...inventory];

  if (searchTerm) {
    filteredInventory = filteredInventory.filter(item =>
      (item.details?.name || item.name).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.details?.description || item.description).toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  if (rarityFilter !== 'all') {
    filteredInventory = filteredInventory.filter(item =>
      (item.details?.rarity || item.rarity) === rarityFilter
    );
  }

  // Sort inventory
  filteredInventory.sort((a, b) => {
    switch(sortBy) {
      case 'value_asc':
        return (a.value || a.details?.value || 0) - (b.value || b.details?.value || 0);
      case 'value_desc':
        return (b.value || b.details?.value || 0) - (a.value || a.details?.value || 0);
      case 'name_asc':
        return (a.details?.name || a.name).localeCompare(b.details?.name || b.name);
      case 'name_desc':
        return (b.details?.name || b.name).localeCompare(a.details?.name || a.name);
      default:
        return (b.value || b.details?.value || 0) - (a.value || a.details?.value || 0);
    }
  });

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Create Coinflip Game</h2>
            <button className="close-modal" onClick={onClose}>×</button>
          </div>
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      {notice && (
        <AnimatedPopup
          message={notice.message}
          type={notice.type}
          onClose={() => setNotice(null)}
        />
      )}
      <div className="modal enhanced" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Coinflip Game</h2>
          <button className="close-modal" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Selected Items ({selectedCount}): {getTotalValue().toLocaleString()} AMP</label>
            <div className="selected-items compact">
              {selectedEntries.length > 0 ? (
                selectedEntries.map(({ item, qty }) => (
                  <div key={item.itemId || item.id} className="selected-chip" title={`${item.details?.name || item.name} — ${((item.value || item.details?.value || 0) * qty).toLocaleString()} AMP`}>
                    <img
                      src={item.details?.imageUrl || item.image || '/default-item.png'}
                      alt={item.details?.name || item.name}
                      className="chip-img"
                      onError={(e) => {
                        e.target.src = '/default-item.png';
                      }}
                    />
                    <span className="chip-name">{item.details?.name || item.name}{qty > 1 && ` ×${qty}`}</span>
                    <span className="chip-val">{((item.value || item.details?.value || 0) * qty).toLocaleString()}</span>
                    <button
                      className="chip-x"
                      onClick={() => clearStack(stackKeyOf(item))}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <div className="no-selected-items">
                  <p>No items selected</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="inventory-filters">
            <input
              type="text"
              className="form-control"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select 
              className="form-control" 
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value)}
            >
              <option value="all">All Rarities</option>
              <option value="common">Common</option>
              <option value="uncommon">Uncommon</option>
              <option value="rare">Rare</option>
              <option value="epic">Epic</option>
              <option value="legendary">Legendary</option>
              <option value="mythic">Mythic</option>
            </select>
            <select 
              className="form-control" 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="value_desc">Value: High to Low</option>
              <option value="value_asc">Value: Low to High</option>
              <option value="name_asc">Name: A to Z</option>
              <option value="name_desc">Name: Z to A</option>
            </select>
          </div>
          
          <div className="inventory-grid">
            {filteredInventory.length > 0 ? (
              filteredInventory.flatMap((item) => {
                const key = stackKeyOf(item);
                const max = stackQtyOf(item);
                const sel = selectedQty[key] || 0;
                // One tile per unit so multiples show next to each other
                return Array.from({ length: max }, (_, i) => {
                  const isSelected = i < sel;
                  return (
                    <div
                      key={`${key}:${i}`}
                      className={`inventory-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleUnit(key, i)}
                    >
                      <img
                        src={item.details?.imageUrl || item.image || '/default-item.png'}
                        alt={item.details?.name || item.name}
                        className="item-image"
                        onError={(e) => {
                          e.target.src = '/default-item.png';
                        }}
                      />
                      <div className="item-info">
                        <div className="item-name">{item.details?.name || item.name}</div>
                        <div className="item-value">{(item.value || item.details?.value || 0).toLocaleString()} AMP</div>
                        <span className={`badge ${getRarityClass(item.details?.rarity || item.rarity)}`}>
                          {(item.details?.rarity || item.rarity)}
                        </span>
                      </div>
                    </div>
                  );
                });
              })
            ) : (
              <div className="no-inventory-items">
                <p>No items available in your inventory</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="modal-actions create-actions">
          <div className="cf-create-sides">
            <button
              type="button"
              className={`side-btn heads ${selectedSide === 'heads' ? 'active' : ''}`}
              onClick={() => setSelectedSide('heads')}
            >
              <span className="coin-badge heads">H</span> Heads
            </button>
            <button
              type="button"
              className={`side-btn tails ${selectedSide === 'tails' ? 'active' : ''}`}
              onClick={() => setSelectedSide('tails')}
            >
              <span className="coin-badge tails">T</span> Tails
            </button>
            <div className={`cf-limitations ${limitationsOn ? 'on' : ''}`}>
              <div className="cf-limit-switch-row">
                <span className="cf-limit-label">Limit Items</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={limitationsOn}
                  className={`cf-limit-switch ${limitationsOn ? 'on' : ''}`}
                  onClick={() => {
                    const next = !limitationsOn;
                    setLimitationsOn(next);
                    setLimitMenuOpen(next);
                  }}
                >
                  <span className="cf-limit-knob" />
                </button>
              </div>
              <div className={`cf-limit-dropdown ${limitationsOn && limitMenuOpen ? 'open' : ''} ${limitationsOn ? 'enabled' : ''}`}>
                <button
                  type="button"
                  className="cf-limit-trigger"
                  disabled={!limitationsOn}
                  onClick={() => setLimitMenuOpen((o) => !o)}
                  aria-expanded={limitationsOn && limitMenuOpen}
                >
                  Max {maxJoinPets === 0 ? 'No Limit' : `${maxJoinPets} pet${maxJoinPets === 1 ? '' : 's'}`}
                  <span className="cf-limit-caret">▾</span>
                </button>
                <div className="cf-limit-menu" role="listbox">
                  {[0, ...Array.from({ length: 15 }, (_, i) => i + 1)].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="option"
                      aria-selected={maxJoinPets === n}
                      className={`cf-limit-opt ${maxJoinPets === n ? 'active' : ''}`}
                      style={{ '--i': n }}
                      onClick={() => {
                        setMaxJoinPets(n);
                        setLimitMenuOpen(false);
                      }}
                    >
                      {n === 0 ? 'No Limit' : n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="cf-create-confirm">
            <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateCoinflip}
              disabled={selectedCount === 0 || loading}
            >
              {loading ? 'Creating...' : `Create Game (${getTotalValue().toLocaleString()} AMP)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateCoinflipModal;