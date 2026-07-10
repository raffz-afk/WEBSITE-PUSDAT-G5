/**
 * ============================================================
 *  plugins/PUSDAT/auditberkas.js — 🆕 v12: Audit Berkas Per Kelas + ALL
 * ============================================================
 *
 *  Command: .auditberkas [kelas|all|semua]
 *  Tipe   : KHUSUS STAF (Membutuhkan Password — Gateway nosystemissafe)
 *
 *  PERUBAHAN v12:
 *  - 🆕 Mendukung argumen *all* / *semua* untuk mengaudit
 *    SELURUH santri aktif (semua kelas sekaligus).
 *  - Hasil audit massal otomatis dikirim sebagai file Excel
 *    agar tidak terpotong di WA.
 *  - Output WA tetap menampilkan ringkasan per kelas.
 *
 *  Folder yang dicek (9 folder):
 *  A. FOTO AKSES, B. IJAZAH, C. AKTA KELAHIRAN,
 *  D. KARTU KELUARGA, E. SURAT PERMOHONAN, F. SURAT PERNYATAAN,
 *  G. PAKTA INTEGRITAS, H. BPJS, I. LAIN-LAIN
 *
 *  Alur:
 *    Per kelas → daftar santri kurang berkas (ditampilkan di chat)
 *    Mode ALL  → ringkasan per kelas + file Excel detail
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import {
  setAuditBerkasSession,
  getAuditBerkasSession,
  clearAuditBerkasSession,
  // Clear session lain untuk mencegah collision
  getSession,
  clearSession,
  getAdminSession,
  clearAdminSession,
  getCekSantriSession,
  clearCekSantriSession,
  deepSanitize,
} from '../../lib/dbAccess.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, message } = messageInfo;

  // ═══ VALIDASI: Pastikan parameter disertakan ═══
  const kelasInput = (content || '').trim();

  if (!kelasInput) {
    return await reply(
      m,
      `❌ *Format Salah!*\n\n` +
      `Penggunaan: *.auditberkas [Kelas|all|semua]*\n\n` +
      `Contoh:\n` +
      `┣⌬ .auditberkas 3 Int B\n` +
      `┣⌬ .auditberkas 4 KMI A\n` +
      `┣⌬ .auditberkas 1A\n` +
      `┣⌬ *.auditberkas all*  ← 🆕 audit SELURUH santri\n` +
      `┣⌬ *.auditberkas semua*\n\n` +
      `_Mode ALL akan menghasilkan file Excel rekap berkas yang kurang_\n` +
      `_untuk seluruh kelas. Cocok untuk audit besar._`
    );
  }

  // Sanitasi input
  const cleanInput = deepSanitize(kelasInput).trim();
  const lowerInput = cleanInput.toLowerCase();

  // 🆕 v12: Deteksi mode ALL
  const isAllMode = ['all', 'semua', 'all santri', 'seluruhnya', 'global'].includes(lowerInput);

  // ─── Cek & clear session lain yang mungkin aktif ───
  const existingAudit = getAuditBerkasSession(sender);
  if (existingAudit) {
    clearAuditBerkasSession(sender);
  }

  const existingUser = getSession(sender);
  if (existingUser) {
    clearSession(sender);
    console.log(`[AUDITBERKAS] ⚠️ User session untuk ${sender} di-clear.`);
  }

  const existingAdmin = getAdminSession(sender);
  if (existingAdmin) {
    clearAdminSession(sender);
    console.log(`[AUDITBERKAS] ⚠️ Admin session untuk ${sender} di-clear.`);
  }

  const existingCekSantri = getCekSantriSession(sender);
  if (existingCekSantri) {
    clearCekSantriSession(sender);
    console.log(`[AUDITBERKAS] ⚠️ CekSantri session untuk ${sender} di-clear.`);
  }

  // ─── Set audit berkas session baru ───
  setAuditBerkasSession(sender, {
    step: 'await_password',
    authenticated: false,
    kelas: cleanInput,
    isAll: isAllMode, // 🆕 v12 flag mode all
  });

  console.log(
    `[AUDITBERKAS] 🔐 AuditBerkas session dimulai untuk ${sender}, ` +
    `mode: ${isAllMode ? 'ALL' : 'PER-KELAS'}, target: "${cleanInput}"`
  );

  await sock.sendMessage(remoteJid, {
    react: { text: '🔐', key: message.key },
  });

  const targetText = isAllMode
    ? `🌐 *SELURUH SANTRI AKTIF*\n📊 Mode: AUDIT MASSAL (semua kelas)`
    : `📋 Kelas Target: *${cleanInput}*`;

  await reply(
    m,
    `🔐 *AUDIT KELENGKAPAN BERKAS*\n\n` +
    `${targetText}\n\n` +
    `⚠️ Fitur ini hanya untuk *Staf Pusdat* yang berwenang.\n\n` +
    `🔑 Masukkan *Password Staf*:\n\n` +
    `_⏳ Session berlaku selama 3 menit._\n` +
    `_Ketik perintah lain untuk membatalkan._` +
    (isAllMode
      ? `\n\n_💡 Mode ALL akan mengirim file Excel berisi daftar lengkap_\n_santri yang berkasnya kurang, dikelompokkan per kelas._`
      : '')
  );
}

export default {
  handle,
  Commands: ['auditberkas'],
  OnlyPremium: false,
  OnlyOwner: false,
};
