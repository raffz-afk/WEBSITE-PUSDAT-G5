/**
 * ============================================================
 *  lib/rateLimiter.js — Rate Limiting & Security Monitor
 * ============================================================
 *
 *  FITUR:
 *  1. Rate Limit per-user untuk command BERAT (max 1x per menit)
 *  2. Deteksi aktivitas mencurigakan (>5x akses command sensitif/menit)
 *  3. Auto-notif WA ke nomor Owner saat ada percobaan abuse
 *
 *  ⚙️ TEKNIS:
 *  - In-memory cache (Map) — auto-bersih setiap 5 menit (anti memory leak)
 *  - Tidak butuh redis/database eksternal
 *  - Stabil di server low-spec
 *
 *  📌 CARA DIPAKAI:
 *  Sudah di-wire otomatis lewat handle/rateLimitGuard.js
 *  (priority -100 → jalan paling awal sebelum semua handler lain).
 *
 * ============================================================
 */

import pusdatConfig from '../pusdat-config.js';

// ═══════════════════════════════════════════════════════
//  KONFIGURASI
// ═══════════════════════════════════════════════════════

// Daftar command BERAT (1x per menit per user)
const HEAVY_COMMANDS = new Set([
  'auditberkas',
  'eksporfull',
  'ekspor',
  'rekapberkas',
  'lihatberkas',
  'bcpusdat',
  'cari',
  'lacak',
  'uploadberkas',
]);

// Daftar command SENSITIF (yg dipantau anti-abuse)
const SENSITIVE_COMMANDS = new Set([
  'admin',
  'setpass',
  'cek',
  'eksporfull',
  'auditberkas',
  'lihatberkas',
  'terima',
  'editproker',
  'bcpusdat',
]);

// Limit
const HEAVY_WINDOW_MS = 60 * 1000;        // 60 detik
const HEAVY_MAX = 1;                       // max 1x per window
const ABUSE_WINDOW_MS = 60 * 1000;         // 60 detik
const ABUSE_MAX = 5;                       // >5x = curiga
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;  // jangan spam owner: 10 menit cooldown
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // bersih cache 5 menit

// ═══════════════════════════════════════════════════════
//  STORAGE (IN-MEMORY) — Map ringan, auto-cleanup
// ═══════════════════════════════════════════════════════
const heavyMap = new Map();   // sender → [timestamp, ...]
const sensitiveMap = new Map();
const lastAlertAt = new Map(); // sender → timestamp
const blockedTemp = new Map(); // sender → unblock timestamp

// ═══════════════════════════════════════════════════════
//  CLEANUP — Hindari memory leak
// ═══════════════════════════════════════════════════════
setInterval(() => {
  const now = Date.now();
  // Bersihkan timestamp lama
  for (const [k, arr] of heavyMap.entries()) {
    const fresh = arr.filter((t) => now - t < HEAVY_WINDOW_MS);
    if (fresh.length === 0) heavyMap.delete(k);
    else heavyMap.set(k, fresh);
  }
  for (const [k, arr] of sensitiveMap.entries()) {
    const fresh = arr.filter((t) => now - t < ABUSE_WINDOW_MS);
    if (fresh.length === 0) sensitiveMap.delete(k);
    else sensitiveMap.set(k, fresh);
  }
  for (const [k, ts] of blockedTemp.entries()) {
    if (now > ts) blockedTemp.delete(k);
  }
  for (const [k, ts] of lastAlertAt.entries()) {
    if (now - ts > ALERT_COOLDOWN_MS) lastAlertAt.delete(k);
  }
}, CLEANUP_INTERVAL_MS).unref?.();

// ═══════════════════════════════════════════════════════
//  HELPER
// ═══════════════════════════════════════════════════════

