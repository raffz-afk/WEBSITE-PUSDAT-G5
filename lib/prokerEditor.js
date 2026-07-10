/**
 * ============================================================
 *  lib/prokerEditor.js — 🆕 v12: Editor Proker via WhatsApp
 * ============================================================
 *
 *  Fungsi utama:
 *  - CRUD (Create/Read/Update/Delete) proker tahunan, bulanan, pekanan
 *  - Auto-backup setiap perubahan ke folder _backup
 *  - Validasi field & sanitasi input
 *  - Format helper untuk pekanan (sebelumnya tidak ada)
 *
 *  DEPENDENSI: fs, path, moment-timezone (sudah ada di package.json)
 *
 *  CARA INTEGRASI:
 *    import {
 *      addProker, editProker, delProker,
 *      resetProker, setHeaderProker,
 *      formatProkerPekananText, getProkerPekanan,
 *    } from './lib/prokerEditor.js';
 *
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';

const ROOT = process.cwd();
const DIR_PROKER = path.resolve(ROOT, 'database', 'proker');
const DIR_BACKUP = path.join(DIR_PROKER, '_backup');

const FILES = {
  tahunan: path.join(DIR_PROKER, 'proker_tahunan.json'),
  bulanan: path.join(DIR_PROKER, 'proker_bulanan.json'),
  pekanan: path.join(DIR_PROKER, 'proker_pekanan.json'),
};

// Pastikan folder backup ada
if (!fs.existsSync(DIR_BACKUP)) fs.mkdirSync(DIR_BACKUP, { recursive: true });

// ══════════════════════════════════════════════════
//  HELPER UMUM
// ══════════════════════════════════════════════════
function readJSON(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8');
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`[PROKER-EDIT] ❌ Gagal baca ${filePath}:`, err.message);
    return fallback;
  }
}

function backupFile(filePath, type) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const ts = moment().tz('Asia/Jakarta').format('YYYYMMDD_HHmmss');
    const fname = `proker_${type}_${ts}.json`;
    const dest = path.join(DIR_BACKUP, fname);
    fs.copyFileSync(filePath, dest);
    return dest;
  } catch (err) {
    console.error(`[PROKER-EDIT] ⚠️ Backup gagal:`, err.message);
    return null;
  }
}

function writeJSONWithBackup(filePath, type, data) {
  try {
    backupFile(filePath, type);
    data.last_updated = moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`[PROKER-EDIT] ❌ Gagal tulis ${filePath}:`, err.message);
    return false;
  }
}

function getEmptyTemplate(type) {
  if (type === 'tahunan') {
    return {
      _keterangan: 'Daftar Program Kerja TAHUNAN.',
      tahun_hijriyah: '1447 H',
      tahun_masehi: String(new Date().getFullYear()),
      last_updated: moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm'),
      list: [],
    };
  }
  if (type === 'bulanan') {
    return {
      _keterangan: 'Daftar Program Kerja BULANAN.',
      bulan_hijriyah: '-',
      bulan_masehi: '-',
      last_updated: moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm'),
      perlu_diperbarui: false,
      list: [],
    };
  }
  return {
    _keterangan: 'Daftar Program Kerja PEKANAN.',
    pekan_label: '-',
    tanggal_mulai: moment().tz('Asia/Jakarta').format('YYYY-MM-DD'),
    last_updated: moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm'),
    perlu_diperbarui: false,
    list: [],
  };
}

// ══════════════════════════════════════════════════
//  GETTERS (untuk plugin lain)
// ══════════════════════════════════════════════════
export function getProkerByType(type) {
  if (!FILES[type]) return null;
  return readJSON(FILES[type], getEmptyTemplate(type));
}

export function getProkerPekanan() {
  return readJSON(FILES.pekanan, getEmptyTemplate('pekanan'));
}

export function formatProkerPekananText() {
  const p = getProkerPekanan();
  if (!p.list || p.list.length === 0) return '_Belum ada Proker Pekanan terdaftar._';
  const head = `📅 *PROKER PEKANAN ${p.pekan_label || ''}*`;
  const warn = p.perlu_diperbarui
    ? '\n⚠️ _Pekan baru — silakan perbarui daftar via .editproker pekanan_'
    : '';
  const body = p.list
    .map(
      (x) => `┃ ${x.no}. *${x.judul}*\n┃    🎯 ${x.target}\n┃    👤 ${x.pic || '-'}`
    )
    .join('\n');
  return `${head}${warn}\n${body}`;
}

// ══════════════════════════════════════════════════
//  CRUD: ADD
// ══════════════════════════════════════════════════
/**
 * Tambah proker baru.
 * @param {'tahunan'|'bulanan'|'pekanan'} type
 * @param {Object} fields - { judul, target, pic, deadline?, status? }
 * @returns {{ ok: boolean, no?: number, reason?: string }}
 */
export function addProker(type, fields) {
  if (!FILES[type]) return { ok: false, reason: 'TIPE_TIDAK_VALID' };
  if (!fields || !fields.judul) return { ok: false, reason: 'JUDUL_KOSONG' };

  const data = readJSON(FILES[type], getEmptyTemplate(type));
  if (!Array.isArray(data.list)) data.list = [];

  const nextNo = data.list.length === 0
    ? 1
    : Math.max(...data.list.map((x) => Number(x.no) || 0)) + 1;

  const newItem = {
    no: nextNo,
    judul: String(fields.judul).trim(),
    target: String(fields.target || '-').trim(),
  };

  if (type === 'tahunan') {
    newItem.deadline = String(fields.deadline || '-').trim();
    newItem.status = String(fields.status || 'berjalan').trim();
  } else {
    newItem.pic = String(fields.pic || '-').trim();
  }

  data.list.push(newItem);
  data.perlu_diperbarui = false;

  if (writeJSONWithBackup(FILES[type], type, data)) {
    return { ok: true, no: nextNo, item: newItem };
  }
  return { ok: false, reason: 'GAGAL_SIMPAN' };
}

