/**
 * ============================================================
 *  plugins/PUSDAT/lapharian.js — 🆕 Laporan Bakdiyah Harian
 *  ★ VERSI v13.6 — JUMAT AUTO-LIBUR + CONTOH MULTI-POIN
 * ============================================================
 *
 *  Command: .lapharian / .lapbakdiyah
 *
 *  📝 FORMAT YANG DITERIMA (semua valid):
 *
 *    A) Format lengkap (banyak poin, dengan/tanpa spasi setelah '#'):
 *       .lapharian
 *       # selesai
 *       - Backup database santri
 *       - Update absensi guru
 *       # belum
 *       - Audit berkas kelas 6
 *       - Input angket kelas 6
 *
 *    B) Format singkat (tanpa tag, semua dianggap selesai):
 *       .lapharian
 *       - Backup database santri
 *       - Update absensi guru
 *
 *    C) Mode libur:
 *       .lapharian libur     atau    .lapharian off / cuti / nihil
 *
 *    D) Jumat → otomatis libur (tidak perlu kirim apa-apa)
 *
 * ============================================================
 *  PERBAIKAN v13.6 (4 Mei 2026):
 *  ────────────────────────────────────────────────────────
 *  ✅ Hard-block kalau hari Jumat → balas ucapan libur.
 *  ✅ Pesan format-salah & konfirmasi diberi contoh multi-poin
 *     dan opsi libur yang jelas.
 *  ✅ try/catch global supaya error tidak crash bot.
 *
 * ============================================================
 */

import { reply, convertToJid } from '../../lib/utils.js';
import {
  simpanLaporanBakdiyah,
  setLiburHariIni,
  isLiburKeyword,
  isJumatHariIni,
  getStafByWA,
  getAllStaf,
  parseSelesaiBelum,
} from '../../lib/prokerManager.js';
import { hentikanSpam } from '../../lib/cronProker.js';
import { readPusdatSettings } from '../../lib/dbAccess.js';

// ────────────────────────────────────────────────
//  Template panduan
// ────────────────────────────────────────────────
function buildPanduanLapharian() {
  return (
    `📝 *PANDUAN LAPORAN BAKDIYAH*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `1️⃣ *Mode lengkap (banyak poin selesai & belum):*\n` +
    `\`\`\`\n.lapharian\n#selesai\n- Backup database santri\n- Update absensi guru\n- Cek berkas kelas 5\n#belum\n- Audit berkas kelas 6\n- Input angket kelas 6\n\`\`\`\n\n` +
    `2️⃣ *Mode singkat (semua dianggap selesai):*\n` +
    `\`\`\`\n.lapharian\n- Backup database santri\n- Update absensi guru\n\`\`\`\n\n` +
    `3️⃣ *Mode hanya selesai (tanpa belum):*\n` +
    `\`\`\`\n.lapharian\n#selesai\n- Backup database santri\n- Update absensi guru\n- Cek berkas kelas 5\n\`\`\`\n\n` +
    `4️⃣ *Mode libur:*\n` +
    `\`.lapharian libur\` _atau_ \`.lapharian off\` _atau_ \`.lapharian cuti\`\n\n` +
    `🕌 *Catatan:* Setiap hari *Jumat* otomatis libur, tidak perlu kirim apa-apa.\n\n` +
    `_💡 Tag '#selesai' & '#belum' boleh pakai spasi (mis. '# selesai') atau huruf besar/kecil._`
  );
}

