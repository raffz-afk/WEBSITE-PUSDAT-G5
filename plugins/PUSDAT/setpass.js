/**
 * ============================================================
 *  plugins/PUSDAT/setpass.js — 🔐 Dynamic Staff Password Changer
 * ============================================================
 *
 *  Command: .setpass [password_baru]
 *  Tipe   : OWNER ONLY
 *
 *  Mengubah password staf yang tersimpan di pusdat_settings.json
 *  secara dinamis. Password baru akan langsung berlaku untuk
 *  semua fitur gateway (.admin, .ceksantri, .auditberkas).
 *
 *  Contoh:
 *    .setpass rahasia2026
 *    .setpass pusdatG5!
 *
 *  KEAMANAN:
 *  - OnlyOwner: true — hanya owner bot yang bisa mengakses
 *  - Sinkronisasi JSON menggunakan writeFileSync (atomic)
 *  - Password minimal 6 karakter
 *
 * ============================================================
 */

import { reply, style } from '../../lib/utils.js';
import { getStaffPassword, setStaffPassword, deepSanitize } from '../../lib/dbAccess.js';

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, message } = messageInfo;

  // ═══ VALIDASI: Pastikan password baru disertakan ═══
  const rawContent = (content || '').trim();
  const passwordBaru = deepSanitize(rawContent).trim();

  if (!passwordBaru) {
    return await reply(
      m,
      `❌ *Format Salah!*\n\n` +
      `Penggunaan: *.setpass [password_baru]*\n\n` +
      `Contoh:\n` +
      `┣⌬ .setpass rahasia2026\n` +
      `┣⌬ .setpass pusdatG5!\n\n` +
      `📌 _Password saat ini: "${getStaffPassword()}"_\n\n` +
      `⚠️ _Command ini HANYA untuk Owner._`
    );
  }

  // ═══ VALIDASI: Minimal 6 karakter ═══
  if (passwordBaru.length < 6) {
    return await reply(
      m,
      `❌ *Password terlalu pendek!*\n\n` +
      `Password minimal *6 karakter*.\n` +
      `Password yang Anda masukkan: ${passwordBaru.length} karakter.\n\n` +
      `_Silakan coba lagi dengan password yang lebih panjang._`
    );
  }

  // ═══ PROSES: Ubah password di JSON ═══
  try {
    const passwordLama = getStaffPassword();
    setStaffPassword(passwordBaru);

    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });

    const outputText =
      `┏━━━『 🔐 *PASSWORD STAF DIUBAH* 』━━━\n` +
      `┃\n` +
      `┃ ✅ Password Staf berhasil diubah menjadi:\n` +
      `┃ 🔑 *${passwordBaru}*\n` +
      `┃\n` +
      `┃ 📝 Password lama: ~${passwordLama}~\n` +
      `┃ 📝 Password baru: *${passwordBaru}*\n` +
      `┃\n` +
      `┃ ⚠️ _Perubahan langsung berlaku untuk:_\n` +
      `┃ ┣⌬ .admin / .cekpass\n` +
      `┃ ┣⌬ .ceksantri\n` +
      `┃ ┣⌬ .auditberkas\n` +
      `┃\n` +
      `┗━━━━━━━━━━━━━━━━━━━━━◧\n\n` +
      `🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

    await reply(m, style(outputText));

    console.log(`[SETPASS] ✅ Password staf diubah oleh ${sender}: "${passwordLama}" → "${passwordBaru}"`);

  } catch (err) {
    console.error('[SETPASS] Error:', err.message);
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    await reply(m, `❌ _Gagal mengubah password: ${err.message}_`);
  }
}

export default {
  handle,
  Commands: ['setpass'],
  OnlyPremium: false,
  OnlyOwner: true, // ★ HANYA OWNER
};