// ══════════════════════════════════════════════════
//  CRUD: EDIT
// ══════════════════════════════════════════════════
export function editProker(type, no, fields) {
  if (!FILES[type]) return { ok: false, reason: 'TIPE_TIDAK_VALID' };
  const data = readJSON(FILES[type], getEmptyTemplate(type));
  const idx = (data.list || []).findIndex((x) => Number(x.no) === Number(no));
  if (idx === -1) return { ok: false, reason: 'NOMOR_TIDAK_DITEMUKAN' };

  const item = data.list[idx];
  if (fields.judul !== undefined) item.judul = String(fields.judul).trim();
  if (fields.target !== undefined) item.target = String(fields.target).trim();
  if (type === 'tahunan') {
    if (fields.deadline !== undefined) item.deadline = String(fields.deadline).trim();
    if (fields.status !== undefined) item.status = String(fields.status).trim();
  } else {
    if (fields.pic !== undefined) item.pic = String(fields.pic).trim();
  }

  if (writeJSONWithBackup(FILES[type], type, data)) {
    return { ok: true, item };
  }
  return { ok: false, reason: 'GAGAL_SIMPAN' };
}

// ══════════════════════════════════════════════════
//  CRUD: DELETE
// ══════════════════════════════════════════════════
export function delProker(type, no) {
  if (!FILES[type]) return { ok: false, reason: 'TIPE_TIDAK_VALID' };
  const data = readJSON(FILES[type], getEmptyTemplate(type));
  const idx = (data.list || []).findIndex((x) => Number(x.no) === Number(no));
  if (idx === -1) return { ok: false, reason: 'NOMOR_TIDAK_DITEMUKAN' };

  const removed = data.list.splice(idx, 1)[0];
  // Re-number
  data.list.forEach((x, i) => { x.no = i + 1; });

  if (writeJSONWithBackup(FILES[type], type, data)) {
    return { ok: true, removed };
  }
  return { ok: false, reason: 'GAGAL_SIMPAN' };
}

// ══════════════════════════════════════════════════
//  RESET (kosongkan semua list)
// ══════════════════════════════════════════════════
export function resetProker(type) {
  if (!FILES[type]) return { ok: false, reason: 'TIPE_TIDAK_VALID' };
  const data = readJSON(FILES[type], getEmptyTemplate(type));
  const totalSebelum = (data.list || []).length;
  data.list = [];
  data.perlu_diperbarui = true;

  if (writeJSONWithBackup(FILES[type], type, data)) {
    return { ok: true, totalSebelum };
  }
  return { ok: false, reason: 'GAGAL_SIMPAN' };
}

// ══════════════════════════════════════════════════
//  SET HEADER (label bulan / pekan)
// ══════════════════════════════════════════════════
export function setHeaderProker(type, value1, value2 = '') {
  if (!FILES[type]) return { ok: false, reason: 'TIPE_TIDAK_VALID' };
  const data = readJSON(FILES[type], getEmptyTemplate(type));

  if (type === 'tahunan') {
    if (value1) data.tahun_hijriyah = String(value1).trim();
    if (value2) data.tahun_masehi = String(value2).trim();
  } else if (type === 'bulanan') {
    if (value1) data.bulan_hijriyah = String(value1).trim();
    if (value2) data.bulan_masehi = String(value2).trim();
  } else {
    // pekanan
    if (value1) data.pekan_label = String(value1).trim();
    if (value2) data.tanggal_mulai = String(value2).trim();
  }

  if (writeJSONWithBackup(FILES[type], type, data)) {
    return { ok: true, data };
  }
  return { ok: false, reason: 'GAGAL_SIMPAN' };
}

// ══════════════════════════════════════════════════
//  PARSER: terima format pipe atau multi-line
// ══════════════════════════════════════════════════
/**
 * Parse input dari user. Mendukung 2 format:
 *
 * 1) PIPE (one-liner):
 *    "Judul | Target | PIC"          (untuk bulanan/pekanan)
 *    "Judul | Target | Deadline | Status"  (untuk tahunan)
 *
 * 2) MULTI-LINE:
 *    judul: ...
 *    target: ...
 *    pic: ...    (atau deadline: + status: untuk tahunan)
 *
 * @returns {Object} fields: { judul, target, pic|deadline, status }
 */
export function parseProkerInput(text, type = 'bulanan') {
  const t = String(text || '').trim();
  if (!t) return {};

  // Format pipe
  if (t.includes('|')) {
    const parts = t.split('|').map((x) => x.trim()).filter(Boolean);
    if (type === 'tahunan') {
      return {
        judul: parts[0] || '',
        target: parts[1] || '',
        deadline: parts[2] || '',
        status: parts[3] || 'berjalan',
      };
    }
    return {
      judul: parts[0] || '',
      target: parts[1] || '',
      pic: parts[2] || '',
    };
  }

  // Format multi-line key:value
  const fields = {};
  const lines = t.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*(judul|target|pic|deadline|status)\s*[:=]\s*(.+)$/i);
    if (m) {
      fields[m[1].toLowerCase()] = m[2].trim();
    }
  }
  return fields;
}
