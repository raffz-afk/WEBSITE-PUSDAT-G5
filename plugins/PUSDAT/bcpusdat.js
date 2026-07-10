/**
 * ============================================================
 *  plugins/PUSDAT/bcpusdat.js — 🆕 Broadcast Resmi Pusdat
 * ============================================================
 *
 *  ★ v8 FITUR BARU: Sistem Broadcast Resmi — OWNER ONLY
 *
 *  Command: .bcpusdat [Teks Pengumuman]
 *  Tipe   : OWNER / SUPERADMIN ONLY
 *
 *  ALUR:
 *  1. Cek akses: WAJIB Owner atau Superadmin
 *  2. Baca array targetGroups dari pusdat_settings.json
 *  3. Kirim teks pengumuman ke semua grup target
 *  4. Pesan dibingkai header/footer resmi
 *
 *  Contoh:
 *    .bcpusdat Besok semua data wajib dikumpulkan sebelum jam 10 pagi
 *    .bcpusdat Pengumuman: Rapat Staf Pusdat jam 14:00 WIB
 *
 * ============================================================
 */

import { reply, style } from '../../lib/utils.js';
import { readPusdatSettings } from '../../lib/dbAccess.js';
import config from '../../config.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, message } = messageInfo;

  // ═══ 1. CEK AKSES: Owner / Superadmin ONLY ═══
  const senderNumber = sender.replace(/[@].*/, '').replace(/[^0-9]/g, '');
  const ownerNumbers = config.owner_number || [];

  const isOwner = ownerNumbers.includes(senderNumber);

  if (!isOwner) {
    await sock.sendMessage(remoteJid, {
      react: { text: '🚫', key: message.key },
    });
    return await reply(
      m,
      `🚫 *Akses Ditolak!*\n\n` +
      `Fitur *.bcpusdat* hanya bisa digunakan oleh *Owner / Superadmin* bot.\n\n` +
      `_Jika kamu adalah staf Pusdat, hubungi Owner untuk mengirimkan pengumuman._`
    );
  }

  // ═══ 2. VALIDASI: Pastikan teks pengumuman disertakan ═══
  const teksAnnouncement = (content || '').trim();

  if (!teksAnnouncement) {
    return await reply(
      m,
      `❌ *Format Salah!*\n\n` +
      `Penggunaan: *.bcpusdat [Teks Pengumuman]*\n\n` +
      `Contoh:\n` +
      `┣⌬ .bcpusdat Besok semua data wajib dikumpulkan\n` +
      `┣⌬ .bcpusdat Rapat Staf Pusdat jam 14:00 WIB\n\n` +
      `_Pesan akan dikirim ke semua grup target yang terdaftar._`
    );
  }

  // Loading reaction
  await sock.sendMessage(remoteJid, {
    react: { text: '📢', key: message.key },
  });

  try {
    // ═══ 3. BACA: targetGroups dari pusdat_settings.json ═══
    const settings = readPusdatSettings();
    const targetGroups = settings.targetGroups || [];

    if (targetGroups.length === 0) {
      await sock.sendMessage(remoteJid, {
        react: { text: '❌', key: message.key },
      });
      return await reply(
        m,
        `❌ *Tidak ada grup target!*\n\n` +
        `Array targetGroups di pusdat_settings.json masih kosong.\n` +
        `Tambahkan ID grup terlebih dahulu menggunakan fitur *.broadcast-settings*`
      );
    }

    // ═══ 4. BUILD: Pesan dengan header/footer resmi ═══
    const now = new Date();
    const tanggal = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
    const waktu = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

    const broadcastMessage =
      `╔══════════════════════════════════╗\n` +
      `║  📢 *PENGUMUMAN RESMI PUSAT DATA*  ║\n` +
      `║     _PMDG Kampus 5 Magelang_       ║\n` +
      `╚══════════════════════════════════╝\n\n` +
      `${teksAnnouncement}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📅 ${tanggal} | 🕒 ${waktu} WIB\n` +
      `_Disampaikan oleh Pusat Data Gontor 5_\n` +
      `_Pesan ini dikirim secara resmi melalui Bot Pusdat._`;

    // ═══ 5. KIRIM: Ke semua grup target ═══
    let berhasilCount = 0;
    let gagalCount = 0;
    const gagalList = [];

    for (const grupId of targetGroups) {
      if (!grupId || typeof grupId !== 'string' || !grupId.endsWith('@g.us')) {
        console.warn(`[BCPUSDAT] ⚠️ ID grup tidak valid, dilewati: ${grupId}`);
        gagalCount++;
        gagalList.push(grupId);
        continue;
      }

      try {
        await sock.sendMessage(grupId, { text: style(broadcastMessage) });
        console.log(`[BCPUSDAT] ✅ Terkirim ke: ${grupId}`);
        berhasilCount++;

        // Jeda antar pengiriman untuk menghindari rate limit
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`[BCPUSDAT] ❌ Gagal kirim ke ${grupId}: ${err.message}`);
        gagalCount++;
        gagalList.push(grupId);
      }
    }

    // ═══ 6. LAPORAN: Kirim ringkasan ke pengirim ═══
    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });

    let reportText =
      `✅ *Broadcast Selesai!*\n\n` +
      `📊 *Ringkasan:*\n` +
      `┣⌬ Total Grup   : ${targetGroups.length}\n` +
      `┣⌬ Berhasil     : ${berhasilCount}\n` +
      `┗⌬ Gagal        : ${gagalCount}\n`;

    if (gagalList.length > 0) {
      reportText += `\n⚠️ *Grup Gagal:*\n`;
      gagalList.forEach((g, i) => {
        reportText += `  ${i + 1}. ${g}\n`;
      });
    }

    reportText += `\n🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

    await reply(m, style(reportText));

    console.log(`[BCPUSDAT] ✅ Broadcast selesai: ${berhasilCount}/${targetGroups.length} berhasil.`);

  } catch (err) {
    console.error('[BCPUSDAT] Error:', err.message);
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    await reply(m, `❌ _Terjadi kesalahan saat broadcast: ${err.message}_`);
  }
}

export default {
  handle,
  Commands: ['bcpusdat', 'broadcastpusdat'],
  OnlyPremium: false,
  OnlyOwner: true, // Hanya Owner yang bisa mengakses
};
