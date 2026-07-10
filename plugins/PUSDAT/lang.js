/**
 * ============================================================
 *  plugins/PUSDAT/lang.js — Pengaturan Bahasa Pengguna
 * ============================================================
 *
 *  Command: .lang [id/ar/en]
 *
 *  Tanpa argumen → tampilkan info bahasa saat ini & cara ganti.
 *  Dengan argumen → simpan preferensi ke users.json.
 *
 *  Bahasa didukung:
 *    - id (Indonesia, default)
 *    - ar (العربية)
 *    - en (English)
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import { setUserLang, getUserLang, t, SUPPORTED } from '../../lib/i18n.js';

const LABELS = {
  id: '🇮🇩 Bahasa Indonesia',
  ar: '🇸🇦 العربية',
  en: '🇬🇧 English',
};

async function handle(sock, messageInfo) {
  const { m, sender, content, message, remoteJid } = messageInfo;
  const arg = (content || '').trim().toLowerCase();
  const currentLang = getUserLang(sender);

  // ── Tanpa argumen → tampilkan menu ──
  if (!arg) {
    const optsText = SUPPORTED.map(
      (l) => `   ${l === currentLang ? '✅' : '⬜'} *${l}* — ${LABELS[l]}`
    ).join('\n');

    return await reply(
      m,
      `${t('lang.help_title', currentLang)}\n\n` +
        `${t('lang.current', currentLang)}: *${LABELS[currentLang]}*\n\n` +
        `📋 *Pilihan:*\n${optsText}\n\n` +
        `📌 ${t('lang.help_example', currentLang)}`
    );
  }

  // ── Validasi ──
  if (!SUPPORTED.includes(arg)) {
    return await reply(m, t('lang.invalid', currentLang));
  }

  // ── Set ──
  const ok = setUserLang(sender, arg);
  if (!ok) {
    return await reply(m, t('err.generic', currentLang));
  }

  await sock.sendMessage(remoteJid, {
    react: { text: '🌐', key: message.key },
  });

  // Konfirmasi pakai bahasa BARU
  return await reply(
    m,
    `${t('lang.success', arg)}\n\n` +
      `${t('lang.current', arg)}: *${LABELS[arg]}*\n\n` +
      `_${t('menu.lang_change_hint', arg)}_`
  );
}

export default {
  Commands: ['lang', 'language', 'bahasa'],
  handle,
  OnlyOwner: false,
  OnlyPremium: false,
  OnlyAdmin: false,
  OnlyGroup: false,
  OnlyPrivate: false,
  limitDeduction: 0,
};
