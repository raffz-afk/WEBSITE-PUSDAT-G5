/**
 * ============================================================
 *  plugins/PUSDAT/cek.js — Fitur 1: Cek Data Pribadi
 * ============================================================
 *
 *  Command: .cek
 *  Alur:
 *  1. User ketik .cek
 *  2. Bot minta Nomor Stambuk → handler gateway tangkap
 *  3. Bot minta Tanggal Lahir (password) → handler gateway verifikasi
 *  4. Jika cocok → tampilkan biodata lengkap
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import { setSession, getSession, clearSession } from '../../lib/dbAccess.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, message } = messageInfo;

  // Cek apakah sudah ada session aktif
  const existingSession = getSession(sender);
  if (existingSession) {
    clearSession(sender); // Reset session lama
  }

  // Set session baru: langkah pertama = minta stambuk
  setSession(sender, {
    step: 'await_stambuk',
    stambuk: null,
    command: 'cek',
  });

  await reply(
    m,
    `🔐 *CEK DATA PRIBADI*\n\n` +
      `Untuk mengakses data pribadi Anda, silakan melalui proses verifikasi.\n\n` +
      `📝 *Langkah 1/2*\nMasukkan *Nomor Stambuk* Anda:\n\n` +
      `_Contoh: 120_\n` +
      `_⏳ Session berlaku selama 5 menit._`
  );
}

export default {
  handle,
  Commands: ['cek'],
  OnlyPremium: false,
  OnlyOwner: false,
};
