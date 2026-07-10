/**
 * ============================================================
 *  plugins/PUSDAT/listsantri.js — Daftar Santri Aktif (TWO-TIER)
 * ============================================================
 *
 *  ★ v8 REFACTORING: Two-Tier System untuk anti-spam chat
 *
 *  TIER 1 — Tanpa Parameter (.listsantri):
 *    SQL: GROUP BY [Kelas] → Tampilkan daftar kelas + jumlah santri
 *    Output: 1. Kelas 3 Int B: 35 Santri
 *
 *  TIER 2 — Dengan Parameter (.listsantri [Kelas]):
 *    SQL: LIKE '%kelas%' → Tampilkan daftar anak di kelas tersebut
 *    Output: No | Stambuk | Nama Lengkap
 *
 *  Command: .listsantri / .direktorisantri
 *  Tipe   : PUBLIK (Tanpa Login)
 *
 * ============================================================
 */

import { reply, style } from '../../lib/utils.js';
import { getKelasGroupCount, getSantriByKelasLike, deepSanitize } from '../../lib/dbAccess.js';

// ══════════════════════════════════════════════════
//  FUNGSI PEMECAH PESAN (CHUNKING)
// ══════════════════════════════════════════════════

function chunkText(text, maxLength = 3800) {
  if (!text || text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let cutPoint = remaining.lastIndexOf('\n', maxLength);

    if (cutPoint === -1 || cutPoint < maxLength * 0.5) {
      cutPoint = maxLength;
    }

    chunks.push(remaining.substring(0, cutPoint));
    remaining = remaining.substring(cutPoint).replace(/^\n/, '');
  }

  return chunks;
}

// ══════════════════════════════════════════════════
//  MAIN HANDLER
// ══════════════════════════════════════════════════

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, message } = messageInfo;

  // Ambil parameter setelah command
  const param = (content || '').trim();

  // Loading reaction
  await sock.sendMessage(remoteJid, {
    react: { text: '⏳', key: message.key },
  });

  try {
    // ═══════════════════════════════════════════════
    //  TIER 1: Tanpa Parameter → Daftar Kelas + Jumlah
    // ═══════════════════════════════════════════════
    if (!param) {
      let kelasList = await getKelasGroupCount();

      // 🛠️ v13.1 FIX (Bug #3): pastikan Array sebelum .reduce/.forEach
      if (!Array.isArray(kelasList)) {
        console.error('[LISTSANTRI] getKelasGroupCount tidak return Array, paksa []');
        kelasList = [];
      }

      if (kelasList.length === 0) {
        await sock.sendMessage(remoteJid, {
          react: { text: '❌', key: message.key },
        });
        return await reply(m, '❌ _Tidak ada data kelas santri aktif di database._');
      }

      // Hitung grand total
      const grandTotal = kelasList.reduce((acc, k) => acc + k.Total, 0);

      // Format output
      let outputText =
        `┏━━━━『 📋 *DAFTAR KELAS SANTRI AKTIF* 』━━━━┓\n` +
        `┃\n` +
        `┃ 📊 Grand Total: *${grandTotal}* santri aktif\n` +
        `┃ 🏫 Jumlah Kelas: *${kelasList.length}*\n` +
        `┃\n` +
        `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━\n┃\n`;

      kelasList.forEach((k, idx) => {
        outputText += `┃  ${idx + 1}. *${k.Kelas}* : ${k.Total} Santri\n`;
      });

      outputText += `┃\n┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
      outputText += `💡 _Ketik_ *.listsantri [nama kelas]* _untuk melihat daftar santri di kelas tertentu._\n`;
      outputText += `_Contoh: .listsantri 3 Int B_\n\n`;
      outputText += `🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

      await sock.sendMessage(remoteJid, {
        react: { text: '✅', key: message.key },
      });

      return await reply(m, style(outputText));
    }

    // ═══════════════════════════════════════════════
    //  TIER 2: Dengan Parameter → Daftar Anak di Kelas
    // ═══════════════════════════════════════════════
    let santriList = await getSantriByKelasLike(param);

    // 🛠️ v13.1 FIX (Bug #3): pastikan Array
    if (!Array.isArray(santriList)) {
      console.error('[LISTSANTRI] getSantriByKelasLike tidak return Array, paksa []');
      santriList = [];
    }

    if (santriList.length === 0) {
      await sock.sendMessage(remoteJid, {
        react: { text: '❌', key: message.key },
      });
      return await reply(
        m,
        `❌ _Tidak ditemukan santri aktif di kelas "${deepSanitize(param)}"._\n\n` +
        `_Tips: Pastikan nama kelas benar (contoh: 3 Int B, 4 KMI A)._\n` +
        `_Ketik_ *.listsantri* _tanpa parameter untuk melihat daftar kelas._`
      );
    }

    // Deteksi nama kelas dari hasil (ambil kelas pertama)
    const namaKelas = santriList[0].Kelas || param;

    // Format output sebagai tabel rapi
    let outputText =
      `┏━━━━『 📋 *DAFTAR SANTRI — ${String(namaKelas).toUpperCase()}* 』━━━━┓\n` +
      `┃\n` +
      `┃ 📊 Total: *${santriList.length}* santri\n` +
      `┃\n` +
      `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `┃ *No* | *Stambuk* | *Nama Lengkap*\n` +
      `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    santriList.forEach((santri, idx) => {
      outputText += `┃ ${String(idx + 1).padStart(2, ' ')}. | ${santri.Stambuk || '-'} | ${santri['Nama Lengkap'] || '-'}\n`;
    });

    outputText += `┃\n┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
    outputText += `🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

    // Chunking untuk pesan panjang
    const chunks = chunkText(outputText, 3800);

    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });

    for (let i = 0; i < chunks.length; i++) {
      const chunkHeader = chunks.length > 1 ? `📄 *Halaman ${i + 1}/${chunks.length}*\n\n` : '';
      await sock.sendMessage(
        remoteJid,
        { text: style(chunkHeader + chunks[i]) },
        i === 0 ? { quoted: message } : {}
      );

      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(`[LISTSANTRI] ✅ Tier-2: Kelas "${param}" → ${santriList.length} santri, ${chunks.length} pesan.`);

  } catch (err) {
    console.error('[LISTSANTRI] Error:', err.message);
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    await reply(m, `❌ _Terjadi kesalahan saat mengambil daftar santri: ${err.message}_`);
  }
}

export default {
  handle,
  Commands: ['listsantri', 'direktorisantri'],
  OnlyPremium: false,
  OnlyOwner: false,
};
