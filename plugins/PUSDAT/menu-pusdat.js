/**
 * ============================================================
 *  plugins/PUSDAT/menu-pusdat.js — Menu Utama SISFO PUSDAT (v13)
 *  ★ MEGA UPDATE: Multi-bahasa, Smart Search, Voice Lapor,
 *    Upload Berkas, Dashboard Web
 * ============================================================
 */

import { isOwner } from '../../lib/users.js';
import { getUserLang, t } from '../../lib/i18n.js';
import { getDashboardUrl } from '../../lib/dashboard.js';
import pusdatConfig from '../../pusdat-config.js';

async function handle(sock, messageInfo) {
  const { remoteJid, message, pushName, sender } = messageInfo;

  await sock.sendMessage(remoteJid, {
    react: { text: '📋', key: message.key },
  });

  const namaUser = pushName || 'Pengguna';
  const isOwnerUser = isOwner(sender);
  const lang = getUserLang(sender);

  // Lokalisasi greeting & title
  const greeting = t('menu.greeting', lang);
  const title = t('menu.title', lang);
  const langNow = t('menu.lang_now', lang);
  const langHint = t('menu.lang_change_hint', lang);

  const ownerSection = isOwnerUser
    ? `┏━━━『 👑 ᴏᴡɴᴇʀ ᴘᴀɴᴇʟ (ᴇᴅɪᴛ ᴘʀᴏᴋᴇʀ) 』━━━\n` +
      `┣⌬ .editproker bulanan add — ᴛᴀᴍʙᴀʜ ᴘʀᴏᴋᴇʀ ʙᴜʟᴀɴᴀɴ 👑\n` +
      `┣⌬ .editproker bulanan edit [no] — ᴜʙᴀʜ ᴘʀᴏᴋᴇʀ ʙᴜʟᴀɴᴀɴ 👑\n` +
      `┣⌬ .editproker bulanan del [no] — ʜᴀᴘᴜꜱ ᴘʀᴏᴋᴇʀ ʙᴜʟᴀɴᴀɴ 👑\n` +
      `┣⌬ .editproker pekanan add/edit/del 👑\n` +
      `┣⌬ .editproker tahunan add/edit/del 👑\n` +
      `┣⌬ .editproker reset bulanan — ᴋᴏꜱᴏɴɢᴋᴀɴ ʟɪꜱᴛ 👑\n` +
      `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
      ` \n`
    : '';

  const dashboardSection = pusdatConfig.DASHBOARD_ENABLED
    ? `┏━━━『 🌐 ᴅᴀꜱʜʙᴏᴀʀᴅ ᴡᴇʙ 』━━━\n` +
      `┣⌬ 🔗 ${getDashboardUrl()}\n` +
      `┃     _Login pakai password Owner_\n` +
      `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
      ` \n`
    : '';

  const menuText =
    `👋 *${greeting}, ${namaUser}!*\n` +
    ` \n` +
    `${title} *(v13)*\n` +
    `🌐 _${langNow}_: *${lang.toUpperCase()}*\n` +
    `_${langHint}_\n` +
    ` \n` +
    `┏━━━『 🔍 ꜱᴍᴀʀᴛ ꜱᴇᴀʀᴄʜ 』━━━\n` +
    `┣⌬ .cari [keyword] — 🆕 ᴄᴀʀɪ ʟɪɴᴛᴀꜱ ᴅʙ 🌐\n` +
    `┃     ↳ santri, guru, daerah, konsulat, proker\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
    ` \n` +
    `┏━━━『 🗂️ ᴅᴀᴛᴀ ꜱᴀɴᴛʀɪ 』━━━\n` +
    `┣⌬ .ceksantri — ᴅᴇᴛᴀɪʟ ʙɪᴏᴅᴀᴛᴀ & ʙᴇʀᴋᴀꜱ 🔐\n` +
    `┣⌬ .listsantri — ᴅᴀꜰᴛᴀʀ ᴋᴇʟᴀꜱ 🌐\n` +
    `┣⌬ .carisantri [ɴᴀᴍᴀ] 🌐\n` +
    `┣⌬ .lacak [ɴᴀᴍᴀ/ꜱᴛᴀᴍʙᴜᴋ] 📡\n` +
    `┣⌬ .ekspor / .eksporfull 🔐\n` +
    `┣⌬ .statsantri 🌐\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
    ` \n` +
    `┏━━━『 📁 ᴀᴜᴅɪᴛ & ʙᴇʀᴋᴀꜱ 』━━━\n` +
    `┣⌬ .auditberkas [ᴋᴇʟᴀꜱ/all] 🔐\n` +
    `┣⌬ .lihatberkas 🔐\n` +
    `┣⌬ .rekapberkas [ᴋᴇʟᴀꜱ/ꜱᴇᴍᴜᴀ] 🔐\n` +
    `┣⌬ .uploadberkas [ꜱᴛᴀᴍʙᴜᴋ] [ᴋᴏᴅᴇ] — 🆕 ᴜᴘʟᴏᴀᴅ ᴠɪᴀ ᴡᴀ 🔐\n` +
    `┃     ↳ kirim foto/PDF + caption\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
    ` \n` +
    `┏━━━『 🗂️ ᴅᴀᴛᴀ ɢᴜʀᴜ / ꜱᴛᴀꜰ 』━━━\n` +
    `┣⌬ .cek 🔐\n` +
    `┣⌬ .admin 🔐\n` +
    `┣⌬ .setpass 🔐\n` +
    `┣⌬ .daftar / .terima / .revisi\n` +
    `┣⌬ .validasidata — 🆕 Validasi Data via Bot 🔐\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
    ` \n` +
    `┏━━━『 🛠️ ᴇᴅɪᴛ ᴅᴀᴛᴀ ʟɪᴠᴇ 』━━━\n` +
    `┣⌬ .editdata — ᴍᴏᴅᴇ ɪɴᴛᴇʀᴀᴋᴛɪꜰ ᴇᴅɪᴛ ᴅʙ 🔐\n` +
    `┣⌬ .editsantri [ꜱᴛᴀᴍʙᴜᴋ]|[ᴋᴏʟᴏᴍ]|[ɴɪʟᴀɪ] 🔐\n` +
    `┣⌬ .editguru [ꜱᴛᴀᴍʙᴜᴋ]|[ᴋᴏʟᴏᴍ]|[ɴɪʟᴀɪ] 🔐\n` +
    `┃     ↳ ᴋɪʀɪᴍ *[KOSONGKAN]* ᴜɴᴛᴜᴋ ᴍᴇɴɢᴏꜱᴏɴɢᴋᴀɴ ɪꜱɪ\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
    ` \n` +
    `┏━━━『 📋 ᴘʀᴏᴋᴇʀ & ᴘɪᴋᴇᴛ 』━━━\n` +
    `┣⌬ .piket / .listproker / .proker 🌐\n` +
    `┣⌬ .lapor / .lapharian / .absen 📝\n` +
    `┣⌬ 🎙️ Voice Note → Lapor: kirim VN saat piket 🆕\n` +
    `┃     _otomatis transkripsi via Whisper AI_\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
    ` \n` +
    `┏━━━『 📡 ʙʀᴏᴀᴅᴄᴀꜱᴛ 』━━━\n` +
    `┣⌬ .bcpusdat / .setwaktu 👑\n` +
    `┣⌬ .addtujuan / .deltujuan / .listtujuan 🔐\n` +
    `┣⌬ .idgrup 🌐\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
    ` \n` +
    `┏━━━『 ⚙️ ᴘʀᴇꜰᴇʀᴇɴꜱɪ 』━━━\n` +
    `┣⌬ .lang [id/ar/en] — 🆕 ᴜʙᴀʜ ʙᴀʜᴀꜱᴀ\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
    ` \n` +
    dashboardSection +
    ownerSection +
    `┏━━━『 ℹ️ ɪɴꜰᴏ 』━━━\n` +
    `┣⌬ .tutorialpusdat 📖\n` +
    `┣⌬ .menu / .menu2 / .allmenu\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
    ` \n` +
    `_🌐 = Publik_\n` +
    `_🔐 = Butuh Password Staf_\n` +
    `_📡 = Broadcast_\n` +
    `_📝 = Hanya Staf Piket_\n` +
    `_👑 = Owner Only_\n` +
    `_🆕 = Fitur Baru v13_\n` +
    ` \n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏫 *ᴘᴜꜱᴀᴛ ᴅᴀᴛᴀ ᴘᴍᴅɢ ᴋᴀᴍᴘᴜꜱ 5 ᴍᴀɢᴇʟᴀɴɢ*\n` +
    `⚙️ _SISFO Pusdat v13 — Multi-bahasa, AI, Dashboard_\n` +
    `👨‍💻 _Dev: Pusdat Gontor 5_`;

  await sock.sendMessage(
    remoteJid,
    { text: menuText },
    { quoted: message }
  );

  return false;
}

export default {
  Commands: ['menu'],
  handle,
  OnlyOwner: false,
  OnlyPremium: false,
  OnlyAdmin: false,
  OnlyGroup: false,
  OnlyPrivate: false,
  limitDeduction: 0,
};
