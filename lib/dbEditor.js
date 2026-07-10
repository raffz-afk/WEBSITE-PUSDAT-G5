/**
 * ============================================================
 *  lib/dbEditor.js — Editor Data Langsung DB Access via WA
 * ============================================================
 *
 *  Fitur utama:
 *  - Session editor data terpisah dari session gateway lain
 *  - Mendukung DB Guru + DB Santri
 *  - Mendukung mode interaktif + quick command
 *  - Resolusi nama kolom fleksibel (exact / case-insensitive / nomor)
 *  - UPDATE langsung ke Microsoft Access (Windows / node-adodb)
 *  - Audit log perubahan ke tmp/logs/pusdat-edit-data.log
 *
 *  Catatan penting:
 *  - UPDATE langsung ke .accdb hanya dieksekusi di Windows.
 *  - Di Linux/Mac fungsi simulasi tetap bisa dites, tetapi UPDATE real
 *    akan ditolak demi keamanan dan kompatibilitas.
 *
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getFullBiodata,
  getFullBiodataSantri,
  DB_GURU_PATH,
  DB_SANTRI_PATH,
  CONN_STR_GURU,
  CONN_STR_SANTRI,
  deepSanitize,
  sanitizeStambuk,
  normalizeDate,
} from './dbAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = (typeof process !== 'undefined' && typeof process.cwd === 'function')
  ? process.cwd()
  : path.resolve(__dirname, '..');

const EDIT_SESSION_TTL = 3 * 60 * 1000;
const editDataSession = new Map();

const AUDIT_DIR = path.resolve(ROOT, 'tmp', 'logs');
const AUDIT_LOG = path.join(AUDIT_DIR, 'pusdat-edit-data.log');

const IS_WINDOWS = process.platform === 'win32';
const IS_64_BIT = process.arch.includes('64');

let adodb = null;
let dbGuruEditor = null;
let dbSantriEditor = null;

function ensureAuditDir() {
  try {
    if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
  } catch (err) {
    console.error('[DB-EDITOR] ⚠️ Gagal menyiapkan folder audit:', err.message);
  }
}

function writeAudit(entry) {
  try {
    ensureAuditDir();
    fs.appendFileSync(AUDIT_LOG, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch (err) {
    console.error('[DB-EDITOR] ⚠️ Gagal menulis audit log:', err.message);
  }
}

function getDbMeta(dbType) {
  if (dbType === 'guru') {
    return {
      key: 'guru',
      label: 'DB Guru',
      tableName: 'T Master Guru',
      connStr: CONN_STR_GURU,
      filePath: DB_GURU_PATH,
    };
  }

  if (dbType === 'santri') {
    return {
      key: 'santri',
      label: 'DB Santri',
      tableName: 'Tabel Master Santri',
      connStr: CONN_STR_SANTRI,
      filePath: DB_SANTRI_PATH,
    };
  }

  throw new Error(`Tipe database tidak dikenal: ${dbType}`);
}

export function getDbTypeLabel(dbType) {
  try {
    return getDbMeta(dbType).label;
  } catch {
    return 'Database';
  }
}

export function parseDbTypeInput(input) {
  const text = deepSanitize(String(input || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (['1', 's', 'santri', 'dbsantri', 'datasantri'].includes(text)) return 'santri';
  if (['2', 'g', 'guru', 'dbguru', 'dataguru', 'asatidz', 'ustadz'].includes(text)) return 'guru';
  return null;
}

export function setEditDataSession(sender, data) {
  editDataSession.set(sender, {
    ...data,
    createdAt: Date.now(),
    expiresAt: Date.now() + EDIT_SESSION_TTL,
  });
}

export function getEditDataSession(sender) {
  const sess = editDataSession.get(sender);
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    editDataSession.delete(sender);
    return null;
  }
  return sess;
}

export function clearEditDataSession(sender) {
  editDataSession.delete(sender);
}

export function parseQuickEditInput(content) {
  const raw = String(content || '').trim();
  const parts = raw.split('|').map((x) => x.trim());

  if (parts.length < 3) {
    return {
      ok: false,
      reason: 'Format harus: stambuk | nama kolom | nilai baru',
    };
  }

  const stambuk = parts[0] || '';
  const fieldInput = parts[1] || '';
  const newValueRaw = parts.slice(2).join(' | ').trim();

  if (!stambuk || !fieldInput || !newValueRaw) {
    return {
      ok: false,
      reason: 'Stambuk, nama kolom, dan nilai baru wajib diisi',
    };
  }

  return {
    ok: true,
    stambuk,
    fieldInput,
    newValueRaw,
  };
}

export async function getEditableRecordByStambuk(dbType, stambuk) {
  if (dbType === 'guru') return await getFullBiodata(stambuk);
  if (dbType === 'santri') return await getFullBiodataSantri(stambuk);
  throw new Error(`Tipe database tidak dikenal: ${dbType}`);
}

export function listEditableFields(record) {
  if (!record || typeof record !== 'object') return [];
  return Object.keys(record).filter((k) => String(k || '').trim() !== '');
}

function normalizeFieldName(name) {
  return String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\[\]`"']/g, '')
    .replace(/[_\-\s().:/\\?]+/g, '');
}

export function getFieldSuggestions(record, input, limit = 8) {
  const fields = listEditableFields(record);
  const clean = normalizeFieldName(input);
  if (!clean) return fields.slice(0, limit);

  const scored = fields.map((field) => {
    const nf = normalizeFieldName(field);
    let score = 0;
    if (nf === clean) score += 100;
    if (nf.startsWith(clean)) score += 50;
    if (nf.includes(clean)) score += 20;
    if (clean.includes(nf)) score += 10;
    return { field, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.field);
}

export function resolveEditableField(record, input) {
  const fields = listEditableFields(record);
  if (fields.length === 0) return null;

  const raw = deepSanitize(String(input || '')).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const idx = parseInt(raw, 10);
    if (idx >= 1 && idx <= fields.length) return fields[idx - 1];
  }

  const exact = fields.find((f) => f === raw);
  if (exact) return exact;

  const exactInsensitive = fields.find((f) => String(f).toLowerCase() === raw.toLowerCase());
  if (exactInsensitive) return exactInsensitive;

  const normalized = normalizeFieldName(raw);
  const normalizedMatch = fields.find((f) => normalizeFieldName(f) === normalized);
  if (normalizedMatch) return normalizedMatch;

  const startsWith = fields.find((f) => normalizeFieldName(f).startsWith(normalized));
  if (startsWith) return startsWith;

  const contains = fields.find((f) => normalizeFieldName(f).includes(normalized));
  if (contains) return contains;

  return null;
}

export function formatEditValue(value) {
  if (value === null || value === undefined) return '(kosong)';
  if (value instanceof Date) return normalizeDate(value);
  if (typeof value === 'boolean') return value ? 'YA' : 'TIDAK';
  const text = String(value).trim();
  return text === '' ? '(kosong)' : text;
}

export function formatEditableRecordSummary(dbType, record) {
  if (!record) return '_Data tidak tersedia._';

  if (dbType === 'santri') {
    return (
      `🗂️ *REKAMAN SANTRI*\n` +
      `• Stambuk : ${formatEditValue(record.Stambuk)}\n` +
      `• Nama    : ${formatEditValue(record['Nama Lengkap'])}\n` +
      `• Kelas   : ${formatEditValue(record['Kelas'])}\n` +
      `• Rayon   : ${formatEditValue(record['Rayon'])}\n` +
      `• Status  : ${formatEditValue(record['Status'])}`
    );
  }

  return (
    `🗂️ *REKAMAN GURU*\n` +
    `• Stambuk : ${formatEditValue(record.Stambuk)}\n` +
    `• Nama    : ${formatEditValue(record['Nama Lengkap'])}\n` +
    `• Status  : ${formatEditValue(record['Status'])}\n` +
    `• Bagian  : ${formatEditValue(record['Bagian'])}\n` +
    `• HP      : ${formatEditValue(record['No HP'])}`
  );
}

export function formatEditableFieldList(record) {
  const fields = listEditableFields(record);
  return fields.map((field, idx) => `${idx + 1}. ${field}`).join('\n');
}

function parseFlexibleDate(input) {
  const text = deepSanitize(String(input || '')).trim();
  if (!text) return null;

  let m;

  if ((m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const d = new Date(year, month - 1, day, 12, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if ((m = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/))) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const d = new Date(year, month - 1, day, 12, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function inferAndNormalizeNewValue(rawInput, existingValue) {
  const original = String(rawInput ?? '');
  const text = deepSanitize(original).trim();
  const lower = text.toLowerCase();

  if (['[kosongkan]', 'kosongkan', 'null', '(kosong)', '[null]'].includes(lower)) {
    return {
      value: null,
      type: 'null',
      display: '(kosong)',
    };
  }

  if (existingValue instanceof Date) {
    const d = parseFlexibleDate(text);
    if (!d) throw new Error('Kolom ini bertipe tanggal. Gunakan format DD-MM-YYYY, DD/MM/YYYY, atau YYYY-MM-DD.');
    return { value: d, type: 'date', display: normalizeDate(d) };
  }

  if (typeof existingValue === 'number' && Number.isFinite(existingValue)) {
    const normalizedNumber = text.replace(/\s+/g, '').replace(/,/g, '.');
    const num = Number(normalizedNumber);
    if (Number.isNaN(num)) {
      throw new Error('Kolom ini bertipe angka. Masukkan angka yang valid.');
    }
    return { value: num, type: 'number', display: String(num) };
  }

  if (typeof existingValue === 'boolean') {
    if (['ya', 'yes', 'true', '1', 'aktif', 'on'].includes(lower)) {
      return { value: true, type: 'boolean', display: 'YA' };
    }
    if (['tidak', 'no', 'false', '0', 'nonaktif', 'off'].includes(lower)) {
      return { value: false, type: 'boolean', display: 'TIDAK' };
    }
    throw new Error('Kolom ini bertipe ya/tidak. Gunakan: ya / tidak.');
  }

  // Jika value lama kosong/null, coba tebak tipe dari pola input
  if (existingValue === null || existingValue === undefined || existingValue === '') {
    const guessedDate = parseFlexibleDate(text);
    if (guessedDate && /[\/-]/.test(text)) {
      return { value: guessedDate, type: 'date', display: normalizeDate(guessedDate) };
    }

    if (/^-?\d+(\.\d+)?$/.test(text)) {
      return { value: Number(text), type: 'number', display: String(Number(text)) };
    }

    if (['ya', 'yes', 'true', '1', 'aktif', 'on'].includes(lower)) {
      return { value: true, type: 'boolean', display: 'YA' };
    }
    if (['tidak', 'no', 'false', '0', 'nonaktif', 'off'].includes(lower)) {
      return { value: false, type: 'boolean', display: 'TIDAK' };
    }
  }

  return {
    value: text,
    type: 'string',
    display: text || '(kosong)',
  };
}

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

function buildAccessLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) {
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    const yyyy = value.getFullYear();
    return `#${mm}/${dd}/${yyyy}#`;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '-1' : '0';
  return `'${escapeSqlString(value)}'`;
}

async function ensureEditorConnection(dbType) {
  if (!IS_WINDOWS) {
    throw new Error('UPDATE langsung ke file Microsoft Access hanya didukung saat bot berjalan di Windows.');
  }

  if (!adodb) {
    try {
      adodb = (await import('node-adodb')).default;
    } catch (err) {
      throw new Error(`node-adodb belum siap: ${err.message}`);
    }
  }

  if (dbType === 'guru') {
    if (!dbGuruEditor) dbGuruEditor = adodb.open(CONN_STR_GURU, IS_64_BIT);
    return dbGuruEditor;
  }

  if (dbType === 'santri') {
    if (!dbSantriEditor) dbSantriEditor = adodb.open(CONN_STR_SANTRI, IS_64_BIT);
    return dbSantriEditor;
  }

  throw new Error(`Tipe database tidak dikenal: ${dbType}`);
}

async function queryRecordDirect(dbType, stambukNum, cleanStambuk) {
  const meta = getDbMeta(dbType);
  const conn = await ensureEditorConnection(dbType);
  const sql = `SELECT * FROM [${meta.tableName}] WHERE [Stambuk] = ${stambukNum} OR [Stambuk] = '${cleanStambuk}'`;
  const rows = await conn.query(sql);
  return rows && rows.length > 0 ? rows[0] : null;
}

export function simulateRecordUpdate(record, fieldInput, rawNewValue) {
  if (!record || typeof record !== 'object') throw new Error('Record simulasi tidak valid.');

  const resolvedField = resolveEditableField(record, fieldInput);
  if (!resolvedField) {
    throw new Error('Kolom tidak ditemukan pada record simulasi.');
  }

  const before = record[resolvedField];
  const normalized = inferAndNormalizeNewValue(rawNewValue, before);

  return {
    resolvedField,
    before,
    after: normalized.value,
    beforeDisplay: formatEditValue(before),
    afterDisplay: normalized.display,
    nextRecord: {
      ...record,
      [resolvedField]: normalized.value,
    },
  };
}

export async function updateRecordField(dbType, stambuk, fieldInput, rawNewValue, actor = '-') {
  const meta = getDbMeta(dbType);
  const cleanStambuk = sanitizeStambuk(String(stambuk));
  const stambukNum = parseInt(cleanStambuk, 10);

  if (isNaN(stambukNum)) {
    throw new Error('Nomor Stambuk tidak valid.');
  }

  const beforeRecord = await getEditableRecordByStambuk(dbType, cleanStambuk);
  if (!beforeRecord) {
    throw new Error(`Data dengan Stambuk ${cleanStambuk} tidak ditemukan di ${meta.label}.`);
  }

  const resolvedField = resolveEditableField(beforeRecord, fieldInput);
  if (!resolvedField) {
    const suggestions = getFieldSuggestions(beforeRecord, fieldInput, 6);
    const hint = suggestions.length > 0 ? ` Saran: ${suggestions.join(', ')}` : '';
    throw new Error(`Kolom "${fieldInput}" tidak ditemukan.${hint}`);
  }

  const beforeValue = beforeRecord[resolvedField];
  const normalized = inferAndNormalizeNewValue(rawNewValue, beforeValue);
  const literal = buildAccessLiteral(normalized.value);
  const sql = `UPDATE [${meta.tableName}] SET [${resolvedField}] = ${literal} WHERE [Stambuk] = ${stambukNum} OR [Stambuk] = '${cleanStambuk}'`;

  const conn = await ensureEditorConnection(dbType);
  await conn.execute(sql);

  const afterRecord = await queryRecordDirect(dbType, stambukNum, cleanStambuk);
  const afterValue = afterRecord ? afterRecord[resolvedField] : normalized.value;

  const audit = {
    time: new Date().toISOString(),
    actor,
    dbType,
    dbLabel: meta.label,
    stambuk: cleanStambuk,
    field: resolvedField,
    before: formatEditValue(beforeValue),
    after: formatEditValue(afterValue),
  };
  writeAudit(audit);

  return {
    ok: true,
    dbType,
    dbLabel: meta.label,
    tableName: meta.tableName,
    stambuk: cleanStambuk,
    field: resolvedField,
    before: beforeValue,
    after: afterValue,
    beforeDisplay: formatEditValue(beforeValue),
    afterDisplay: formatEditValue(afterValue),
    record: afterRecord,
  };
}

export default {
  getDbTypeLabel,
  parseDbTypeInput,
  setEditDataSession,
  getEditDataSession,
  clearEditDataSession,
  parseQuickEditInput,
  getEditableRecordByStambuk,
  listEditableFields,
  getFieldSuggestions,
  resolveEditableField,
  formatEditValue,
  formatEditableRecordSummary,
  formatEditableFieldList,
  inferAndNormalizeNewValue,
  simulateRecordUpdate,
  updateRecordField,
};
