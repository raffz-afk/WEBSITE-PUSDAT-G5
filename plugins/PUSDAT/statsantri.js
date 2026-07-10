/**
 * ============================================================
 *  plugins/PUSDAT/statsantri.js — 📊 Statistik Santri v2
 *  ROMBAK TOTAL: Dual-Mode (List/Grouping + Fuzzy LIKE Search)
 * ============================================================
 *
 *  Command: .statsantri [kolom]            → Mode A: List/Grouping
 *           .statsantri [kolom] # [nilai]  → Mode B: Fuzzy LIKE Search
 *  Tipe   : PUBLIK (Tanpa Login)
 *
 *  ════════════════════════════════════════════════════════════
 *  MODE A: LIST / GROUPING (tanpa tanda #)
 *  ════════════════════════════════════════════════════════════
 *  Menampilkan SEMUA nilai unik yang ada di kolom tersebut
 *  beserta jumlahnya, menggunakan GROUP BY + ORDER BY COUNT DESC.
 *
 *  Contoh:
 *    .statsantri Konsulat
 *    .statsantri Kelas
 *    .statsantri Provinsi
 *
 *  Output:
 *    📊 STATISTIK: KONSULAT
 *    1. Surabaya: 120 Santri
 *    2. Surakarta-Jogjakarta: 85 Santri
 *    ...dst
 *
 *  ════════════════════════════════════════════════════════════
 *  MODE B: FUZZY LIKE SEARCH (dengan tanda #)
 *  ════════════════════════════════════════════════════════════
 *  Menghitung jumlah santri aktif menggunakan LIKE '%nilai%'
 *  (tidak perlu exact match, cukup mengandung kata kunci).
 *
 *  Contoh:
 *    .statsantri Konsulat # Jogja
 *    .statsantri Provinsi # Jawa
 *    .statsantri Kelas # Int
 *
 *  Output:
 *    📊 Terdapat total 85 Santri Aktif dengan Konsulat
 *       yang mengandung kata 'Jogja'.
 *
 * ============================================================
 */

