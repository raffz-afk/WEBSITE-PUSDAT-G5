/**
 * ============================================================
 *  plugins/PUSDAT/carisantri.js — 🆕 Pencarian Santri
 * ============================================================
 *
 *  Command: .carisantri [keyword]
 *  Tipe   : PUBLIK (Tanpa Login)
 *
 *  Mencari santri aktif berdasarkan nama atau stambuk.
 *  Menggunakan pencarian LIKE '%keyword%' di database.
 *
 *  Contoh:
 *    .carisantri Ahmad
 *    .carisantri 14012
 *
 *  Output:
 *    ┏━━━『 🔍 HASIL PENCARIAN 』
 *    ┃
 *    ┣⌬ 1. Ahmad Fauzi
 *    ┃     Stambuk: 140123 | Kelas: 3 Int B
 *    ┗━━━━━━━◧
 *
 * ============================================================
 */

import { reply, style } from '../../lib/utils.js';
import { cariSantri, deepSanitize } from '../../lib/dbAccess.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, message } = messageInfo;

  // ═══ VALIDASI: Pastikan keyword disertakan ═══
  const keyword = (content || '').trim();

  if (!keyword) {
    return await reply(
      m,
      `❌ *Format Salah!*\n\n` +
      `Penggunaan: *.carisantri [keyword]*\n\n` +
      `Contoh:\n` +
      `┣⌬ .carisantri Ahmad\n` +
      `┣⌬ .carisantri 14012\n\n` +
      `_Pencarian dilakukan pada kolom Nama dan Stambuk._`
    );
  }

  // Loading reaction
  await sock.sendMessage(remoteJid, {
    react: { text: '🔍', key: message.key },
  });

  try {
    // ═══ QUERY: Cari santri ═══
    let results = await cariSantri(keyword);

    // 🛠️ v13.1 FIX (Bug #3): pastikan Array
    if (!Array.isArray(results)) {
      console.error('[CARISANTRI] cariSantri tidak return Array, paksa []');
      results = [];
    }

    if (results.length === 0) {
      await sock.sendMessage(remoteJid, {
        react: { text: '❌', key: message.key },
      });
      return await reply(
        m,
        `🔍 *Hasil Pencarian: "${keyword}"*\n\n` +
        `❌ _Tidak ditemukan santri aktif dengan kata kunci tersebut._\n\n` +
        `_Tips: Coba gunakan sebagian nama (misal "Ahm" untuk "Ahmad")._`
      );
    }

    // ═══ FORMAT OUTPUT ═══
    let outputText =
      `┏━━━『 🔍 *HASIL PENCARIAN* 』━━━\n` +
      `┃\n` +
      `┃ 🔑 Keyword: *${deepSanitize(keyword)}*\n` +
      `┃ 📊 Ditemukan: *${results.length}* santri\n` +
      `┃\n`;

    // Batasi tampilan maksimal 30 hasil agar pesan tidak terlalu panjang
    const maxDisplay = 30;
    const displayResults = results.slice(0, maxDisplay);

    displayResults.forEach((santri, idx) => {
      outputText += `┣⌬ ${idx + 1}. *${santri['Nama Lengkap'] || '-'}*\n`;
      outputText += `┃     Stambuk: ${santri.Stambuk || '-'} | Kelas: ${santri.Kelas || '-'}\n`;
    });

    if (results.length > maxDisplay) {
      outputText += `┃\n┣⌬ _...dan ${results.length - maxDisplay} santri lainnya._\n`;
      outputText += `┃  _Gunakan keyword yang lebih spesifik untuk mempersempit hasil._\n`;
    }

    outputText += `┃\n┗━━━━━━━━━━━━━━━━━━━━━◧\n\n🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });

    await reply(m, style(outputText));

    console.log(`[CARISANTRI] ✅ Pencarian "${keyword}" → ${results.length} hasil.`);

  } catch (err) {
    console.error('[CARISANTRI] Error:', err.message);
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    await reply(m, `❌ _Terjadi kesalahan saat mencari santri: ${err.message}_`);
  }
}

export default {
  handle,
  Commands: ['carisantri'],
  OnlyPremium: false,
  OnlyOwner: false,
};
