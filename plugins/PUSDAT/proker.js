/**
 * ============================================================
 *  plugins/PUSDAT/proker.js — 🆕 Setor Proker Hari Ini
 *  ★ VERSI v13.6 — JUMAT AUTO-LIBUR + CONTOH MULTI-PROKER
 * ============================================================
 *
 *  Command: .proker / .setorproker
 *
 *  📝 FORMAT YANG DITERIMA:
 *
 *    A) Format normal (banyak proker):
 *       .proker
 *       1. Backup database santri
 *       2. Audit berkas kelas 6
 *       3. Update absensi guru
 *
 *    B) Mode libur (BYPASS):
 *       .proker libur   /   .proker off   /   .proker cuti
 *
 *    C) Jumat → otomatis libur (tidak perlu kirim apa-apa)
 *
 * ============================================================
 *  PERBAIKAN v13.6 (4 Mei 2026):
 *  ────────────────────────────────────────────────────────
 *  ✅ Hard-block kalau hari Jumat → balas ucapan libur,
 *     tidak perlu setor proker.
 *  ✅ Pesan format-salah & konfirmasi diberi contoh multi-proker
 *     dan opsi libur supaya staf piket tidak bingung.
 *  ✅ try/catch tambahan supaya error tidak crash bot.
 *
 * ============================================================
 */

import { reply, convertToJid } from '../../lib/utils.js';
import {
  simpanProkerPagi,
  setLiburHariIni,
  isLiburKeyword,
  isJumatHariIni,
  getStafByWA,
  getStafPiketHariIni,
  getAllStaf,
} from '../../lib/prokerManager.js';
import { hentikanSpam } from '../../lib/cronProker.js';
import { readPusdatSettings } from '../../lib/dbAccess.js';

