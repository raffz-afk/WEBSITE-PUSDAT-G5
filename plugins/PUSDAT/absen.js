/**
 * ============================================================
 *  plugins/PUSDAT/absen.js — Fitur 3: Direktori Guru (Publik)
 * ============================================================
 *
 *  Command: .absen
 *  Bersifat PUBLIK — TIDAK perlu login/gateway.
 *
 *  SQL QUERY:
 *    SELECT [Stambuk], [Nama Lengkap], [Guru Tahun ke], [Ranking]
 *    FROM [T Master Guru]
 *    WHERE [Status] = 'Aktif'
 *    ORDER BY [Ranking] ASC
 *
 *  ⚠️ DILARANG KERAS memanggil kolom [Tanggal Lahir] / Password!
 *
 *  CATATAN: Command .absen lama (absensi grup) sudah diubah
 *           menjadi .absensi di plugins/GROUP/absen.js
 *
 * ============================================================
 */

import { reply, style } from '../../lib/utils.js';
import { getDirektoriGuru } from '../../lib/dbAccess.js';
import pusdatConfig from '../../pusdat-config.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, message, content } = messageInfo;

  // Loading reaction
  await sock.sendMessage(remoteJid, {
    react: { text: '⏳', key: message.key },
  });

  try {
    let daftarGuru = await getDirektoriGuru();

    // 🛠️ v13.1 FIX (Bug #3): pastikan Array agar .filter() aman
    if (!Array.isArray(daftarGuru)) {
      console.error('[ABSEN] getDirektoriGuru tidak return Array, paksa []');
      daftarGuru = [];
    }

    if (daftarGuru.length === 0) {
      return await reply(m, '❌ _Data guru tidak ditemukan atau database kosong._');
    }

    // Jika user memberikan keyword pencarian
    let filteredGuru = daftarGuru;
    if (content && content.trim()) {
      const keyword = content.trim().toLowerCase();
      filteredGuru = daftarGuru.filter((g) => {
        const nama = (g['Nama Lengkap'] || '').toLowerCase();
        const stambuk = String(g.Stambuk || '');
        const tahun = String(g['Guru Tahun ke'] || '');
        return nama.includes(keyword) || stambuk.includes(keyword) || tahun.includes(keyword);
      });

      if (filteredGuru.length === 0) {
        return await reply(m, `❌ _Tidak ditemukan guru dengan kata kunci "${content.trim()}"_`);
      }
    }

    // Kelompokkan berdasarkan Guru Tahun ke
    const grouped = {};
    for (const guru of filteredGuru) {
      const tahun = guru['Guru Tahun ke'] || 'Lainnya';
      if (!grouped[tahun]) grouped[tahun] = [];
      grouped[tahun].push(guru);
    }

    // Urutkan grup tahun dari besar ke kecil (senior dulu)
    const sortedTahun = Object.keys(grouped).sort((a, b) => {
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      return numB - numA;
    });

    // Format output
    let output = `📋 *DIREKTORI GURU AKTIF*\n`;
    output += `📍 _PMDG Kampus 5 Magelang_\n`;
    output += `👥 _Total: ${filteredGuru.length} Guru_\n`;

    if (content && content.trim()) {
      output += `🔍 _Pencarian: "${content.trim()}"_\n`;
    }

    output += `\n`;

    let nomor = 1;
    for (const tahun of sortedTahun) {
      output += `┏━━━『 *GURU TAHUN KE-${tahun}* 』\n┃\n`;

      for (const guru of grouped[tahun]) {
        output += `┣ ${nomor}. *${guru['Nama Lengkap'] || '-'}*\n`;
        output += `┃    📌 Stambuk: ${guru.Stambuk || '-'}\n`;
        nomor++;
      }

      output += `┃\n┗━━━━━━━◧\n\n`;
    }

    output += `_${pusdatConfig.BOT_WATERMARK}_\n`;
    output += `_🔍 Tip: Ketik .absen [nama/stambuk] untuk mencari_`;

    // Jika terlalu panjang, split pesan
    if (output.length > 4000) {
      const chunks = splitMessage(output, 3500);
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) {
          await reply(m, style(chunks[i]));
        } else {
          await sock.sendMessage(remoteJid, { text: style(chunks[i]) }, { quoted: message });
        }
      }
    } else {
      await reply(m, style(output));
    }

    // Success reaction
    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });
  } catch (err) {
    console.error('[Absen/Direktori] Error:', err.message);
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    await reply(m, `❌ _Terjadi kesalahan: ${err.message}_`);
  }
}

/**
 * Memecah pesan panjang menjadi beberapa bagian
 */
function splitMessage(text, maxLength) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Cari posisi newline terakhir sebelum maxLength
    let splitPos = remaining.lastIndexOf('\n', maxLength);
    if (splitPos === -1 || splitPos < maxLength * 0.5) {
      splitPos = maxLength;
    }

    chunks.push(remaining.substring(0, splitPos));
    remaining = remaining.substring(splitPos).trimStart();
  }

  return chunks;
}

export default {
  handle,
  Commands: ['absen'],
  OnlyPremium: false,
  OnlyOwner: false,
};
