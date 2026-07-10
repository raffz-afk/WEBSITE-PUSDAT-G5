/**
 * ============================================================
 * plugins/PUSDAT/ekspor.js — Ekspor Data Santri ke Excel
 * ============================================================
 *
 * Command:
 * .ekspor [kolom] # [nilai]
 * .ekspor Semua
 *
 * .eksporfull [kolom] # [nilai]
 * .eksporfull Semua
 *
 * MODE LITE (.ekspor): Publik, hanya 5 kolom aman.
 * MODE FULL (.eksporfull): Khusus staf (Gateway Password), semua kolom.
 */

import fs from 'fs';
import path from 'path';
import { reply } from '../../lib/utils.js';
import {
  getFilteredSantriAll,
  deepSanitize,
  normalizeDate,
  setEksporSession,
  clearEksporSession,
  getSession,
  clearSession,
  getAdminSession,
  clearAdminSession,
  getCekSantriSession,
  clearCekSantriSession,
  getAuditBerkasSession,
  clearAuditBerkasSession,
} from '../../lib/dbAccess.js';

const LITE_COLUMNS = ['Stambuk', 'Nama Lengkap', 'Kelas', 'Rayon', 'Kamar Rayon'];

function buildUsageText(prefix = '.', command = 'ekspor') {
  const isFull = String(command).toLowerCase().includes('full');
  const cmd = `${prefix}${isFull ? 'eksporfull' : 'ekspor'}`;
  return (
    `❌ *Format Salah!*\n\n` +
    `Gunakan: *${cmd} [kolom] # [nilai]* (Contoh: ${cmd} Kelas # 3 Int B)\n` +
    `Atau ekspor seluruh santri: *${cmd} Semua*`
  );
}

function parseFilterInput(rawParam = '') {
  const cleanParam = deepSanitize(rawParam).trim();
  if (!cleanParam) return { valid: false };

  if (cleanParam.toLowerCase() === 'semua') {
    return { valid: true, isSemua: true, kolom: 'Semua', nilai: '' };
  }

  if (!cleanParam.includes('#')) return { valid: false };

  const parts = cleanParam.split('#');
  const kolom = deepSanitize(parts[0] || '').trim();
  const nilai = deepSanitize(parts.slice(1).join('#') || '').trim();

  if (!kolom || !nilai) return { valid: false };

  return { valid: true, isSemua: false, kolom, nilai };
}

function normalizeFullRow(row = {}) {
  const output = {};
  for (const [key, value] of Object.entries(row)) {
    const keyLower = String(key).toLowerCase();
    const isTanggalColumn = keyLower.includes('tanggal') || keyLower.includes('tgl');
    output[key] = (isTanggalColumn || value instanceof Date) ? normalizeDate(value) : value;
  }
  return output;
}

function buildLiteRows(results = []) {
  return results.map((r) => ({
    'Stambuk': r.Stambuk ?? '',
    'Nama Lengkap': r['Nama Lengkap'] ?? '',
    'Kelas': r.Kelas ?? '',
    'Rayon': r.Rayon ?? '',
    'Kamar Rayon': r['Kamar Rayon'] ?? '',
  }));
}

async function loadXLSX() {
  try {
    return await import('xlsx');
  } catch (err) {
    throw new Error('Modul Excel belum terpasang. Jalankan: npm install xlsx');
  }
}

async function generateAndSendExcel(sock, messageInfo, options = {}) {
  const { m, remoteJid, message } = messageInfo;
  const { mode, kolom, nilai, isSemua } = options;
  const isFull = mode === 'full';
  const modeLabel = isFull ? 'Full' : 'Lite';
  let filePath = null;

  try {
    const XLSX = await loadXLSX();
    let results = await getFilteredSantriAll(kolom, nilai);

    // 🛠️ v13.1 FIX (Bug #3): pastikan Array sebelum .map()
    if (!Array.isArray(results)) {
      console.error('[EKSPOR] getFilteredSantriAll tidak return Array, paksa []');
      results = [];
    }

    if (results.length === 0) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return reply(m, `❌ *Tidak ada data!*\n\nData tidak ditemukan untuk filter tersebut.`);
    }

    const excelRows = isFull ? results.map(normalizeFullRow) : buildLiteRows(results);
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Santri');

    const safeFilter = deepSanitize(isSemua ? 'Semua' : nilai).replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Data_${modeLabel}_${safeFilter}.xlsx`;
    
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    filePath = path.join(tmpDir, fileName);

    XLSX.writeFile(workbook, filePath);

    const caption =
      `✅ *Ekspor Data ${modeLabel} Berhasil!*\n\n` +
      `┣⌬ Filter: ${isSemua ? 'Semua Santri Aktif' : `*${kolom}* = *${nilai}*`}\n` +
      `┣⌬ Jumlah: *${results.length}* santri\n` +
      `┗⌬ File: ${fileName}\n\n` +
      `🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

    await sock.sendMessage(remoteJid, {
      document: fs.readFileSync(filePath),
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName, caption
    }, { quoted: message });

    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
  } catch (err) {
    await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
    await reply(m, `❌ _Terjadi kesalahan: ${err.message}_`);
  } finally {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

async function clearConflictingSessions(sender) {
  clearEksporSession(sender);
  clearSession(sender);
  clearAdminSession(sender);
  clearCekSantriSession(sender);
  clearAuditBerkasSession(sender);
}

async function startEksporFullSession(sock, messageInfo, parsed) {
  const { m, remoteJid, sender, message } = messageInfo;
  await clearConflictingSessions(sender);

  setEksporSession(sender, {
    step: 'await_password',
    mode: 'full',
    kolom: parsed.kolom,
    nilai: parsed.nilai,
    isSemua: parsed.isSemua,
  });

  await sock.sendMessage(remoteJid, { react: { text: '🔐', key: message.key } });
  return reply(m, `🔐 *AKSES EKSPOR FULL*\n\nTarget: ${parsed.isSemua ? 'Semua santri aktif' : `${parsed.kolom} = ${parsed.nilai}`}\n\n⚠️ Fitur ini hanya untuk Staf Pusdat.\n🔑 *Masukkan Password Staf:*`);
}

export async function processEksporFullAuthorized(sock, messageInfo, sessionData) {
  return generateAndSendExcel(sock, messageInfo, {
    mode: 'full',
    kolom: sessionData?.kolom || 'Semua',
    nilai: sessionData?.nilai || '',
    isSemua: Boolean(sessionData?.isSemua),
  });
}

async function handle(sock, messageInfo) {
  const { m, content, prefix = '.', command = 'ekspor', remoteJid, message } = messageInfo;
  const activeCommand = String(command).toLowerCase();
  const parsed = parseFilterInput(content);

  if (!parsed.valid) return reply(m, buildUsageText(prefix, activeCommand));

  if (activeCommand === 'eksporfull' || activeCommand === 'exportfull') {
    return startEksporFullSession(sock, messageInfo, parsed);
  }

  await sock.sendMessage(remoteJid, { react: { text: '📊', key: message.key } });
  return generateAndSendExcel(sock, messageInfo, {
    mode: 'lite', kolom: parsed.kolom, nilai: parsed.nilai, isSemua: parsed.isSemua
  });
}

export default {
  handle,
  Commands: ['ekspor', 'eksporfull', 'export', 'exportfull'],
  OnlyPremium: false,
  OnlyOwner: false,
};