// ────────────────────────────────────────────────
//  Template format-salah / panduan
// ────────────────────────────────────────────────
function buildPanduanProker() {
  return (
    `📋 *PANDUAN SETOR PROKER HARI INI*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `1️⃣ *Mode normal (1 atau lebih proker):*\n` +
    `\`\`\`\n.proker\n1. Backup database santri\n2. Audit berkas kelas 6\n3. Update absensi guru\n4. Input angket kelas 6\n\`\`\`\n\n` +
    `2️⃣ *Mode satu poin saja:*\n` +
    `\`\`\`\n.proker\n1. Input angket kelas 6\n\`\`\`\n\n` +
    `3️⃣ *Mode libur* (otomatis matikan spam 07:30 & reminder 12:00):\n` +
    `\`.proker libur\` _atau_ \`.proker off\` _atau_ \`.proker cuti\`\n\n` +
    `🕌 *Catatan:* Setiap hari *Jumat* otomatis libur, tidak perlu kirim apa-apa.\n\n` +
    `_Minimum 5 karakter untuk mode normal._`
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
    console.warn('[.proker] convertToJid error:', err.message);
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

    console.log(`\n[.proker] ═══════════════════════════════════`);
    console.log(`[.proker] Sender raw : ${sender}`);
    console.log(`[.proker] Content    : ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`);

    // ── Resolusi nomor pengirim (LID-aware) ──
    const { number: senderNumber, source } = await resolveSenderNumber(sock, messageInfo);
    console.log(`[.proker] Sender num : ${senderNumber} (via ${source})`);

    if (!senderNumber) {
      return await reply(m, `❌ _Tidak bisa membaca nomor pengirim. Coba kirim ulang._`);
    }

    // ── Cek: pengirim adalah staf? ──
    const found = findStafFlexible(senderNumber);
    if (!found) {
      console.log(`[.proker] ❌ Bukan staf. Daftar:`, getAllStaf().map((s) => s.wa).join(', '));
      return await reply(
        m,
        `🚫 _Nomor Anda (${senderNumber}) tidak terdaftar sebagai staf Pusdat._`,
      );
    }
    const staf = found.staf;
    console.log(`[.proker] ✅ Staf match: ${staf.nama} (via ${found.via})`);

    // ═══════════════════════════════════════════════
    //  🆕 v13.6: JUMAT — otomatis libur, tidak perlu setor
    // ═══════════════════════════════════════════════
    if (isJumatHariIni()) {
      console.log(`[.proker] 🕌 Jumat — auto-libur, abaikan setoran.`);
      try {
        await sock.sendMessage(remoteJid, { react: { text: '🕌', key: message.key } });
      } catch (_) {}
      // Pastikan record di-set libur (idempotent)
      try { setLiburHariIni(senderNumber, 'auto-jumat'); } catch (_) {}
      try { hentikanSpam(staf.id); } catch (_) {}
      return await reply(
        m,
        `🕌 *Jumat Mubarak, ${staf.nama}!*\n\n` +
          `Hari ini *libur otomatis* — tidak perlu setor proker maupun laporan bakdiyah.\n` +
          `Selamat beribadah & beristirahat. 🌿`,
      );
    }

    // ── Cek: staf piket HARI INI? ──
    const piketHariIni = getStafPiketHariIni() || [];
    if (!piketHariIni.find((s) => s.id === staf.id)) {
      return await reply(
        m,
        `ℹ️ *${staf.nama}*, Anda *bukan staf piket hari ini*.\n\n` +
          `Jadwal Anda: *${staf.hari_label}*.`,
      );
    }

    // ═══════════════════════════════════════════════
    //  MODE LIBUR — bypass total + matikan spam
    // ═══════════════════════════════════════════════
    if (isLiburKeyword(content)) {
      console.log(`[.proker] 🏖️ Mode LIBUR terdeteksi.`);

      const r = setLiburHariIni(senderNumber, 'proker');
      if (!r || !r.ok) {
        return await reply(m, `❌ Gagal menyimpan status libur: ${(r && r.reason) || 'Unknown'}`);
      }

      try {
        hentikanSpam(staf.id);
        console.log(`[.proker] 🛑 Spam dihentikan untuk staf ${staf.id}.`);
      } catch (e) {
        console.warn(`[.proker] ⚠️ Gagal stop spam:`, e.message);
      }

      try {
        await sock.sendMessage(remoteJid, { react: { text: '🏖️', key: message.key } });
      } catch (_) {}

      const teks =
        `✅ *LIBUR DICATAT*\n\n` +
        `🏖️ ${staf.nama}, hari ini di-set libur.\n` +
        `Spam 07:30 & reminder 12:00 dimatikan otomatis.\n\n` +
        `Selamat beristirahat! 🌿`;
      await reply(m, teks);

      console.log(`[.proker] ✅ Libur tersimpan. Spam OFF. Bakdiyah auto-skipped.`);
      console.log(`[.proker] ═══════════════════════════════════\n`);
      return;
    }

    // ── Validasi: harus ada isi (mode normal) ──
    if (!content || content.length < 5) {
      return await reply(m, `❌ *Format Salah!*\n\n${buildPanduanProker()}`);
    }

    // ── Simpan proker pagi ──
    const result = simpanProkerPagi(senderNumber, content);
    if (!result || !result.ok) {
      console.log(`[.proker] ❌ Simpan gagal:`, result);
      return await reply(m, `❌ Gagal menyimpan: ${(result && result.reason) || 'Unknown'}`);
    }
    console.log(`[.proker] ✅ Tersimpan.`);

    // ── Stop spam ──
    try { hentikanSpam(staf.id); } catch (_) {}

    // ── Reaksi & konfirmasi ──
    try {
      await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
    } catch (_) {}

    const konfirmasi =
      `✅ *PROKER HARI INI TERSIMPAN*\n\n` +
      `👤 ${staf.nama}\n` +
      `🕘 ${result.record.proker_pagi.submitted_at}\n\n` +
      `📋 *Isi:*\n${result.record.proker_pagi.isi}\n\n` +
      `_Spam otomatis dihentikan. Reminder bakdiyah akan dikirim pukul 12.00._`;

    await reply(m, konfirmasi);

    // ── Forward ke semua grup target ──
    try {
      const settings = readPusdatSettings();
      const teksGrup =
        `📋 *PROKER HARI INI — ${staf.nama}*\n` +
        `🕘 ${result.record.proker_pagi.submitted_at}\n\n` +
        `${result.record.proker_pagi.isi}`;
      for (const jid of (settings && settings.targetGroups) || []) {
        if (jid !== remoteJid) {
          await sock.sendMessage(jid, { text: teksGrup });
        }
      }
    } catch (err) {
      console.error('[.proker] Gagal forward ke grup:', err.message);
    }
    console.log(`[.proker] ═══════════════════════════════════\n`);
  } catch (err) {
    // 🆕 v13.6: tangkap semua error supaya bot tidak crash
    console.error('[.proker] ❌ FATAL:', err);
    try {
      await reply(messageInfo.m, `❌ Terjadi kesalahan internal: ${err.message}\n\n${buildPanduanProker()}`);
    } catch (_) {}
  }
}

export default {
  handle,
  Commands: ['proker', 'setorproker'],
  OnlyPremium: false,
  OnlyOwner: false,
  description: 'Setor Proker Hari Ini (staf piket only)',
  category: 'PUSDAT',
};
