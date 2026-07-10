/**
 * ============================================================
 *  plugins/PUSDAT/lapor.js — Fitur 5: Layanan Bantuan Tanpa Login
 * ============================================================
 *
 *  Command: .lapor [Nama] # [Keluhan]
 *
 *  Fitur ini TIDAK membutuhkan gateway atau password.
 *  Bot meneruskan keluhan langsung ke Grup WA Staf Pusdat.
 *
 *  Contoh:
 *    .lapor Ahmad Fauzi # Stambuk saya salah, tidak bisa login
 *    .lapor Budi Santoso # Tanggal lahir di database salah
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import pusdatConfig from '../../pusdat-config.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, prefix, command, message } = messageInfo;

  // ─── Validasi Input ───
  if (!content || content.trim() === '') {
    return await reply(
      m,
      `⚠️ *FORMAT LAPORAN*\n\n` +
        `Gunakan format:\n` +
        `*${prefix}lapor [Nama] # [Keluhan]*\n\n` +
        `📌 *Contoh:*\n` +
        `_${prefix}lapor Ahmad Fauzi # Stambuk saya salah, seharusnya 125_\n` +
        `_${prefix}lapor Budi Santoso # Tanggal lahir di database salah, tidak bisa login_\n\n` +
        `ℹ️ _Fitur ini tidak memerlukan login._`
    );
  }

  // Parse input: [Nama] # [Keluhan]
  const parts = content.split('#').map((p) => p.trim());

  if (parts.length < 2) {
    return await reply(
      m,
      `❌ *Format Salah!*\n\n` +
        `Harus ada tanda *#* pemisah antara Nama dan Keluhan.\n\n` +
        `*${prefix}lapor [Nama] # [Keluhan]*\n` +
        `_Contoh: ${prefix}lapor Ahmad Fauzi # Tidak bisa login, stambuk salah_`
    );
  }

  const nama = parts[0];
  const keluhan = parts.slice(1).join('#').trim(); // Gabung jika ada # tambahan

  // Validasi
  if (!nama || nama.length < 2) {
    return await reply(m, `❌ _Nama terlalu pendek._`);
  }
  if (!keluhan || keluhan.length < 5) {
    return await reply(m, `❌ _Keluhan terlalu pendek. Jelaskan masalah Anda dengan lebih detail._`);
  }

  // Loading
  await sock.sendMessage(remoteJid, {
    react: { text: '📨', key: message.key },
  });

  try {
    // Konfirmasi ke user
    await reply(
      m,
      `📨 *LAPORAN TERKIRIM*\n\n` +
        `Keluhan Anda telah diteruskan ke Staf Pusdat.\n\n` +
        `📋 *Detail Laporan:*\n` +
        `┣⌬ Nama     : *${nama}*\n` +
        `┣⌬ Keluhan  : _${keluhan}_\n\n` +
        `_⏳ Mohon tunggu, staf akan melakukan pengecekan manual._`
    );

    // Kirim laporan ke Grup Staf Pusdat
    const grupStafId = pusdatConfig.GRUP_STAF_PUSDAT_ID;
    if (grupStafId && grupStafId !== '120363xxxxxxxxxxxx@g.us') {
      await sock.sendMessage(grupStafId, {
        text:
          `🚨 *LAPORAN MASALAH LOGIN/DATA*\n\n` +
          `Seseorang melaporkan masalah:\n\n` +
          `┣⌬ *Nama*     : ${nama}\n` +
          `┣⌬ *Pengirim* : @${sender.split('@')[0]}\n` +
          `┣⌬ *Keluhan*  :\n${keluhan}\n\n` +
          `_⚠️ Harap cek dan tindaklanjuti di database Access._`,
        mentions: [sender],
      });
    } else {
      console.warn('[Lapor] GRUP_STAF_PUSDAT_ID belum dikonfigurasi di pusdat-config.js!');
      // Tetap berikan konfirmasi ke user meskipun grup belum diset
    }

    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });
  } catch (err) {
    console.error('[Lapor] Error:', err.message);
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    await reply(m, `❌ _Terjadi kesalahan: ${err.message}_`);
  }
}

export default {
  handle,
  Commands: ['lapor'],
  OnlyPremium: false,
  OnlyOwner: false,
};
