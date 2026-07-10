/**
 * ============================================================
 *  plugins/PUSDAT/listproker.js — 🆕 v12: Lihat Proker Tahunan/Bulanan/Pekanan
 * ============================================================
 *
 *  Command:
 *    .listproker            → tampilkan tahunan + bulanan + pekanan
 *    .listproker tahunan    → hanya tahunan
 *    .listproker bulanan    → hanya bulanan
 *    .listproker pekanan    → 🆕 hanya pekanan
 *
 *  v12 changes:
 *    - Tambah dukungan format pekanan
 *    - Output gabungan otomatis include semua tipe
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import {
  formatProkerTahunanText,
  formatProkerBulananText,
} from '../../lib/prokerManager.js';
import { formatProkerPekananText } from '../../lib/prokerEditor.js';

async function handle(sock, messageInfo) {
  const { m } = messageInfo;
  const content = messageInfo.content || messageInfo.fullText || '';
  const arg = content.trim().toLowerCase();

  let teks = '';
  if (arg === 'tahunan' || arg === 'tahun') {
    teks = formatProkerTahunanText();
  } else if (arg === 'bulanan' || arg === 'bulan') {
    teks = formatProkerBulananText();
  } else if (arg === 'pekanan' || arg === 'pekan' || arg === 'mingguan') {
    teks = formatProkerPekananText();
  } else {
    // Tampilkan semua
    teks =
      `${formatProkerTahunanText()}\n\n` +
      `${formatProkerBulananText()}\n\n` +
      `${formatProkerPekananText()}\n\n` +
      `_💡 Gunakan_ \`.listproker tahunan\` / \`.listproker bulanan\` / \`.listproker pekanan\`\n` +
      `_untuk filter_`;
  }

  return await reply(m, teks);
}

export default {
  handle,
  Commands: ['listproker', 'lstproker'],
  OnlyPremium: false,
  OnlyOwner: false,
  description: 'Lihat daftar Proker Tahunan, Bulanan & Pekanan',
  category: 'PUSDAT',
};
