/**
 * ============================================================
 *  plugins/PUSDAT/terima.js — Approval Pendaftaran oleh Staf
 * ============================================================
 *
 *  Command: .terima [Stambuk]
 *  Hanya bisa dijalankan di dalam Grup Staf Pusdat.
 *
 *  Alur:
 *  1. Staf ketik .terima 999 di Grup Staf
 *  2. Bot cek pending registration untuk Stambuk 999
 *  3. Bot jalankan INSERT INTO ke database .accdb
 *  4. Bot kirim konfirmasi ke grup + DM ke pendaftar
 *
 *  SQL QUERY:
 *    INSERT INTO [T Master Guru]
 *      ([Stambuk], [Nama Lengkap], [Tanggal Lahir], [Status])
 *    VALUES (999, 'Ahmad Fauzi', #08/15/2003#, 'Aktif')
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import {
  getPendingRegistration,
  removePendingRegistration,
  insertGuru,
  isStambukExists,
} from '../../lib/dbAccess.js';
import pusdatConfig from '../../pusdat-config.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, prefix, command, message, isGroup } = messageInfo;

  // Hanya bisa dijalankan di grup
  if (!isGroup) {
    return await reply(m, '❌ _Command ini hanya bisa digunakan di dalam Grup Staf Pusdat._');
  }

  // Cek apakah ini grup staf (opsional, bisa diperketat)
  const grupStafId = pusdatConfig.GRUP_STAF_PUSDAT_ID;
  if (grupStafId && grupStafId !== '120363xxxxxxxxxxxx@g.us' && remoteJid !== grupStafId) {
    return await reply(m, '❌ _Command ini hanya bisa digunakan di Grup Staf Pusdat._');
  }

  // Validasi input
  if (!content || content.trim() === '') {
    return await reply(
      m,
      `⚠️ *FORMAT:*\n*${prefix}terima [Nomor Stambuk]*\n\n_Contoh: ${prefix}terima 999_`
    );
  }

  const stambuk = parseInt(content.trim(), 10);
  if (isNaN(stambuk)) {
    return await reply(m, `❌ _Nomor Stambuk tidak valid: "${content.trim()}"_`);
  }

  // Loading
  await sock.sendMessage(remoteJid, {
    react: { text: '⏳', key: message.key },
  });

  try {
    // Cek apakah ada pending registration
    const pending = getPendingRegistration(stambuk);

    if (!pending) {
      await sock.sendMessage(remoteJid, {
        react: { text: '❌', key: message.key },
      });
      return await reply(
        m,
        `❌ _Tidak ada pendaftaran yang menunggu untuk Stambuk ${stambuk}._\n_Mungkin sudah diproses atau belum ada yang mendaftar._`
      );
    }

    // Double-check apakah stambuk sudah ada di DB
    const exists = await isStambukExists(stambuk);
    if (exists) {
      removePendingRegistration(stambuk);
      await sock.sendMessage(remoteJid, {
        react: { text: '⚠️', key: message.key },
      });
      return await reply(
        m,
        `⚠️ _Stambuk ${stambuk} ternyata sudah ada di database. Pendaftaran dibatalkan._`
      );
    }

    // INSERT ke database
    await insertGuru({
      stambuk: pending.stambuk,
      nama: pending.nama,
      tanggalLahir: pending.tanggalLahir,
    });

    // Hapus dari pending
    removePendingRegistration(stambuk);

    // Konfirmasi di grup
    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });

    await reply(
      m,
      `✅ *PENDAFTARAN DISETUJUI*\n\n` +
        `Data berikut telah berhasil ditambahkan ke database:\n\n` +
        `┣⌬ Stambuk   : *${pending.stambuk}*\n` +
        `┣⌬ Nama      : *${pending.nama}*\n` +
        `┣⌬ Tgl Lahir : *${pending.tanggalLahir}*\n` +
        `┣⌬ Status    : *Aktif*\n\n` +
        `_Disetujui oleh @${sender.split('@')[0]}_`,
    );

    // Kirim DM ke pendaftar
    if (pending.senderJid) {
      try {
        await sock.sendMessage(pending.senderJid, {
          text:
            `🎉 *PENDAFTARAN DISETUJUI!*\n\n` +
            `Selamat! Data Anda telah diverifikasi dan ditambahkan ke database Pusdat Gontor 5.\n\n` +
            `┣⌬ Stambuk   : *${pending.stambuk}*\n` +
            `┣⌬ Nama      : *${pending.nama}*\n\n` +
            `_Anda sekarang bisa menggunakan fitur *.cek* untuk melihat data pribadi._`,
        });
      } catch (dmErr) {
        console.warn('[Terima] Gagal kirim DM ke pendaftar:', dmErr.message);
      }
    }
  } catch (err) {
    console.error('[Terima] Error:', err.message);
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    await reply(m, `❌ _Gagal menyimpan data: ${err.message}_`);
  }
}

export default {
  handle,
  Commands: ['terima'],
  OnlyPremium: false,
  OnlyOwner: false,
};
