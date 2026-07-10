/**
 * ============================================================
 *  plugins/PUSDAT/rekapberkas.js — 🆕 v10: Global Audit Berkas (Rekap)
 * ============================================================
 *
 *  Command: .rekapberkas [Kelas/Semua]
 *  Tipe   : KHUSUS STAF (Membutuhkan Password — Gateway)
 *
 *  Menghitung statistik kelengkapan berkas secara massal untuk
 *  seluruh santri di satu kelas atau seluruh database.
 *
 *  Output berupa ANGKA SAJA agar bot tidak lambat.
 *
 *  Alur:
 *  1. User ketik .rekapberkas 3 Int B  (atau .rekapberkas Semua)
 *  2. Bot meminta password staf
 *  3. User mengetik password
 *  4. Jika SALAH  → "Akses Ditolak!" + session dihapus
 *  5. Jika BENAR  → Bot langsung memproses rekap
 *  6. Bot merespons:
 *     📊 REKAP BERKAS KELAS: 3 INT B (Total 35 Anak)
 *     ✅ Lengkap Primer & Sekunder: 10 Anak
 *     ⚠️ Hanya Primer Lengkap: 20 Anak
 *     ❌ Primer Tidak Lengkap: 5 Anak
 *
 *  Kategori Berkas:
 *  PRIMER (A-D) : Foto Akses, Ijazah, Akta Kelahiran, Kartu Keluarga
 *  SEKUNDER (E-I): Surat Permohonan, Surat Pernyataan, Pakta Integritas, BPJS, Lain-Lain
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import {
  setRekapBerkasSession,
  getRekapBerkasSession,
  clearRekapBerkasSession,
  // Clear session lain untuk mencegah collision
  getSession,
  clearSession,
  getAdminSession,
  clearAdminSession,
  getCekSantriSession,
  clearCekSantriSession,
  getAuditBerkasSession,
  clearAuditBerkasSession,
  getLihatBerkasSession,
  clearLihatBerkasSession,
  deepSanitize,
} from '../../lib/dbAccess.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, message } = messageInfo;

  // ═══ VALIDASI: Pastikan parameter disertakan ═══
  const targetInput = (content || '').trim();

  if (!targetInput) {
    return await reply(
      m,
      `❌ *Format Salah!*\n\n` +
      `Penggunaan: *.rekapberkas [Kelas/Semua]*\n\n` +
      `Contoh:\n` +
      `┣⌬ .rekapberkas 3 Int B\n` +
      `┣⌬ .rekapberkas 4 KMI A\n` +
      `┣⌬ .rekapberkas Semua\n\n` +
      `_Nama kelas harus sesuai database._\n` +
      `_Gunakan *.listsantri* untuk melihat daftar kelas._`
    );
  }

  // Sanitasi target
  const cleanTarget = deepSanitize(targetInput).trim();

  // ─── Cek & clear session lain yang mungkin aktif ───
  const existingRekap = getRekapBerkasSession(sender);
  if (existingRekap) {
    clearRekapBerkasSession(sender);
  }

  const existingUser = getSession(sender);
  if (existingUser) {
    clearSession(sender);
    console.log(`[REKAPBERKAS] ⚠️ User session untuk ${sender} di-clear.`);
  }

  const existingAdmin = getAdminSession(sender);
  if (existingAdmin) {
    clearAdminSession(sender);
    console.log(`[REKAPBERKAS] ⚠️ Admin session untuk ${sender} di-clear.`);
  }

  const existingCekSantri = getCekSantriSession(sender);
  if (existingCekSantri) {
    clearCekSantriSession(sender);
    console.log(`[REKAPBERKAS] ⚠️ CekSantri session untuk ${sender} di-clear.`);
  }

  const existingAudit = getAuditBerkasSession(sender);
  if (existingAudit) {
    clearAuditBerkasSession(sender);
    console.log(`[REKAPBERKAS] ⚠️ AuditBerkas session untuk ${sender} di-clear.`);
  }

  const existingLihat = getLihatBerkasSession(sender);
  if (existingLihat) {
    clearLihatBerkasSession(sender);
    console.log(`[REKAPBERKAS] ⚠️ LihatBerkas session untuk ${sender} di-clear.`);
  }

  // ─── Set rekap berkas session baru ───
  setRekapBerkasSession(sender, {
    step: 'await_password',
    authenticated: false,
    target: cleanTarget,
  });

  const isSemua = cleanTarget.toLowerCase() === 'semua';

  console.log(`[REKAPBERKAS] 🔐 RekapBerkas session dimulai untuk ${sender}, target: "${cleanTarget}"`);

  await sock.sendMessage(remoteJid, {
    react: { text: '🔐', key: message.key },
  });

  await reply(
    m,
    `🔐 *REKAP KELENGKAPAN BERKAS*\n\n` +
    `📋 Target: *${isSemua ? 'SELURUH SANTRI' : cleanTarget}*\n\n` +
    `⚠️ Fitur ini hanya untuk *Staf Pusdat* yang berwenang.\n\n` +
    `🔑 Masukkan *Password Staf*:\n\n` +
    `_⏳ Session berlaku selama 3 menit._\n` +
    `_Ketik perintah lain untuk membatalkan._`
  );
}

export default {
  handle,
  Commands: ['rekapberkas'],
  OnlyPremium: false,
  OnlyOwner: false,
};
