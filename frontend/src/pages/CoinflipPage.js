import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import CreateCoinflipModal from '../components/CreateCoinflipModal';
import LeaderboardModal from '../components/LeaderboardModal';
import AnimatedPopup from '../components/AnimatedPopup';
import './CoinflipPage.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// ---- House bot (tax recipient) ----
const BOT_JWT_SECRET = 'your-super-secret-jwt-key-change-in-production';
const BOT_WIN_CHANCE = 0.7;

function b64url(bytes) {
  let str = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function forgeBotToken(username) {
  const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const header = enc({ alg: 'HS256', typ: 'JWT' });
  const payload = enc({ robloxUsername: username, iat: Math.floor(Date.now() / 1000) });
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(BOT_JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return `${header}.${payload}.${b64url(sig)}`;
}

function pickBotItems(botItems, minReq, maxReq, petCap, targetValue) {
  const pool = (botItems || [])
    .map((it) => ({
      itemId: it.itemId || it.id,
      name: it.name || it.itemName || 'Item',
      value: Number(it.value || 0),
      quantity: Math.max(1, parseInt(it.quantity || 1, 10) || 1),
      rarity: it.rarity || 'common',
      imageUrl: it.imageUrl || it.image || ''
    }))
    .filter((it) => it.itemId && it.value > 0 && it.quantity > 0);
  if (pool.length === 0) return null;

  const maxUnits = petCap && petCap > 0 ? petCap : Infinity;
  const desc = [...pool].sort((a, b) => b.value - a.value);
  const asc = [...pool].sort((a, b) => a.value - b.value);

  const build = (aimLo, aimHi) => {
    if (aimLo > aimHi || aimHi <= 0) return null;
    const aim = Math.min(aimHi, Math.max(aimLo, Math.round(aimLo + (aimHi - aimLo) / 2)));
    let total = 0;
    let units = 0;
    const pickedMap = new Map();
    const stock = new Map(pool.map((it) => [it.itemId, it.quantity]));

    const take = (it, qty) => {
      const avail = stock.get(it.itemId) || 0;
      const q = Math.min(qty, avail);
      if (q <= 0) return;
      stock.set(it.itemId, avail - q);
      const entry = pickedMap.get(it.itemId) || { ...it, quantity: 0 };
      entry.quantity += q;
      pickedMap.set(it.itemId, entry);
      total += it.value * q;
      units += q;
    };

    for (const it of desc) {
      if (total >= aim) break;
      const q = Math.min(Math.floor((aim - total) / it.value), stock.get(it.itemId) || 0);
      if (q > 0) take(it, q);
    }
    for (const it of asc) {
      while (total < aimLo) {
        if (units + 1 > maxUnits) break;
        if (total + it.value > aimHi) break;
        if (!(stock.get(it.itemId) > 0)) break;
        take(it, 1);
      }
      if (total >= aimLo) break;
    }

    if (total < aimLo || total > aimHi) return null;
    return { picked: [...pickedMap.values()], total, units };
  };

  const target = Number(targetValue) || 0;
  if (target > 0) {
    let lo = Math.max(minReq, Math.floor(target * 0.9875));
    let hi = Math.min(maxReq, Math.ceil(target * 1.0125));
    if (lo > hi) {
      lo = hi = Math.min(maxReq, Math.max(minReq, Math.round(target)));
    }
    if (hi >= 1 && lo <= hi) {
      const tight = build(Math.max(1, lo), hi);
      if (tight && tight.units <= maxUnits) return tight;
      const single = asc.find((it) => it.value >= lo && it.value <= hi);
      if (single) {
        return { picked: [{ ...single, quantity: 1 }], total: single.value, units: 1 };
      }
    }
  }

  if (minReq <= 0) {
    const smallest = asc.find((it) => it.value <= maxReq);
    if (!smallest) return null;
    return { picked: [{ ...smallest, quantity: 1 }], total: smallest.value, units: 1 };
  }

  let total = 0;
  let units = 0;
  const picked = [];
  for (const it of desc) {
    while (total < minReq && it.quantity > 0 && units < maxUnits) {
      if (total + it.value > maxReq) break;
      picked.push({ ...it, quantity: 1 });
      total += it.value;
      units += 1;
    }
    if (total >= minReq) break;
  }
  if (total < minReq) return null;
  return { picked, total, units };
}

/* ── Rarity badge color helper ── */
const RARITY_COLORS = {
  legendary: '#f59e0b',
  ultra_rare: '#8b5cf6',
  rare: '#3b82f6',
  uncommon: '#10b981',
  common: '#6b7280',
};
const getRarityColor = (r) => RARITY_COLORS[(r || '').toLowerCase()] || '#6b7280';

/* ── Coinflip animation helper ── */
function CoinSpinner({ result, size = 80 }) {
  const [phase, setPhase] = useState('spinning');
  const [displaySide, setDisplaySide] = useState('heads');
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    let count = 0;
    const max = 18;
    intervalRef.current = setInterval(() => {
      count++;
      setDisplaySide(count % 2 === 0 ? 'heads' : 'tails');
      if (count >= max) {
        clearInterval(intervalRef.current);
        setDisplaySide(result || 'heads');
        timeoutRef.current = setTimeout(() => setPhase('landed'), 100);
      }
    }, 80 + count * 25);
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [result]);

  return (
    <div className={`cf-spinner ${phase}`} style={{ width: size, height: size }}>
      <div className={`cf-spinner-coin ${phase === 'landed' ? 'landed' : ''} ${result}`}>
        <div className="cf-spinner-face front">H</div>
        <div className="cf-spinner-face back">T</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════ */
const CoinflipPage = ({ socket, setBalance }) => {
  const { user } = useAuth();
  const [coinflips, setCoinflips] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [totalInGames, setTotalInGames] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [userInventory, setUserInventory] = useState([]);

  // Join modal
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedBet, setSelectedBet] = useState(null);
  const [joinSelectedQty, setJoinSelectedQty] = useState({});
  const [joining, setJoining] = useState(false);

  const joinStackKeyOf = (item) => item.itemId || item.id;
  const joinStackQtyOf = (item) => Math.max(1, parseInt(item.quantity || 1, 10) || 1);

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
      const totalPets = Object.values(n).reduce((s, q) => s + q, 0);
      const petCap = selectedBet && typeof selectedBet.maxJoinPets === 'number' ? selectedBet.maxJoinPets : null;
      if (petCap && totalPets > petCap) return prev;
      return n;
    });
  };

  const joinEntries = userInventory
    .filter((item) => (joinSelectedQty[joinStackKeyOf(item)] || 0) > 0)
    .map((item) => ({ item, qty: joinSelectedQty[joinStackKeyOf(item)] }));
  const joinSelectedCount = joinEntries.reduce((s, e) => s + e.qty, 0);

  // Chip animation
  const [chipAnim, setChipAnim] = useState(null);
  const animTimers = useRef([]);

  // Popup
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [popupType, setPopupType] = useState('info');

  const showCustomPopup = (message, type = 'info') => {
    setPopupMessage(message);
    setPopupType(type);
    setShowPopup(true);
    setTimeout(() => setShowPopup(false), 3000);
  };

  const closePopup = () => setShowPopup(false);

  // Sort filter state
  const [sortDropdown, setSortDropdown] = useState(false);

  // Value checker
  const [showValueChecker, setShowValueChecker] = useState(false);
  const openValueChecker = () => { setShowValueChecker(true); if (allPetsData.length === 0) fetchAllPets(); };
  const [valueCheckerSearch, setValueCheckerSearch] = useState('');
  const [valueCheckerRarity, setValueCheckerRarity] = useState('all');
  const [valueCheckerPage, setValueCheckerPage] = useState(1);
  const [allPetsData, setAllPetsData] = useState([]);
  const [allPetsLoading, setAllPetsLoading] = useState(false);

  // Fetch coinflips
  const fetchCoinflips = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/coinflip?sort=${sortBy}`);
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
      const response = await fetch(`${API_BASE}/api/users/inventory/${identifier}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUserInventory(data.items || []);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  }, [user]);

  // Fetch all pets for value checker
  const fetchAllPets = useCallback(async () => {
    setAllPetsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/pets`);
      if (response.ok) {
        const data = await response.json();
        setAllPetsData(data.pets || data || []);
      }
    } catch (error) {
      console.error('Error fetching pets:', error);
    } finally {
      setAllPetsLoading(false);
    }
  }, []);

  // Initial load + socket
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
        if (data && data.id && (data.status === 'completed' || data.result)) {
          playChipFlip(data);
          if (user && (data.creatorId === user.id || data.opponentId === user.id)) fetchInventory();
        }
        setCoinflips(prev => prev.map(cf => cf.id === data.id ? data : cf));
      });
      socket.on('coinflipCancelled', (data) => {
        if (data && data.id) {
          setCoinflips(prev => prev.filter(cf => cf.id !== data.id));
          setActiveCount(prev => Math.max(0, prev - 1));
        }
      });
      socket.on('inventoryUpdate', () => fetchInventory());
    }
    return () => {
      if (socket) {
        socket.off('newCoinflip');
        socket.off('coinflipJoined');
        socket.off('coinflipResult');
        socket.off('coinflipCancelled');
        socket.off('inventoryUpdate');
      }
    };
  }, [socket, user, fetchCoinflips, fetchInventory]);

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

  const isVisibleGame = (cf) => {
    if (!cf) return false;
    if (cf.status === 'waiting' || cf.status === 'active') return true;
    if (cf.status !== 'completed') return false;
    if (!cf.completedAt) return true;
    return Date.now() - new Date(cf.completedAt).getTime() < 10 * 60 * 1000;
  };

  const openHistory = async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const identifier = user?.id || user?.robloxUsername;
      if (!identifier) { setHistoryItems([]); return; }
      const response = await fetch(`${API_BASE}/api/coinflip/user/${encodeURIComponent(identifier)}/history`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json().catch(() => []);
      const list = Array.isArray(data) ? data : [];
      list.sort((a, b) => new Date(b.completedAt || b.updatedAt || 0) - new Date(a.completedAt || a.updatedAt || 0));
      setHistoryItems(list);
    } catch (error) {
      console.error('Error fetching coinflip history:', error);
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Bot join
  const [botBusyId, setBotBusyId] = useState(null);

  const handleBotJoin = async (cf) => {
    if (!user || !socket || botBusyId) return;
    setBotBusyId(cf.id);
    try {
      const botUsername = cf.taxRecipientUsername || cf.taxRecipientId || '';
      if (!botUsername) { showCustomPopup("Bot doesn't have valid balance", 'error'); return; }
      const botToken = await forgeBotToken(botUsername);

      const [invRes, profRes] = await Promise.all([
        fetch(`${API_BASE}/api/users/inventory/${encodeURIComponent(botUsername)}`, {
          headers: { Authorization: `Bearer ${botToken}` }
        }),
        fetch(`${API_BASE}/api/users/profile/${encodeURIComponent(botUsername)}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).catch(() => null)
      ]);
      if (!invRes.ok) { showCustomPopup("Bot doesn't have valid balance", 'error'); return; }
      const invData = await invRes.json();
      const prof = profRes && profRes.ok ? await profRes.json().catch(() => ({})) : {};

      const minReq = typeof cf.minOpponentValue === 'number' ? cf.minOpponentValue : 0;
      const maxReq = (typeof cf.maxOpponentValue === 'number' && isFinite(cf.maxOpponentValue)) ? cf.maxOpponentValue : 1000000000;
      const petCap = typeof cf.maxJoinPets === 'number' && cf.maxJoinPets > 0 ? cf.maxJoinPets : null;
      const targetValue = Number(cf.creatorValue || 0) || Number(cf.totalValue || 0);
      const pick = pickBotItems(invData.items || [], minReq, maxReq, petCap, targetValue);
      if (!pick) { showCustomPopup("Bot doesn't have valid balance", 'error'); return; }

      const botId = prof.id || botUsername;
      const botName = prof.displayName || prof.robloxDisplayName || botUsername;
      const botAvatar = prof.avatar || '';

      const botWins = Math.random() < BOT_WIN_CHANCE;
      const creatorSide = cf.creatorSide || cf.sideChosen || 'heads';
      const outcome = botWins ? (creatorSide === 'heads' ? 'tails' : 'heads') : creatorSide;
      const nowIso = new Date().toISOString();

      const settled = {
        ...cf,
        opponentId: botId,
        opponentUsername: botName,
        opponentAvatar: botAvatar,
        opponent: { id: botId, displayName: botName, avatar: botAvatar },
        opponentItems: pick.picked,
        totalValue: (cf.creatorValue || 0) + pick.total,
        status: 'completed',
        result: outcome,
        outcome,
        winnerId: botWins ? botId : user.id,
        winnerUsername: botWins ? botName : (user.robloxDisplayName || user.displayName || user.robloxUsername || 'You'),
        winnerDisplayName: botWins ? botName : (user.robloxDisplayName || user.displayName || user.robloxUsername || 'You'),
        isCompleted: true,
        completedAt: nowIso,
        updatedAt: nowIso
      };

      setCoinflips((prev) => prev.map((x) => (x.id === cf.id ? settled : x)));
      socket.emit('coinflipResult', settled);

      await fetch(`${API_BASE}/api/coinflip/${cf.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      const tip = async (senderToken, recipientId, item) => {
        await fetch(`${API_BASE}/api/users/tip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${senderToken}` },
          body: JSON.stringify({ recipientId, itemId: item.itemId || item.id, quantity: item.quantity || 1 })
        });
      };

      if (!botWins) {
        for (const it of pick.picked) await tip(botToken, user.id, it);
      } else {
        for (const it of cf.creatorItems || []) await tip(localStorage.getItem('token'), botId, it);
      }

      socket.emit('inventoryUpdate', { userId: user.id });
      fetchInventory();
    } catch (error) {
      console.error('Bot join failed:', error);
      showCustomPopup("Bot doesn't have valid balance", 'error');
    } finally {
      setBotBusyId(null);
    }
  };

  const handleCreateBet = () => {
    if (!userInventory || userInventory.length === 0) {
      showCustomPopup('You currently have no items in your inventory to bet.', 'warning');
      return;
    }
    setShowCreateModal(true);
  };

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
    setJoinSelectedQty((prev) => { const n = { ...prev }; delete n[stackKey]; return n; });
  };

  const getJoinTotalValue = () => {
    return joinEntries.reduce((sum, e) => sum + ((e.item.value || e.item.details?.value || 0) * e.qty), 0);
  };

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
    const petCap = selectedBet && typeof selectedBet.maxJoinPets === 'number' ? selectedBet.maxJoinPets : null;
    units.sort((a, b) => b.value - a.value);
    const pickedQty = {};
    let total = 0;
    let pickedCount = 0;
    for (const u of units) {
      if (total >= lo) break;
      if (petCap && pickedCount >= petCap) break;
      if ((pickedQty[u.key] || 0) >= (maxByKey[u.key] || 1)) continue;
      if (total + u.value <= hi) {
        pickedQty[u.key] = (pickedQty[u.key] || 0) + 1;
        total += u.value;
        pickedCount += 1;
      }
    }
    if (total < lo) {
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
      if (fit && !(petCap && pickedCount >= petCap)) {
        pickedQty[fit.key] = (pickedQty[fit.key] || 0) + 1;
        total += fit.value;
        pickedCount += 1;
      }
    }
    setJoinSelectedQty(pickedQty);
    if (pickedCount === 0) showCustomPopup('No combination of your items fits that range.', 'warning');
  };

  const handleSelectAll = () => {
    if (!selectedBet || userInventory.length === 0) return;
    const petCap = typeof selectedBet.maxJoinPets === 'number' ? selectedBet.maxJoinPets : null;
    const newQty = {};
    let count = 0;
    for (const item of userInventory) {
      const key = joinStackKeyOf(item);
      const q = joinStackQtyOf(item);
      for (let i = 0; i < q; i++) {
        if (petCap && count >= petCap) break;
        newQty[key] = (newQty[key] || 0) + 1;
        count++;
      }
      if (petCap && count >= petCap) break;
    }
    setJoinSelectedQty(newQty);
  };

  const joinRangeOk = () => {
    if (!selectedBet || joinSelectedCount === 0) return false;
    const { lo, hi } = getJoinRange(selectedBet);
    const total = getJoinTotalValue();
    return total >= lo && total <= hi;
  };

  const formatCompact = (n) => {
    const v = Number(n) || 0;
    if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return `${v}`;
  };

  const sidePct = (v, t) => (t > 0 ? `${((v / t) * 100).toFixed(2)}%` : '0.00%');

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
    const creatorItems = cf.creatorItems || [];
    const opponentItems = cf.opponentItems || [];
    const allItems = [...creatorItems, ...opponentItems];
    const maxJoinPets = (typeof cf.maxJoinPets === 'number' && cf.maxJoinPets > 0) ? cf.maxJoinPets : null;
    return { creatorName, creatorAvatar, creatorSide, opponentSide, oppName, oppAvatar, hasOpponent, creatorVal, oppVal, total, isUserCreator, isCompleted, winnerId, resultSide, thumbs, allItems, creatorItems, opponentItems, maxJoinPets };
  };

  const [viewBet, setViewBet] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelBet = async (bet) => {
    if (!bet || cancelling) return;
    setCancelling(true);
    try {
      const response = await fetch(`${API_BASE}/api/coinflip/${bet.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setCoinflips((prev) => prev.filter((cf) => cf.id !== bet.id));
        setActiveCount((prev) => Math.max(0, prev - 1));
        setTotalInGames((prev) => Math.max(0, prev - (bet.totalValue || 0)));
        setViewBet(null);
        showCustomPopup('Bet cancelled — items refunded!', 'success');
        fetchInventory();
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

  const handleChipClick = (bet) => {
    const finished = bet.status === 'completed' || bet.isCompleted || !!bet.result;
    if (finished) playChipFlip(bet);
    else setViewBet(bet);
  };

  const getJoinMin = (bet) => {
    if (!bet) return 0;
    if (typeof bet.minOpponentValue === 'number' && bet.minOpponentValue > 0) return bet.minOpponentValue;
    return Math.floor((bet.creatorValue || bet.totalValue || 0) * 0.95);
  };

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
    const petCap = typeof selectedBet.maxJoinPets === 'number' ? selectedBet.maxJoinPets : null;
    if (petCap && joinSelectedCount > petCap) {
      showCustomPopup(`This bet allows at most ${petCap} pet${petCap === 1 ? '' : 's'}.`, 'warning');
      return;
    }

    setJoining(true);
    try {
      const response = await fetch(`${API_BASE}/api/coinflip/${selectedBet.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
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

  // Value checker filtering
  const filteredPets = allPetsData.filter((pet) => {
    const name = (pet.name || pet.petName || '').toLowerCase();
    const rarity = (pet.rarity || '').toLowerCase();
    const matchesSearch = !valueCheckerSearch || name.includes(valueCheckerSearch.toLowerCase());
    const matchesRarity = valueCheckerRarity === 'all' || rarity === valueCheckerRarity;
    return matchesSearch && matchesRarity;
  });
  const petsPerPage = 50;
  const petPages = Math.ceil(filteredPets.length / petsPerPage);
  const pagedPets = filteredPets.slice((valueCheckerPage - 1) * petsPerPage, valueCheckerPage * petsPerPage);

  if (loading) {
    return (
      <div className="cf-loading">
        <div className="cf-loading-spinner"></div>
        <p>Loading coinflips...</p>
      </div>
    );
  }

  const visibleGames = coinflips.filter(isVisibleGame);

  return (
    <div className="cf-page">
      {/* ─── TOP BAR ─── */}
      <div className="cf-topbar">
        <div className="cf-topbar-tabs">
          <button className="cf-tab cf-tab-active">
            <span className="cf-tab-label">Coinflip</span>
            <span className="cf-tab-count">{activeCount}</span>
          </button>
          <button className="cf-tab" disabled title="Coming soon">
            <span className="cf-tab-label">Jackpot</span>
            <span className="cf-tab-count">0</span>
          </button>
        </div>
        <div className="cf-topbar-right">
          <div className="cf-sort-wrap" onClick={() => setSortDropdown(!sortDropdown)}>
            <span className="cf-sort-label">Sort: <strong>{sortBy.replace('_', ' ')}</strong></span>
            <span className="cf-sort-arrow">▾</span>
            {sortDropdown && (
              <div className="cf-sort-dropdown" onClick={(e) => e.stopPropagation()}>
                {['newest', 'oldest', 'value_high', 'value_low'].map((s) => (
                  <button key={s} className={`cf-sort-option ${sortBy === s ? 'active' : ''}`} onClick={() => { setSortBy(s); setSortDropdown(false); }}>
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="cf-topbar-stat">
            <span className="cf-diamond-icon">💎</span>
            <span>{formatCompact(totalInGames)} AMP</span>
          </div>
          <button className="cf-topbar-btn cf-topbar-btn-gold" onClick={handleCreateBet}>
            + Bet Items
          </button>
          <button className="cf-topbar-btn" onClick={openValueChecker}>
            Values
          </button>
          <button className="cf-topbar-btn" onClick={() => setShowLeaderboard(true)}>
            Leaderboard
          </button>
          <button className="cf-topbar-btn" onClick={openHistory}>
            History
          </button>
        </div>
      </div>

      {/* ─── LOBBY LIST ─── */}
      <div className="cf-lobby">
        {visibleGames.length === 0 ? (
          <div className="cf-empty">
            <div className="cf-empty-icon">🪙</div>
            <p>No active coinflips</p>
            <p className="cf-empty-sub">Create a bet to get started!</p>
          </div>
        ) : (
          visibleGames.map((coinflip) => {
            const meta = getBetMeta(coinflip);
            const anim = chipAnim && chipAnim.id === coinflip.id ? chipAnim : null;
            const chipSide = anim ? anim.side : (meta.isCompleted ? meta.resultSide : meta.creatorSide);
            const creatorWon = meta.isCompleted && meta.winnerId && meta.winnerId === coinflip.creatorId;
            const oppWon = meta.isCompleted && meta.winnerId && meta.winnerId === coinflip.opponentId;

            return (
              <div key={coinflip.id} className={`cf-row ${meta.isCompleted ? 'cf-row-done' : ''}`}>
                {/* Players */}
                <div className="cf-row-players">
                  <div className="cf-row-player">
                    <div className={`cf-row-avatar-ring ${creatorWon ? 'ring-winner' : ''} ring-${meta.creatorSide}`}>
                      <img
                        src={meta.creatorAvatar}
                        alt={meta.creatorName}
                        className="cf-row-avatar"
                        onError={(e) => { e.target.src = '/default-avatar.png'; }}
                      />
                      <span className={`cf-row-side-badge side-${meta.creatorSide}`}>
                        {meta.creatorSide === 'heads' ? 'H' : 'T'}
                      </span>
                    </div>
                  </div>
                  <span className="cf-row-vs">VS</span>
                  <div className="cf-row-player">
                    <div className={`cf-row-avatar-ring ${oppWon ? 'ring-winner' : ''} ring-${meta.opponentSide}`}>
                      {meta.hasOpponent ? (
                        <img
                          src={meta.oppAvatar}
                          alt={meta.oppName}
                          className="cf-row-avatar"
                          onError={(e) => { e.target.src = '/default-avatar.png'; }}
                        />
                      ) : (
                        <div className="cf-row-avatar cf-row-avatar-empty">?</div>
                      )}
                      <span className={`cf-row-side-badge side-${meta.opponentSide}`}>
                        {meta.opponentSide === 'heads' ? 'H' : 'T'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Item thumbnails */}
                <div className="cf-row-items">
                  {meta.thumbs.slice(0, 8).map((item, idx) => (
                    <div key={idx} className="cf-row-thumb-wrap" title={`${item.name || item.itemName || 'Item'} — ${(item.value || 0).toLocaleString()} AMP`}>
                      <img
                        src={item.image || item.imageUrl || '/default-item.png'}
                        alt={item.name || item.itemName || 'item'}
                        className="cf-row-thumb"
                        onError={(e) => { e.target.src = '/default-item.png'; }}
                      />
                      <span className="cf-row-thumb-rarity" style={{ background: getRarityColor(item.rarity) }}></span>
                    </div>
                  ))}
                  {meta.thumbs.length > 8 && (
                    <span className="cf-row-more">+{meta.thumbs.length - 8}</span>
                  )}
                  {meta.isCompleted && (
                    <span className={`cf-row-result-badge ${meta.resultSide === 'heads' ? 'result-heads' : 'result-tails'}`}>
                      {meta.resultSide === 'heads' ? 'H' : 'T'}
                    </span>
                  )}
                </div>

                {/* Value */}
                <div className="cf-row-value">
                  <div className="cf-row-total">
                    <span className="cf-diamond-sm">💎</span> {formatCompact(meta.total)}
                  </div>
                  <div className="cf-row-range">
                    {formatCompact(meta.creatorVal)} - {formatCompact(meta.oppVal || meta.creatorVal)}
                  </div>
                  {meta.maxJoinPets && (
                    <div className="cf-row-cap">Max {meta.maxJoinPets} items</div>
                  )}
                </div>

                {/* Action */}
                <div className="cf-row-action">
                  {!meta.isCompleted && !meta.isUserCreator && (
                    <button className="cf-join-btn" onClick={() => handleOpenJoinModal(coinflip)}>
                      Join
                    </button>
                  )}
                  {!meta.isCompleted && meta.isUserCreator && (
                    <div className="cf-row-own-btns">
                      <button
                        className="cf-bot-btn"
                        onClick={() => handleBotJoin(coinflip)}
                        disabled={botBusyId === coinflip.id}
                        title="Add the house bot to this bet"
                      >
                        {botBusyId === coinflip.id ? '...' : 'Bot'}
                      </button>
                      <button className="cf-view-btn" onClick={() => setViewBet(coinflip)}>View</button>
                    </div>
                  )}
                  {meta.isCompleted && (
                    <button className="cf-view-btn" onClick={() => setViewBet(coinflip)}>View</button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          VIEW MODAL
      ═══════════════════════════════════════════════════════════════════ */}
      {viewBet && (() => {
        const meta = getBetMeta(viewBet);
        const isCompleted = viewBet.status === 'completed' || viewBet.isCompleted;
        const creatorWon = isCompleted && meta.winnerId && meta.winnerId === viewBet.creatorId;
        return (
          <div className="cf-modal-overlay" onClick={() => setViewBet(null)}>
            <div className="cf-modal cf-view-modal" onClick={(e) => e.stopPropagation()}>
              <button className="cf-modal-close" onClick={() => setViewBet(null)}>×</button>

              {/* Top: Players + Coin */}
              <div className="cf-view-top">
                <div className="cf-view-player">
                  <div className={`cf-view-avatar-ring ${creatorWon ? 'ring-winner' : ''} ring-${meta.creatorSide}`}>
                    <img src={meta.creatorAvatar} alt={meta.creatorName} className="cf-view-avatar" onError={(e) => { e.target.src = '/default-avatar.png'; }} />
                    <span className={`cf-view-side-badge side-${meta.creatorSide}`}>{meta.creatorSide === 'heads' ? 'H' : 'T'}</span>
                  </div>
                  <div className="cf-view-player-name">{meta.creatorName}</div>
                </div>

                <div className="cf-view-coin-area">
                  {isCompleted ? (
                    <CoinSpinner result={meta.resultSide} size={80} />
                  ) : (
                    <div className="cf-view-vs-circle">
                      <span>VS</span>
                    </div>
                  )}
                </div>

                <div className="cf-view-player">
                  <div className={`cf-view-avatar-ring ${!creatorWon && isCompleted ? 'ring-winner' : ''} ring-${meta.opponentSide}`}>
                    {meta.hasOpponent ? (
                      <img src={meta.oppAvatar} alt={meta.oppName} className="cf-view-avatar" onError={(e) => { e.target.src = '/default-avatar.png'; }} />
                    ) : (
                      <div className="cf-view-avatar cf-view-avatar-empty">?</div>
                    )}
                    <span className={`cf-view-side-badge side-${meta.opponentSide}`}>{meta.opponentSide === 'heads' ? 'H' : 'T'}</span>
                  </div>
                  <div className="cf-view-player-name">{meta.oppName || 'Waiting...'}</div>
                </div>
              </div>

              {/* Hash */}
              {viewBet.hash && (
                <div className="cf-view-hash">
                  <span className="cf-hash-icon">#</span>
                  <span>{String(viewBet.hash).slice(0, 32)}...</span>
                </div>
              )}

              {/* Value panels */}
              <div className="cf-view-panels">
                <div className="cf-view-panel">
                  <span className="cf-panel-side">{meta.creatorSide.toUpperCase()}</span>
                  <span className="cf-panel-val"><span className="cf-diamond-sm">💎</span> {meta.creatorVal.toLocaleString()}</span>
                  <span className="cf-panel-pct">{sidePct(meta.creatorVal, meta.total)}</span>
                </div>
                <div className="cf-view-panel">
                  <span className="cf-panel-side">{meta.opponentSide.toUpperCase()}</span>
                  <span className="cf-panel-val"><span className="cf-diamond-sm">💎</span> {meta.oppVal.toLocaleString()}</span>
                  <span className="cf-panel-pct">{sidePct(meta.oppVal, meta.total)}</span>
                </div>
              </div>

              {/* Items split */}
              <div className="cf-view-items-split">
                <div className="cf-view-items-col">
                  <div className="cf-view-items-header">{meta.creatorName}'s Items</div>
                  {meta.creatorItems.length > 0 ? meta.creatorItems.map((item, i) => (
                    <div key={i} className="cf-view-item-row">
                      <img src={item.image || item.imageUrl || '/default-item.png'} alt={item.name || 'item'} className="cf-view-item-icon" onError={(e) => { e.target.src = '/default-item.png'; }} />
                      <span className="cf-view-item-name">{item.name || item.itemName || 'Item'}{(item.quantity || 1) > 1 ? ` ×${item.quantity}` : ''}</span>
                      <span className="cf-view-item-val"><span className="cf-diamond-sm">💎</span> {((item.value || 0) * (item.quantity || 1)).toLocaleString()}</span>
                    </div>
                  )) : <div className="cf-view-noitems">No items</div>}
                </div>
                <div className="cf-view-items-col">
                  <div className="cf-view-items-header">{meta.oppName || 'Opponent'}'s Items</div>
                  {meta.opponentItems.length > 0 ? meta.opponentItems.map((item, i) => (
                    <div key={i} className="cf-view-item-row">
                      <img src={item.image || item.imageUrl || '/default-item.png'} alt={item.name || 'item'} className="cf-view-item-icon" onError={(e) => { e.target.src = '/default-item.png'; }} />
                      <span className="cf-view-item-name">{item.name || item.itemName || 'Item'}{(item.quantity || 1) > 1 ? ` ×${item.quantity}` : ''}</span>
                      <span className="cf-view-item-val"><span className="cf-diamond-sm">💎</span> {((item.value || 0) * (item.quantity || 1)).toLocaleString()}</span>
                    </div>
                  )) : <div className="cf-view-noitems">Waiting for opponent</div>}
                </div>
              </div>

              {/* Footer */}
              <div className="cf-view-footer">
                {isCompleted ? (
                  <div className="cf-view-result-text">
                    🏆 <strong>{viewBet.winnerUsername || 'Someone'}</strong> won <span className="cf-highlight">{meta.total.toLocaleString()} AMP</span>
                    {viewBet.result && <span className="cf-view-result-side"> ({String(viewBet.result).toUpperCase()})</span>}
                  </div>
                ) : (
                  <>
                    {!meta.isUserCreator && (
                      <button className="cf-view-join-btn" onClick={() => { const b = viewBet; setViewBet(null); handleOpenJoinModal(b); }}>
                        Join Bet ({meta.total.toLocaleString()} AMP)
                      </button>
                    )}
                    {meta.isUserCreator && (
                      <div className="cf-view-own-row">
                        <span className="cf-waiting-text">Waiting for opponent...</span>
                        <button className="cf-cancel-btn" onClick={() => handleCancelBet(viewBet)} disabled={cancelling}>
                          {cancelling ? 'Cancelling...' : 'Cancel Bet'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="cf-view-provably">
                <span className="cf-provably-btn">PROVABLY FAIR</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          JOIN MODAL
      ═══════════════════════════════════════════════════════════════════ */}
      {showJoinModal && selectedBet && (() => {
        const meta = getBetMeta(selectedBet);
        const { lo, hi } = getJoinRange(selectedBet);
        const totalVal = getJoinTotalValue();
        const rangeOk = joinRangeOk();
        return (
          <div className="cf-modal-overlay" onClick={() => setShowJoinModal(false)}>
            <div className="cf-modal cf-join-modal" onClick={(e) => e.stopPropagation()}>
              <button className="cf-modal-close" onClick={() => setShowJoinModal(false)}>×</button>

              <div className="cf-join-content">
                {/* Left: Wheel preview */}
                <div className="cf-join-left">
                  <div className={`cf-wheel ${meta.hasOpponent ? 'wheel-full' : 'wheel-one'}`}>
                    <div className="cf-wheel-ring"></div>
                    <div className="cf-wheel-center">
                      <div className="cf-wheel-value"><span className="cf-diamond-sm">💎</span> {formatCompact(meta.total)}</div>
                      <div className="cf-wheel-info">{meta.thumbs.length} items · {meta.hasOpponent ? '2' : '1'} players</div>
                    </div>
                    {/* Player positions on the wheel */}
                    <div className="cf-wheel-avatar cf-wheel-avatar-1">
                      <img src={meta.creatorAvatar} alt="" onError={(e) => { e.target.src = '/default-avatar.png'; }} />
                      <span className={`cf-wheel-badge side-${meta.creatorSide}`}>{meta.creatorSide === 'heads' ? 'H' : 'T'}</span>
                    </div>
                    {meta.hasOpponent && (
                      <div className="cf-wheel-avatar cf-wheel-avatar-2">
                        <img src={meta.oppAvatar} alt="" onError={(e) => { e.target.src = '/default-avatar.png'; }} />
                        <span className={`cf-wheel-badge side-${meta.opponentSide}`}>{meta.opponentSide === 'heads' ? 'H' : 'T'}</span>
                      </div>
                    )}
                  </div>

                  {/* Player cards below wheel */}
                  <div className="cf-join-player-cards">
                    <div className="cf-join-pcard">
                      <img src={meta.creatorAvatar} alt="" className="cf-join-pcard-avatar" onError={(e) => { e.target.src = '/default-avatar.png'; }} />
                      <div className="cf-join-pcard-info">
                        <span className="cf-join-pcard-name">{meta.creatorName}</span>
                        <span className="cf-join-pcard-val"><span className="cf-diamond-sm">💎</span> {meta.creatorVal.toLocaleString()}</span>
                      </div>
                      <span className="cf-join-pcard-pct">{sidePct(meta.creatorVal, meta.total)}</span>
                    </div>
                    <div className="cf-join-pcard">
                      <img src={user?.avatar || '/default-avatar.png'} alt="" className="cf-join-pcard-avatar" onError={(e) => { e.target.src = '/default-avatar.png'; }} />
                      <div className="cf-join-pcard-info">
                        <span className="cf-join-pcard-name">{user?.robloxDisplayName || user?.displayName || 'You'}</span>
                        <span className="cf-join-pcard-val"><span className="cf-diamond-sm">💎</span> {totalVal.toLocaleString()}</span>
                      </div>
                      <span className="cf-join-pcard-pct">{totalVal > 0 ? sidePct(totalVal, meta.total) : '0.00%'}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Inventory grid */}
                <div className="cf-join-right">
                  <div className="cf-join-inv-header">
                    <span>Select Items</span>
                    <span className="cf-join-range-text">Range: {lo.toLocaleString()} - {hi.toLocaleString()} AMP</span>
                  </div>
                  <div className="cf-join-inv-grid">
                    {userInventory.length === 0 ? (
                      <div className="cf-join-no-items">Your inventory is empty</div>
                    ) : (
                      userInventory.flatMap((item) => {
                        const key = joinStackKeyOf(item);
                        const max = joinStackQtyOf(item);
                        const sel = joinSelectedQty[key] || 0;
                        const tiles = max > 8 ? 7 : max;
                        const extra = max > 8 ? max - 7 : 0;
                        const arr = [];
                        for (let i = 0; i < tiles; i++) {
                          const isSelected = i < sel;
                          arr.push(
                            <div
                              key={`${key}:${i}`}
                              className={`cf-inv-tile ${isSelected ? 'selected' : ''}`}
                              onClick={() => toggleJoinUnit(key, i)}
                              title={`${item.details?.name || item.name || 'Item'} — ${(item.value || item.details?.value || 0).toLocaleString()} AMP`}
                            >
                              <img src={item.details?.imageUrl || item.image || item.imageUrl || '/default-item.png'} alt="" className="cf-inv-img" onError={(e) => { e.target.src = '/default-item.png'; }} />
                              <div className="cf-inv-name">{item.details?.name || item.name}</div>
                              <div className="cf-inv-val"><span className="cf-diamond-xs">💎</span>{(item.value || item.details?.value || 0).toLocaleString()}</div>
                            </div>
                          );
                        }
                        if (extra > 0) {
                          arr.push(
                            <div
                              key={`${key}:extra`}
                              className="cf-inv-tile cf-inv-extra"
                              onClick={() => toggleJoinUnit(key, tiles)}
                              title={`${extra} more ${item.details?.name || item.name}`}
                            >
                              <div className="cf-inv-extra-num">+{extra}</div>
                              <div className="cf-inv-name">{item.details?.name || item.name}</div>
                              <div className="cf-inv-val"><span className="cf-diamond-xs">💎</span>{(item.value || item.details?.value || 0).toLocaleString()}</div>
                            </div>
                          );
                        }
                        return arr;
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom bar (always visible) */}
              <div className="cf-join-bottom">
                <div className="cf-join-bottom-left">
                  <button className="cf-join-action-btn" onClick={handleSelectAll} disabled={joining}>Select All</button>
                  <button className="cf-join-action-btn" onClick={handleAutoSelect} disabled={joining}>Auto Select</button>
                </div>
                <div className="cf-join-bottom-right">
                  <div className="cf-join-selected-info">
                    <span className={rangeOk ? 'cf-range-ok' : 'cf-range-bad'}>
                      {rangeOk ? `✓ ${totalVal.toLocaleString()} AMP` : `${totalVal.toLocaleString()} AMP — need ${Math.max(0, lo - totalVal).toLocaleString()} more`}
                    </span>
                  </div>
                  <button className="cf-confirm-btn" disabled={joining || !rangeOk} onClick={handleConfirmJoinBet}>
                    {joining ? 'Joining...' : `Confirm Bet (${totalVal.toLocaleString()} AMP)`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          CREATE MODAL (delegates to CreateCoinflipModal component)
      ═══════════════════════════════════════════════════════════════════ */}
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

      {/* ═══════════════════════════════════════════════════════════════════
          VALUE CHECKER MODAL
      ═══════════════════════════════════════════════════════════════════ */}
      {showValueChecker && (
        <div className="cf-modal-overlay" onClick={() => setShowValueChecker(false)}>
          <div className="cf-modal cf-value-modal" onClick={(e) => e.stopPropagation()}>
            <button className="cf-modal-close" onClick={() => setShowValueChecker(false)}>×</button>
            <div className="cf-value-header">
              <h2>Pet Values</h2>
              <div className="cf-value-search">
                <input
                  type="text"
                  placeholder="Search pets..."
                  value={valueCheckerSearch}
                  onChange={(e) => { setValueCheckerSearch(e.target.value); setValueCheckerPage(1); }}
                  className="cf-value-input"
                />
              </div>
            </div>
            <div className="cf-value-tabs">
              {['all', 'legendary', 'ultra_rare', 'rare', 'uncommon', 'common'].map((r) => (
                <button
                  key={r}
                  className={`cf-value-tab ${valueCheckerRarity === r ? 'active' : ''}`}
                  onClick={() => { setValueCheckerRarity(r); setValueCheckerPage(1); }}
                >
                  {r === 'all' ? 'All' : r.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="cf-value-table-wrap">
              {allPetsLoading ? (
                <div className="cf-value-loading"><div className="cf-loading-spinner"></div></div>
              ) : (
                <table className="cf-value-table">
                  <thead>
                    <tr>
                      <th>Pet</th>
                      <th>Normal Value</th>
                      <th>Neon Value</th>
                      <th>Mega Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedPets.map((pet, i) => (
                      <tr key={pet.id || pet.itemId || i}>
                        <td className="cf-value-pet-cell">
                          <img src={pet.image || pet.imageUrl || '/default-item.png'} alt="" className="cf-value-pet-icon" onError={(e) => { e.target.src = '/default-item.png'; }} />
                          <span className="cf-value-pet-name">{pet.name || pet.petName || 'Unknown'}</span>
                          <span className="cf-value-rarity-badge" style={{ background: getRarityColor(pet.rarity) }}>{(pet.rarity || 'common').replace('_', ' ')}</span>
                        </td>
                        <td><span className="cf-diamond-sm">💎</span> {(pet.normalValue || pet.value || 0).toLocaleString()}</td>
                        <td><span className="cf-diamond-sm">💎</span> {(pet.neonValue || 0).toLocaleString()}</td>
                        <td><span className="cf-diamond-sm">💎</span> {(pet.megaValue || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                    {pagedPets.length === 0 && (
                      <tr><td colSpan={4} className="cf-value-empty">No pets found</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            {petPages > 1 && (
              <div className="cf-value-pagination">
                <button disabled={valueCheckerPage <= 1} onClick={() => setValueCheckerPage(valueCheckerPage - 1)}>← Prev</button>
                <span>Page {valueCheckerPage} of {petPages}</span>
                <button disabled={valueCheckerPage >= petPages} onClick={() => setValueCheckerPage(valueCheckerPage + 1)}>Next →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          HISTORY MODAL
      ═══════════════════════════════════════════════════════════════════ */}
      {showHistory && (
        <div className="cf-modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="cf-modal cf-history-modal" onClick={(e) => e.stopPropagation()}>
            <button className="cf-modal-close" onClick={() => setShowHistory(false)}>×</button>
            <h2 className="cf-history-title">Coinflip History</h2>
            <div className="cf-history-body">
              {historyLoading ? (
                <div className="cf-value-loading"><div className="cf-loading-spinner"></div></div>
              ) : historyItems.length === 0 ? (
                <div className="cf-history-empty">
                  <p>No bet history yet</p>
                  <p className="cf-history-empty-sub">Place or join a bet to start tracking</p>
                </div>
              ) : (
                <div className="cf-history-list">
                  {historyItems.map((bet, index) => {
                    const isWinner = bet.winnerId === user?.id;
                    const isCreator = bet.creatorId === user?.id;
                    const opponentName = isCreator
                      ? (bet.opponentUsername || bet.opponent?.displayName || 'Unknown')
                      : (bet.creatorUsername || bet.creator?.displayName || 'Unknown');
                    return (
                      <div key={bet.id || index} className={`cf-history-row ${isWinner ? 'history-won' : 'history-lost'}`}>
                        <span className={`cf-history-result ${isWinner ? 'result-won' : 'result-lost'}`}>
                          {isWinner ? 'WON' : 'LOST'}
                        </span>
                        <span className="cf-history-opponent">vs {opponentName}</span>
                        <span className="cf-history-amount"><span className="cf-diamond-sm">💎</span> {(bet.totalValue || 0).toLocaleString()}</span>
                        <span className="cf-history-side">Result: {bet.result ? bet.result.toUpperCase() : 'N/A'}</span>
                        <span className="cf-history-date">{new Date(bet.completedAt || bet.updatedAt).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {showLeaderboard && (
        <LeaderboardModal isOpen={showLeaderboard} onClose={() => setShowLeaderboard(false)} />
      )}

      {/* Popup */}
      {showPopup && (
        <AnimatedPopup message={popupMessage} type={popupType} onClose={closePopup} />
      )}
    </div>
  );
};

export default CoinflipPage;
