import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import CreateCoinflipModal from '../components/CreateCoinflipModal';
import LeaderboardModal from '../components/LeaderboardModal';
import AnimatedPopup from '../components/AnimatedPopup';
import './CoinflipPage.css';

const CoinflipPage = ({ socket, setBalance }) => {
  const { user } = useAuth();
  const [coinflips, setCoinflips] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [totalInGames, setTotalInGames] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [userInventory, setUserInventory] = useState([]);

  // Join modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedBet, setSelectedBet] = useState(null);
  const [joinSelectedQty, setJoinSelectedQty] = useState({}); // stackKey -> units picked
  const [joining, setJoining] = useState(false);

  const joinStackKeyOf = (item) => item.itemId || item.id;
  const joinStackQtyOf = (item) => Math.max(1, parseInt(item.quantity || 1, 10) || 1);

  // Per-unit toggle: multiples show as individual tiles, never stacked
  const toggleJoinUnit = (stackKey, tileIdx) => {
    setJoinSelectedQty((prev) => {
      const cur = prev[stackKey] || 0;
      const next = tileIdx < cur ? tileIdx : cur + 1;
      const stack = userInventory.find((i) => joinStackKeyOf(i) === stackKey);
      const max = stack ? joinStackQtyOf(stack) : next;
      const clamped = Math.min(next, max);
      const n = { ...prev };
      if (clamped <= 0) delete n[stackKey];
      else n[stackKey] = clamped;
      return n;
    });
  };

  // Picked stacks with their chosen unit counts
  const joinEntries = userInventory
    .filter((item) => (joinSelectedQty[joinStackKeyOf(item)] || 0) > 0)
    .map((item) => ({ item, qty: joinSelectedQty[joinStackKeyOf(item)] }));
  const joinSelectedCount = joinEntries.reduce((s, e) => s + e.qty, 0);

  // Inline chip flip on the row itself (no layout shift, no modal):
  // { id, phase: 'flipping' | 'landed', side }
  const [chipAnim, setChipAnim] = useState(null);
  const animTimers = useRef([]);

  // Popup state
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [popupType, setPopupType] = useState('info');

  const showCustomPopup = (message, type = 'info') => {
    setPopupMessage(message);
    setPopupType(type);
    setShowPopup(true);
    setTimeout(() => {
      setShowPopup(false);
    }, 3000);
  };

  const closePopup = () => {
    setShowPopup(false);
  };

  // Fetch coinflips
  const fetchCoinflips = useCallback(async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/coinflip?sort=${sortBy}`);
      if (response.ok) {
        const data = await response.json();
        setCoinflips(data.coinflips || []);
        setActiveCount(data.activeCount || 0);
        setTotalInGames(data.totalInGames || 0);
      } else if (response.status === 429) {
        showCustomPopup('Server is rate-limiting requests — wait a few seconds and refresh.', 'error');
      }
    } catch (error) {
      console.error('Error fetching coinflips:', error);
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  // Fetch user inventory
  const fetchInventory = useCallback(async () => {
    if (!user) return;
    try {
      const identifier = user.id || user.robloxUsername;
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/users/inventory/${identifier}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setUserInventory(data.items || []);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  }, [user]);

  // Initial load and socket listeners
  useEffect(() => {
    fetchCoinflips();
    fetchInventory();

    if (socket) {
      socket.on('newCoinflip', (data) => {
        setCoinflips(prev => [data, ...prev.filter(cf => cf.id !== data.id)]);
        setActiveCount(prev => prev + 1);
        setTotalInGames(prev => prev + (data.totalValue || 0));
      });

      socket.on('coinflipJoined', (data) => {
        setCoinflips(prev => prev.map(cf => cf.id === data.id ? data : cf));
      });

      socket.on('coinflipResult', (data) => {
        // Flip the chip on the bet's own row for completed games.
        if (data && data.id && (data.status === 'completed' || data.result)) {
          playChipFlip(data);
          if (user && (data.creatorId === user.id || data.opponentId === user.id)) {
            fetchInventory();
          }
        }
        setCoinflips(prev => prev.map(cf => cf.id === data.id ? data : cf));
      });
    }

    return () => {
      if (socket) {
        socket.off('newCoinflip');
        socket.off('coinflipJoined');
        socket.off('coinflipResult');
      }
    };
  }, [socket, user, fetchCoinflips, fetchInventory]);

  // Spins the little chip on the bet's own row, then lands it on the
  // result side. Nothing else on the page moves. Clears itself.
  const playChipFlip = (gameData) => {
    if (!gameData || !gameData.id) return;
    animTimers.current.forEach(clearTimeout);
    animTimers.current = [];
    const side = (gameData.result || gameData.sideChosen || gameData.creatorSide || 'heads')
      .toLowerCase() === 'tails' ? 'tails' : 'heads';
    setChipAnim({ id: gameData.id, phase: 'flipping', side });
    animTimers.current.push(setTimeout(() => {
      setChipAnim((prev) => (prev && prev.id === gameData.id ? { id: gameData.id, phase: 'landed', side } : prev));
    }, 3000));
    animTimers.current.push(setTimeout(() => {
      setChipAnim((prev) => (prev && prev.id === gameData.id ? null : prev));
    }, 7000));
  };

  useEffect(() => () => { animTimers.current.forEach(clearTimeout); }, []);

  // Games shown in the lobby: waiting/active + completed within the last 10 min
  const isVisibleGame = (cf) => {
    if (!cf) return false;
    if (cf.status === 'waiting' || cf.status === 'active') return true;
    if (cf.status !== 'completed') return false;
    if (!cf.completedAt) return true;
    return Date.now() - new Date(cf.completedAt).getTime() < 10 * 60 * 1000;
  };

  const handleCreateBet = () => {
    if (!userInventory || userInventory.length === 0) {
      showCustomPopup('You currently have no items in your inventory to bet.', 'warning');
      return;
    }
    setShowCreateModal(true);
  };

  // Called by the create modal on success: post the new bet into the
  // current list immediately, then refetch to reconcile with the server.
  const handleBetCreated = (newBet) => {
    if (newBet && newBet.id) {
      setCoinflips((prev) => [newBet, ...prev.filter((cf) => cf.id !== newBet.id)]);
      setActiveCount((prev) => prev + 1);
      setTotalInGames((prev) => prev + (newBet.totalValue || 0));
      showCustomPopup('Coinflip created — your bet is live!', 'success');
    }
    fetchCoinflips();
    fetchInventory();
  };

  const handleOpenJoinModal = (bet) => {
    if (!userInventory || userInventory.length === 0) {
      showCustomPopup('You currently have no items in your inventory to bet with.', 'warning');
      return;
    }
    setSelectedBet(bet);
    setJoinSelectedQty({});
    setShowJoinModal(true);
  };

  const clearJoinStack = (stackKey) => {
    setJoinSelectedQty((prev) => {
      const n = { ...prev };
      delete n[stackKey];
      return n;
    });
  };

  const getJoinTotalValue = () => {
    return joinEntries.reduce((sum, e) => sum + ((e.item.value || e.item.details?.value || 0) * e.qty), 0);
  };

  // Auto-select individual units whose values land inside the 95%-105% range
  const handleAutoSelect = () => {
    if (!selectedBet) return;
    const { lo, hi } = getJoinRange(selectedBet);
    const maxByKey = {};
    const units = [];
    userInventory.forEach((item) => {
      const v = item.value || item.details?.value || 0;
      if (v <= 0) return;
      const key = joinStackKeyOf(item);
      const q = joinStackQtyOf(item);
      maxByKey[key] = q;
      for (let i = 0; i < q; i++) units.push({ key, value: v });
    });
    units.sort((a, b) => b.value - a.value);
    const pickedQty = {};
    let total = 0;
    for (const u of units) {
      if (total >= lo) break;
      if ((pickedQty[u.key] || 0) >= (maxByKey[u.key] || 1)) continue;
      if (total + u.value <= hi) {
        pickedQty[u.key] = (pickedQty[u.key] || 0) + 1;
        total += u.value;
      }
    }
    if (total < lo) {
      // Top up with the smallest remaining unit that reaches the minimum
      const seen = new Set();
      const rest = [];
      units.forEach((u) => {
        if (seen.has(u.key)) return;
        seen.add(u.key);
        if ((pickedQty[u.key] || 0) < (maxByKey[u.key] || 1)) rest.push(u);
      });
      rest.sort((a, b) => a.value - b.value);
      const fit = rest.find((u) => total + u.value >= lo && total + u.value <= hi)
        || rest.find((u) => total + u.value <= hi);
      if (fit) {
        pickedQty[fit.key] = (pickedQty[fit.key] || 0) + 1;
        total += fit.value;
      }
    }
    const pickedCount = Object.values(pickedQty).reduce((s, n) => s + n, 0);
    setJoinSelectedQty(pickedQty);
    if (pickedCount === 0) {
      showCustomPopup('No combination of your items fits that range.', 'warning');
    }
  };

  const joinRangeOk = () => {
    if (!selectedBet || joinSelectedCount === 0) return false;
    const { lo, hi } = getJoinRange(selectedBet);
    const total = getJoinTotalValue();
    return total >= lo && total <= hi;
  };

  // Compact value formatter (6.7M style)
  const formatCompact = (n) => {
    const v = Number(n) || 0;
    if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return `${v}`;
  };

  const sidePct = (v, t) => (t > 0 ? `${((v / t) * 100).toFixed(2)}%` : '0.00%');

  // Normalized view-model for a bet, shared by the row + detail modal
  const getBetMeta = (cf) => {
    const creatorName = cf.creator?.displayName || cf.creatorUsername || 'Unknown';
    const creatorAvatar = cf.creator?.avatar || cf.creatorAvatar || '/default-avatar.png';
    const creatorSide = (cf.sideChosen || cf.creatorSide || 'heads').toLowerCase() === 'tails' ? 'tails' : 'heads';
    const opponentSide = creatorSide === 'heads' ? 'tails' : 'heads';
    const oppName = cf.opponent?.displayName || cf.opponentUsername || null;
    const oppAvatar = cf.opponent?.avatar || cf.opponentAvatar || '/default-avatar.png';
    const hasOpponent = !!(cf.opponentId || oppName);
    const creatorVal = cf.creatorValue || 0;
    const oppVal = cf.opponentValue || 0;
    const total = cf.totalValue || (creatorVal + oppVal);
    const isUserCreator = !!(user && cf.creatorId === user.id);
    const isCompleted = cf.status === 'completed' || !!cf.isCompleted;
    const winnerId = cf.winnerId || null;
    const resultSide = (cf.result || cf.sideChosen || cf.creatorSide || 'heads').toLowerCase() === 'tails' ? 'tails' : 'heads';
    const thumbs = [...(cf.creatorItems || []), ...(cf.opponentItems || [])];
    const allItems = [...(cf.creatorItems || []), ...(cf.opponentItems || [])];
    return { creatorName, creatorAvatar, creatorSide, opponentSide, oppName, oppAvatar, hasOpponent, creatorVal, oppVal, total, isUserCreator, isCompleted, winnerId, resultSide, thumbs, allItems };
  };

  // Detail modal state (the "View" popup)
  const [viewBet, setViewBet] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  // Cancel your own waiting bet — refunds wagered items
  const handleCancelBet = async (bet) => {
    if (!bet || cancelling) return;
    setCancelling(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/coinflip/${bet.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setCoinflips((prev) => prev.filter((cf) => cf.id !== bet.id));
        setActiveCount((prev) => Math.max(0, prev - 1));
        setTotalInGames((prev) => Math.max(0, prev - (bet.totalValue || 0)));
        setViewBet(null);
        showCustomPopup('Bet cancelled — items refunded!', 'success');
        fetchInventory();
        if (socket) socket.emit('inventoryUpdate', { userId: user?.id });
      } else {
        showCustomPopup(data.message || 'Failed to cancel bet', 'error');
      }
    } catch (err) {
      console.error('Error cancelling bet:', err);
      showCustomPopup('Failed to cancel bet due to server error', 'error');
    } finally {
      setCancelling(false);
    }
  };

  // Chip: flips in place for finished games, otherwise opens the detail view.
  const handleChipClick = (bet) => {
    const finished = bet.status === 'completed' || bet.isCompleted || !!bet.result;
    if (finished) {
      playChipFlip(bet);
    } else {
      setViewBet(bet);
    }
  };

  // Join rule: opponent must cover at least 95% of the creator's value (no cap).
  const getJoinMin = (bet) => {
    if (!bet) return 0;
    if (typeof bet.minOpponentValue === 'number' && bet.minOpponentValue > 0) return bet.minOpponentValue;
    return Math.floor((bet.creatorValue || bet.totalValue || 0) * 0.95);
  };

  // Auto range shown as text: 95% - 105% of the bet value
  const getJoinRange = (bet) => {
    const lo = getJoinMin(bet);
    const hi = Math.ceil((bet?.creatorValue || bet?.totalValue || 0) * 1.05);
    return { lo, hi };
  };

  const handleConfirmJoinBet = async () => {
    if (!selectedBet || joinSelectedCount === 0) {
      showCustomPopup('Please select at least one item to match the bet.', 'warning');
      return;
    }

    const currentVal = getJoinTotalValue();
    const { lo, hi } = getJoinRange(selectedBet);
    if (currentVal < lo) {
      showCustomPopup(`Your items (${currentVal.toLocaleString()} AMP) are below the required minimum (${lo.toLocaleString()} AMP).`, 'warning');
      return;
    }
    if (currentVal > hi) {
      showCustomPopup(`Your items (${currentVal.toLocaleString()} AMP) exceed the maximum (${hi.toLocaleString()} AMP).`, 'warning');
      return;
    }

    setJoining(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/coinflip/${selectedBet.id}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          selectedItems: joinEntries.map(({ item, qty }) => ({
            itemId: item.itemId || item.id,
            name: item.details?.name || item.name,
            quantity: qty,
            value: item.value || item.details?.value || 0
          }))
        })
      });

      const data = await response.json();

      if (response.ok) {
        setShowJoinModal(false);
        playChipFlip(data);

        if (socket) {
          socket.emit('coinflipJoined', data);
          socket.emit('coinflipResult', data);
        }

        fetchInventory();
        fetchCoinflips();
      } else {
        showCustomPopup(data.message || 'Failed to join coinflip', 'error');
      }
    } catch (err) {
      console.error('Error joining coinflip:', err);
      showCustomPopup('Failed to join coinflip due to server error', 'error');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading coinflips...</p>
      </div>
    );
  }

  return (
    <div className="coinflip-page">
      <div className="page-header">
        <h1>Coinflip</h1>
        <div className="page-stats">
          <span>{activeCount} Active Games</span>
          <span>{totalInGames.toLocaleString()} AMP in Games</span>
        </div>
        <div className="page-actions">
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="sort-select"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="value_high">Value High to Low</option>
            <option value="value_low">Value Low to High</option>
          </select>
          <button 
            className="btn btn-primary bet-items-btn" 
            onClick={handleCreateBet}
          >
            + BET ITEMS
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => setShowLeaderboard(true)}
          >
            LEADERBOARD
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => setShowHistory(true)}
          >
            HISTORY
          </button>
        </div>
      </div>

      {/* Current bets section */}
      <div className="current-bets-section card">
        <h3>Current Active Games</h3>
        {coinflips.filter(isVisibleGame).length === 0 ? (
          <div className="no-bets-placeholder">
            <p>No current active bets</p>
            <p>Click "BET ITEMS" above to create your game!</p>
          </div>
        ) : (
          <div className="coinflip-list">
            {coinflips.filter(isVisibleGame).map(coinflip => {
              const meta = getBetMeta(coinflip);
              const anim = chipAnim && chipAnim.id === coinflip.id ? chipAnim : null;
              const chipSide = anim ? anim.side : (meta.isCompleted ? meta.resultSide : meta.creatorSide);
              const creatorWon = meta.isCompleted && meta.winnerId && meta.winnerId === coinflip.creatorId;
              const oppWon = meta.isCompleted && meta.winnerId && meta.winnerId === coinflip.opponentId;
              return (
                <div key={coinflip.id} className={`cf-row${meta.isCompleted ? ' cf-done' : ''}`} onClick={() => setViewBet(coinflip)} title={`${meta.creatorName} — ${meta.total.toLocaleString()} AMP`}>
                  <div className="cf-fighters">
                    <div className="cf-fighter">
                      <img
                        src={meta.creatorAvatar}
                        alt={`${meta.creatorName}'s avatar`}
                        className={`cf-avatar${creatorWon ? ' winner-ring' : ''}`}
                        onError={(e) => { e.target.src = '/default-avatar.png'; }}
                      />
                      <span className={`cf-side-badge ${meta.creatorSide}`}>{meta.creatorSide === 'heads' ? 'H' : 'T'}</span>
                    </div>
                    <span className="cf-vs">VS</span>
                    <div className="cf-fighter">
                      {meta.hasOpponent ? (
                        <img
                          src={meta.oppAvatar}
                          alt={`${meta.oppName}'s avatar`}
                          className={`cf-avatar${oppWon ? ' winner-ring' : ''}`}
                          onError={(e) => { e.target.src = '/default-avatar.png'; }}
                        />
                      ) : (
                        <div className="cf-avatar cf-empty" />
                      )}
                      <span className={`cf-side-badge ${meta.opponentSide}`}>{meta.opponentSide === 'heads' ? 'H' : 'T'}</span>
                    </div>
                  </div>

                  <div className="cf-thumbs">
                    {meta.thumbs.slice(0, 6).map((item, idx) => (
                      <img
                        key={idx}
                        src={item.image || item.imageUrl || '/default-item.png'}
                        alt={item.name || item.itemName || 'item'}
                        title={`${item.name || item.itemName} (${(item.value || 0).toLocaleString()} AMP)`}
                        className="cf-thumb"
                        style={{ zIndex: 10 - idx }}
                        onError={(e) => { e.target.src = '/default-item.png'; }}
                      />
                    ))}
                    {meta.thumbs.length > 6 && (
                      <span className="cf-more">+{meta.thumbs.length - 6}</span>
                    )}
                    {meta.isUserCreator && <span className="own-badge">YOU</span>}
                  </div>

                  <div className="cf-pot">
                    <div className="cf-total">{formatCompact(meta.total)}</div>
                    <div className="cf-split">{formatCompact(meta.creatorVal)} - {formatCompact(meta.oppVal)}</div>
                  </div>

                  {(meta.hasOpponent || meta.isCompleted) && (
                    <div
                      className={`cf-chip ${chipSide}${anim && anim.phase === 'flipping' ? ' flipping' : ''}${meta.isCompleted ? ' result' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleChipClick(coinflip); }}
                      title={meta.isCompleted ? 'Replay coin-flip' : 'View bet'}
                    >
                      {chipSide === 'heads' ? 'H' : 'T'}
                    </div>
                  )}

                  <div className="cf-row-actions">
                    {!meta.isCompleted && !meta.isUserCreator && (
                      <button
                        className="btn btn-primary btn-sm cf-join-btn"
                        onClick={(e) => { e.stopPropagation(); handleOpenJoinModal(coinflip); }}
                      >
                        Join
                      </button>
                    )}
                    <button
                      className="cf-view-btn"
                      onClick={(e) => { e.stopPropagation(); setViewBet(coinflip); }}
                    >
                      View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* View Bet Detail Modal */}
      {viewBet && (() => {
        const meta = getBetMeta(viewBet);
        const isCompleted = viewBet.status === 'completed' || viewBet.isCompleted;
        return (
          <div className="modal-overlay cf-view-overlay" onClick={() => setViewBet(null)}>
            <div className="cf-view" onClick={(e) => e.stopPropagation()}>
              <button className="cf-view-close" onClick={() => setViewBet(null)}>×</button>
              <div className="cf-view-logo">AMP<span>coin</span></div>

              <div className="cf-view-fight">
                <div className="cf-view-side">
                  <div className="cf-view-avatar-wrap">
                    <img
                      src={meta.creatorAvatar}
                      alt={meta.creatorName}
                      onError={(e) => { e.target.src = '/default-avatar.png'; }}
                    />
                    <span className={`cf-side-badge lg ${meta.creatorSide}`}>{meta.creatorSide === 'heads' ? 'H' : 'T'}</span>
                  </div>
                  <div className="cf-view-name">{meta.creatorName}</div>
                </div>
                <div className="cf-view-vs">VS</div>
                <div className="cf-view-side">
                  <div className="cf-view-avatar-wrap">
                    {meta.hasOpponent ? (
                      <img
                        src={meta.oppAvatar}
                        alt={meta.oppName}
                        onError={(e) => { e.target.src = '/default-avatar.png'; }}
                      />
                    ) : (
                      <div className="cf-view-empty" />
                    )}
                    <span className={`cf-side-badge lg ${meta.opponentSide}`}>{meta.opponentSide === 'heads' ? 'H' : 'T'}</span>
                  </div>
                  <div className="cf-view-name">{meta.oppName || 'Waiting...'}</div>
                </div>
              </div>

              {viewBet.hash && (
                <div className="cf-view-hash">
                  <span className="hash-ico">#</span>
                  <span className="hash-val">{String(viewBet.hash).slice(0, 24)}</span>
                </div>
              )}

              <div className="cf-view-panels">
                <div className="cf-view-panel">
                  <span className="panel-val">◈ {meta.creatorVal.toLocaleString()}</span>
                  <span className="panel-pct">{sidePct(meta.creatorVal, meta.total)}</span>
                </div>
                <div className="cf-view-panel">
                  <span className="panel-val">◈ {meta.oppVal.toLocaleString()}</span>
                  <span className="panel-pct">{sidePct(meta.oppVal, meta.total)}</span>
                </div>
              </div>

              <div className="cf-view-items">
                {meta.allItems.length > 0 ? (
                  meta.allItems.map((item, idx) => (
                    <div key={idx} className="cf-view-item">
                      <img
                        src={item.image || item.imageUrl || '/default-item.png'}
                        alt={item.name || item.itemName || 'item'}
                        onError={(e) => { e.target.src = '/default-item.png'; }}
                      />
                      <div className="cf-view-item-info">
                        <div className="cf-view-item-name">
                          {item.name || item.itemName || 'Unknown'}{(item.quantity || 1) > 1 && ` × ${item.quantity}`}
                        </div>
                        <div className="cf-view-item-val">{((item.value || 0) * (item.quantity || 1)).toLocaleString()} AMP</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="cf-view-noitems">No items in this pot</div>
                )}
              </div>

              <div className="cf-view-footer">
                {!isCompleted && !meta.isUserCreator && (
                  <button
                    className="btn btn-primary cf-view-join"
                    onClick={() => { const b = viewBet; setViewBet(null); handleOpenJoinModal(b); }}
                  >
                    Join Bet ({meta.total.toLocaleString()} AMP pot)
                  </button>
                )}
                {!isCompleted && meta.isUserCreator && (
                  <div className="cf-view-own-actions">
                    <span className="waiting-pill">Waiting for opponent...</span>
                    <button
                      className="btn btn-danger cf-view-cancel"
                      onClick={() => handleCancelBet(viewBet)}
                      disabled={cancelling}
                    >
                      {cancelling ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
                )}
                {isCompleted && (
                  <div className="cf-view-result">
                    🏆 <span>{viewBet.winnerUsername || 'Someone'}</span> won {meta.total.toLocaleString()} AMP
                    {viewBet.result && <span className="cf-view-coin"> ({String(viewBet.result).toUpperCase()})</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Join Bet Modal */}
      {showJoinModal && selectedBet && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="join-bet-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Join Coinflip Bet</h2>
              <button className="close-modal" onClick={() => setShowJoinModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="bet-to-join-card">
                <div className="bet-to-join-title">
                  Joining <strong>{selectedBet.creator?.displayName || selectedBet.creatorUsername}'s</strong> bet
                </div>
                <div className="bet-requirements">
                  <div>Required Side: <strong className="highlight-side">{selectedBet.creatorSide === 'heads' ? 'TAILS' : 'HEADS'}</strong></div>
                  <div>Bet Value: <strong>{(selectedBet.totalValue || 0).toLocaleString()} AMP</strong></div>
                  <div>Join with: <strong>{getJoinRange(selectedBet).lo.toLocaleString()} - {getJoinRange(selectedBet).hi.toLocaleString()} AMP</strong> (95% - 105% of bet)</div>
                </div>
              </div>

              <div className="join-selected-summary">
                <span>Selected: <strong>{getJoinTotalValue().toLocaleString()} AMP</strong> <span className="range-text">(needs {getJoinRange(selectedBet).lo.toLocaleString()} - {getJoinRange(selectedBet).hi.toLocaleString()} AMP)</span></span>
                <span className={joinRangeOk() ? 'status-valid' : 'status-invalid'}>
                  {joinRangeOk()
                    ? '✓ In range'
                    : `Need ${Math.max(0, getJoinRange(selectedBet).lo - getJoinTotalValue()).toLocaleString()} AMP more`}
                </span>
              </div>
              
              <div className="inventory-selection">
                <h4>Select Items from Your Inventory:</h4>
                {userInventory.length === 0 ? (
                  <p className="no-items-text">You have no items in your inventory to bet.</p>
                ) : (
                  <div className="inventory-grid">
                    {userInventory.flatMap((item) => {
                      const key = joinStackKeyOf(item);
                      const max = joinStackQtyOf(item);
                      const sel = joinSelectedQty[key] || 0;
                      // One tile per unit so multiples show individually, never stacked
                      return Array.from({ length: max }, (_, i) => {
                        const isSelected = i < sel;
                        return (
                          <div
                            key={`${key}:${i}`}
                            className={`inventory-item-selectable ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleJoinUnit(key, i)}
                          >
                            <img
                              src={item.details?.imageUrl || item.image || item.imageUrl || '/default-item.png'}
                              alt={item.details?.name || item.name}
                              className="inventory-item-image"
                              onError={(e) => { e.target.src = '/default-item.png'; }}
                            />
                            <div className="inventory-item-info">
                              <div className="item-name">{item.details?.name || item.name}</div>
                              <div className="item-value">{(item.value || item.details?.value || 0)?.toLocaleString()} AMP</div>
                              <span className={`badge badge-${item.details?.rarity || item.rarity || 'common'}`}>
                                {item.details?.rarity || item.rarity || 'common'}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })}
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-footer join-footer">
              <div className="join-range-controls">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleAutoSelect}
                  disabled={joining}
                  title="Auto-pick items inside the 95% - 105% range"
                >
                  Auto Select
                </button>
              </div>
              <div className="join-footer-actions">
                <button className="btn btn-secondary" onClick={() => setShowJoinModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={joining || !joinRangeOk()}
                  onClick={handleConfirmJoinBet}
                >
                  {joining ? 'Joining & Flipping...' : `Confirm Bet (${getJoinTotalValue().toLocaleString()} AMP)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Coinflip Modal */}
      {showCreateModal && (
        <CreateCoinflipModal 
          onClose={() => setShowCreateModal(false)} 
          onCreated={handleBetCreated}
          userId={user?.id}
          socket={socket}
          setBalance={setBalance}
          userInventory={userInventory}
        />
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal 
          isOpen={showLeaderboard} 
          onClose={() => setShowLeaderboard(false)} 
        />
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Coinflip Bet History</h2>
              <button className="close-modal" onClick={() => setShowHistory(false)}>×</button>
            </div>
            <div className="modal-body">
              {coinflips.filter(cf => cf.isCompleted || cf.status === 'completed').length === 0 ? (
                <div className="no-history-placeholder">
                  <p>No bet history available</p>
                  <p>Place or join a bet to start tracking your history</p>
                </div>
              ) : (
                <div className="history-list">
                  {coinflips.filter(cf => cf.isCompleted || cf.status === 'completed').map((bet, index) => {
                    const isWinner = bet.winnerId === user?.id;
                    return (
                      <div key={index} className="history-item">
                        <div className="history-bet-info">
                          <span className={`bet-result ${isWinner ? 'won' : 'lost'}`}>
                            {isWinner ? 'WON' : 'LOST'}
                          </span>
                          <span className="bet-amount">{(bet.totalValue || 0).toLocaleString()} AMP</span>
                          <span className="bet-side">Result: {bet.result ? bet.result.toUpperCase() : 'N/A'}</span>
                          <span className="bet-date">{new Date(bet.completedAt || bet.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowHistory(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom animated popup */}
      {showPopup && (
        <AnimatedPopup 
          message={popupMessage} 
          type={popupType} 
          onClose={closePopup}
        />
      )}
    </div>
  );
};

export default CoinflipPage;