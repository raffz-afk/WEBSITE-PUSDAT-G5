/**
 * ============================================================
 *  plugins/PUSDAT/editdata.js — Editor Data Guru/Santri via WA
 * ============================================================
 *
 *  Command interaktif:
 *    .editdata
 *
 *  Quick command:
 *    .editsantri stambuk | nama kolom | nilai baru
 *    .editguru   stambuk | nama kolom | nilai baru
 *
 *  Catatan hak akses:
 *  - Owner: boleh interaktif + quick command langsung
 *  - Staf Pusdat: interaktif + quick command (tetap lewat password)
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import { isOwner } from '../../lib/users.js';
import {
  getSession,
  clearSession,
  getAdminSession,
  clearAdminSession,
  getCekSantriSession,
  clearCekSantriSession,
  getAuditBerkasSession,
  clearAuditBerkasSession,
  getEksporSession,
  clearEksporSession,
  getLihatBerkasSession,
  clearLihatBerkasSession,
  getRekapBerkasSession,
  clearRekapBerkasSession,
} from '../../lib/dbAccess.js';
import {
  setEditDataSession,
  getEditDataSession,
  clearEditDataSession,
  parseQuickEditInput,
  updateRecordField,
  getDbTypeLabel,
} from '../../lib/dbEditor.js';

function clearConflictingSessions(sender) {
  if (getSession(sender)) clearSession(sender);
  if (getAdminSession(sender)) clearAdminSession(sender);
  if (getCekSantriSession(sender)) clearCekSantriSession(sender);
  if (getAuditBerkasSession(sender)) clearAuditBerkasSession(sender);
  if (getEksporSession(sender)) clearEksporSession(sender);
  if (getLihatBerkasSession(sender)) clearLihatBerkasSession(sender);
  if (getRekapBerkasSession(sender)) clearRekapBerkasSession(sender);
  if (getEditDataSession(sender)) clearEditDataSession(sender);
}

function helpText() {
  return (
    `🛠️ *EDITOR DATA ACCESS VIA WHATSAPP*\n\n` +
    `*MODE 1 — Interaktif*\n` +
    `\`\`\`.editdata\`\`\`\n\n` +
    `Bot akan membimbing Anda langkah demi langkah:\n` +
    `1. Pilih DB\n2. Masukkan Stambuk\n3. Pilih kolom\n4. Isi nilai baru\n5. Konfirmasi simpan\n\n` +
    `*MODE 2 — Quick Command*\n` +
    `\`\`\`.editsantri 25001 | Nama Lengkap | Ahmad Fulan\`\`\`\n` +
    `\`\`\`.editguru 14001 | Status | Aktif\`\`\`\n\n` +
    `*Catatan penting*\n` +
    `• Nama kolom boleh exact, mirip, atau nomor urut saat mode interaktif\n` +
    `• Untuk mengosongkan isi kolom, pakai keyword: \`[KOSONGKAN]\`\n` +
    `• Owner bisa eksekusi langsung\n` +
    `• Staf tetap diminta password staf demi keamanan\n\n` +
    `*Contoh mengosongkan kolom:*\n` +
    `\`\`\`.editsantri 25001 | No BPJS | [KOSONGKAN]\`\`\``
  );
}

async function startInteractive(sock, messageInfo) {
  const { m, remoteJid, sender, message } = messageInfo;
  const owner = isOwner(sender);

  clearConflictingSessions(sender);

  if (owner) {
    setEditDataSession(sender, {
      step: 'await_db_type',
      authenticated: true,
      accessLevel: 'owner',
      mode: 'interactive',
    });

    await sock.sendMessage(remoteJid, {
      react: { text: '🛠️', key: message.key },
    });

    return await reply(
      m,
      `🛠️ *EDITOR DATA LANGSUNG*\n\n` +
      `Akses Owner terdeteksi.\n\n` +
      `Pilih database yang ingin diedit:\n` +
      `1. *Santri*\n` +
      `2. *Guru*\n\n` +
      `_Balas dengan: 1 / 2 / santri / guru_\n` +
      `_Ketik command lain untuk membatalkan._`
    );
  }

  setEditDataSession(sender, {
    step: 'await_password',
    authenticated: false,
    accessLevel: 'staff',
    mode: 'interactive',
  });

  await sock.sendMessage(remoteJid, {
    react: { text: '🔐', key: message.key },
  });

  return await reply(
    m,
    `🔐 *EDITOR DATA LANGSUNG*\n\n` +
    `Fitur ini memungkinkan edit langsung seperti di MS Access, tetapi melalui WhatsApp.\n\n` +
    `⚠️ Hanya untuk *Staf Pusdat / Owner* yang berwenang.\n\n` +
    `Masukkan *Password Staf* untuk melanjutkan.\n\n` +
    `_Session aktif 3 menit._`
  );
}

async function runQuickEdit(sock, messageInfo, dbType) {
  const { m, sender, content, remoteJid, message } = messageInfo;
  const parsed = parseQuickEditInput(content || '');

  if (!parsed.ok) {
    return await reply(
      m,
      `❌ *Format salah.*\n\n` +
      `Gunakan:\n` +
      (dbType === 'santri'
        ? `\`\`\`.editsantri 25001 | Nama Lengkap | Ahmad Fulan\`\`\``
        : `\`\`\`.editguru 14001 | Status | Aktif\`\`\``) +
      `\n\nKeterangan: *stambuk | nama kolom | nilai baru*`
    );
  }

  const owner = isOwner(sender);

  clearConflictingSessions(sender);

  if (!owner) {
    setEditDataSession(sender, {
      step: 'await_password',
      authenticated: false,
      accessLevel: 'staff',
      mode: 'quick',
      quickPayload: {
        dbType,
        ...parsed,
      },
    });

    await sock.sendMessage(remoteJid, {
      react: { text: '🔐', key: message.key },
    });

    return await reply(
      m,
      `🔐 *KONFIRMASI QUICK EDIT*\n\n` +
      `Database : *${getDbTypeLabel(dbType)}*\n` +
      `Stambuk  : *${parsed.stambuk}*\n` +
      `Kolom    : *${parsed.fieldInput}*\n` +
      `Nilai    : *${parsed.newValueRaw}*\n\n` +
      `Masukkan *Password Staf* untuk mengeksekusi perubahan.`
    );
  }

  await sock.sendMessage(remoteJid, {
    react: { text: '⏳', key: message.key },
  });

  try {
    const result = await updateRecordField(
      dbType,
      parsed.stambuk,
      parsed.fieldInput,
      parsed.newValueRaw,
      `owner:${sender}`,
    );

    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });

    return await reply(
      m,
      `✅ *EDIT BERHASIL*\n\n` +
      `Database : ${result.dbLabel}\n` +
      `Stambuk  : ${result.stambuk}\n` +
      `Kolom    : ${result.field}\n` +
      `Sebelum  : ${result.beforeDisplay}\n` +
      `Sesudah  : ${result.afterDisplay}\n\n` +
      `_Perubahan sudah tersimpan ke database._`
    );
  } catch (err) {
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    return await reply(
      m,
      `❌ *EDIT GAGAL*\n\n${err.message}`
    );
  }
}

async function handle(sock, messageInfo) {
  const { m, command, content } = messageInfo;
  const cmd = String(command || '').toLowerCase();
  const text = String(content || '').trim();

  if (cmd === 'editdata') {
    const lower = text.toLowerCase();
    if (!text || lower === 'mulai' || lower === 'start') {
      return await startInteractive(sock, messageInfo);
    }
    if (['help', '?', 'bantuan'].includes(lower)) {
      return await reply(m, helpText());
    }
    if (['batal', 'cancel'].includes(lower)) {
      clearEditDataSession(messageInfo.sender);
      return await reply(m, '🛑 Session edit data dibatalkan.');
    }

    return await reply(m, helpText());
  }

  if (cmd === 'editsantri') {
    return await runQuickEdit(sock, messageInfo, 'santri');
  }

  if (cmd === 'editguru') {
    return await runQuickEdit(sock, messageInfo, 'guru');
  }

  return false;
}

export default {
  handle,
  Commands: ['editdata', 'editsantri', 'editguru'],
  OnlyPremium: false,
  OnlyOwner: false,
};
