/**
 * ============================================================
 *  plugins/PUSDAT/piket.js — 🆕 Cek Jadwal Piket
 * ============================================================
 *
 *  Command: .piket          → siapa piket hari ini
 *           .piket all       → tampilkan semua jadwal staf
 *
 * ============================================================
 *  🛠️ FIX 25-Apr-2026:
 *  - Ganti `command:` → `Commands:` (kunci yang dibaca plugin loader).
 *  - Tambah OnlyPremium/OnlyOwner agar konsisten dgn plugin lain.
 *  - Guard `content`, dan `stafs` agar tidak crash bila DB kosong.
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import {
  getStafPiketHariIni,
  getAllStaf,
  getNamaHariIni,
  getHijriyahHariIni,
} from '../../lib/prokerManager.js';

async function handle(sock, messageInfo) {
  const { m } = messageInfo;
  const content = messageInfo.content || messageInfo.fullText || '';
  const arg = content.trim().toLowerCase();

  if (arg === 'all' || arg === 'semua') {
    const all = getAllStaf() || [];
    if (all.length === 0) {
      return await reply(m, `_Belum ada data staf Pusdat._`);
    }
    const teks =
      `📅 *DAFTAR JADWAL PIKET STAF PUSDAT*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      all
        .map(
          (s, i) =>
            `${i + 1}. *${s.nama}*\n` +
            `   📱 wa.me/${s.wa}\n` +
            `   📅 ${s.hari_label}\n` +
            `   ${s.aktif !== false ? '✅ Aktif' : '⚠️ Nonaktif'}`,
        )
        .join('\n\n');
    return await reply(m, teks);
  }

  const stafs = getStafPiketHariIni() || [];
  const h = getHijriyahHariIni() || { hari: '-', bulan: '-', tahun: '-' };
  const head =
    `📅 *PIKET HARI INI — ${getNamaHariIni().toUpperCase()}*\n` +
    `🕌 ${h.hari} ${h.bulan} ${h.tahun} H\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (stafs.length === 0) {
    return await reply(m, head + `_Tidak ada staf piket hari ini._\n\nKetik *.piket all* untuk lihat semua jadwal.`);
  }

  const body = stafs
    .map(
      (s) =>
        `👤 *${s.nama}*\n📱 wa.me/${s.wa}\n📅 Jadwal: ${s.hari_label}`,
    )
    .join('\n\n');

  return await reply(m, head + body);
}

export default {
  handle,
  Commands: ['piket', 'jadwalpiket'],
  OnlyPremium: false,
  OnlyOwner: false,
  description: 'Cek staf piket hari ini',
  category: 'PUSDAT',
};
