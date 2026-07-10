/**
 * ============================================================
 *  plugins/PUSDAT/validasidata.js — Validasi Data Guru (Event)
 *  ★ v18.0
 * ============================================================
 *
 *  Command: .validasidata  (alias: .validasi, .vd)
 *
 *  Alur:
 *  1. User ketik .validasidata
 *  2. Bot mengecek apakah ada event validasi yang sedang aktif
 *  3. Jika ada, bot menampilkan info event lalu meminta Stambuk
 *  4. User input Stambuk → gateway minta Tanggal Lahir
 *  5. Setelah terverifikasi, gateway menandai user sebagai SUDAH VALIDASI
 *     pada event tersebut (channel = 'wa')
 *  6. Bot menampilkan biodata user sebagai bukti & untuk diperiksa
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import { setSession, getSession, clearSession } from '../../lib/dbAccess.js';
import * as validasiEvent from '../../lib/validasiEvent.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, message } = messageInfo;

  try {
    await sock.sendMessage(remoteJid, { react: { text: '📋', key: message.key } });
  } catch (_) {}

  const openEv = validasiEvent.getOpenEvent();
  if (!openEv) {
    return reply(
      m,
      `ℹ️ *TIDAK ADA EVENT VALIDASI AKTIF*\n\n` +
        `Saat ini belum ada event validasi data guru yang berjalan.\n\n` +
        `_Silakan tunggu pengumuman dari admin Pusdat untuk event validasi berikutnya._\n\n` +
        `📌 Untuk sekedar mengecek data pribadi, gunakan perintah *.cek*`
    );
  }

  if (getSession(sender)) clearSession(sender);

  const eff = validasiEvent.getEffectiveDeadline(openEv);
  const exts = Array.isArray(openEv.extensions) ? openEv.extensions : [];
  const extInfo = exts.length
    ? `\n\n⏰ *DEADLINE TELAH DIPERPANJANG ${exts.length}×*\n` +
      exts.slice(-1).map((x) => {
        return `Batas terbaru: *${validasiEvent.formatTanggalWIB(x.newDeadline)}*` +
          (x.note ? `\n_Catatan admin: "${x.note}"_` : '');
      }).join('')
    : '';

  const requiredFields = Array.isArray(openEv.requiredFields) && openEv.requiredFields.length
    ? openEv.requiredFields
    : validasiEvent.DEFAULT_REQUIRED_FIELDS;

  setSession(sender, {
    step: 'await_stambuk',
    stambuk: null,
    command: 'validasidata',
    eventId: openEv.id,
  });

  await reply(
    m,
    `📅 *VALIDASI DATA GURU*\n\n` +
      `📋 *Event:* ${openEv.title}\n` +
      `${openEv.description ? `📝 ${openEv.description}\n` : ''}` +
      `⏰ *Deadline:* ${validasiEvent.formatTanggalWIB(eff)}` +
      extInfo +
      `\n\n` +
      `✅ Dengan validasi ini, Anda menyatakan bahwa data berikut sudah BENAR:\n` +
      requiredFields.map((f) => `• ${f}`).join('\n') +
      `\n\n` +
      `_Jika ada kolom yang masih salah/kosong, mohon ajukan revisi dulu dengan *.revisi* sebelum melakukan validasi._\n\n` +
      `🔐 *Langkah 1/2*\n` +
      `Masukkan *Nomor Stambuk* Anda:\n\n` +
      `_Contoh: 120_\n` +
      `_⏳ Session berlaku 5 menit._`
  );
}

export default {
  handle,
  Commands: ['validasidata', 'validasi', 'vd'],
  OnlyPremium: false,
  OnlyOwner: false,
};
