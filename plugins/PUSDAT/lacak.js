/**
 * ============================================================
 *  plugins/PUSDAT/lacak.js — 🆕 Radar Lokasi Santri (Ringan)
 * ============================================================
 *
 *  ★ v8 FITUR BARU: Lacak — Versi super ringan dari .ceksantri
 *
 *  Command: .lacak [Nama atau Stambuk]
 *  Tipe   : PUBLIK (Tanpa Login)
 *
 *  Output DIBATASI hanya memunculkan:
 *  - Nama Lengkap
 *  - Stambuk
 *  - Kelas
 *  - Rayon
 *  - Kamar Rayon
 *
 *  Use Case: Kebutuhan darurat kurir / tamu yang ingin mencari
 *  lokasi santri tanpa perlu melihat biodata lengkap.
 *
 *  Contoh:
 *    .lacak Ahmad Fauzi
 *    .lacak 140123
 *
 * ============================================================
 */

import { reply, style } from '../../lib/utils.js';
import { lacakSantri, deepSanitize } from '../../lib/dbAccess.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, message } = messageInfo;

  // ═══ VALIDASI: Pastikan keyword disertakan ═══
  const keyword = (content || '').trim();

  if (!keyword) {
    return await reply(
      m,
      `❌ *Format Salah!*\n\n` +
      `Penggunaan: *.lacak [Nama atau Stambuk]*\n\n` +
      `Contoh:\n` +
      `┣⌬ .lacak Ahmad Fauzi\n` +
      `┣⌬ .lacak 140123\n\n` +
      `_Fitur ini menampilkan lokasi santri (Kelas, Rayon, Kamar) secara ringkas._`
    );
  }

  // Loading reaction
  await sock.sendMessage(remoteJid, {
    react: { text: '📡', key: message.key },
  });

  try {
    // ═══ QUERY: Lacak santri ═══
    let results = await lacakSantri(keyword);

    // 🛠️ v13.1 FIX (Bug #3): pastikan Array
    if (!Array.isArray(results)) {
      console.error('[LACAK] lacakSantri tidak return Array, paksa []');
      results = [];
    }

    if (results.length === 0) {
      await sock.sendMessage(remoteJid, {
        react: { text: '❌', key: message.key },
      });
      return await reply(
        m,
        `📡 *Radar Lokasi: "${deepSanitize(keyword)}"*\n\n` +
        `❌ _Tidak ditemukan santri aktif dengan kata kunci tersebut._\n\n` +
        `_Tips: Coba gunakan sebagian nama atau nomor stambuk._`
      );
    }

    // ═══ FORMAT OUTPUT ═══
    let outputText =
      `┏━━━『 📡 *RADAR LOKASI SANTRI* 』━━━\n` +
      `┃\n` +
      `┃ 🔑 Keyword: *${deepSanitize(keyword)}*\n` +
      `┃ 📊 Ditemukan: *${results.length}* santri\n` +
      `┃\n`;

    // Batasi tampilan maksimal 20 hasil
    const maxDisplay = 20;
    const displayResults = results.slice(0, maxDisplay);

    displayResults.forEach((santri, idx) => {
      outputText += `┣━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      outputText += `┃ *${idx + 1}. ${santri['Nama Lengkap'] || '-'}*\n`;
      outputText += `┃  📇 Stambuk    : ${santri.Stambuk || '-'}\n`;
      outputText += `┃  📚 Kelas      : ${santri.Kelas || '-'}\n`;
      outputText += `┃  🏠 Rayon      : ${santri.Rayon || '-'}\n`;
      outputText += `┃  🚪 Kamar Rayon: ${santri['Kamar Rayon'] || '-'}\n`;
    });

    if (results.length > maxDisplay) {
      outputText += `┃\n┣⌬ _...dan ${results.length - maxDisplay} santri lainnya._\n`;
      outputText += `┃  _Gunakan keyword yang lebih spesifik._\n`;
    }

    outputText += `┃\n┗━━━━━━━━━━━━━━━━━━━━━◧\n\n🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });

    await reply(m, style(outputText));

    console.log(`[LACAK] ✅ Pencarian "${keyword}" → ${results.length} hasil.`);

  } catch (err) {
    console.error('[LACAK] Error:', err.message);
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    await reply(m, `❌ _Terjadi kesalahan saat melacak santri: ${err.message}_`);
  }
}

export default {
  handle,
  Commands: ['lacak', 'radarlokasi'],
  OnlyPremium: false,
  OnlyOwner: false,
};
