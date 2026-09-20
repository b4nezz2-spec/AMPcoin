// One-shot importer: wipes the items catalog and rebuilds it from amvgg.net
// (Adopt Me values). Stored site value = round(amvgg rvalue * 10).
// Usage: node backend/importAmvgg.js
// NOTE: the running backend holds items in memory — restart node server.js after.
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const AJAX_URL = 'https://amvgg.net/wp-admin/admin-ajax.php';
const FALLBACK_NONCE = '9135f81534';
const VALUE_MULTIPLIER = 10;

async function getNonce() {
  try {
    const r = await fetch('https://amvgg.net/adopt-me-values-list/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await r.text();
    const m = html.match(/AMCCONFIG\s*=\s*\{[^}]*"nonce"\s*:\s*"([a-f0-9]+)"/);
    if (m) return m[1];
  } catch (e) {
    console.warn('Nonce scrape failed, using fallback:', e.message);
  }
  return FALLBACK_NONCE;
}

function mapRarity(raw) {
  const r = String(raw || '').toLowerCase().trim();
  if (r.includes('ultra') || r.includes('epic')) return 'epic';
  if (r.includes('legend')) return 'legendary';
  if (r.includes('mythic')) return 'mythic';
  if (r.includes('rare')) return 'rare';
  if (r.includes('uncommon')) return 'uncommon';
  return 'common';
}

async function main() {
  const nonce = await getNonce();
  const params = new URLSearchParams();
  params.append('action', 'elvebredd_load_pet_data');
  params.append('nonce', nonce);

  const res = await fetch(AJAX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://amvgg.net/adopt-me-values-list/'
    },
    body: params
  });
  if (!res.ok) throw new Error(`amvgg responded ${res.status}`);
  const body = await res.json();
  if (!body.success || !body.data || !body.data.data) {
    throw new Error('amvgg returned no data (nonce may have expired — try again)');
  }

  const raw = body.data.data;
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  console.log(`Fetched ${list.length} raw entries from amvgg`);

  const seen = new Set();
  const now = new Date().toISOString();
  const items = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const name = String(entry.name || '').trim();
    const image = String(entry.image || '').trim();
    if (!name || !image) continue;
    if (image.includes('gagpets')) continue;
    if (String(entry.type || '').toLowerCase() !== 'pets') continue;

    const rvalue = parseFloat(entry['rvalue - nopotion'] ?? entry.rvalue ?? entry.value);
    if (isNaN(rvalue)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const id = `amvgg-${String(entry.id || '').trim() || uuidv4()}`;
    const rarity = mapRarity(entry.rarity);
    items.push({
      id,
      itemId: id,
      name,
      itemName: name,
      description: `Adopt Me pet • ${entry.rarity || rarity}`,
      imageUrl: image,
      image,
      rarity,
      value: Math.max(1, Math.round(rvalue * VALUE_MULTIPLIER)),
      tradable: true,
      isEnabled: true,
      source: 'amvgg',
      createdAt: now,
      updatedAt: now
    });
  }

  items.sort((a, b) => b.value - a.value);

  const outPath = path.join(__dirname, 'db', 'items.json');
  fs.writeFileSync(outPath, JSON.stringify({ items }, null, 2));
  console.log(`Wrote ${items.length} pets to ${outPath} (values x${VALUE_MULTIPLIER})`);
  console.log('Top 5:', items.slice(0, 5).map((i) => `${i.name}=${i.value}`).join(', '));
  console.log('IMPORTANT: restart the backend (node server.js) so it loads the new catalog.');
}

main().catch((e) => {
  console.error('Import failed:', e.message);
  process.exit(1);
});
