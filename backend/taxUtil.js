const crypto = require('crypto');
const dbManager = require('./db/dbHelper');

function readSetting(key) {
  try {
    const db = dbManager.getMainDb();
    const s = db.settings;
    if (Array.isArray(s)) {
      const found = s.find((x) => x.key === key);
      return found ? found.value : undefined;
    }
    if (s && typeof s === 'object') return s[key];
  } catch (e) { /* ignore */ }
  return undefined;
}

// Tax rate stored either as fraction (0.05) or percent (5) -> returns 0..1 fraction
function getTaxRate(key) {
  const v = parseFloat(readSetting(key));
  if (isNaN(v)) return 0;
  if (v <= 0) return 0;
  return v > 1 ? Math.min(v, 100) / 100 : Math.min(v, 1);
}

// Master tax switch + single percentage (10-30%).
function getTaxConfig() {
  const rawEnabled = readSetting('tax_enabled');
  let enabled;
  if (rawEnabled === undefined || rawEnabled === null || rawEnabled === '') {
    const legacy = parseFloat(readSetting('coinflip_fee_percentage'));
    enabled = !(isNaN(legacy)) && legacy > 0;
    if (readSetting('coinflip_fee_percentage') === undefined) enabled = true;
  } else {
    enabled = rawEnabled === true || rawEnabled === 1 ||
      String(rawEnabled).toLowerCase() === 'true' || String(rawEnabled) === '1';
  }
  let pct = parseFloat(readSetting('tax_percentage'));
  if (isNaN(pct)) {
    const legacy = parseFloat(readSetting('coinflip_fee_percentage'));
    pct = isNaN(legacy) ? 15 : (legacy <= 1 ? legacy * 100 : legacy);
  }
  pct = Math.min(30, Math.max(10, pct));
  return { enabled: !!enabled, percent: pct, rate: enabled ? pct / 100 : 0 };
}

// Admin-configured account that receives taxed items.
function getTaxRecipient() {
  try {
    const raw = readSetting('tax_recipient');
    if (!raw || !String(raw).trim()) return null;
    const key = String(raw).trim().toLowerCase();
    const usersDb = dbManager.getUsersDb();
    const u = (usersDb.users || []).find(
      (x) => String(x.id).toLowerCase() === key ||
        String(x.robloxUsername || '').toLowerCase() === key
    );
    if (!u) return null;
    return { id: u.id, username: u.robloxUsername, displayName: u.displayName || u.robloxUsername };
  } catch (e) {
    return null;
  }
}

function cloneStack(st) {
  return { ...st };
}

// Smart tax: EVERY item worth 10%-30% of the whole pot gets taxed (if available).
// - 3 or fewer total items: NO TAX (tiny bets stay untouched)
// - Takes ALL units whose single-unit value is 10%-30% of the pot — no cap
// - Always leaves at least 1 unit in the pot for the winner
function collectItemTax(potStacks, rate) {
  const stacks = Array.isArray(potStacks) ? potStacks : [];
  const potValue = stacks.reduce((s, it) => s + ((it.value || 0) * (it.quantity || 1)), 0);
  const totalUnits = stacks.reduce((s, it) => s + Math.max(1, parseInt(it.quantity || 1, 10) || 1), 0);

  // NO TAX for small bets (3 or fewer total items)
  if (totalUnits <= 3 || !stacks.length || !(rate > 0) || potValue <= 0) {
    return { winnerStacks: stacks.map(cloneStack), taxStacks: [], taxAmount: 0, potValue };
  }

  // Find every unit worth 10%-30% of the pot
  const eligibleUnits = []; // { stackIndex, unitValue }
  stacks.forEach((st, si) => {
    const qty = Math.max(1, parseInt(st.quantity || 1, 10) || 1);
    const unitVal = st.value || 0;
    const pctOfPot = potValue > 0 ? (unitVal / potValue) * 100 : 0;
    if (pctOfPot >= 10 && pctOfPot <= 30) {
      for (let k = 0; k < qty; k++) eligibleUnits.push({ stackIndex: si, unitValue: unitVal });
    }
  });

  if (!eligibleUnits.length) {
    return { winnerStacks: stacks.map(cloneStack), taxStacks: [], taxAmount: 0, potValue };
  }

  // Shuffle so which exact units go is random
  for (let i = eligibleUnits.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const tmp = eligibleUnits[i];
    eligibleUnits[i] = eligibleUnits[j];
    eligibleUnits[j] = tmp;
  }

  // Take every qualifying unit, but always leave 1 unit in the pot for the winner
  const takeQty = {}; // stackIndex -> how many to take
  let remaining = totalUnits;
  for (const { stackIndex } of eligibleUnits) {
    if (remaining <= 1) break; // keep the last unit for the winner
    const stackQty = Math.max(1, parseInt(stacks[stackIndex].quantity || 1, 10) || 1);
    if ((takeQty[stackIndex] || 0) >= stackQty) continue;
    takeQty[stackIndex] = (takeQty[stackIndex] || 0) + 1;
    remaining -= 1;
  }

  const winnerStacks = [];
  const taxStacks = [];
  stacks.forEach((st, si) => {
    const take = takeQty[si] || 0;
    const total = Math.max(1, parseInt(st.quantity || 1, 10) || 1);
    const left = total - take;
    if (left > 0) winnerStacks.push({ ...st, quantity: left });
    if (take > 0) taxStacks.push({ ...st, quantity: take });
  });

  const taxAmount = taxStacks.reduce((s, it) => s + ((it.value || 0) * (it.quantity || 1)), 0);
  return { winnerStacks, taxStacks, taxAmount, potValue };
}

module.exports = { readSetting, getTaxRate, getTaxConfig, getTaxRecipient, collectItemTax };
