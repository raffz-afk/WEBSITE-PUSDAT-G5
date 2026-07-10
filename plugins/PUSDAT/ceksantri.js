/**
 * ============================================================
 *  plugins/PUSDAT/ceksantri.js — 🆕 Fitur Cek Biodata Santri Super Lengkap
 * ============================================================
 *
 *  Command: .ceksantri
 *
 *  Fitur khusus untuk Staf Pusdat agar bisa melihat biodata LENGKAP
 *  santri dari DB Santri, termasuk foto akses dari local drive.
 *
 *  Alur:
 *  1. User ketik .ceksantri
 *  2. Bot meminta password staf
 *  3. User mengetik password → "nosystemissafe"
 *  4. Jika SALAH  → "Akses Ditolak!" + session dihapus
 *  5. Jika BENAR  → Bot meminta Nomor Stambuk Santri
 *  6. User memasukkan Stambuk → Bot query DB Santri
 *  7. Bot merespons: Biodata super lengkap + Foto Akses (jika ada)
 *
 *  KEAMANAN:
 *  - CekSantri session TERPISAH dari user session dan admin session
 *  - Session berlaku 3 menit
 *  - Password dicek setelah deepSanitize untuk menghindari karakter gaib
 *
 *  FOTO AKSES:
 *  - Path foto: D:\PUSAT DATA 2026\01. MASTER DATA SANTRI\01. BERKAS SANTRI\A. FOTO AKSES\{stambuk}.jpg
 *  - Jika foto ditemukan → kirim sebagai image + caption biodata
 *  - Jika foto tidak ditemukan → kirim teks biodata saja
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import {
  setCekSantriSession,
  getCekSantriSession,
  clearCekSantriSession,
  // Juga clear session lain jika ada, mencegah collision
  getSession,
  clearSession,
  getAdminSession,
  clearAdminSession,
} from '../../lib/dbAccess.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, message } = messageInfo;

  // ─── Cek apakah sudah ada ceksantri session aktif ───
  const existingCekSantri = getCekSantriSession(sender);
  if (existingCekSantri) {
    clearCekSantriSession(sender); // Reset session lama
  }

  // ─── Cek apakah ada user session aktif, clear jika ada ───
  // Ini mencegah bug tumpang tindih state antara gateway biasa dan ceksantri
  const existingUser = getSession(sender);
  if (existingUser) {
    clearSession(sender);
    console.log(`[CEKSANTRI] ⚠️ User session untuk ${sender} di-clear sebelum masuk mode ceksantri.`);
  }

  // ─── Cek apakah ada admin session aktif, clear jika ada ───
  const existingAdmin = getAdminSession(sender);
  if (existingAdmin) {
    clearAdminSession(sender);
    console.log(`[CEKSANTRI] ⚠️ Admin session untuk ${sender} di-clear sebelum masuk mode ceksantri.`);
  }

  // ─── Set ceksantri session baru: langkah pertama = minta password ───
  setCekSantriSession(sender, {
    step: 'await_password',
    authenticated: false,
  });

  console.log(`[CEKSANTRI] 🔐 CekSantri session dimulai untuk ${sender}`);

  await sock.sendMessage(remoteJid, {
    react: { text: '🔐', key: message.key },
  });

  await reply(
    m,
    `🔐 *AKSES CEK DATA SANTRI*\n\n` +
      `⚠️ Fitur ini hanya untuk *Staf Pusdat* yang berwenang.\n\n` +
      `🔑 Masukkan *Password Staf*:\n\n` +
      `_⏳ Session berlaku selama 3 menit._\n` +
      `_Ketik perintah lain untuk membatalkan._`
  );
}

export default {
  handle,
  Commands: ['ceksantri'],
  OnlyPremium: false,
  OnlyOwner: false,
};
