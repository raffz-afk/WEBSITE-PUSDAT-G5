/**
 * ============================================================
 *  plugins/PUSDAT/revisi.js — Fitur 2: Revisi Data Pribadi
 * ============================================================
 *
 *  Command: .revisi [detail data yang ingin diubah]
 *  Alur:
 *  1. User ketik .revisi Saya ingin mengubah No HP dan Alamat
 *  2. Bot minta Nomor Stambuk → handler gateway tangkap
 *  3. Bot minta Tanggal Lahir (password) → handler gateway verifikasi
 *  4. Jika cocok → kirim notifikasi revisi ke Grup Staf Pusdat
 *
 *  CATATAN: User boleh mengajukan revisi untuk Nomor Stambuk
 *           dan Tanggal Lahir (Password) mereka.
 *           Database TIDAK diubah otomatis oleh bot.
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import { setSession, getSession, clearSession } from '../../lib/dbAccess.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, prefix, command, message } = messageInfo;

  // Cek apakah user menyertakan detail revisi
  if (!content || content.trim() === '') {
    return await reply(
      m,
      `⚠️ *FORMAT SALAH*\n\n` +
        `Gunakan format:\n` +
        `*${prefix}revisi [detail data yang ingin diubah]*\n\n` +
        `📌 *Contoh:*\n` +
        `_${prefix}revisi Saya ingin mengubah No HP menjadi 081234567890 dan alamat menjadi Jl. Raya No. 10_\n\n` +
        `_${prefix}revisi Stambuk saya salah, seharusnya 125 bukan 124_\n\n` +
        `_${prefix}revisi Tanggal Lahir saya salah, seharusnya 15/08/2003_\n\n` +
        `ℹ️ _Anda diperbolehkan mengajukan revisi untuk *Nomor Stambuk* dan *Tanggal Lahir* (Password)._`
    );
  }

  // Reset session lama jika ada
  const existingSession = getSession(sender);
  if (existingSession) {
    clearSession(sender);
  }

  // Set session baru: simpan konten revisi, minta stambuk
  setSession(sender, {
    step: 'await_stambuk',
    stambuk: null,
    command: 'revisi',
    revisiContent: content.trim(),
  });

  await reply(
    m,
    `🔐 *REVISI DATA PRIBADI*\n\n` +
      `Untuk mengajukan revisi, silakan verifikasi identitas Anda terlebih dahulu.\n\n` +
      `📝 *Langkah 1/2*\nMasukkan *Nomor Stambuk* Anda:\n\n` +
      `_Contoh: 120_\n` +
      `_⏳ Session berlaku selama 5 menit._`
  );
}

export default {
  handle,
  Commands: ['revisi'],
  OnlyPremium: false,
  OnlyOwner: false,
};
