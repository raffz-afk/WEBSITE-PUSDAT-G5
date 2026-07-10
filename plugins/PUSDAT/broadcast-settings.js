/**
 * ============================================================
 *  plugins/PUSDAT/broadcast-settings.js
 *  ★ Command Admin: Pengaturan Dinamis Broadcast Harian Pusdat
 * ============================================================
 *
 *  4 COMMAND (OWNER ONLY):
 *
 *  .setwaktu [HH:mm]
 *    → Mengubah jam broadcast di pusdat_settings.json
 *    → Otomatis stop cron lama & start cron baru
 *
 *  .addtujuan [ID_GRUP]
 *    → Menambahkan ID Grup ke daftar target broadcast
 *    → ID Grup HARUS diketik manual oleh admin
 *
 *  .deltujuan [ID_GRUP]
 *    → Menghapus ID Grup dari daftar target broadcast
 *
 *  .listtujuan
 *    → Menampilkan seluruh ID Grup target broadcast
 *
 *  KEAMANAN:
 *  - OnlyOwner: true → Hanya nomor WA Owner yang bisa eksekusi
 *  - ID Grup diketik MANUAL, BUKAN otomatis dari grup chat
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import { readSettings, writeSettings, reloadCron } from '../../lib/cronBroadcast.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, message, command, content } = messageInfo;

  // ═══════════════════════════════════════════════
  //  COMMAND: .setwaktu [HH:mm]
  // ═══════════════════════════════════════════════
  if (command === 'setwaktu') {
    const inputWaktu = content.trim();

    // ── Validasi: harus ada input ──
    if (!inputWaktu) {
      return await reply(m,
        `❌ *Format salah!*\n\n` +
        `📝 Gunakan: *.setwaktu HH:mm*\n` +
        `📌 Contoh : *.setwaktu 07:30*`
      );
    }

    // ── Validasi: format HH:mm ──
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(inputWaktu)) {
      return await reply(m,
        `❌ *Format waktu tidak valid!*\n\n` +
        `⏰ Format yang benar: *HH:mm* (24 jam)\n` +
        `📌 Contoh: *07:30*, *14:00*, *21:45*\n\n` +
        `_Jam: 00-23, Menit: 00-59_`
      );
    }

    // ── Baca settings, ubah, simpan ──
    const settings = readSettings();
    const waktuLama = settings.broadcastTime;
    settings.broadcastTime = inputWaktu;
    writeSettings(settings);

    // ── Reload cron job ──
    const waktuBaru = reloadCron();

    // ── Konfirmasi ke admin ──
    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });

    return await reply(m,
      `✅ *Waktu Broadcast Berhasil Diubah!*\n\n` +
      `┣⌬ Waktu Lama : *${waktuLama}* WIB\n` +
      `┣⌬ Waktu Baru : *${waktuBaru}* WIB\n\n` +
      `🔄 _Cron job telah di-restart otomatis._\n` +
      `📡 _Broadcast berikutnya akan dikirim pada jam ${waktuBaru} WIB._`
    );
  }

  // ═══════════════════════════════════════════════
  //  COMMAND: .addtujuan [ID_GRUP]
  // ═══════════════════════════════════════════════
  if (command === 'addtujuan') {
    const inputIdGrup = content.trim();

    // ── Validasi: harus ada input ──
    if (!inputIdGrup) {
      return await reply(m,
        `❌ *ID Grup tidak boleh kosong!*\n\n` +
        `📝 Gunakan: *.addtujuan ID_GRUP*\n` +
        `📌 Contoh : *.addtujuan 120363123456789@g.us*\n\n` +
        `💡 _Gunakan command *.idgrup* di dalam grup untuk mengetahui ID-nya._`
      );
    }

    // ── Validasi: format ID grup WhatsApp ──
    if (!inputIdGrup.endsWith('@g.us')) {
      return await reply(m,
        `❌ *Format ID Grup tidak valid!*\n\n` +
        `ID Grup WhatsApp harus diakhiri dengan *@g.us*\n` +
        `📌 Contoh: *120363123456789@g.us*\n\n` +
        `💡 _Gunakan command *.idgrup* di dalam grup untuk mengetahui ID-nya._`
      );
    }

    // ── Baca settings ──
    const settings = readSettings();

    // ── Cek apakah sudah terdaftar ──
    if (settings.targetGroups.includes(inputIdGrup)) {
      return await reply(m,
        `⚠️ *ID Grup sudah terdaftar!*\n\n` +
        `ID: \`${inputIdGrup}\`\n` +
        `_Grup ini sudah ada di daftar target broadcast._\n\n` +
        `📋 _Gunakan *.listtujuan* untuk melihat daftar lengkap._`
      );
    }

    // ── Tambahkan ke array ──
    settings.targetGroups.push(inputIdGrup);
    writeSettings(settings);

    // ── Konfirmasi ──
    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });

    return await reply(m,
      `✅ *Grup Berhasil Ditambahkan ke Daftar Broadcast!*\n\n` +
      `┣⌬ ID Grup : \`${inputIdGrup}\`\n` +
      `┣⌬ Total Target : *${settings.targetGroups.length}* grup\n\n` +
      `📡 _Grup ini akan menerima Laporan Harian Pusdat setiap jam ${settings.broadcastTime} WIB._`
    );
  }

  // ═══════════════════════════════════════════════
  //  COMMAND: .deltujuan [ID_GRUP]
  // ═══════════════════════════════════════════════
  if (command === 'deltujuan') {
    const inputIdGrup = content.trim();

    // ── Validasi: harus ada input ──
    if (!inputIdGrup) {
      return await reply(m,
        `❌ *ID Grup tidak boleh kosong!*\n\n` +
        `📝 Gunakan: *.deltujuan ID_GRUP*\n` +
        `📌 Contoh : *.deltujuan 120363123456789@g.us*\n\n` +
        `📋 _Gunakan *.listtujuan* untuk melihat daftar ID yang terdaftar._`
      );
    }

    // ── Baca settings ──
    const settings = readSettings();

    // ── Cari dan hapus ──
    const index = settings.targetGroups.indexOf(inputIdGrup);

    if (index === -1) {
      return await reply(m,
        `❌ *ID Grup Tidak Ditemukan!*\n\n` +
        `ID: \`${inputIdGrup}\`\n` +
        `_ID tersebut tidak ada di daftar target broadcast._\n\n` +
        `📋 _Gunakan *.listtujuan* untuk melihat daftar yang benar._`
      );
    }

    settings.targetGroups.splice(index, 1);
    writeSettings(settings);

    // ── Konfirmasi ──
    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });

    return await reply(m,
      `✅ *Grup Berhasil Dihapus dari Daftar Broadcast!*\n\n` +
      `┣⌬ ID Dihapus : \`${inputIdGrup}\`\n` +
      `┣⌬ Sisa Target : *${settings.targetGroups.length}* grup\n\n` +
      `_Grup tersebut tidak akan menerima Laporan Harian lagi._`
    );
  }

  // ═══════════════════════════════════════════════
  //  COMMAND: .listtujuan
  // ═══════════════════════════════════════════════
  if (command === 'listtujuan') {
    const settings = readSettings();
    const groups = settings.targetGroups;
    const waktu = settings.broadcastTime;

    if (!groups || groups.length === 0) {
      return await reply(m,
        `📋 *DAFTAR TARGET BROADCAST HARIAN*\n\n` +
        `⏰ Jadwal : *${waktu}* WIB\n\n` +
        `_(Belum ada grup yang terdaftar)_\n\n` +
        `💡 _Gunakan *.addtujuan [ID_GRUP]* untuk menambahkan._`
      );
    }

    let listText = `📋 *DAFTAR TARGET BROADCAST HARIAN*\n\n`;
    listText += `⏰ Jadwal Broadcast : *${waktu}* WIB\n`;
    listText += `📊 Total Grup Target : *${groups.length}*\n\n`;
    listText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    groups.forEach((g, i) => {
      listText += `┃ ${i + 1}. \`${g}\`\n`;
    });

    listText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    listText += `📝 *Command Tersedia:*\n`;
    listText += `┣⌬ *.setwaktu HH:mm* — Ubah jam broadcast\n`;
    listText += `┣⌬ *.addtujuan ID* — Tambah grup\n`;
    listText += `┗⌬ *.deltujuan ID* — Hapus grup`;

    await sock.sendMessage(remoteJid, {
      react: { text: '📋', key: message.key },
    });

    return await reply(m, listText);
  }
}

export default {
  handle,
  Commands: ['setwaktu', 'addtujuan', 'deltujuan', 'listtujuan'],
  OnlyPremium: false,
  OnlyOwner: true, // ★ SUPER KETAT: Hanya Owner yang bisa eksekusi
};
