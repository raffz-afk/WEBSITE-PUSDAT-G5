/**
 * ============================================================
 *  plugins/PUSDAT/daftar.js — Fitur 4: Registrasi & Approval
 * ============================================================
 *
 *  Command: .daftar [Stambuk] # [Nama] # [Tanggal Lahir DD/MM/YYYY]
 *
 *  Alur:
 *  1. User ketik .daftar 999 # Ahmad Fauzi # 15/08/2003
 *  2. Bot validasi format dan cek apakah Stambuk sudah ada
 *  3. Bot menyimpan data sementara (pending) di memory
 *  4. Bot mengirim pesan persetujuan ke Grup Staf Pusdat
 *  5. Staf membalas .terima [Stambuk] di grup → INSERT ke database
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import {
  isStambukExists,
  addPendingRegistration,
  getPendingRegistration,
} from '../../lib/dbAccess.js';
import pusdatConfig from '../../pusdat-config.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, prefix, command, message } = messageInfo;

  // ─── Validasi Input ───
  if (!content || content.trim() === '') {
    return await reply(
      m,
      `⚠️ *FORMAT REGISTRASI*\n\n` +
        `Gunakan format:\n` +
        `*${prefix}daftar [Stambuk] # [Nama Lengkap] # [Tanggal Lahir]*\n\n` +
        `📌 *Contoh:*\n` +
        `_${prefix}daftar 999 # Ahmad Fauzi # 15/08/2003_\n\n` +
        `_Format Tanggal Lahir: DD/MM/YYYY_`
    );
  }

  // Parse input: [Stambuk] # [Nama] # [Tanggal Lahir]
  const parts = content.split('#').map((p) => p.trim());

  if (parts.length !== 3) {
    return await reply(
      m,
      `❌ *Format Salah!*\n\n` +
        `Harus terdiri dari 3 bagian dipisahkan tanda *#*\n\n` +
        `*${prefix}daftar [Stambuk] # [Nama] # [Tanggal Lahir]*\n` +
        `_Contoh: ${prefix}daftar 999 # Ahmad Fauzi # 15/08/2003_`
    );
  }

  const [stambukRaw, nama, tanggalLahir] = parts;
  const stambuk = parseInt(stambukRaw, 10);

  // Validasi Stambuk
  if (isNaN(stambuk) || stambuk <= 0) {
    return await reply(m, `❌ _Nomor Stambuk tidak valid: "${stambukRaw}"_`);
  }

  // Validasi Nama
  if (!nama || nama.length < 2) {
    return await reply(m, `❌ _Nama terlalu pendek. Masukkan nama lengkap._`);
  }

  // Validasi Tanggal Lahir
  const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
  if (!dateRegex.test(tanggalLahir)) {
    return await reply(
      m,
      `❌ _Format tanggal lahir salah!_\n_Gunakan format: DD/MM/YYYY_\n_Contoh: 15/08/2003_`
    );
  }

  // Loading
  await sock.sendMessage(remoteJid, {
    react: { text: '⏳', key: message.key },
  });

  try {
    // Cek apakah Stambuk sudah ada di database
    const exists = await isStambukExists(stambuk);
    if (exists) {
      await sock.sendMessage(remoteJid, {
        react: { text: '❌', key: message.key },
      });
      return await reply(
        m,
        `❌ *Stambuk ${stambuk} Sudah Terdaftar!*\n\n` +
          `Nomor Stambuk ini sudah ada di database.\n` +
          `Jika Anda merasa ini salah, gunakan *.lapor* untuk melapor ke staf.`
      );
    }

    // Cek apakah sudah ada pending registration untuk stambuk ini
    const pendingExisting = getPendingRegistration(stambuk);
    if (pendingExisting) {
      return await reply(
        m,
        `⚠️ _Stambuk ${stambuk} sudah memiliki pendaftaran yang sedang menunggu persetujuan staf._\n_Mohon tunggu konfirmasi._`
      );
    }

    // Simpan pending registration
    addPendingRegistration(stambuk, {
      stambuk: stambuk,
      nama: nama,
      tanggalLahir: tanggalLahir,
      senderJid: sender,
    });

    // Kirim konfirmasi ke user
    await sock.sendMessage(remoteJid, {
      react: { text: '📨', key: message.key },
    });

    await reply(
      m,
      `📨 *PENDAFTARAN TERKIRIM*\n\n` +
        `Data Anda telah dikirim ke Staf Pusdat untuk diverifikasi.\n\n` +
        `📋 *Detail Pendaftaran:*\n` +
        `┣⌬ Stambuk     : *${stambuk}*\n` +
        `┣⌬ Nama        : *${nama}*\n` +
        `┣⌬ Tgl Lahir   : *${tanggalLahir}*\n\n` +
        `_⏳ Mohon tunggu persetujuan dari staf Pusdat._`
    );

    // Kirim pesan persetujuan ke Grup Staf Pusdat
    const grupStafId = pusdatConfig.GRUP_STAF_PUSDAT_ID;
    if (grupStafId && grupStafId !== '120363xxxxxxxxxxxx@g.us') {
      await sock.sendMessage(grupStafId, {
        text:
          `🆕 *PENDAFTARAN GURU BARU*\n\n` +
          `Seseorang mengajukan pendaftaran data baru:\n\n` +
          `┣⌬ *Stambuk*     : ${stambuk}\n` +
          `┣⌬ *Nama*        : ${nama}\n` +
          `┣⌬ *Tgl Lahir*   : ${tanggalLahir}\n` +
          `┣⌬ *Pengirim*    : @${sender.split('@')[0]}\n\n` +
          `─────────────────────\n` +
          `✅ Untuk *menyetujui*, balas:\n` +
          `*.terima ${stambuk}*\n\n` +
          `❌ Untuk *menolak*, abaikan saja.\n` +
          `─────────────────────`,
        mentions: [sender],
      });
    } else {
      console.warn('[Daftar] GRUP_STAF_PUSDAT_ID belum dikonfigurasi di pusdat-config.js!');
    }
  } catch (err) {
    console.error('[Daftar] Error:', err.message);
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    await reply(m, `❌ _Terjadi kesalahan: ${err.message}_`);
  }
}

export default {
  handle,
  Commands: ['daftar'],
  OnlyPremium: false,
  OnlyOwner: false,
};
