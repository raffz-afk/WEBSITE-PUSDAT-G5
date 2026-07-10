/**
 * ============================================================
 *  plugins/PUSDAT/admin.js — 🆕 Fitur Superadmin: Cek Password
 * ============================================================
 *
 *  Command: .admin atau .cekpass
 *
 *  Fitur khusus untuk Staf Pusdat agar bisa melihat password
 *  (Tanggal Lahir) dari Stambuk guru mana pun.
 *
 *  Alur:
 *  1. User ketik .admin atau .cekpass
 *  2. Bot meminta password Superadmin
 *  3. User mengetik password → "nosystemissafe"
 *  4. Jika SALAH  → "Akses Ditolak!" + session dihapus
 *  5. Jika BENAR  → Bot meminta Nomor Stambuk
 *  6. User memasukkan Stambuk → Bot query DB
 *  7. Bot merespons: "Password (Tgl Lahir) untuk Stambuk X adalah: DD-MM-YYYY"
 *
 *  KEAMANAN:
 *  - Admin session TERPISAH dari user session (tidak ada tumpang tindih)
 *  - Session admin lebih pendek (3 menit) dari session user (5 menit)
 *  - Password dicek setelah deepSanitize untuk menghindari karakter gaib
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import {
  setAdminSession,
  getAdminSession,
  clearAdminSession,
  // Juga clear user session jika ada, mencegah collision
  getSession,
  clearSession,
} from '../../lib/dbAccess.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, message } = messageInfo;

  // ─── Cek apakah sudah ada admin session aktif ───
  const existingAdmin = getAdminSession(sender);
  if (existingAdmin) {
    clearAdminSession(sender); // Reset admin session lama
  }

  // ─── Cek apakah ada user session aktif, clear jika ada ───
  // Ini mencegah bug tumpang tindih state antara gateway biasa dan admin
  const existingUser = getSession(sender);
  if (existingUser) {
    clearSession(sender);
    console.log(`[ADMIN] ⚠️ User session untuk ${sender} di-clear sebelum masuk mode admin.`);
  }

  // ─── Set admin session baru: langkah pertama = minta password ───
  setAdminSession(sender, {
    step: 'await_password',
    authenticated: false,
  });

  console.log(`[ADMIN] 🔐 Admin session dimulai untuk ${sender}`);

  await sock.sendMessage(remoteJid, {
    react: { text: '🔐', key: message.key },
  });

  await reply(
    m,
    `🔐 *AKSES SUPERADMIN*\n\n` +
      `⚠️ Fitur ini hanya untuk *Staf Pusdat* yang berwenang.\n\n` +
      `🔑 Masukkan *Password Superadmin*:\n\n` +
      `_⏳ Session berlaku selama 3 menit._\n` +
      `_Ketik perintah lain untuk membatalkan._`
  );
}

export default {
  handle,
  Commands: ['admin', 'cekpass'],
  OnlyPremium: false,
  OnlyOwner: false,
};
