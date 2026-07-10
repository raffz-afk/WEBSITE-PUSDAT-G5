/**
 * ============================================================
 *  plugins/PUSDAT/idgrup.js — Cek ID Grup WhatsApp
 * ============================================================
 *
 *  Command: .idgrup
 *  Menampilkan ID Grup yang sedang digunakan.
 *  Berguna untuk mendapatkan ID Grup Staf Pusdat
 *  yang akan diisi di pusdat-config.js
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, isGroup, message } = messageInfo;

  if (!isGroup) {
    return await reply(m, '❌ _Command ini hanya bisa digunakan di dalam grup._');
  }

  try {
    // Ambil metadata grup
    const groupMeta = await sock.groupMetadata(remoteJid);

    const info = `
🆔 *INFORMASI GRUP*

┣⌬ *ID Grup*    : \`${remoteJid}\`
┣⌬ *Nama Grup*  : ${groupMeta.subject || '-'}
┣⌬ *Jumlah*     : ${groupMeta.participants?.length || 0} anggota

📋 _Salin ID di atas dan tempel di file_ \`pusdat-config.js\`
_pada bagian_ \`GRUP_STAF_PUSDAT_ID\``.trim();

    return await reply(m, info);
  } catch (err) {
    console.error('[IdGrup] Error:', err.message);
    // Fallback: tampilkan remoteJid langsung
    return await reply(m, `🆔 *ID Grup ini:*\n\`${remoteJid}\``);
  }
}

export default {
  handle,
  Commands: ['idgrup'],
  OnlyPremium: false,
  OnlyOwner: false,
};