// ────────────────────────────────────────────────
//  HELPER: Resolusi nomor WA asli dari sender JID
// ────────────────────────────────────────────────
async function resolveSenderNumber(sock, messageInfo) {
  const { sender, message } = messageInfo;
  const raw = String(sender || '');

  if (!raw.endsWith('@lid')) {
    const num = raw.replace(/[@].*/, '').replace(/[^0-9]/g, '');
    if (num) return { number: num, source: 'direct' };
  }

  try {
    const key = message?.key || {};
    const alt = key.participantAlt || key.senderAlt || '';
    if (alt && !alt.endsWith('@lid')) {
      const num = alt.replace(/[@].*/, '').replace(/[^0-9]/g, '');
      if (num) return { number: num, source: 'participantAlt' };
    }
  } catch (_) {}

  try {
    if (sock && sock.signalRepository?.lidMapping?.getPNForLID) {
      const realJid = await convertToJid(sock, raw);
      if (realJid) {
        const num = realJid.replace(/[@].*/, '').replace(/[^0-9]/g, '');
        if (num) return { number: num, source: 'lidMapping' };
      }
    }
  } catch (err) {
    console.warn('[.lapharian] convertToJid error:', err.message);
  }

  const num = raw.replace(/[@].*/, '').replace(/[^0-9]/g, '');
  return { number: num, source: 'lid-raw' };
}

function findStafFlexible(senderNumber) {
  let staf = getStafByWA(senderNumber);
  if (staf) return { staf, via: 'exact' };

  if (senderNumber.startsWith('62')) {
    const alt = '0' + senderNumber.slice(2);
    staf = getStafByWA(alt);
    if (staf) return { staf, via: 'no-cc' };
  } else if (senderNumber.startsWith('0')) {
    const alt = '62' + senderNumber.slice(1);
    staf = getStafByWA(alt);
    if (staf) return { staf, via: 'add-cc' };
  }
  return null;
}