function pushTimestamp(map, key, windowMs) {
  const now = Date.now();
  const arr = (map.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  map.set(key, arr);
  return arr.length;
}

function getOwnerJids() {
  // Ambil dari config.js DATA_OWNER
  // pusdatConfig sengaja tidak menyimpan owner → kita baca dari config.js
  try {
    // Lazy import agar tidak circular
    const cfg = global.__appConfigCache;
    if (cfg && Array.isArray(cfg.owner)) {
      return cfg.owner.map((n) => `${String(n).replace(/[^0-9]/g, '')}@s.whatsapp.net`);
    }
  } catch (_) {}
  return [];
}

/**
 * Setter dipanggil sekali dari startup — agar kita punya akses
 * ke list owner tanpa circular import.
 */
export function bindAppConfig(cfg) {
  global.__appConfigCache = cfg;
}

// ═══════════════════════════════════════════════════════
//  API UTAMA — Dipanggil oleh handle/rateLimitGuard.js
// ═══════════════════════════════════════════════════════

/**
 * Cek rate limit. Return:
 *   { allowed: true }  → boleh lanjut
 *   { allowed: false, reason: 'heavy', waitSec: 45 } → tolak
 *
 * @param {string} sender - JID pengirim
 * @param {string} command - command tanpa prefix (lowercase)
 * @param {boolean} isOwner - apakah owner (bypass)
 */
export function checkRateLimit(sender, command, isOwner = false) {
  if (!sender || !command) return { allowed: true };
  if (isOwner) return { allowed: true }; // owner bypass

  const cmd = String(command).toLowerCase();
  const now = Date.now();

  // Sementara di-block (akibat abuse)
  if (blockedTemp.has(sender)) {
    const until = blockedTemp.get(sender);
    if (now < until) {
      return {
        allowed: false,
        reason: 'blocked',
        waitSec: Math.ceil((until - now) / 1000),
      };
    } else {
      blockedTemp.delete(sender);
    }
  }

  // Heavy command limiter
  if (HEAVY_COMMANDS.has(cmd)) {
    const key = `${sender}::${cmd}`;
    const count = pushTimestamp(heavyMap, key, HEAVY_WINDOW_MS);
    if (count > HEAVY_MAX) {
      const arr = heavyMap.get(key);
      const oldest = arr[0];
      const waitSec = Math.max(1, Math.ceil((HEAVY_WINDOW_MS - (now - oldest)) / 1000));
      return { allowed: false, reason: 'heavy', waitSec, command: cmd };
    }
  }

  return { allowed: true };
}

/**
 * Catat akses sensitif. Return data abuse jika terdeteksi.
 *
 * @returns {null | { count: number, windowSec: number }}
 */
export function trackSensitive(sender, command) {
  if (!sender || !command) return null;
  const cmd = String(command).toLowerCase();
  if (!SENSITIVE_COMMANDS.has(cmd)) return null;

  const count = pushTimestamp(sensitiveMap, sender, ABUSE_WINDOW_MS);
  if (count > ABUSE_MAX) {
    // Block sementara 2 menit
    blockedTemp.set(sender, Date.now() + 2 * 60 * 1000);
    return { count, windowSec: ABUSE_WINDOW_MS / 1000 };
  }
  return null;
}

/**
 * Kirim notif ke Owner saat ada abuse.
 * Punya cooldown agar tidak spam.
 */
export async function notifyOwnerAbuse(sock, abuserJid, command, info) {
  const now = Date.now();
  const last = lastAlertAt.get(abuserJid) || 0;
  if (now - last < ALERT_COOLDOWN_MS) return; // cooldown
  lastAlertAt.set(abuserJid, now);

  const owners = getOwnerJids();
  if (!owners.length) {
    console.warn('[RATE-LIMIT] ⚠️ Tidak ada owner di config.js untuk dikirimi notif abuse.');
    return;
  }

  const nomor = abuserJid.split('@')[0];
  const tgl = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const text =
    `🚨 *PERINGATAN KEAMANAN PUSDAT*\n\n` +
    `Terdeteksi *aktivitas mencurigakan* pada bot:\n\n` +
    `┣⌬ 👤 Pelaku  : wa.me/${nomor}\n` +
    `┣⌬ ⚠️ Command : .${command}\n` +
    `┣⌬ 🔢 Jumlah  : ${info.count}x dalam ${info.windowSec} detik\n` +
    `┣⌬ ⏱️ Status  : *Sementara DIBLOKIR 2 menit*\n` +
    `┣⌬ 📅 Waktu   : ${tgl} WIB\n\n` +
    `_Bot otomatis memblokir akses sementara untuk mencegah abuse._\n` +
    `_Cek log server untuk detail._`;

  for (const ownerJid of owners) {
    try {
      await sock.sendMessage(ownerJid, { text });
      console.log(`[RATE-LIMIT] 🚨 Notif abuse dikirim ke owner: ${ownerJid}`);
    } catch (err) {
      console.error(`[RATE-LIMIT] ❌ Gagal kirim notif ke ${ownerJid}:`, err.message);
    }
  }
}

// ═══════════════════════════════════════════════════════
//  DEBUG / STATS (dipakai dashboard web)
// ═══════════════════════════════════════════════════════
export function getRateLimitStats() {
  return {
    heavyTrackedKeys: heavyMap.size,
    sensitiveTrackedUsers: sensitiveMap.size,
    blockedNow: blockedTemp.size,
    heavyCommands: [...HEAVY_COMMANDS],
    sensitiveCommands: [...SENSITIVE_COMMANDS],
  };
}

export default {
  checkRateLimit,
  trackSensitive,
  notifyOwnerAbuse,
  bindAppConfig,
  getRateLimitStats,
};
