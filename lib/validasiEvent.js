/**
 * ============================================================
 *  lib/validasiEvent.js — Modul Event Validasi Data Guru
 *  ★ v18.0 — Event-driven Validation System
 * ============================================================
 *
 *  Fitur:
 *  - Admin dapat membuat event validasi data guru dengan rentang
 *    waktu (startAt s/d deadline) yang fleksibel.
 *  - Admin dapat memperpanjang deadline dengan catatan.
 *  - Guru/ustadz dapat melakukan validasi via WA bot dan/atau via
 *    dashboard website.
 *  - Sistem mencatat siapa yang sudah & belum validasi.
 *  - Ekspor rekap (siapa sudah / belum) ke Excel otomatis.
 *
 *  Data disimpan di database/validasi_events.json (atomic write).
 *
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.resolve(ROOT_DIR, 'database', 'validasi_events.json');

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}
ensureDir(path.dirname(DB_PATH));

// ════════════════════════════════════════════════
//  STORAGE
// ════════════════════════════════════════════════
function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) return { events: [] };
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw || '{"events":[]}');
    if (!Array.isArray(parsed.events)) parsed.events = [];
    return parsed;
  } catch (err) {
    console.error('[VALIDASI-EVENT] Gagal baca DB:', err.message);
    return { events: [] };
  }
}

function writeDb(data) {
  try {
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, DB_PATH);
    return true;
  } catch (err) {
    console.error('[VALIDASI-EVENT] Gagal tulis DB:', err.message);
    return false;
  }
}

function genId() {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `evt_${ts}_${rnd}`;
}

function nowISO() {
  return new Date().toISOString();
}

/** Parse input tanggal/datetime → ISO string (WIB +07:00). */
export function parseDateInput(input, endOfDay = false) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const hh = endOfDay ? '23:59:59' : '00:00:00';
    d = new Date(`${s}T${hh}+07:00`);
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
      d = new Date(`${s.length === 16 ? s + ':00' : s}+07:00`);
    } else {
      d = new Date(s);
    }
  } else {
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function formatTanggalWIB(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(d) + ' WIB';
  } catch {
    return '-';
  }
}

export function formatTanggalRingkasWIB(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(d) + ' WIB';
  } catch {
    return '-';
  }
}

export function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const wibMs = d.getTime() + (7 * 60 * 60 * 1000);
    const wd = new Date(wibMs);
    const yyyy = wd.getUTCFullYear();
    const mm = String(wd.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(wd.getUTCDate()).padStart(2, '0');
    const hh = String(wd.getUTCHours()).padStart(2, '0');
    const mi = String(wd.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return '';
  }
}

export function getEffectiveDeadline(event) {
  if (!event) return null;
  const exts = Array.isArray(event.extensions) ? event.extensions : [];
  if (exts.length === 0) return event.deadline || null;
  const sorted = exts.slice().sort((a, b) => {
    const ta = new Date(a.newDeadline || 0).getTime();
    const tb = new Date(b.newDeadline || 0).getTime();
    return tb - ta;
  });
  return sorted[0]?.newDeadline || event.deadline || null;
}

export function getRuntimeStatus(event) {
  if (!event) return 'unknown';
  if (event.status === 'draft') return 'draft';
  if (event.status === 'closed') return 'closed';
  const now = Date.now();
  const start = event.startAt ? new Date(event.startAt).getTime() : 0;
  const dead = getEffectiveDeadline(event);
  const deadMs = dead ? new Date(dead).getTime() : 0;
  if (start && now < start) return 'upcoming';
  if (deadMs && now > deadMs) return 'expired';
  return 'active';
}

export const DEFAULT_REQUIRED_FIELDS = [
  'Nama Lengkap', 'Tempat Lahir', 'Tanggal Lahir', 'Jenis Kelamin',
  'Status', 'Bagian', 'No HP', 'No KTP', 'NUPTK', 'EMIS', 'Eprimer Pondok',
];

