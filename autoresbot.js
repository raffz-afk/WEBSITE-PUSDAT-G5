/*
⚠️ PERINGATAN:
Script ini **TIDAK BOLEH DIPERJUALBELIKAN** dalam bentuk apa pun!

╔══════════════════════════════════════════════╗
║                🛠️ INFORMASI SCRIPT           ║
╠══════════════════════════════════════════════╣
║ 📦 Version   : 5.1.3
║ 👨‍💻 Developer  : Azhari Creative              ║
║ 🌐 Website    : https://autoresbot.com       ║
║ 💻 GitHub  : github.com/autoresbot/resbot-md ║
╚══════════════════════════════════════════════╝

📌 File ini adalah **ROOT DISPATCHER** untuk pesan masuk dan event
participant grup. lib/connection.js mengimpor `processMessage` dan
`participantUpdate` dari sini.

File ini sebelumnya HILANG dari paket Anda — itulah penyebab error:
  Cannot find module '...autoresbot.js'

Versi ini sudah:
  ✔ Defensif terhadap plugin tanpa property Commands (anti crash 25-Apr-2026)
  ✔ Defensif terhadap plugin tanpa fungsi handle
  ✔ Defensif terhadap senderLid undefined (fallback ke sender)
  ✔ Defensif terhadap rate_limit / commandSimilarity yang tidak terdefinisi
  ✔ Mendukung hot-reload plugin di mode development
  ✔ Try/catch per-plugin agar 1 plugin error tidak menjatuhkan plugin lain
  ✔ Support OnlyGroup / OnlyPrivate
*/

// List command tanpa registrasi
export const commandWithoutRegister = ['list', 'owner', 'menu', 'claim'];

// Import ESM
import chokidar from 'chokidar';
import config from './config.js';
const mode = config.mode;

import { findGroup } from './lib/group.js';
import chalk from 'chalk';
import handler from './lib/handler.js';
import mess from './strings.js';
import { updateParticipant } from './lib/cache.js';

import path from 'path';
import { handleActiveFeatures } from './lib/participant_update.js';

import { logWithTime, log, danger, findClosestCommand, logTracking } from './lib/utils.js';

import { isOwner, isPremiumUser, updateUser, findUser } from './lib/users.js';

import { reloadPlugins } from './lib/plugins.js';
import { logCustom } from './lib/logger.js';

// Inisialisasi handler
handler.initHandlers();

// Variabel global
const lastMessageTime = {};
const pluginsPath = path.join(process.cwd(), 'plugins');
const lastSent_participantUpdate = {};
let plugins = [];

// Load plugin awal
reloadPlugins()
  .then((loadedPlugins) => {
    plugins = loadedPlugins || [];
    console.log(`[✔] Load All Plugins done... (${plugins.length} plugins)`);
  })
  .catch((error) => {
    console.error('❌ ERROR: Gagal memuat plugins:', error);
  });

// Hot reload hanya di development
if (mode === 'development') {
  const watcher = chokidar.watch(pluginsPath, {
    persistent: true,
    ignoreInitial: true,
    ignored: /(^|[\/\\])\../, // Abaikan file tersembunyi
  });

  watcher.on('change', (filePath) => {
    if (filePath.endsWith('.js')) {
      logWithTime('System', `File changed: ${filePath}`);

      reloadPlugins()
        .then((loadedPlugins) => {
          plugins = loadedPlugins || [];
        })
        .catch((error) => {
          console.error('❌ ERROR: Gagal memuat plugins:', error);
        });
    }
  });

  logWithTime('System', 'Hot reload active in development mode.');
} else {
  logWithTime('System', 'Hot reload disabled in production mode.');
}

