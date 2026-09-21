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
// (legacy per-game keys; new code should use getTaxConfig instead)
function getTaxRate(key) {
  const v = parseFloat(readSetting(key));
  if (isNaN(v)) return 0;
  if (v <= 0) return 0;
  return v > 1 ? Math.min(v, 100) / 100 : Math.min(v, 1);
}

// Master tax switch + single percentage (10-30%). The tax takes random
// items worth about that % of every bet whenever the pot allows it.
function getTaxConfig() {
  const rawEnabled = readSetting('tax_enabled');
  let enabled;
  if (rawEnabled === undefined || rawEnabled === null || rawEnabled === '') {
    // Migrate: enabled if any legacy fee rate was set above zero
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

// Admin-configured account that receives taxed items. Setting holds a user id or roblox username.
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

// Split item stacks into winner stacks + randomly-picked tax stacks.
// Only items whose individual unit value is 10%-30% of the total pot value
// are eligible for taxation. Items outside that range are left for the winner.
function collectItemTax(potStacks, rate) {
  const stacks = Array.isArray(potStacks) ? potStacks : [];
  const potValue = stacks.reduce((s, it) => s + ((it.value || 0) * (it.quantity || 1)), 0);

  if (!stacks.length || !(rate > 0) || potValue <= 0) {
    return { winnerStacks: stacks.map(cloneStack), taxStacks: [], taxAmount: 0, potValue };
  }

  // Build units with their stack index — only include items within 10-30% of total bet
  const units = [];
  stacks.forEach((st, si) => {
    const qty = Math.max(1, parseInt(st.quantity || 1, 10) || 1);
    const unitVal = st.value || 0;
    const pctOfPot = potValue > 0 ? (unitVal / potValue) * 100 : 0;
    // Only tax items that are between 10% and 30% of the whole bet
    if (pctOfPot >= 10 && pctOfPot <= 30) {
      for (let k = 0; k < qty; k++) units.push(si);
    }
  });

  if (!units.length) {
    return { winnerStacks: stacks.map(cloneStack), taxStacks: [], taxAmount: 0, potValue };
  }

  const target = potValue * rate;
  // Shuffle eligible units
  for (let i = units.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const tmp = units[i];
    units[i] = units[j];
    units[j] = tmp;
  }

  const takeQty = {};
  let takenValue = 0;
  let takenUnits = 0;
  for (const si of units) {
    if (takenValue >= target) break;
    if (takenUnits >= units.length - 1) break; // always leave 1 eligible unit for the winner
    takeQty[si] = (takeQty[si] || 0) + 1;
    takenValue += (stacks[si].value || 0);
    takenUnits += 1;
  }

  const winnerStacks = [];
  const taxStacks = [];
  stacks.forEach((st, si) => {
    const taken = takeQty[si] || 0;
    const total = Math.max(1, parseInt(st.quantity || 1, 10) || 1);
    const left = total - taken;
    if (left > 0) winnerStacks.push({ ...st, quantity: left });
    if (taken > 0) taxStacks.push({ ...st, quantity: taken });
  });

  const taxAmount = taxStacks.reduce((s, it) => s + ((it.value || 0) * (it.quantity || 1)), 0);
  return { winnerStacks, taxStacks, taxAmount, potValue };
}

module.exports = { readSetting, getTaxRate, getTaxConfig, getTaxRecipient, collectItemTax };