export function listEvents() {
  const db = readDb();
  return db.events.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export function getEvent(id) {
  const db = readDb();
  return db.events.find((e) => e.id === id) || null;
}

export function getActiveEvent() {
  for (const e of listEvents()) {
    if (getRuntimeStatus(e) === 'active') return e;
  }
  return null;
}

export function getOpenEvent() {
  for (const e of listEvents()) {
    if (e.status !== 'active') continue;
    if (getRuntimeStatus(e) === 'active') return e;
  }
  return null;
}

export function createEvent({
  title, description = '', startAt, deadline, requiredFields,
  createdBy = 'admin', status = 'active',
}) {
  if (!title || !String(title).trim()) throw new Error('Judul event wajib diisi.');
  const startISO = parseDateInput(startAt, false);
  const deadISO = parseDateInput(deadline, true);
  if (!startISO) throw new Error('Tanggal mulai tidak valid.');
  if (!deadISO) throw new Error('Tanggal deadline tidak valid.');
  if (new Date(deadISO) <= new Date(startISO)) {
    throw new Error('Deadline harus setelah tanggal mulai.');
  }

  const event = {
    id: genId(),
    title: String(title).trim(),
    description: String(description || '').trim(),
    createdBy,
    createdAt: nowISO(),
    startAt: startISO,
    deadline: deadISO,
    extensions: [],
    status: ['draft', 'active', 'closed'].includes(status) ? status : 'active',
    requiredFields:
      Array.isArray(requiredFields) && requiredFields.length > 0
        ? requiredFields.slice()
        : DEFAULT_REQUIRED_FIELDS.slice(),
    submissions: {},
  };

  const db = readDb();
  db.events.push(event);
  writeDb(db);
  return event;
}

export function updateEvent(id, patch = {}) {
  const db = readDb();
  const idx = db.events.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error('Event tidak ditemukan.');
  const ev = db.events[idx];

  if (patch.title !== undefined) ev.title = String(patch.title).trim();
  if (patch.description !== undefined) ev.description = String(patch.description || '').trim();
  if (patch.startAt !== undefined) {
    const v = parseDateInput(patch.startAt, false);
    if (!v) throw new Error('Tanggal mulai tidak valid.');
    ev.startAt = v;
  }
  if (patch.deadline !== undefined) {
    const v = parseDateInput(patch.deadline, true);
    if (!v) throw new Error('Deadline tidak valid.');
    ev.deadline = v;
  }
  if (patch.status !== undefined && ['draft', 'active', 'closed'].includes(patch.status)) {
    ev.status = patch.status;
  }
  if (Array.isArray(patch.requiredFields)) {
    ev.requiredFields = patch.requiredFields.slice();
  }

  db.events[idx] = ev;
  writeDb(db);
  return ev;
}

export function extendDeadline(id, { newDeadline, note = '', by = 'admin' }) {
  const db = readDb();
  const idx = db.events.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error('Event tidak ditemukan.');
  const ev = db.events[idx];

  const newISO = parseDateInput(newDeadline, true);
  if (!newISO) throw new Error('Deadline baru tidak valid.');
  const currentDead = getEffectiveDeadline(ev);
  if (currentDead && new Date(newISO) <= new Date(currentDead)) {
    throw new Error('Deadline baru harus LEBIH LAMA dari deadline saat ini.');
  }

  if (!Array.isArray(ev.extensions)) ev.extensions = [];
  ev.extensions.push({
    newDeadline: newISO,
    note: String(note || '').trim(),
    extendedAt: nowISO(),
    by,
  });
  if (ev.status === 'closed') ev.status = 'active';

  db.events[idx] = ev;
  writeDb(db);
  return ev;
}

export function deleteEvent(id) {
  const db = readDb();
  const before = db.events.length;
  db.events = db.events.filter((e) => e.id !== id);
  if (db.events.length === before) throw new Error('Event tidak ditemukan.');
  writeDb(db);
  return true;
}

export function toggleEventStatus(id) {
  const ev = getEvent(id);
  if (!ev) throw new Error('Event tidak ditemukan.');
  const newStatus = ev.status === 'active' ? 'closed' : 'active';
  return updateEvent(id, { status: newStatus });
}

export function hasSubmitted(eventId, stambuk) {
  const ev = getEvent(eventId);
  if (!ev) return false;
  return !!ev.submissions?.[String(stambuk)];
}

export function submitValidation(eventId, stambuk, {
  channel = 'web', note = '', fieldsConfirmed = null, nama = '',
} = {}) {
  const db = readDb();
  const idx = db.events.findIndex((e) => e.id === eventId);
  if (idx === -1) throw new Error('Event tidak ditemukan.');
  const ev = db.events[idx];

  const rt = getRuntimeStatus(ev);
  if (rt !== 'active') {
    throw new Error(
      rt === 'upcoming' ? 'Event belum dimulai.'
        : rt === 'expired' ? 'Event sudah melewati batas waktu (deadline).'
        : rt === 'closed' ? 'Event sudah ditutup oleh admin.'
        : 'Event tidak aktif.'
    );
  }

  if (!ev.submissions || typeof ev.submissions !== 'object') ev.submissions = {};
  const key = String(stambuk);
  const prev = ev.submissions[key] || null;

  ev.submissions[key] = {
    stambuk: Number(stambuk) || stambuk,
    nama: String(nama || prev?.nama || ''),
    validatedAt: nowISO(),
    channel: String(channel || 'web'),
    note: String(note || ''),
    fieldsConfirmed: fieldsConfirmed || prev?.fieldsConfirmed || null,
    submitCount: (prev?.submitCount || 0) + 1,
  };

  db.events[idx] = ev;
  writeDb(db);
  return ev.submissions[key];
}

export function removeSubmission(eventId, stambuk) {
  const db = readDb();
  const idx = db.events.findIndex((e) => e.id === eventId);
  if (idx === -1) throw new Error('Event tidak ditemukan.');
  const ev = db.events[idx];
  if (ev.submissions) delete ev.submissions[String(stambuk)];
  db.events[idx] = ev;
  writeDb(db);
  return true;
}

export function buildProgress(event, guruAktif = []) {
  const subs = event?.submissions || {};
  const sudah = [];
  const belum = [];
  for (const g of guruAktif) {
    const stb = String(g.Stambuk || '');
    if (!stb) continue;
    const s = subs[stb];
    if (s) {
      sudah.push({
        Stambuk: stb,
        'Nama Lengkap': g['Nama Lengkap'] || s.nama || '-',
        Status: g.Status || '-',
        Bagian: g.Bagian || '-',
        'No HP': g['No HP'] || '-',
        validatedAt: s.validatedAt,
        channel: s.channel,
        note: s.note || '',
        submitCount: s.submitCount || 1,
      });
    } else {
      belum.push({
        Stambuk: stb,
        'Nama Lengkap': g['Nama Lengkap'] || '-',
        Status: g.Status || '-',
        Bagian: g.Bagian || '-',
        'No HP': g['No HP'] || '-',
      });
    }
  }
  const total = guruAktif.length;
  const pct = total > 0 ? Math.round((sudah.length / total) * 100) : 0;
  return { total, sudah, belum, percentage: pct };
}

export default {
  parseDateInput, formatTanggalWIB, formatTanggalRingkasWIB, isoToDatetimeLocal,
  getEffectiveDeadline, getRuntimeStatus, DEFAULT_REQUIRED_FIELDS,
  listEvents, getEvent, getActiveEvent, getOpenEvent,
  createEvent, updateEvent, extendDeadline, deleteEvent, toggleEventStatus,
  hasSubmitted, submitValidation, removeSubmission, buildProgress,
};