// ────────────────────────────────────────────────
//  HANDLER UTAMA
// ────────────────────────────────────────────────
async function handle(sock, messageInfo) {
  try {
    const { m, remoteJid, sender, message } = messageInfo;
    const content = (messageInfo.content || messageInfo.fullText || '').trim();

    console.log(`\n[.lapharian] ═══════════════════════════════════`);
    console.log(`[.lapharian] Sender raw  : ${sender}`);
    console.log(`[.lapharian] Content     : ${content.slice(0, 120)}${content.length > 120 ? '...' : ''}`);

    const { number: senderNumber, source } = await resolveSenderNumber(sock, messageInfo);
    console.log(`[.lapharian] Sender num  : ${senderNumber} (via ${source})`);

    if (!senderNumber) {
      return await reply(m, `❌ _Tidak bisa membaca nomor pengirim. Coba kirim ulang._`);
    }

    const found = findStafFlexible(senderNumber);
    if (!found) {
      console.log(`[.lapharian] ❌ Bukan staf. Daftar staf:`,
        getAllStaf().map((s) => s.wa).join(', '));
      return await reply(
        m,
        `🚫 _Nomor Anda (${senderNumber}) belum terdaftar sebagai staf Pusdat._\n\n` +
        `_Hubungi admin untuk pendaftaran._`,
      );
    }
    const staf = found.staf;
    console.log(`[.lapharian] ✅ Staf match: ${staf.nama} (via ${found.via})`);

    // ═══════════════════════════════════════════════
    //  🆕 v13.6: JUMAT — otomatis libur
    // ═══════════════════════════════════════════════
    if (isJumatHariIni()) {
      console.log(`[.lapharian] 🕌 Jumat — auto-libur.`);
      try {
        await sock.sendMessage(remoteJid, { react: { text: '🕌', key: message.key } });
      } catch (_) {}
      try { setLiburHariIni(senderNumber, 'auto-jumat'); } catch (_) {}
      try { hentikanSpam(staf.id); } catch (_) {}
      return await reply(
        m,
        `🕌 *Jumat Mubarak, ${staf.nama}!*\n\n` +
          `Hari ini *libur otomatis* — tidak perlu kirim laporan bakdiyah.\n` +
          `Selamat beribadah & beristirahat. 🌿`,
      );
    }

    // ═══════════════════════════════════════════════
    //  MODE LIBUR — bypass total + matikan spam
    // ═══════════════════════════════════════════════
    if (isLiburKeyword(content)) {
      console.log(`[.lapharian] 🏖️ Mode LIBUR terdeteksi.`);

      const r = setLiburHariIni(senderNumber, 'lapharian');
      if (!r || !r.ok) {
        return await reply(m, `❌ Gagal menyimpan status libur: ${(r && r.reason) || 'Unknown'}`);
      }

      try {
        hentikanSpam(staf.id);
        console.log(`[.lapharian] 🛑 Spam dihentikan untuk staf ${staf.id}.`);
      } catch (e) {
        console.warn(`[.lapharian] ⚠️ Gagal stop spam:`, e.message);
      }

      try {
        await sock.sendMessage(remoteJid, { react: { text: '🏖️', key: message.key } });
      } catch (_) {}

      const teks =
        `✅ *LIBUR DICATAT*\n\n` +
        `🏖️ ${staf.nama}, hari ini di-set libur.\n` +
        `Spam & reminder dimatikan otomatis.\n\n` +
        `Selamat beristirahat! 🌿`;
      await reply(m, teks);

      console.log(`[.lapharian] ✅ Libur tersimpan. Spam OFF.`);
      console.log(`[.lapharian] ═══════════════════════════════════\n`);
      return;
    }

    // ─── Validasi konten (selain mode libur) ───
    if (!content) {
      return await reply(m, `⚠️ *Konten Kosong!*\n\n${buildPanduanLapharian()}`);
    }

    // ═══════════════════════════════════════════════
    //  PARSING ROBUST (lewat parser di prokerManager)
    // ═══════════════════════════════════════════════
    const preview = parseSelesaiBelum(content);
    console.log(`[.lapharian] 📋 Preview parse → selesai=${preview.selesai.length}, belum=${preview.belum.length}`);
    if (preview.selesai.length) {
      console.log(`[.lapharian]    SELESAI :`, preview.selesai);
    }
    if (preview.belum.length) {
      console.log(`[.lapharian]    BELUM   :`, preview.belum);
    }

    // Jika setelah parsing kedua list kosong → format salah
    if (preview.selesai.length === 0 && preview.belum.length === 0) {
      return await reply(m, `⚠️ *Tidak ada poin terbaca.*\n\n${buildPanduanLapharian()}`);
    }

    const r = simpanLaporanBakdiyah(senderNumber, content);
    if (!r || !r.ok) {
      console.log(`[.lapharian] ❌ Simpan gagal:`, r);
      return await reply(m, `❌ Gagal menyimpan laporan: ${(r && r.reason) || 'Unknown'}`);
    }
    console.log(`[.lapharian] ✅ Tersimpan. selesai=${r.selesai.length}, belum=${r.belum.length}`);

    try {
      hentikanSpam(staf.id);
    } catch (_) {}

    try {
      await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
    } catch (_) {}

    const teksKonfirmasi =
      `✅ *LAPORAN BAKDIYAH TERSIMPAN*\n\n` +
      `👤 ${staf.nama}\n` +
      `🕘 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n` +
      `✅ Selesai: *${r.selesai.length}* poin\n` +
      `${r.selesai.map((s, i) => `   ${i + 1}. ${s}`).join('\n') || '   _Nihil_'}\n\n` +
      `⏳ Belum Selesai: *${r.belum.length}* poin\n` +
      `${r.belum.map((s, i) => `   ${i + 1}. ${s}`).join('\n') || '   _Nihil_'}\n\n` +
      `_Poin "belum" otomatis jadi evaluasi besok pagi._`;

    await reply(m, teksKonfirmasi);

    try {
      const settings = readPusdatSettings();
      for (const jid of (settings && settings.targetGroups) || []) {
        if (jid !== remoteJid) {
          await sock.sendMessage(jid, { text: teksKonfirmasi });
        }
      }
    } catch (err) {
      console.error('[.lapharian] forward error:', err.message);
    }
    console.log(`[.lapharian] ═══════════════════════════════════\n`);
  } catch (err) {
    console.error('[.lapharian] ❌ FATAL:', err);
    try {
      await reply(messageInfo.m, `❌ Terjadi kesalahan internal: ${err.message}\n\n${buildPanduanLapharian()}`);
    } catch (_) {}
  }
}

export default {
  handle,
  Commands: ['lapharian', 'lapbakdiyah'],
  OnlyPremium: false,
  OnlyOwner: false,
  description: 'Laporan bakdiyah harian (staf piket)',
  category: 'PUSDAT',
};