// ─────────────────────────────────────────────
// Fungsi utama untuk memproses pesan
// ─────────────────────────────────────────────
async function processMessage(sock, messageInfo) {
  const {
    remoteJid,
    isGroup,
    message,
    sender,
    senderLid,
    pushName,
    fullText = '',
    prefix,
    command,
  } = messageInfo;

  // 🛡️ Fallback: senderLid kadang undefined (versi Baileys lama)
  const idForUser = senderLid || sender;

  const isPremiumUsers = isPremiumUser(idForUser);
  const isOwnerUsers = isOwner(idForUser) || isOwner(sender);

  try {
    const shouldContinue = await handler.preProcess(sock, messageInfo);
    if (shouldContinue === false) return; // Jika handler.js memutuskan untuk berhenti

    // Rate limiter
    const safeText = typeof fullText === 'string' ? fullText : '';
    let truncatedContent = safeText.length > 10 ? safeText.slice(0, 10) + '...' : safeText;

    const currentTime = Date.now();
    const rateLimit = Number(config.rate_limit) || 3000;

    if (
      lastMessageTime[remoteJid] &&
      currentTime - lastMessageTime[remoteJid] < rateLimit &&
      prefix &&
      !isOwnerUsers
    ) {
      danger(pushName, `Rate limit : ${truncatedContent}`);
      return;
    }
    if (prefix) {
      lastMessageTime[remoteJid] = currentTime;
    }

    if (truncatedContent.trim() && prefix) {
      const logMessage =
        config.mode === 'production'
          ? () => log(pushName, truncatedContent)
          : () =>
              logWithTime(
                'CHAT',
                `${pushName}(${(sender || '').split('@')[0]}) - ${truncatedContent}`,
              );
      logMessage();
    }

    if (!pushName || pushName.trim() === '') {
      logWithTime(
        'DOUBLE CHAT',
        `${(sender || '').split('@')[0]} - (No Name) - ${truncatedContent}`,
      );
    }

    // Handle Destination
    if (
      (config.bot_destination?.toLowerCase() === 'private' && isGroup) ||
      (config.bot_destination?.toLowerCase() === 'group' && !isGroup)
    ) {
      if (!isOwnerUsers) {
        logWithTime('SYSTEM', `Destination handle only - ${config.bot_destination} chat`);
        return;
      }
    }

    let commandFound = false;

    // Iterasi melalui semua plugin untuk menemukan perintah yang sesuai
    for (const plugin of plugins) {
      // 🛡️ FIX 25-Apr-2026: lewati plugin tanpa Commands valid
      if (!plugin || !Array.isArray(plugin.Commands)) continue;
      if (typeof plugin.handle !== 'function') continue;

      if (plugin.Commands.includes(command)) {
        commandFound = true;

        // Cek apakah perintah ini hanya untuk pengguna premium
        if (plugin.OnlyPremium && !isPremiumUsers && !isOwnerUsers) {
          logTracking(`Handler - Bukan premium (${command})`);
          await sock.sendMessage(
            remoteJid,
            { text: mess.general.isPremium },
            { quoted: message },
          );
          return;
        }

        // Cek apakah perintah ini hanya untuk owner
        if (plugin.OnlyOwner && !isOwnerUsers) {
          logTracking(`Handler - Bukan Owner (${command})`);
          await sock.sendMessage(
            remoteJid,
            { text: mess.general.isOwner },
            { quoted: message },
          );
          return;
        }

        // OnlyGroup
        if (plugin.OnlyGroup && !isGroup) {
          await sock.sendMessage(
            remoteJid,
            { text: mess.general.isGroup },
            { quoted: message },
          );
          return;
        }

        // OnlyPrivate
        if (plugin.OnlyPrivate && isGroup) {
          await sock.sendMessage(
            remoteJid,
            { text: '⚠️ _Perintah ini hanya bisa digunakan di chat pribadi._' },
            { quoted: message },
          );
          return;
        }

        let isGrubPremium = false;
        try {
          const settingGroups = await findGroup(remoteJid);
          if (
            settingGroups?.fitur?.premium &&
            new Date(settingGroups.fitur.premium) > new Date()
          ) {
            isGrubPremium = true;
          }
        } catch (_) {}

        // Cek apakah perintah ini menggunakan limit
        if (!isPremiumUsers && !isOwnerUsers && plugin.limitDeduction && !isGrubPremium) {
          try {
            const dataUsers = await findUser(idForUser, 'Debug 1');
            if (!dataUsers) {
              // user belum ter-register → diamkan, jangan crash
            } else {
              const [docId, userData] = dataUsers;

              const isLimitExceeded =
                userData.limit < plugin.limitDeduction || userData.limit < 1;
              if (isLimitExceeded) {
                logTracking('Handler - Limit habis ');
                await sock.sendMessage(
                  remoteJid,
                  { text: mess.general.limit },
                  { quoted: message },
                );
                return;
              }

              // Kurangi limit pengguna jika masih cukup
              await updateUser(idForUser, {
                limit: userData.limit - plugin.limitDeduction,
              });
            }
          } catch (error) {
            console.error(
              `Terjadi kesalahan saat mengurangi limit pengguna: ${error.message}`,
            );
          }
        }

        try {
          const pluginResult = await plugin.handle(sock, messageInfo);
          logTracking(`Plugins - ${command} dijalankan oleh ${idForUser}`);

          // Cek apakah plugin meminta untuk menghentikan eksekusi
          if (pluginResult === false) return;
        } catch (errPlugin) {
          logCustom('error', errPlugin, `ERROR-plugin-${command}.txt`);
          console.error(
            chalk.redBright(`[!] Error di plugin ${command}: ${errPlugin?.message || errPlugin}`),
          );
        }
      }
    }

    // sampai sini command tidak ditemukan
    if (config.commandSimilarity && !commandFound) {
      const closestCommand = findClosestCommand(command, plugins);
      if (closestCommand && command !== '' && safeText.length < 20 && prefix) {
        logTracking(`Handler - Command tidak ditemukan (${command})`);
        logCustom(
          'info',
          `_Command *${command}* tidak ditemukan_ \n\n_Apakah maksud Anda *.${closestCommand}*?_`,
          `ERROR-COMMAND-NOT-FOUND.txt`,
        );
        return await sock.sendMessage(
          remoteJid,
          {
            text: `_Command *${command}* tidak ditemukan_ \n\n_Apakah maksud Anda *.${closestCommand}*?_`,
          },
          { quoted: message },
        );
      }
    }
  } catch (error) {
    logCustom('error', error, `ERROR-processMessage.txt`);
    danger(command, `Kesalahan di processMessage: ${error}`);
  }
}

// ─────────────────────────────────────────────
// Fungsi event participant grup (add/remove/promote/demote)
// ─────────────────────────────────────────────
async function participantUpdate(sock, messageInfo) {
  const { id, action, participants } = messageInfo;
  const now = Date.now();

  try {
    const settingGroups = await findGroup(id);
    const validActions = ['promote', 'demote', 'add', 'remove'];

    if (validActions.includes(action)) {
      try {
        updateParticipant(sock, id, participants, action);
      } catch (e) {
        console.log('error updateParticipant ');
      }
    } else {
      return console.log('action tidak valid :', action);
    }
    // Jika grup ditemukan
    if (settingGroups) {
      const rateLimit = Number(config.rate_limit) || 3000;
      if (lastSent_participantUpdate[id]) {
        if (now - lastSent_participantUpdate[id] < rateLimit) {
          return console.log(chalk.redBright(`Rate limit : ${id}`));
        }
      }
      lastSent_participantUpdate[id] = now;

      await handleActiveFeatures(sock, messageInfo, settingGroups.fitur);
    }
  } catch (error) {
    logCustom('error', error, `ERROR-participantUpdate.txt`);
    console.error(chalk.redBright(`Error: ${error?.message || error}`));
  }
}

export { processMessage, participantUpdate };
