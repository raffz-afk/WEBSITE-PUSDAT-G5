/**
 * ============================================================
 *  plugins/PUSDAT/lihatberkas.js — 🆕 v10: On-Demand File Viewer
 * ============================================================
 *
 *  Command: .lihatberkas
 *  Tipe   : KHUSUS STAF (Membutuhkan Password — Gateway)
 *
 *  Fitur untuk menarik file fisik santri langsung ke chat WhatsApp.
 *  Staf bisa melihat file berkas santri (foto, ijazah, akta, dll)
 *  tanpa perlu membuka folder manual di komputer.
 *
 *  Alur:
 *  1. User ketik .lihatberkas
 *  2. Bot meminta password staf
 *  3. User mengetik password
 *  4. Jika SALAH  → "Akses Ditolak!" + session dihapus
 *  5. Jika BENAR  → Bot meminta input: Stambuk # Kode Folder
 *  6. User memasukkan (contoh: 140123 # B)
 *  7. Bot mencari file dengan ekstensi .jpg, .jpeg, .png, .pdf
 *  8. Jika ketemu → kirim sebagai image/document
 *  9. Jika tidak → "File tidak ditemukan"
 *
 *  Kode Folder:
 *  A → A. FOTO AKSES
 *  B → B. IJAZAH
 *  C → C. AKTA KELAHIRAN
 *  D → D. KARTU KELUARGA
 *  E → E. SURAT PERMOHONAN
 *  F → F. SURAT PERNYATAAN
 *  G → G. PAKTA INTEGRITAS
 *  H → H. BPJS
 *  I → I. LAIN-LAIN
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import {
  setLihatBerkasSession,
  getLihatBerkasSession,
  clearLihatBerkasSession,
  // Clear session lain untuk mencegah collision
  getSession,
  clearSession,
  getAdminSession,
  clearAdminSession,
  getCekSantriSession,
  clearCekSantriSession,
  getAuditBerkasSession,
  clearAuditBerkasSession,
  getRekapBerkasSession,
  clearRekapBerkasSession,
} from '../../lib/dbAccess.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, message } = messageInfo;

  // ─── Cek & clear session lain yang mungkin aktif ───
  const existingLihat = getLihatBerkasSession(sender);
  if (existingLihat) {
    clearLihatBerkasSession(sender);
  }

  const existingUser = getSession(sender);
  if (existingUser) {
    clearSession(sender);
    console.log(`[LIHATBERKAS] ⚠️ User session untuk ${sender} di-clear.`);
  }

  const existingAdmin = getAdminSession(sender);
  if (existingAdmin) {
    clearAdminSession(sender);
    console.log(`[LIHATBERKAS] ⚠️ Admin session untuk ${sender} di-clear.`);
  }

  const existingCekSantri = getCekSantriSession(sender);
  if (existingCekSantri) {
    clearCekSantriSession(sender);
    console.log(`[LIHATBERKAS] ⚠️ CekSantri session untuk ${sender} di-clear.`);
  }

  const existingAudit = getAuditBerkasSession(sender);
  if (existingAudit) {
    clearAuditBerkasSession(sender);
    console.log(`[LIHATBERKAS] ⚠️ AuditBerkas session untuk ${sender} di-clear.`);
  }

  const existingRekap = getRekapBerkasSession(sender);
  if (existingRekap) {
    clearRekapBerkasSession(sender);
    console.log(`[LIHATBERKAS] ⚠️ RekapBerkas session untuk ${sender} di-clear.`);
  }

  // ─── Set lihat berkas session baru ───
  setLihatBerkasSession(sender, {
    step: 'await_password',
    authenticated: false,
  });

  console.log(`[LIHATBERKAS] 🔐 LihatBerkas session dimulai untuk ${sender}`);

  await sock.sendMessage(remoteJid, {
    react: { text: '🔐', key: message.key },
  });

  await reply(
    m,
    `🔐 *LIHAT BERKAS SANTRI*\n\n` +
      `📂 Fitur ini memungkinkan Anda melihat file berkas santri\n` +
      `langsung di chat WhatsApp.\n\n` +
      `⚠️ Fitur ini hanya untuk *Staf Pusdat* yang berwenang.\n\n` +
      `🔑 Masukkan *Password Staf*:\n\n` +
      `_⏳ Session berlaku selama 3 menit._\n` +
      `_Ketik perintah lain untuk membatalkan._`
  );
}

export default {
  handle,
  Commands: ['lihatberkas'],
  OnlyPremium: false,
  OnlyOwner: false,
};
