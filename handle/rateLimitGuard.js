/**
 * ============================================================
 *  handle/rateLimitGuard.js — Guard rate limit untuk SEMUA pesan
 * ============================================================
 *
 *  Priority: -100  (paling awal, sebelum gateway.js (priority 0))
 *
 *  Tugas:
 *  1. Tolak command BERAT yg dispam (>1x/menit per user)
 *  2. Pantau akses command sensitif & kirim notif owner
 *
 *  File ini SUDAH dideteksi otomatis oleh lib/handler.js
 *  (auto-load semua .js di folder handle/).
 *
 * ============================================================
 */

import {
  checkRateLimit,
  trackSensitive,
  notifyOwnerAbuse,
} from '../lib/rateLimiter.js';
import { isOwner } from '../lib/users.js';

async function process(sock, messageInfo) {
  const { remoteJid, sender, message, command, prefix } = messageInfo;

  // Hanya proses jika ada command (ada prefix titik)
  if (!prefix || !command || command === false) return true;

  const isOwnerUser = isOwner(sender);
  const cmd = String(command).toLowerCase();

  // ── 1. RATE LIMIT CHECK ──
  const result = checkRateLimit(sender, cmd, isOwnerUser);
  if (!result.allowed) {
    try {
      await sock.sendMessage(remoteJid, {
        react: { text: '🐢', key: message.key },
      });
    } catch (_) {}

    if (result.reason === 'heavy') {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `⏳ *Mohon Pelan-pelan*\n\n` +
            `Command *.${result.command}* tergolong BERAT dan hanya boleh ` +
            `dieksekusi *1x per menit*.\n\n` +
            `_Tunggu ${result.waitSec} detik lagi sebelum mencoba kembali._`,
        },
        { quoted: message }
      );
    } else if (result.reason === 'blocked') {
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🚫 *Akses Diblokir Sementara*\n\n` +
            `Anda terdeteksi melakukan akses berlebihan ke command sensitif.\n` +
            `Akses dibuka kembali dalam *${result.waitSec} detik*.\n\n` +
            `_Owner bot telah diberitahu._`,
        },
        { quoted: message }
      );
    }
    return false; // STOP — jangan proses ke handler lain
  }

  // ── 2. TRACK COMMAND SENSITIF ──
  const abuse = trackSensitive(sender, cmd);
  if (abuse && !isOwnerUser) {
    console.warn(
      `[RATE-LIMIT] 🚨 ABUSE DETECTED: ${sender} → .${cmd} (${abuse.count}x/${abuse.windowSec}s)`
    );

    // Kirim notif owner async (jangan blocking flow)
    notifyOwnerAbuse(sock, sender, cmd, abuse).catch((err) =>
      console.error('[RATE-LIMIT] Notif gagal:', err.message)
    );

    try {
      await sock.sendMessage(remoteJid, {
        react: { text: '🚨', key: message.key },
      });
    } catch (_) {}

    await sock.sendMessage(
      remoteJid,
      {
        text:
          `🚨 *AKTIVITAS MENCURIGAKAN TERDETEKSI*\n\n` +
          `Anda telah mengakses command sensitif sebanyak *${abuse.count}x* dalam ` +
          `${abuse.windowSec} detik.\n\n` +
          `Akses Anda *DIBLOKIR sementara selama 2 menit* untuk keamanan.\n` +
          `Owner bot telah menerima notifikasi.`,
      },
      { quoted: message }
    );
    return false; // STOP
  }

  return true; // lanjut ke handler berikutnya
}

export default {
  name: 'Rate Limit Guard',
  priority: -100, // jalan PALING AWAL
  process,
};