import { reply, style } from '../../lib/utils.js';
import {
  getStatSantriGroupBy,
  getStatSantriLike,
  deepSanitize,
} from '../../lib/dbAccess.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, message } = messageInfo;

  const rawContent = (content || '').trim();

  // ═══ VALIDASI: Pastikan ada input ═══
  if (!rawContent) {
    return await reply(
      m,
      `❌ *Format Salah!*\n\n` +
      `Penggunaan:\n` +
      `┣⌬ *.statsantri [kolom]* → Lihat semua nilai & jumlahnya\n` +
      `┣⌬ *.statsantri [kolom] # [nilai]* → Cari fuzzy (mengandung kata)\n\n` +
      `Contoh Mode A (List):\n` +
      `┣⌬ .statsantri Konsulat\n` +
      `┣⌬ .statsantri Kelas\n` +
      `┣⌬ .statsantri Provinsi\n\n` +
      `Contoh Mode B (Fuzzy Search):\n` +
      `┣⌬ .statsantri Konsulat # Jogja\n` +
      `┣⌬ .statsantri Provinsi # Jawa\n` +
      `┣⌬ .statsantri Kelas # Int\n\n` +
      `📋 *Kolom yang Tersedia:*\n` +
      `Kelas, Konsulat, Golongan Darah, Suku, Daerah, ` +
      `Kewarganegaraan, Rayon, Kamar Rayon, Dapur, ` +
      `Tempat Pidato, POT, Jabatan, Posisi, ` +
      `Th Masuk Gontor, Provinsi, Kab/Kota, Kecamatan, ` +
      `dan lainnya.\n\n` +
      `_ℹ️ Pemisah # hanya diperlukan untuk Mode B (Fuzzy Search)._`
    );
  }

  // ═══ DETEKSI MODE: Cek apakah ada tanda # ═══
  const hasHash = rawContent.includes('#');

  // Loading reaction
  await sock.sendMessage(remoteJid, {
    react: { text: '📊', key: message.key },
  });

  try {
    if (hasHash) {
      // ══════════════════════════════════════════════
      //  MODE B: FUZZY LIKE SEARCH (ada tanda #)
      // ══════════════════════════════════════════════
      const parts = rawContent.split('#');

      if (parts.length < 2) {
        return await reply(
          m,
          `❌ _Format tidak valid. Gunakan tanda # sebagai pemisah._\n\n` +
          `_Contoh: .statsantri Konsulat # Jogja_`
        );
      }

      const kolom = deepSanitize(parts[0]).trim();
      const nilai = deepSanitize(parts.slice(1).join('#')).trim();

      if (!kolom || !nilai) {
        return await reply(
          m,
          `❌ _Kolom atau nilai tidak boleh kosong._\n\n` +
          `_Contoh: .statsantri Konsulat # Jogja_`
        );
      }

      // ═══ QUERY: Hitung statistik dengan LIKE ═══
      const total = await getStatSantriLike(kolom, nilai);

      await sock.sendMessage(remoteJid, {
        react: { text: '✅', key: message.key },
      });

      // ═══ FORMAT OUTPUT MODE B ═══
      const outputText =
        `┏━━━『 📊 *STATISTIK SANTRI* 』━━━\n` +
        `┃\n` +
        `┃ 📊 Terdapat total *${total}* Santri Aktif\n` +
        `┃ dengan *${kolom}* yang mengandung\n` +
        `┃ kata '*${nilai}*'.\n` +
        `┃\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━◧\n\n` +
        `🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

      await reply(m, style(outputText));

      console.log(`[STATSANTRI] ✅ Mode B (LIKE): [${kolom}] LIKE '%${nilai}%' → ${total} santri.`);

    } else {
      // ══════════════════════════════════════════════
      //  MODE A: LIST / GROUPING (tanpa tanda #)
      // ══════════════════════════════════════════════
      const kolom = deepSanitize(rawContent).trim();

      if (!kolom) {
        return await reply(
          m,
          `❌ _Nama kolom tidak boleh kosong._\n\n` +
          `_Contoh: .statsantri Konsulat_`
        );
      }

      // ═══ QUERY: GROUP BY pada kolom tersebut ═══
      let results = await getStatSantriGroupBy(kolom);

      // 🛠️ v13.1 FIX (Bug #3): pastikan Array sebelum .reduce/.map
      if (!Array.isArray(results)) {
        console.error('[STATSANTRI] getStatSantriGroupBy tidak return Array, paksa []');
        results = [];
      }

      await sock.sendMessage(remoteJid, {
        react: { text: '✅', key: message.key },
      });

      // ═══ FORMAT OUTPUT MODE A ═══
      if (results.length === 0) {
        const emptyText =
          `┏━━━『 📊 *STATISTIK: ${kolom.toUpperCase()}* 』━━━\n` +
          `┃\n` +
          `┃ ⚠️ Tidak ada data ditemukan.\n` +
          `┃\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━◧\n\n` +
          `🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

        return await reply(m, style(emptyText));
      }

      // Hitung grand total
      const grandTotal = results.reduce((sum, r) => sum + r.Total, 0);

      // Bangun daftar baris
      const lines = results.map((r, idx) => {
        const nilaiKolom = r.Nilai || '(Kosong)';
        return `┃ ${idx + 1}. *${nilaiKolom}*: ${r.Total} Santri`;
      });

      const outputText =
        `┏━━━『 📊 *STATISTIK: ${kolom.toUpperCase()}* 』━━━\n` +
        `┃\n` +
        `┃ 📋 Total Kategori: *${results.length}*\n` +
        `┃ 👥 Grand Total: *${grandTotal}* Santri Aktif\n` +
        `┃\n` +
        `┣━━━『 *RINCIAN* 』━━━\n` +
        `┃\n` +
        lines.join('\n') + '\n' +
        `┃\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━◧\n\n` +
        `🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

      // ═══ CHUNKING: Pecah pesan jika > 4000 karakter ═══
      if (outputText.length > 4000) {
        const chunks = chunkText(outputText, 3800);
        for (let i = 0; i < chunks.length; i++) {
          const chunkHeader = chunks.length > 1 ? `📄 *Halaman ${i + 1}/${chunks.length}*\n\n` : '';
          await sock.sendMessage(
            remoteJid,
            { text: chunkHeader + chunks[i] },
            i === 0 ? { quoted: message } : {}
          );
        }
      } else {
        await reply(m, style(outputText));
      }

      console.log(`[STATSANTRI] ✅ Mode A (GROUP BY): [${kolom}] → ${results.length} kategori, ${grandTotal} total.`);
    }

  } catch (err) {
    console.error('[STATSANTRI] Error:', err.message);
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    await reply(m, `❌ _${err.message}_`);
  }
}

/**
 * Helper: Pecah teks panjang menjadi beberapa chunk
 * agar tidak melebihi batas karakter WhatsApp.
 * @param {string} text - Teks yang akan dipecah
 * @param {number} maxLen - Panjang maksimal per chunk
 * @returns {string[]} Array of text chunks
 */
function chunkText(text, maxLen) {
  const chunks = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > maxLen && current.length > 0) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

export default {
  handle,
  Commands: ['statsantri'],
  OnlyPremium: false,
  OnlyOwner: false,
};
