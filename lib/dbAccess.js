/**
 * ============================================================
 * dbAccess.js — Modul Akses Database Microsoft Access (.accdb)
 * Untuk Bot WhatsApp Pusat Data (Pusdat) Gontor 5
 * ============================================================
 *
 * OPSI 1 (UTAMA  — Windows): node-adodb
 * npm install node-adodb
 * Menggunakan COM/ActiveX, HANYA berjalan di Windows.
 *
 * OPSI 2 (ALTERNATIF — Cross-platform): mdb-reader
 * npm install mdb-reader
 * Pure JavaScript, berjalan di Windows/Linux/Mac.
 * HANYA mendukung READ. Untuk INSERT gunakan mdbtools CLI di Linux.
 *
 * File ini menyediakan KEDUA opsi. Bot akan otomatis memilih
 * berdasarkan platform (process.platform).
 * ============================================================
 *
 * CHANGELOG v2 (AUDIT FIX):
 * - Ditambahkan deepSanitize() untuk membersihkan karakter gaib WhatsApp
 * - Ditambahkan sanitizeStambuk() dan sanitizeTanggal()
 * - Ditambahkan Admin Session terpisah (adminSession Map)
 * - Ditambahkan getPasswordByStambuk() untuk fitur Superadmin
 * - verifyGateway() sekarang menggunakan sanitize sebelum query
 *
 * CHANGELOG v3 (TIMEZONE FINAL FIX):
 * - Ditambahkan normalizeDate() sebagai SATU-SATUNYA sumber kebenaran
 * untuk konversi tanggal dari database → DD-MM-YYYY.
 * - matchDate() dirombak total, sekarang menggunakan normalizeDate().
 * - getPasswordByStambuk() sekarang menggunakan normalizeDate().
 * - formatBiodata() sekarang menggunakan normalizeDate() (bukan inline helper).
 * - Bug UTC shift yang membuat tanggal mundur 1 hari SELESAI PERMANEN.
 *
 * CHANGELOG v4 (MULTI-DATABASE & DAILY STATS):
 * - UPGRADE: Dua koneksi ADODB terpisah → dbGuru & dbSantri
 * - UPGRADE: Dua path DB terpisah → DB_GURU_PATH & DB_SANTRI_PATH
 * - BARU: getDailyPusdatStats() — Query rekapitulasi harian
 * ├─ Total Guru Aktif (COUNT dari DB Guru)
 * ├─ Total Santri Aktif (COUNT dari DB Santri)
 * └─ Pengurangan Santri Harian (rentang 07:00:01 kemarin s/d 07:00:00 hari ini)
 * - readTableMDB() sekarang menerima parameter dbPath untuk multi-DB
 * - Semua fungsi LAMA tetap UTUH, tidak ada yang diubah/dihapus.
 *
 * CHANGELOG v5 (CEK SANTRI SUPER LENGKAP):
 * - BARU: cekSantriSession — Session Map TERPISAH untuk fitur .ceksantri
 * - BARU: getFullBiodataSantri(stambuk) — Query SELECT * dari dbSantri
 * berdasarkan Stambuk, mengambil data dari Tabel Master Santri.
 * - BARU: formatBiodataSantri(santri) — Formatting 80+ kolom biodata
 * santri dengan hierarki ┣⌬, menggunakan normalizeDate() untuk
 * SETIAP kolom tanggal agar bebas UTC shift.
 * - BARU: setCekSantriSession(), getCekSantriSession(), clearCekSantriSession()
 * - Semua fungsi LAMA tetap UTUH, tidak ada yang diubah/dihapus.
 *
 * CHANGELOG v6 (MEGA-UPDATE: EKSPANSI FITUR SANTRI):
 * - BARU: getDaftarSantri() — Daftar santri aktif urut kelas
 * - BARU: cariSantri(keyword) — Pencarian LIKE pada Nama/Stambuk
 * - BARU: getSantriByKelas(kelas) — Ambil santri per kelas
 * - BARU: getStatSantri(kolom, nilai) — COUNT(*) dinamis
 * - BARU: auditBerkasSession — Session Map TERPISAH untuk .auditberkas
 * - BARU: setAuditBerkasSession(), getAuditBerkasSession(), clearAuditBerkasSession()
 * - Semua fungsi LAMA tetap UTUH, tidak ada yang diubah/dihapus.
 *
 * CHANGELOG v7 (DYNAMIC PASSWORD + STATSANTRI GROUP BY & LIKE):
 * - BARU: readPusdatSettings() — Baca pusdat_settings.json dengan error handling
 * - BARU: writePusdatSettings(data) — Tulis ke pusdat_settings.json (atomic sync)
 * - BARU: getStaffPassword() — Ambil password staf dari JSON (real-time)
 * - BARU: setStaffPassword(newPassword) — Ubah password staf di JSON
 * - BARU: getStatSantriGroupBy(kolom) — GROUP BY pada kolom, return Array<{Nilai,Total}>
 * - BARU: getStatSantriLike(kolom, nilai) — LIKE '%nilai%' fuzzy search COUNT
 * - Semua fungsi LAMA tetap UTUH, tidak ada yang diubah/dihapus.
 *
 * CHANGELOG v8 (MEGA-EKSPANSI: LISTSANTRI TWO-TIER, EKSPOR, LACAK, MILAD):
 * - BARU: getKelasGroupCount() — GROUP BY [Kelas] + COUNT untuk .listsantri tier-1
 * - BARU: getSantriByKelasLike(kelas) — LIKE search kelas untuk .listsantri tier-2
 * - BARU: getFilteredSantriAll(kolom, nilai) — SELECT * dengan filter untuk .ekspor
 * - BARU: lacakSantri(keyword) — Pencarian ringan (Nama, Stambuk, Kelas, Rayon, Kamar)
 * - BARU: getAllTanggalLahirGuru() — Ambil semua Nama+TglLahir guru untuk Milad Radar
 * - BARU: getAllTanggalLahirSantri() — Ambil semua Nama+TglLahir santri untuk Milad Radar
 * - Semua fungsi LAMA tetap UTUH, tidak ada yang diubah/dihapus.
 *
 * CHANGELOG v10 (MEGA-UPDATE: SPLIT AUDIT BERKAS, LIHAT BERKAS, REKAP BERKAS):
 * - BARU: lihatBerkasSession — Session Map TERPISAH untuk .lihatberkas
 * - BARU: setLihatBerkasSession(), getLihatBerkasSession(), clearLihatBerkasSession()
 * - BARU: rekapBerkasSession — Session Map TERPISAH untuk .rekapberkas
 * - BARU: setRekapBerkasSession(), getRekapBerkasSession(), clearRekapBerkasSession()
 * - BARU: getAllSantriAktif() — Ambil SEMUA santri aktif (Stambuk + Nama + Kelas)
 * - Semua fungsi LAMA tetap UTUH, tidak ada yang diubah/dihapus.
 * ============================================================
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ══════════════════════════════════════════════════
//  🆕 v7: PUSDAT SETTINGS JSON — DYNAMIC PASSWORD
// ══════════════════════════════════════════════════

/**
 * Path ke file JSON settings Pusdat.
 * File ini menyimpan broadcastTime, targetGroups, DAN staffPassword.
 */
const SETTINGS_PATH = path.resolve(__dirname, '..', 'database', 'pusdat_settings.json');

/**
 * ★ FUNGSI BARU v7: Membaca seluruh isi pusdat_settings.json
 * dengan penanganan error yang aman.
 *
 * @returns {Object} Isi file JSON atau default object
 */
function readPusdatSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[SETTINGS] ⚠️ Gagal membaca ${SETTINGS_PATH}:`, err.message);
    // Return default settings jika file rusak/hilang
    return {
      broadcastTime: '07:00',
      targetGroups: [],
      staffPassword: 'nosystemissafe',
    };
  }
}

/**
 * ★ FUNGSI BARU v7: Menulis seluruh isi ke pusdat_settings.json
 * menggunakan writeFileSync untuk mencegah race condition.
 *
 * @param {Object} data - Objek settings yang akan ditulis
 */
function writePusdatSettings(data) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[SETTINGS] ✅ pusdat_settings.json berhasil diperbarui.`);
  } catch (err) {
    console.error(`[SETTINGS] ❌ Gagal menulis ${SETTINGS_PATH}:`, err.message);
    throw new Error(`Gagal menyimpan settings: ${err.message}`);
  }
}

/**
 * ★ FUNGSI BARU v7: Mengambil password staf saat ini dari JSON.
 * Jika key staffPassword belum ada, kembalikan default 'nosystemissafe'.
 *
 * @returns {string} Password staf yang berlaku
 */
function getStaffPassword() {
  const settings = readPusdatSettings();
  return settings.staffPassword || 'nosystemissafe';
}

/**
 * ★ FUNGSI BARU v7: Mengubah password staf di JSON.
 * Membaca file dulu, modifikasi key staffPassword, lalu tulis kembali.
 * Ini memastikan key lain (broadcastTime, targetGroups) tidak hilang.
 *
 * @param {string} newPassword - Password baru
 */
function setStaffPassword(newPassword) {
  const settings = readPusdatSettings();
  settings.staffPassword = newPassword;
  writePusdatSettings(settings);
  console.log(`[SETTINGS] 🔐 Staff password diubah menjadi: "${newPassword}"`);
}

// ══════════════════════════════════════════════════
//  KONFIGURASI MULTI-DATABASE (LANGSUNG KE MASTER DRIVE D)
// ══════════════════════════════════════════════════

// Karena path sudah menggunakan format Absolute (D:\...),
// kita TIDAK PERLU lagi menggunakan path.resolve ke folder 'database' lokal bot.
const DB_GURU_PATH = 'D:\\PUSAT DATA 2026\\02. MASTER DATA GURU\\00. DB\\DB Guru 2026-2027.accdb';
const DB_SANTRI_PATH = 'D:\\PUSAT DATA 2026\\01. MASTER DATA SANTRI\\00. DB\\DB Santri 2026-2027.accdb';

// ══════════════════════════════════════════════════
//  ★ VARIABEL PENAMPUNG NAMA TABEL SANTRI
//  Ubah di sini jika nama tabel di DB Santri berbeda di dalam file Access-nya.
// ══════════════════════════════════════════════════
const TABEL_MASTER_SANTRI = 'Tabel Master Santri';
const TABEL_SANTRI_NON_AKTIF = 'Tabel Data Santri Non-Aktif';

// Backward compatibility: DB_PATH tetap menunjuk ke DB Guru untuk fungsi lama
const DB_PATH = DB_GURU_PATH;

// Connection string untuk node-adodb (Windows)
const CONN_STR_GURU = `Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${DB_GURU_PATH};`;
const CONN_STR_SANTRI = `Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${DB_SANTRI_PATH};`;

// Backward compatibility
const CONNECTION_STRING = CONN_STR_GURU;

// Deteksi platform dan arsitektur (INI KUNCI FIX-NYA)
const IS_WINDOWS = process.platform === 'win32';
const IS_64_BIT = process.arch.includes('64'); // Cek apakah Node.js berjalan di 64-bit

// ══════════════════════════════════════════════════
//  DEEP SANITIZATION — PEMBUNUH KARAKTER GAIB
// ══════════════════════════════════════════════════

/**
 * Fungsi pembersih agresif untuk input dari WhatsApp.
 * Menghapus SEMUA karakter tak terlihat yang bisa menyebabkan
 * gagal parsing dan gagal verifikasi.
 *
 * @param {string} input - String mentah dari WhatsApp
 * @returns {string} - String yang sudah bersih total
 */
function deepSanitize(input) {
  if (!input || typeof input !== 'string') return '';

  let cleaned = input
    .replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF\u2060\u2061\u2062\u2063\u2064\u00AD\uFFFC]/g, '')
    .replace(/[\uFE00-\uFE0F]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\x80-\x9F]/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Sanitasi khusus untuk Stambuk — hanya menyisakan angka.
 */
function sanitizeStambuk(input) {
  const base = deepSanitize(input);
  const cleaned = base.replace(/[^0-9]/g, '');

  console.log(`[SANITIZE-STAMBUK] Input: "${input}" (len=${input.length}) → Clean: "${cleaned}" (len=${cleaned.length})`);

  if (input.length !== cleaned.length) {
    console.log(`[SANITIZE-STAMBUK] ⚠️ Karakter gaib terdeteksi! Charcode input:`);
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      const hex = code.toString(16).toUpperCase().padStart(4, '0');
      const char = input[i];
      const isPrintable = code >= 0x20 && code <= 0x7E;
      console.log(`  [${i}] U+${hex} = ${isPrintable ? `'${char}'` : '(non-printable)'}`);
    }
  }

  return cleaned;
}

/**
 * Sanitasi khusus untuk Tanggal Lahir — hanya menyisakan angka, /, dan -.
 */
function sanitizeTanggal(input) {
  const base = deepSanitize(input);
  const cleaned = base.replace(/[^0-9\-\/]/g, '');

  console.log(`[SANITIZE-TANGGAL] Input: "${input}" (len=${input.length}) → Clean: "${cleaned}" (len=${cleaned.length})`);

  if (input.length !== cleaned.length) {
    console.log(`[SANITIZE-TANGGAL] ⚠️ Karakter gaib terdeteksi! Charcode input:`);
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      const hex = code.toString(16).toUpperCase().padStart(4, '0');
      const char = input[i];
      const isPrintable = code >= 0x20 && code <= 0x7E;
      console.log(`  [${i}] U+${hex} = ${isPrintable ? `'${char}'` : '(non-printable)'}`);
    }
  }

  return cleaned;
}

// ══════════════════════════════════════════════════
//  SESSION / GATEWAY MANAGEMENT (USER BIASA)
// ══════════════════════════════════════════════════

const gatewaySession = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000;

function setSession(sender, data) {
  gatewaySession.set(sender, {
    ...data,
    timestamp: Date.now(),
  });
}

function getSession(sender) {
  const session = gatewaySession.get(sender);
  if (!session) return null;
  if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
    gatewaySession.delete(sender);
    return null;
  }
  return session;
}

function clearSession(sender) {
  gatewaySession.delete(sender);
}

// ══════════════════════════════════════════════════
//  ADMIN SESSION MANAGEMENT (TERPISAH DARI USER)
// ══════════════════════════════════════════════════

const adminSession = new Map();
const ADMIN_SESSION_TIMEOUT = 3 * 60 * 1000;

function setAdminSession(sender, data) {
  adminSession.set(sender, {
    ...data,
    timestamp: Date.now(),
  });
}

function getAdminSession(sender) {
  const session = adminSession.get(sender);
  if (!session) return null;
  if (Date.now() - session.timestamp > ADMIN_SESSION_TIMEOUT) {
    adminSession.delete(sender);
    return null;
  }
  return session;
}

function clearAdminSession(sender) {
  adminSession.delete(sender);
}

// ══════════════════════════════════════════════════
//  🆕 v5: CEK SANTRI SESSION MANAGEMENT (TERPISAH)
// ══════════════════════════════════════════════════

const cekSantriSession = new Map();
const CEK_SANTRI_SESSION_TIMEOUT = 3 * 60 * 1000;

function setCekSantriSession(sender, data) {
  cekSantriSession.set(sender, {
    ...data,
    timestamp: Date.now(),
  });
}

function getCekSantriSession(sender) {
  const session = cekSantriSession.get(sender);
  if (!session) return null;
  if (Date.now() - session.timestamp > CEK_SANTRI_SESSION_TIMEOUT) {
    cekSantriSession.delete(sender);
    return null;
  }
  return session;
}

function clearCekSantriSession(sender) {
  cekSantriSession.delete(sender);
}

// ══════════════════════════════════════════════════
//  🆕 v6: AUDIT BERKAS SESSION MANAGEMENT (TERPISAH)
// ══════════════════════════════════════════════════

const auditBerkasSession = new Map();
const AUDIT_BERKAS_SESSION_TIMEOUT = 3 * 60 * 1000;

function setAuditBerkasSession(sender, data) {
  auditBerkasSession.set(sender, {
    ...data,
    timestamp: Date.now(),
  });
}

function getAuditBerkasSession(sender) {
  const session = auditBerkasSession.get(sender);
  if (!session) return null;
  if (Date.now() - session.timestamp > AUDIT_BERKAS_SESSION_TIMEOUT) {
    auditBerkasSession.delete(sender);
    return null;
  }
  return session;
}

function clearAuditBerkasSession(sender) {
  auditBerkasSession.delete(sender);
}

// ══════════════════════════════════════════════════
//  🆕 v9: EKSPOR FULL SESSION MANAGEMENT (TERPISAH)
// ══════════════════════════════════════════════════

const eksporSession = new Map();
const EKSPOR_SESSION_TIMEOUT = 3 * 60 * 1000;

function setEksporSession(sender, data) {
  eksporSession.set(sender, {
    ...data,
    timestamp: Date.now(),
  });
}

function getEksporSession(sender) {
  const session = eksporSession.get(sender);
  if (!session) return null;

  if (Date.now() - session.timestamp > EKSPOR_SESSION_TIMEOUT) {
    eksporSession.delete(sender);
    return null;
  }

  return session;
}

function clearEksporSession(sender) {
  eksporSession.delete(sender);
}

// ══════════════════════════════════════════════════
//  🆕 v10: LIHAT BERKAS SESSION MANAGEMENT (TERPISAH)
// ══════════════════════════════════════════════════

const lihatBerkasSession = new Map();
const LIHAT_BERKAS_SESSION_TIMEOUT = 3 * 60 * 1000;

function setLihatBerkasSession(sender, data) {
  lihatBerkasSession.set(sender, {
    ...data,
    timestamp: Date.now(),
  });
}

function getLihatBerkasSession(sender) {
  const session = lihatBerkasSession.get(sender);
  if (!session) return null;
  if (Date.now() - session.timestamp > LIHAT_BERKAS_SESSION_TIMEOUT) {
    lihatBerkasSession.delete(sender);
    return null;
  }
  return session;
}

function clearLihatBerkasSession(sender) {
  lihatBerkasSession.delete(sender);
}

// ══════════════════════════════════════════════════
//  🆕 v10: REKAP BERKAS SESSION MANAGEMENT (TERPISAH)
// ══════════════════════════════════════════════════

const rekapBerkasSession = new Map();
const REKAP_BERKAS_SESSION_TIMEOUT = 3 * 60 * 1000;

function setRekapBerkasSession(sender, data) {
  rekapBerkasSession.set(sender, {
    ...data,
    timestamp: Date.now(),
  });
}

function getRekapBerkasSession(sender) {
  const session = rekapBerkasSession.get(sender);
  if (!session) return null;
  if (Date.now() - session.timestamp > REKAP_BERKAS_SESSION_TIMEOUT) {
    rekapBerkasSession.delete(sender);
    return null;
  }
  return session;
}

function clearRekapBerkasSession(sender) {
  rekapBerkasSession.delete(sender);
}

// ══════════════════════════════════════════════════
//  PENDING REGISTRATION (untuk .daftar)
// ══════════════════════════════════════════════════

const pendingRegistrations = new Map();

function addPendingRegistration(stambuk, data) {
  pendingRegistrations.set(String(stambuk), {
    ...data,
    timestamp: Date.now(),
  });
}

function getPendingRegistration(stambuk) {
  return pendingRegistrations.get(String(stambuk)) || null;
}

function removePendingRegistration(stambuk) {
  pendingRegistrations.delete(String(stambuk));
}

// ══════════════════════════════════════════════════
//  DATABASE QUERY FUNCTIONS — MULTI-DATABASE
// ══════════════════════════════════════════════════

let adodb = null;
let MDBReader = null;

let dbGuru = null;
let dbSantri = null;
let dbConnection = null;

async function initDB() {
  if (IS_WINDOWS) {
    try {
      adodb = (await import('node-adodb')).default;
      dbGuru = adodb.open(CONN_STR_GURU, IS_64_BIT);
      console.log(`[✔] DB Guru terhubung via node-adodb (Windows ${IS_64_BIT ? '64-bit' : '32-bit'})`);
      console.log(`    └─ Path: ${DB_GURU_PATH}`);
      dbSantri = adodb.open(CONN_STR_SANTRI, IS_64_BIT);
      console.log(`[✔] DB Santri terhubung via node-adodb (Windows ${IS_64_BIT ? '64-bit' : '32-bit'})`);
      console.log(`    └─ Path: ${DB_SANTRI_PATH}`);
      dbConnection = dbGuru;
    } catch (err) {
      console.error('[✖] Gagal inisialisasi node-adodb:', err.message);
      console.log('[ℹ] Mencoba fallback ke mdb-reader...');
      await initMDBReader();
    }
  } else {
    await initMDBReader();
  }
}

async function initMDBReader() {
  try {
    const mdbModule = await import('mdb-reader');
    MDBReader = mdbModule.default || mdbModule.MDBReader;
    console.log('[✔] Database Access terhubung via mdb-reader (Cross-platform)');
    console.log(`    ├─ DB Guru  : ${DB_GURU_PATH}`);
    console.log(`    └─ DB Santri: ${DB_SANTRI_PATH}`);
  } catch (err) {
    console.error('[✖] Gagal inisialisasi mdb-reader:', err.message);
    console.error('[!] Install salah satu: npm install node-adodb (Windows) ATAU npm install mdb-reader (Cross-platform)');
  }
}

function readTableMDB(tableName, dbFilePath = DB_GURU_PATH) {
  const buffer = fs.readFileSync(dbFilePath);
  const reader = new MDBReader(buffer);
  const table = reader.getTable(tableName);
  return table.getData();
}

// ══════════════════════════════════════════════════
//  🆕 HELPER UNIVERSAL: normalizeDate
//  SATU-SATUNYA SUMBER KEBENARAN KONVERSI TANGGAL DB
// ══════════════════════════════════════════════════

/**
 * Menetralisir UTC shift dari node-adodb / mdb-reader secara PERMANEN.
 *
 * @param {Date|string|any} dbDate - Tanggal mentah dari database
 * @returns {string} - Format DD-MM-YYYY yang BENAR, atau '-' jika kosong
 */
function normalizeDate(dbDate) {
  if (!dbDate) return '-';

  let dObj;

  if (dbDate instanceof Date) {
    dObj = dbDate;
  } else if (typeof dbDate === 'string' && (dbDate.includes('T') || dbDate.includes('-') || dbDate.includes('/'))) {
    dObj = new Date(dbDate);
  } else {
    dObj = new Date(dbDate);
  }

  if (isNaN(dObj.getTime())) {
    return String(dbDate);
  }

  // ═══ KUNCI FIX: Tambahkan offset +8 jam untuk melawan kemunduran UTC ═══
  dObj.setHours(dObj.getHours() + 8);

  const dd = String(dObj.getDate()).padStart(2, '0');
  const mm = String(dObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dObj.getFullYear();

  return `${dd}-${mm}-${yyyy}`;
}

// ══════════════════════════════════════════════════
//  ★ v17 HELPERS: firstFilledValue, normalizePhoneValue,
//                  extractPhoneFromRecord, enrichGuruRecord
// ══════════════════════════════════════════════════

function firstFilledValue(...values) {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const t = String(v).trim();
    if (t !== '') return t;
  }
  return '';
}

function normalizePhoneValue(...values) {
  const raw = firstFilledValue(...values);
  if (!raw) return '';
  let digits = String(raw).replace(/[\s()\-.]/g, '');
  digits = digits.replace(/[^\d+]/g, '');
  if (!digits) return String(raw);
  if (digits.startsWith('+')) {
    const rest = digits.slice(1).replace(/\+/g, '');
    return `+${rest}`;
  }
  if (digits.startsWith('62')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 9) return `+62${digits.slice(1)}`;
  return digits;
}

function extractPhoneFromRecord(record = {}) {
  if (!record || typeof record !== 'object') return '';
  const seen = [];
  const explicit = [
    'No HP', 'No. HP', 'No.HP', 'No_HP', 'NoHp', 'No Hp', 'NoHP',
    'No Telp', 'No. Telp', 'NoTelp', 'No_Telp', 'Telepon', 'Telp',
    'Handphone', 'HP', 'Hp', 'WA', 'No WA', 'No WhatsApp', 'Whatsapp',
  ];
  for (const key of explicit) {
    if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') {
      seen.push(record[key]);
    }
  }
  for (const [k, v] of Object.entries(record)) {
    if (v === null || v === undefined) continue;
    const lk = String(k).toLowerCase().replace(/[^a-z]/g, '');
    if ((lk.includes('hp') || lk.includes('telp') || lk.includes('phone') || lk === 'wa')
        && String(v).trim() !== '') {
      seen.push(v);
    }
  }
  return normalizePhoneValue(...seen);
}

function enrichGuruRecord(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  const out = { ...rec };
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) { out[k] = normalizeDate(v); continue; }
    const lk = String(k).toLowerCase();
    if ((lk.includes('tanggal') || lk.includes('tgl')) && v !== null && v !== undefined && String(v).trim() !== '') {
      out[k] = normalizeDate(v);
    }
  }
  const phone = extractPhoneFromRecord(rec);
  if (phone) out['No HP'] = phone;
  if (!firstFilledValue(out['EMIS'])) {
    out['EMIS'] = firstFilledValue(rec.EMIS, rec.Emis, rec['E M I S'], rec['E.M.I.S']);
  }
  if (!firstFilledValue(out['Eprimer Pondok'])) {
    out['Eprimer Pondok'] = firstFilledValue(
      rec['Eprimer Pondok'], rec.Eprimer, rec['E Primer Pondok'], rec['EprimerPondok']
    );
  }
  if (!firstFilledValue(out['NUPTK'])) {
    out['NUPTK'] = firstFilledValue(rec.NUPTK, rec.Nuptk);
  }
  return out;
}


// ──────────────────────────────────────────────────
//  QUERY: Verifikasi Gateway (Cek Stambuk + Tanggal Lahir)
// ──────────────────────────────────────────────────

async function verifyGateway(stambuk, tanggalLahirInput) {
  const cleanStambuk = sanitizeStambuk(String(stambuk));
  const cleanTgl = sanitizeTanggal(tanggalLahirInput);

  const stambukNum = parseInt(cleanStambuk, 10);
  if (isNaN(stambukNum)) return null;

  console.log(`\n--- 🔍 DEBUG VERIFIKASI ---`);
  console.log(`▶ Raw Input     : stambuk="${stambuk}" tgl="${tanggalLahirInput}"`);
  console.log(`▶ After Sanitize: stambuk="${cleanStambuk}" tgl="${cleanTgl}"`);
  console.log(`▶ stambukNum    : ${stambukNum}`);

  if (IS_WINDOWS && dbGuru) {
    const sql = `SELECT * FROM [T Master Guru] WHERE [Stambuk] = ${stambukNum} OR [Stambuk] = '${cleanStambuk}'`;
    try {
      const results = await dbGuru.query(sql);
      if (!results || results.length === 0) {
        console.log(`❌ GAGAL: Stambuk ${cleanStambuk} TIDAK DITEMUKAN di database.`);
        return null;
      }

      const guru = results[0];
      const dbDate = guru['Tanggal Lahir'];
      console.log(`✅ Stambuk Ketemu: ${guru['Nama Lengkap']}`);
      console.log(`📅 Raw Tanggal dari DB:`, dbDate, `(Tipe: ${typeof dbDate})`);

      if (!dbDate) {
        console.log(`❌ GAGAL: Kolom Tanggal Lahir KOSONG.`);
        return null;
      }

      if (matchDate(dbDate, cleanTgl)) {
        console.log(`✅ VERIFIKASI SUKSES: Tanggal Lahir Cocok!`);
        return guru;
      } else {
        console.log(`❌ GAGAL: Tanggal Lahir TIDAK COCOK.`);
        return null;
      }
    } catch (err) {
      console.error(`❌ ERROR SQL:`, err.message);
      return null;
    }
  } else if (MDBReader) {
    const rows = readTableMDB('T Master Guru', DB_GURU_PATH);
    const guru = rows.find((r) => Number(r.Stambuk) === stambukNum || String(r.Stambuk) === String(cleanStambuk));
    if (!guru) {
      console.log(`❌ GAGAL: Stambuk ${cleanStambuk} TIDAK DITEMUKAN (mdb-reader).`);
      return null;
    }

    console.log(`✅ Stambuk Ketemu (mdb-reader): ${guru['Nama Lengkap']}`);

    const dbDate = guru['Tanggal Lahir'];
    if (!dbDate) {
      console.log(`❌ GAGAL: Kolom Tanggal Lahir KOSONG.`);
      return null;
    }

    console.log(`📅 DB Date:`, dbDate, `(Tipe: ${typeof dbDate})`);

    if (matchDate(dbDate, cleanTgl)) {
      console.log(`✅ VERIFIKASI SUKSES (mdb-reader)!`);
      return guru;
    }

    console.log(`❌ GAGAL: Tanggal Lahir TIDAK COCOK (mdb-reader).`);
    return null;
  }
  throw new Error('Database belum diinisialisasi.');
}

// ──────────────────────────────────────────────────
//  QUERY: Ambil Biodata Lengkap (untuk .cek)
// ──────────────────────────────────────────────────

async function getFullBiodata(stambuk) {
  const cleanStambuk = sanitizeStambuk(String(stambuk));
  const stambukNum = parseInt(cleanStambuk, 10);
  if (isNaN(stambukNum)) return null;

  let raw = null;
  if (IS_WINDOWS && dbGuru) {
    const sql = `SELECT * FROM [T Master Guru] WHERE [Stambuk] = ${stambukNum}`;
    const results = await dbGuru.query(sql);
    raw = results && results.length > 0 ? results[0] : null;
  } else if (MDBReader) {
    const rows = readTableMDB('T Master Guru', DB_GURU_PATH);
    raw = rows.find((r) => Number(r.Stambuk) === stambukNum) || null;
  } else {
    throw new Error('Database belum diinisialisasi.');
  }

  // ★ v17: normalisasi tanggal & nomor sebelum dipakai editor/dashboard
  return raw ? enrichGuruRecord(raw) : null;
}

// ──────────────────────────────────────────────────
//  QUERY: Ambil Password (Tanggal Lahir) by Stambuk
// ──────────────────────────────────────────────────

async function getPasswordByStambuk(stambuk) {
  const cleanStambuk = sanitizeStambuk(String(stambuk));
  const stambukNum = parseInt(cleanStambuk, 10);
  if (isNaN(stambukNum)) return null;

  console.log(`[ADMIN-QUERY] Mengambil password untuk Stambuk: ${stambukNum}`);

  let guru = null;

  if (IS_WINDOWS && dbGuru) {
    const sql = `SELECT [Stambuk], [Nama Lengkap], [Tanggal Lahir] FROM [T Master Guru] WHERE [Stambuk] = ${stambukNum}`;
    const results = await dbGuru.query(sql);
    guru = results && results.length > 0 ? results[0] : null;
  } else if (MDBReader) {
    const rows = readTableMDB('T Master Guru', DB_GURU_PATH);
    guru = rows.find((r) => Number(r.Stambuk) === stambukNum) || null;
  } else {
    throw new Error('Database belum diinisialisasi.');
  }

  if (!guru) {
    console.log(`[ADMIN-QUERY] ❌ Stambuk ${stambukNum} tidak ditemukan.`);
    return null;
  }

  const tglFormatted = normalizeDate(guru['Tanggal Lahir']);
  console.log(`[ADMIN-QUERY] ✅ Ditemukan: ${guru['Nama Lengkap']}, Tgl: ${tglFormatted}`);

  return {
    stambuk: guru.Stambuk || stambukNum,
    nama: guru['Nama Lengkap'] || '-',
    tanggalLahir: tglFormatted,
  };
}

// ──────────────────────────────────────────────────
//  QUERY: Direktori Guru / Absen (untuk .absen)
// ──────────────────────────────────────────────────

async function getDirektoriGuru() {
  // ★ v17: ambil seluruh kolom yang dibutuhkan dashboard/validasi (No HP, EMIS, Eprimer Pondok, NUPTK, Bagian, Tanggal Lahir, Tempat Lahir, No KTP)
  if (IS_WINDOWS && dbGuru) {
    const sql = `
      SELECT *
      FROM [T Master Guru]
      WHERE [Status] = 'Aktif'
      ORDER BY [Ranking] ASC
    `;
    const rows = await dbGuru.query(sql);
    return Array.isArray(rows) ? rows.map(enrichGuruRecord) : [];
  } else if (MDBReader) {
    const rows = readTableMDB('T Master Guru', DB_GURU_PATH);
    return rows
      .filter((r) => r.Status === 'Aktif')
      .map((r) => enrichGuruRecord(r))
      .sort((a, b) => (Number(a.Ranking) || 999) - (Number(b.Ranking) || 999));
  }

  throw new Error('Database belum diinisialisasi.');
}

// ──────────────────────────────────────────────────
//  QUERY: Cek apakah Stambuk sudah ada (untuk .daftar)
// ──────────────────────────────────────────────────

async function isStambukExists(stambuk) {
  const stambukNum = parseInt(stambuk, 10);
  if (isNaN(stambukNum)) return false;

  if (IS_WINDOWS && dbGuru) {
    const sql = `SELECT [Stambuk] FROM [T Master Guru] WHERE [Stambuk] = ${stambukNum}`;
    const results = await dbGuru.query(sql);
    return results && results.length > 0;
  } else if (MDBReader) {
    const rows = readTableMDB('T Master Guru', DB_GURU_PATH);
    return rows.some((r) => Number(r.Stambuk) === stambukNum);
  }

  return false;
}

// ──────────────────────────────────────────────────
//  QUERY: INSERT guru baru (untuk .terima / approval)
// ──────────────────────────────────────────────────

async function insertGuru(data) {
  const { stambuk, nama, tanggalLahir } = data;
  const stambukNum = parseInt(stambuk, 10);

  const parts = tanggalLahir.split('/');
  const accessDate = `${parts[1]}/${parts[0]}/${parts[2]}`;

  if (IS_WINDOWS && dbGuru) {
    const sql = `
      INSERT INTO [T Master Guru] ([Stambuk], [Nama Lengkap], [Tanggal Lahir], [Status])
      VALUES (${stambukNum}, '${nama.replace(/'/g, "''")}', #${accessDate}#, 'Aktif')
    `;
    await dbGuru.execute(sql);
    return true;
  } else {
    const { execSync } = await import('child_process');

    try {
      const sqlInsert = `INSERT INTO [T Master Guru] ([Stambuk], [Nama Lengkap], [Tanggal Lahir], [Status]) VALUES (${stambukNum}, '${nama.replace(/'/g, "''")}', '${accessDate}', 'Aktif');`;

      execSync(`echo "${sqlInsert}" | mdb-sql -d '|' "${DB_GURU_PATH}"`, {
        encoding: 'utf-8',
      });

      console.log(`[✔] INSERT berhasil untuk Stambuk ${stambukNum}`);
      return true;
    } catch (err) {
      console.error('[✖] INSERT gagal via mdb-sql:', err.message);
      console.log('[ℹ] Alternatif: Gunakan Python + pyodbc, atau jalankan bot di Windows dengan node-adodb.');
      throw new Error('INSERT tidak didukung di platform ini. Hubungi admin untuk menambah data secara manual.');
    }
  }
}

// ══════════════════════════════════════════════════
//  HELPER: Cocokkan Tanggal Lahir
// ══════════════════════════════════════════════════

function matchDate(dbDate, inputDate) {
  try {
    let cleanInput = inputDate.trim().replace(/\//g, '-');
    let parts = cleanInput.split('-');
    if (parts.length !== 3) return false;

    let d = String(parseInt(parts[0], 10)).padStart(2, '0');
    let m = String(parseInt(parts[1], 10)).padStart(2, '0');
    let y = parts[2];

    if (y.length === 2) y = parseInt(y, 10) > 50 ? '19' + y : '20' + y;

    let formattedInput = `${d}-${m}-${y}`;
    let trueDbDate = normalizeDate(dbDate);

    console.log(`[DEBUG MATCH] Input User: ${formattedInput} | Normalisasi DB: ${trueDbDate}`);
    return formattedInput === trueDbDate;
  } catch (err) {
    console.error('[matchDate] Error:', err.message);
    return false;
  }
}

// ══════════════════════════════════════════════════
//  HELPER: Format Biodata untuk Tampilan Chat
// ══════════════════════════════════════════════════

function formatBiodata(guru) {
  const val = (key) => {
    const v = guru[key];
    if (v === null || v === undefined || v === '') return '-';
    if (typeof v === 'string' && v.trim() === '') return '-';
    return String(v);
  };

  const tglLahir = normalizeDate(guru['Tanggal Lahir']);
  const tglAngket = normalizeDate(guru['Tanggal Penulisan Angket']);

  return `
┏━━━━『 *INFORMASI UTAMA* 』━━━━┓
┃
┣⌬ *Stambuk* : ${val('Stambuk')}
┣⌬ *Ranking* : ${val('Ranking')}
┣⌬ *NIM* : ${val('NIM')}
┣⌬ *Nama Lengkap* : ${val('Nama Lengkap')}
┣⌬ *Nama Standar Arab* : ${val('Nama Standar Arab')}
┣⌬ *Nama Panggilan* : ${val('Nama Panggilan')}
┣⌬ *Status* : ${val('Status')}
┣⌬ *Ditempatkan di Gontor?* : ${val('Ditempatkan di Gontor?')}
┣⌬ *Kamar Guru* : ${val('Kamar Guru')}
┃
┣━━━『 *DATA PRIBADI* 』━━━
┃
┣⌬ *Tempat Lahir* : ${val('Tempat Lahir')}
┣⌬ *Tanggal Lahir* : ${tglLahir}
┣⌬ *Umur* : ${val('Umur')}
┣⌬ *No KTP* : ${val('No KTP')}
┣⌬ *Suku* : ${val('Suku')}
┣⌬ *Daerah* : ${val('Daerah')}
┣⌬ *Daerah (Arab)* : ${val('Daerah (Arab)')}
┣⌬ *Dibesarkan di* : ${val('Dibesarkan di')}
┣⌬ *Dibesarkan di Kota* : ${val('Dibesarkan di Kota')}
┣⌬ *Konsulat* : ${val('Konsulat')}
┣⌬ *Kewarganegaraan* : ${val('Kewarganegaraan')}
┃
┣━━━『 *ALAMAT* 』━━━
┃
┣⌬ *Kampung* : ${val('Kampung')}
┣⌬ *Ponpes* : ${val('Ponpes')}
┣⌬ *Jalan* : ${val('Jalan')}
┣⌬ *Km* : ${val('Km')}
┣⌬ *Gang* : ${val('Gang')}
┣⌬ *RT* : ${val('RT')}
┣⌬ *RW* : ${val('RW')}
┣⌬ *Desa* : ${val('Desa')}
┣⌬ *Kecamatan* : ${val('Kecamatan')}
┣⌬ *Kab/Kota* : ${val('Kab/Kota')}
┣⌬ *Provinsi* : ${val('Provinsi')}
┣⌬ *Kode Pos* : ${val('Kode Pos')}
┃
┣━━━『 *KONTAK* 』━━━
┃
┣⌬ *No Telp* : ${val('No Telp')}
┣⌬ *No HP* : ${val('No HP')}
┣⌬ *Faksimile* : ${val('Faksimile')}
┣⌬ *Email* : ${val('Email')}
┃
┣━━━『 *RIWAYAT PENDIDIKAN* 』━━━
┃
┣⌬ *Th Masuk Gontor* : ${val('Th Masuk Gontor')}
┣⌬ *Th Tamat KMI* : ${val('Th Tamat KMI')}
┣⌬ *Guru Tahun ke* : ${val('Guru Tahun ke')}
┃
┣━━━『 *ANGKET* 』━━━
┃
┣⌬ *Tgl Penulisan Angket* : ${tglAngket}
┃
┗━━━━━━━━━━━━━━━━━━━━━◧

🏫 _Pusat Data PMDG Kampus 5 Magelang_`;
}

// ══════════════════════════════════════════════════════════════════
//  🆕 v5: QUERY BIODATA SANTRI SUPER LENGKAP
// ══════════════════════════════════════════════════════════════════

async function getFullBiodataSantri(stambuk) {
  const cleanStambuk = sanitizeStambuk(String(stambuk));
  const stambukNum = parseInt(cleanStambuk, 10);
  if (isNaN(stambukNum)) return null;

  console.log(`[CEK-SANTRI-QUERY] Mengambil biodata santri untuk Stambuk: ${stambukNum}`);

  if (IS_WINDOWS && dbSantri) {
    const sql = `SELECT * FROM [${TABEL_MASTER_SANTRI}] WHERE [Stambuk] = ${stambukNum} OR [Stambuk] = '${cleanStambuk}'`;
    try {
      const results = await dbSantri.query(sql);
      if (!results || results.length === 0) {
        console.log(`[CEK-SANTRI-QUERY] ❌ Stambuk ${cleanStambuk} TIDAK DITEMUKAN di DB Santri.`);
        return null;
      }
      console.log(`[CEK-SANTRI-QUERY] ✅ Ditemukan: ${results[0]['Nama Lengkap'] || '(tanpa nama)'}`);
      return results[0];
    } catch (err) {
      console.error(`[CEK-SANTRI-QUERY] ❌ Error SQL:`, err.message);
      return null;
    }
  } else if (MDBReader) {
    const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
    const santri = rows.find(
      (r) => Number(r.Stambuk) === stambukNum || String(r.Stambuk) === String(cleanStambuk)
    );
    if (!santri) {
      console.log(`[CEK-SANTRI-QUERY] ❌ Stambuk ${cleanStambuk} TIDAK DITEMUKAN (mdb-reader).`);
      return null;
    }
    console.log(`[CEK-SANTRI-QUERY] ✅ Ditemukan (mdb-reader): ${santri['Nama Lengkap'] || '(tanpa nama)'}`);
    return santri;
  }

  throw new Error('Database belum diinisialisasi.');
}

// ══════════════════════════════════════════════════════════════════
//  🆕 v5: FORMAT BIODATA SANTRI SUPER LENGKAP (80+ KOLOM)
// ══════════════════════════════════════════════════════════════════

function formatBiodataSantri(santri) {
  const val = (key) => {
    const v = santri[key];
    if (v === null || v === undefined || v === '') return '-';
    if (typeof v === 'string' && v.trim() === '') return '-';
    return String(v);
  };

  const tglLahir           = normalizeDate(santri['Tanggal Lahir']);
  const ayahTglLahir       = normalizeDate(santri['Ayah_TanggalLahir']);
  const ibuTglLahir        = normalizeDate(santri['Ibu_TanggalLahir']);
  const waliTglLahir       = normalizeDate(santri['Wali_TanggalLahir']);

  return `┏━━━━『 *BIODATA SANTRI AKTIF* 』━━━━┓
┃
┣⌬ *Stambuk* : ${val('Stambuk')}
┣⌬ *Nama Lengkap* : ${val('Nama Lengkap')}
┣⌬ *Nama Standar (Arab)* : ${val('Nama Standar Arab')}
┣⌬ *Nama Panggilan* : ${val('Nama Panggilan')}
┣⌬ *Status* : ${val('Status')}
┣⌬ *Posisi* : ${val('Posisi')}
┣⌬ *Kelas* : ${val('Kelas')} (Asal: ${val('Kls Asal')})
┣⌬ *Absen* : ${val('Abs')}
┃
┣━━━『 *DATA PRIBADI & DOKUMEN* 』━━━
┃
┣⌬ *Tempat Lahir* : ${val('Tempat Lahir')}
┣⌬ *Tanggal Lahir* : ${tglLahir}
┣⌬ *Suku* : ${val('Suku')}
┣⌬ *Daerah* : ${val('Daerah')}
┣⌬ *Daerah (Arab)* : ${val('Daerah (Arab)')}
┣⌬ *Konsulat* : ${val('Konsulat')}
┣⌬ *Kewarganegaraan* : ${val('Kewarganegaraan')}
┣⌬ *No KTP* : ${val('No KTP')}
┣⌬ *No KK* : ${val('No KK')}
┣⌬ *NISN* : ${val('NISN')}
┣⌬ *No BPJS* : ${val('No BPJS')}
┃
┣━━━『 *PENDIDIKAN & RAYON* 』━━━
┃
┣⌬ *TH Masuk Gontor* : ${val('Th Masuk Gontor')}
┣⌬ *Ditempatkan di Gontor?* : ${val('Ditempatkan di Gontor?')}
┣⌬ *Aktif Tahun Ajaran* : ${val('Aktif Tahun Ajaran')}
┣⌬ *Rayon* : ${val('Rayon')}
┣⌬ *Kamar Rayon* : ${val('Kamar Rayon')}
┣⌬ *Jabatan* : ${val('Jabatan')}
┣⌬ *Dapur* : ${val('Dapur')}
┣⌬ *Tempat Pidato* : ${val('Tempat Pidato')}
┣⌬ *POT* : ${val('POT')}
┣⌬ *Dibesarkan di Kota* : ${val('Dibesarkan di Kota')}
┣⌬ *Lulusan Tingkat* : ${val('Lulusan Tingkat')}
┣⌬ *Lulusan Tahun* : ${val('Lulusan Tahun')}
┃
┣━━━『 *KESEHATAN* 』━━━
┃
┣⌬ *Tinggi Badan* : ${val('Tinggi Badan')} cm
┣⌬ *Berat Badan* : ${val('Berat Badan')} kg
┣⌬ *Golongan Darah* : ${val('Golongan Darah')}
┣⌬ *Riwayat Penyakit* : ${val('Riwayat Penyakit')}
┃
┣━━━『 *DATA AYAH* 』━━━
┃
┣⌬ *Nama Ayah* : ${val('Ayah_NamaLengkap')}
┣⌬ *Tempat Lahir* : ${val('Ayah_TempatLahir')}
┣⌬ *Tanggal Lahir* : ${ayahTglLahir}
┣⌬ *Pekerjaan* : ${val('Ayah_Pekerjaan')}
┣⌬ *Pendidikan* : ${val('Ayah_Pendidikan')}
┣⌬ *Penghasilan* : ${val('Ayah_Penghasilan')}
┣⌬ *No HP* : ${val('Ayah_NoHP')}
┃
┣━━━『 *DATA IBU* 』━━━
┃
┣⌬ *Nama Ibu* : ${val('Ibu_NamaLengkap')}
┣⌬ *Tempat Lahir* : ${val('Ibu_TempatLahir')}
┣⌬ *Tanggal Lahir* : ${ibuTglLahir}
┣⌬ *Pekerjaan* : ${val('Ibu_Pekerjaan')}
┣⌬ *Pendidikan* : ${val('Ibu_Pendidikan')}
┣⌬ *No HP* : ${val('Ibu_NoHP')}
┃
┣━━━『 *DATA WALI* 』━━━
┃
┣⌬ *Nama Wali* : ${val('Wali_NamaLengkap')}
┣⌬ *Tempat Lahir* : ${val('Wali_TempatLahir')}
┣⌬ *Tanggal Lahir* : ${waliTglLahir}
┣⌬ *Hubungan* : ${val('Wali_Hubungan')}
┣⌬ *Pekerjaan* : ${val('Wali_Pekerjaan')}
┣⌬ *No HP* : ${val('Wali_NoHP')}
┃
┣━━━『 *ALAMAT* 』━━━
┃
┣⌬ *Kampung* : ${val('Kampung')}
┣⌬ *Jalan* : ${val('Jalan')}
┣⌬ *RT/RW* : ${val('RT')} / ${val('RW')}
┣⌬ *Desa* : ${val('Desa')}
┣⌬ *Kecamatan* : ${val('Kecamatan')}
┣⌬ *Kab/Kota* : ${val('Kab/Kota')}
┣⌬ *Provinsi* : ${val('Provinsi')}
┣⌬ *Kode Pos* : ${val('Kode Pos')}
┃
┗━━━━━━━━━━━━━━━━━━━━━◧`;
}

// ══════════════════════════════════════════════════════════════════
//  🆕 v6: QUERY DAFTAR SANTRI AKTIF (untuk .listsantri)
// ══════════════════════════════════════════════════════════════════

async function getDaftarSantri() {
  console.log(`[DAFTAR-SANTRI] Mengambil daftar santri aktif...`);

  if (IS_WINDOWS && dbSantri) {
    const sql = `SELECT [Stambuk], [Nama Lengkap], [Kelas] FROM [${TABEL_MASTER_SANTRI}] WHERE [Status] = 'Aktif' ORDER BY [Kelas] ASC, [Nama Lengkap] ASC`;
    try {
      const results = await dbSantri.query(sql);
      console.log(`[DAFTAR-SANTRI] ✅ Ditemukan ${results ? results.length : 0} santri aktif.`);
      return results || [];
    } catch (err) {
      console.error(`[DAFTAR-SANTRI] ❌ Error SQL:`, err.message);
      throw new Error(`Gagal mengambil daftar santri: ${err.message}`);
    }
  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const filtered = rows
        .filter((r) => r.Status === 'Aktif')
        .map((r) => ({
          Stambuk: r.Stambuk,
          'Nama Lengkap': r['Nama Lengkap'],
          Kelas: r.Kelas,
        }))
        .sort((a, b) => {
          const kelasCompare = String(a.Kelas || '').localeCompare(String(b.Kelas || ''));
          if (kelasCompare !== 0) return kelasCompare;
          return String(a['Nama Lengkap'] || '').localeCompare(String(b['Nama Lengkap'] || ''));
        });

      console.log(`[DAFTAR-SANTRI] ✅ Ditemukan ${filtered.length} santri aktif (mdb-reader).`);
      return filtered;
    } catch (err) {
      console.error(`[DAFTAR-SANTRI] ❌ Error mdb-reader:`, err.message);
      throw new Error(`Gagal mengambil daftar santri: ${err.message}`);
    }
  }

  throw new Error('Database belum diinisialisasi.');
}

// ══════════════════════════════════════════════════════════════════
//  🆕 v6: CARI SANTRI (untuk .carisantri)
// ══════════════════════════════════════════════════════════════════

async function cariSantri(keyword) {
  const cleanKeyword = deepSanitize(keyword).trim();

  if (!cleanKeyword) {
    console.log(`[CARI-SANTRI] ⚠️ Keyword kosong setelah sanitasi.`);
    return [];
  }

  console.log(`[CARI-SANTRI] Mencari santri dengan keyword: "${cleanKeyword}"`);

  const safeKeyword = cleanKeyword.replace(/'/g, "''");

  if (IS_WINDOWS && dbSantri) {
    const sql = `SELECT [Stambuk], [Nama Lengkap], [Kelas] FROM [${TABEL_MASTER_SANTRI}] WHERE [Status] = 'Aktif' AND ([Nama Lengkap] LIKE '%${safeKeyword}%' OR [Stambuk] LIKE '%${safeKeyword}%') ORDER BY [Nama Lengkap] ASC`;
    try {
      const results = await dbSantri.query(sql);
      console.log(`[CARI-SANTRI] ✅ Ditemukan ${results ? results.length : 0} santri.`);
      return results || [];
    } catch (err) {
      console.error(`[CARI-SANTRI] ❌ Error SQL:`, err.message);
      throw new Error(`Gagal mencari santri: ${err.message}`);
    }
  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const lowerKeyword = cleanKeyword.toLowerCase();
      const filtered = rows
        .filter((r) => {
          if (r.Status !== 'Aktif') return false;
          const nama = String(r['Nama Lengkap'] || '').toLowerCase();
          const stambuk = String(r.Stambuk || '').toLowerCase();
          return nama.includes(lowerKeyword) || stambuk.includes(lowerKeyword);
        })
        .map((r) => ({
          Stambuk: r.Stambuk,
          'Nama Lengkap': r['Nama Lengkap'],
          Kelas: r.Kelas,
        }))
        .sort((a, b) => String(a['Nama Lengkap'] || '').localeCompare(String(b['Nama Lengkap'] || '')));

      console.log(`[CARI-SANTRI] ✅ Ditemukan ${filtered.length} santri (mdb-reader).`);
      return filtered;
    } catch (err) {
      console.error(`[CARI-SANTRI] ❌ Error mdb-reader:`, err.message);
      throw new Error(`Gagal mencari santri: ${err.message}`);
    }
  }

  throw new Error('Database belum diinisialisasi.');
}

// ══════════════════════════════════════════════════════════════════
//  🆕 v6: GET SANTRI BY KELAS (untuk .auditberkas)
// ══════════════════════════════════════════════════════════════════

async function getSantriByKelas(kelas) {
  const cleanKelas = deepSanitize(kelas).trim();
  if (!cleanKelas) {
    console.log(`[SANTRI-KELAS] ⚠️ Kelas kosong setelah sanitasi.`);
    return [];
  }

  console.log(`[SANTRI-KELAS] Mengambil santri di kelas: "${cleanKelas}"`);

  const safeKelas = cleanKelas.replace(/'/g, "''");

  if (IS_WINDOWS && dbSantri) {
    const sql = `SELECT [Stambuk], [Nama Lengkap] FROM [${TABEL_MASTER_SANTRI}] WHERE [Status] = 'Aktif' AND [Kelas] = '${safeKelas}' ORDER BY [Nama Lengkap] ASC`;
    try {
      const results = await dbSantri.query(sql);
      console.log(`[SANTRI-KELAS] ✅ Ditemukan ${results ? results.length : 0} santri di kelas "${cleanKelas}".`);
      return results || [];
    } catch (err) {
      console.error(`[SANTRI-KELAS] ❌ Error SQL:`, err.message);
      throw new Error(`Gagal mengambil santri per kelas: ${err.message}`);
    }
  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const filtered = rows
        .filter((r) => {
          if (r.Status !== 'Aktif') return false;
          return String(r.Kelas || '').trim().toLowerCase() === cleanKelas.toLowerCase();
        })
        .map((r) => ({
          Stambuk: r.Stambuk,
          'Nama Lengkap': r['Nama Lengkap'],
        }))
        .sort((a, b) => String(a['Nama Lengkap'] || '').localeCompare(String(b['Nama Lengkap'] || '')));

      console.log(`[SANTRI-KELAS] ✅ Ditemukan ${filtered.length} santri di kelas "${cleanKelas}" (mdb-reader).`);
      return filtered;
    } catch (err) {
      console.error(`[SANTRI-KELAS] ❌ Error mdb-reader:`, err.message);
      throw new Error(`Gagal mengambil santri per kelas: ${err.message}`);
    }
  }

  throw new Error('Database belum diinisialisasi.');
}

// ══════════════════════════════════════════════════════════════════
//  🆕 v10: GET ALL SANTRI AKTIF (untuk .rekapberkas Semua)
// ══════════════════════════════════════════════════════════════════

/**
 * ★ FUNGSI BARU v10: Mengambil SEMUA santri aktif (Stambuk + Nama + Kelas).
 * Digunakan oleh .rekapberkas Semua.
 *
 * @returns {Array<{Stambuk: string|number, 'Nama Lengkap': string, Kelas: string}>}
 */
async function getAllSantriAktif() {
  console.log(`[ALL-SANTRI] Mengambil semua santri aktif...`);

  if (IS_WINDOWS && dbSantri) {
    const sql = `SELECT [Stambuk], [Nama Lengkap], [Kelas] FROM [${TABEL_MASTER_SANTRI}] WHERE [Status] = 'Aktif' ORDER BY [Kelas] ASC, [Nama Lengkap] ASC`;
    try {
      const results = await dbSantri.query(sql);
      console.log(`[ALL-SANTRI] ✅ Ditemukan ${results ? results.length : 0} santri aktif.`);
      return results || [];
    } catch (err) {
      console.error(`[ALL-SANTRI] ❌ Error SQL:`, err.message);
      throw new Error(`Gagal mengambil semua santri aktif: ${err.message}`);
    }
  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const filtered = rows
        .filter((r) => r.Status === 'Aktif')
        .map((r) => ({
          Stambuk: r.Stambuk,
          'Nama Lengkap': r['Nama Lengkap'],
          Kelas: r.Kelas,
        }))
        .sort((a, b) => {
          const kelasCompare = String(a.Kelas || '').localeCompare(String(b.Kelas || ''));
          if (kelasCompare !== 0) return kelasCompare;
          return String(a['Nama Lengkap'] || '').localeCompare(String(b['Nama Lengkap'] || ''));
        });

      console.log(`[ALL-SANTRI] ✅ Ditemukan ${filtered.length} santri aktif (mdb-reader).`);
      return filtered;
    } catch (err) {
      console.error(`[ALL-SANTRI] ❌ Error mdb-reader:`, err.message);
      throw new Error(`Gagal mengambil semua santri aktif: ${err.message}`);
    }
  }

  throw new Error('Database belum diinisialisasi.');
}

// ══════════════════════════════════════════════════════════════════
//  🆕 v6: STATISTIK SANTRI (untuk .statsantri)
// ══════════════════════════════════════════════════════════════════

const ALLOWED_STAT_COLUMNS = [
  'Kelas', 'Konsulat', 'Golongan Darah', 'Suku', 'Daerah',
  'Kewarganegaraan', 'Rayon', 'Kamar Rayon', 'Dapur',
  'Tempat Pidato', 'POT', 'Jabatan', 'Posisi',
  'Th Masuk Gontor', 'Aktif Tahun Ajaran', 'Ditempatkan di Gontor?',
  'Dibesarkan di Kota', 'Lulusan Tingkat', 'Lulusan Tahun',
  'Provinsi', 'Kab/Kota', 'Kecamatan',
  'Ayah_Pekerjaan', 'Ibu_Pekerjaan',
  'Kls Asal', 'Tempat Lahir',
];

async function getStatSantri(kolom, nilai) {
  const cleanKolom = deepSanitize(kolom).trim();
  const cleanNilai = deepSanitize(nilai).trim();

  if (!cleanKolom || !cleanNilai) {
    console.log(`[STAT-SANTRI] ⚠️ Kolom atau nilai kosong setelah sanitasi.`);
    return 0;
  }

  console.log(`[STAT-SANTRI] Menghitung COUNT(*) WHERE [${cleanKolom}] = '${cleanNilai}'`);

  const safeNilai = cleanNilai.replace(/'/g, "''");

  const matchedColumn = ALLOWED_STAT_COLUMNS.find(
    (col) => col.toLowerCase() === cleanKolom.toLowerCase()
  );

  if (!matchedColumn) {
    console.log(`[STAT-SANTRI] ❌ Kolom "${cleanKolom}" TIDAK ada dalam whitelist.`);
    throw new Error(`Kolom "${cleanKolom}" tidak diizinkan untuk statistik.\n\nKolom yang tersedia:\n${ALLOWED_STAT_COLUMNS.join(', ')}`);
  }

  if (IS_WINDOWS && dbSantri) {
    const sql = `SELECT COUNT(*) AS Total FROM [${TABEL_MASTER_SANTRI}] WHERE [Status] = 'Aktif' AND [${matchedColumn}] = '${safeNilai}'`;
    try {
      const results = await dbSantri.query(sql);
      const total = results && results.length > 0 ? parseInt(results[0].Total, 10) : 0;
      console.log(`[STAT-SANTRI] ✅ COUNT = ${total} untuk [${matchedColumn}] = '${cleanNilai}'`);
      return total;
    } catch (err) {
      console.error(`[STAT-SANTRI] ❌ Error SQL:`, err.message);
      throw new Error(`Gagal menghitung statistik: ${err.message}`);
    }
  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const total = rows.filter((r) => {
        if (r.Status !== 'Aktif') return false;
        return String(r[matchedColumn] || '').trim().toLowerCase() === cleanNilai.toLowerCase();
      }).length;

      console.log(`[STAT-SANTRI] ✅ COUNT = ${total} untuk [${matchedColumn}] = '${cleanNilai}' (mdb-reader)`);
      return total;
    } catch (err) {
      console.error(`[STAT-SANTRI] ❌ Error mdb-reader:`, err.message);
      throw new Error(`Gagal menghitung statistik: ${err.message}`);
    }
  }

  throw new Error('Database belum diinisialisasi.');
}

// ══════════════════════════════════════════════════════════════════
//  🆕 v7: STATISTIK SANTRI — MODE A: GROUP BY
// ══════════════════════════════════════════════════════════════════

async function getStatSantriGroupBy(kolom) {
  const cleanKolom = deepSanitize(kolom).trim();

  if (!cleanKolom) {
    console.log(`[STAT-SANTRI-GROUPBY] ⚠️ Kolom kosong setelah sanitasi.`);
    return [];
  }

  console.log(`[STAT-SANTRI-GROUPBY] Menjalankan GROUP BY pada [${cleanKolom}]`);

  const matchedColumn = ALLOWED_STAT_COLUMNS.find(
    (col) => col.toLowerCase() === cleanKolom.toLowerCase()
  );

  if (!matchedColumn) {
    console.log(`[STAT-SANTRI-GROUPBY] ❌ Kolom "${cleanKolom}" TIDAK ada dalam whitelist.`);
    throw new Error(
      `Kolom "${cleanKolom}" tidak diizinkan untuk statistik.\n\n` +
      `📋 *Kolom yang tersedia:*\n${ALLOWED_STAT_COLUMNS.join(', ')}`
    );
  }

  if (IS_WINDOWS && dbSantri) {
    const sql =
      `SELECT [${matchedColumn}], COUNT(*) AS Total ` +
      `FROM [${TABEL_MASTER_SANTRI}] ` +
      `WHERE [Status] = 'Aktif' ` +
      `GROUP BY [${matchedColumn}] ` +
      `ORDER BY COUNT(*) DESC`;

    try {
      const results = await dbSantri.query(sql);

      if (!results || results.length === 0) {
        console.log(`[STAT-SANTRI-GROUPBY] ⚠️ Tidak ada data untuk GROUP BY [${matchedColumn}].`);
        return [];
      }

      const mapped = results.map((r) => ({
        Nilai: r[matchedColumn] || '(Kosong)',
        Total: parseInt(r.Total, 10) || 0,
      }));

      console.log(`[STAT-SANTRI-GROUPBY] ✅ ${mapped.length} kategori ditemukan untuk [${matchedColumn}].`);
      return mapped;

    } catch (err) {
      console.error(`[STAT-SANTRI-GROUPBY] ❌ Error SQL:`, err.message);
      throw new Error(`Gagal menghitung statistik GROUP BY: ${err.message}`);
    }

  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const activeRows = rows.filter((r) => r.Status === 'Aktif');

      const countMap = new Map();
      for (const r of activeRows) {
        const val = String(r[matchedColumn] || '').trim() || '(Kosong)';
        countMap.set(val, (countMap.get(val) || 0) + 1);
      }

      const mapped = Array.from(countMap.entries())
        .map(([nilai, total]) => ({ Nilai: nilai, Total: total }))
        .sort((a, b) => b.Total - a.Total);

      console.log(`[STAT-SANTRI-GROUPBY] ✅ ${mapped.length} kategori (mdb-reader) untuk [${matchedColumn}].`);
      return mapped;

    } catch (err) {
      console.error(`[STAT-SANTRI-GROUPBY] ❌ Error mdb-reader:`, err.message);
      throw new Error(`Gagal menghitung statistik GROUP BY: ${err.message}`);
    }
  }

  throw new Error('Database belum diinisialisasi.');
}


// ══════════════════════════════════════════════════════════════════
//  🆕 v7: STATISTIK SANTRI — MODE B: LIKE SEARCH
// ══════════════════════════════════════════════════════════════════

async function getStatSantriLike(kolom, nilai) {
  const cleanKolom = deepSanitize(kolom).trim();
  const cleanNilai = deepSanitize(nilai).trim();

  if (!cleanKolom || !cleanNilai) {
    console.log(`[STAT-SANTRI-LIKE] ⚠️ Kolom atau nilai kosong setelah sanitasi.`);
    return 0;
  }

  console.log(`[STAT-SANTRI-LIKE] Menghitung COUNT(*) WHERE [${cleanKolom}] LIKE '%${cleanNilai}%'`);

  const safeNilai = cleanNilai.replace(/'/g, "''");

  const matchedColumn = ALLOWED_STAT_COLUMNS.find(
    (col) => col.toLowerCase() === cleanKolom.toLowerCase()
  );

  if (!matchedColumn) {
    console.log(`[STAT-SANTRI-LIKE] ❌ Kolom "${cleanKolom}" TIDAK ada dalam whitelist.`);
    throw new Error(
      `Kolom "${cleanKolom}" tidak diizinkan untuk statistik.\n\n` +
      `📋 *Kolom yang tersedia:*\n${ALLOWED_STAT_COLUMNS.join(', ')}`
    );
  }

  if (IS_WINDOWS && dbSantri) {
    const sql =
      `SELECT COUNT(*) AS Total ` +
      `FROM [${TABEL_MASTER_SANTRI}] ` +
      `WHERE [Status] = 'Aktif' ` +
      `AND [${matchedColumn}] LIKE '%${safeNilai}%'`;

    try {
      const results = await dbSantri.query(sql);
      const total = results && results.length > 0 ? parseInt(results[0].Total, 10) : 0;
      console.log(`[STAT-SANTRI-LIKE] ✅ COUNT = ${total} untuk [${matchedColumn}] LIKE '%${cleanNilai}%'`);
      return total;
    } catch (err) {
      console.error(`[STAT-SANTRI-LIKE] ❌ Error SQL:`, err.message);
      throw new Error(`Gagal menghitung statistik LIKE: ${err.message}`);
    }

  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const lowerNilai = cleanNilai.toLowerCase();

      const total = rows.filter((r) => {
        if (r.Status !== 'Aktif') return false;
        const colVal = String(r[matchedColumn] || '').toLowerCase();
        return colVal.includes(lowerNilai);
      }).length;

      console.log(`[STAT-SANTRI-LIKE] ✅ COUNT = ${total} untuk [${matchedColumn}] LIKE '%${cleanNilai}%' (mdb-reader)`);
      return total;
    } catch (err) {
      console.error(`[STAT-SANTRI-LIKE] ❌ Error mdb-reader:`, err.message);
      throw new Error(`Gagal menghitung statistik LIKE: ${err.message}`);
    }
  }

  throw new Error('Database belum diinisialisasi.');
}


// ══════════════════════════════════════════════════════════════════
//  🆕 v4: DAILY PUSAT DATA STATS
// ══════════════════════════════════════════════════════════════════

async function getDailyPusdatStats() {
  console.log(`\n[📊 DAILY STATS] ═══════════════════════════════════`);
  console.log(`[📊 DAILY STATS] Memulai query statistik harian...`);

  const now = new Date();
  const wibOffset = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(now.getTime() + wibOffset);

  const hariIni0700 = new Date(nowWIB);
  hariIni0700.setUTCHours(0, 0, 0, 0);
  const todayWIBDate = new Date(nowWIB.toISOString().split('T')[0] + 'T00:00:00.000Z');

  const kemarin0700 = new Date(todayWIBDate.getTime() - 24 * 60 * 60 * 1000 + 1000);

  function toAccessDateTime(d) {
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${mm}/${dd}/${yyyy} ${hh}:${mi}:${ss}`;
  }

  const batasAwal = toAccessDateTime(kemarin0700);
  const batasAkhir = toAccessDateTime(todayWIBDate);

  console.log(`[📊 DAILY STATS] Rentang waktu pengurangan:`);
  console.log(`    ├─ Awal  : ${batasAwal} (Kemarin 07:00:01 WIB)`);
  console.log(`    └─ Akhir : ${batasAkhir} (Hari Ini 07:00:00 WIB)`);

  let totalGuruAktif = 0;
  let totalSantriAktif = 0;
  let penguranganSantri = [];

  if (IS_WINDOWS && dbGuru && dbSantri) {
    try {
      const sqlGuru = `SELECT COUNT(*) AS Total FROM [T Master Guru] WHERE [Status] = 'Aktif'`;
      const resGuru = await dbGuru.query(sqlGuru);
      totalGuruAktif = resGuru && resGuru.length > 0 ? parseInt(resGuru[0].Total, 10) : 0;
      console.log(`[📊 DAILY STATS] ✅ Total Guru Aktif: ${totalGuruAktif}`);

      const sqlSantri = `SELECT COUNT(*) AS Total FROM [${TABEL_MASTER_SANTRI}] WHERE [Status] = 'Aktif'`;
      const resSantri = await dbSantri.query(sqlSantri);
      totalSantriAktif = resSantri && resSantri.length > 0 ? parseInt(resSantri[0].Total, 10) : 0;
      console.log(`[📊 DAILY STATS] ✅ Total Santri Aktif: ${totalSantriAktif}`);

      const sqlPengurangan = `
        SELECT [Nama Lengkap], [Stambuk], [Kelas], [Keputusan], [Pelanggaran/Alasan]
        FROM [${TABEL_SANTRI_NON_AKTIF}]
        WHERE [Tanggal] BETWEEN #${batasAwal}# AND #${batasAkhir}#
        ORDER BY [Nama Lengkap] ASC
      `;
      const resPengurangan = await dbSantri.query(sqlPengurangan);

      if (resPengurangan && resPengurangan.length > 0) {
        penguranganSantri = resPengurangan.map((r) => ({
          nama: r['Nama Lengkap'] || '-',
          stambuk: r['Stambuk'] || '-',
          kelas: r['Kelas'] || '-',
          keputusan: r['Keputusan'] || '-',
          alasan: r['Pelanggaran/Alasan'] || '-',
        }));
      }
      console.log(`[📊 DAILY STATS] ✅ Pengurangan Santri: ${penguranganSantri.length} orang`);

    } catch (err) {
      console.error(`[📊 DAILY STATS] ❌ Error query node-adodb:`, err.message);
    }

  } else if (MDBReader) {
    try {
      const rowsGuru = readTableMDB('T Master Guru', DB_GURU_PATH);
      totalGuruAktif = rowsGuru.filter((r) => r.Status === 'Aktif').length;
      console.log(`[📊 DAILY STATS] ✅ Total Guru Aktif (mdb-reader): ${totalGuruAktif}`);

      const rowsSantri = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      totalSantriAktif = rowsSantri.filter((r) => r.Status === 'Aktif').length;
      console.log(`[📊 DAILY STATS] ✅ Total Santri Aktif (mdb-reader): ${totalSantriAktif}`);

      const rowsNonAktif = readTableMDB(TABEL_SANTRI_NON_AKTIF, DB_SANTRI_PATH);
      const tsAwal = kemarin0700.getTime();
      const tsAkhir = todayWIBDate.getTime();

      penguranganSantri = rowsNonAktif
        .filter((r) => {
          if (!r.Tanggal) return false;
          const tgl = new Date(r.Tanggal);
          if (isNaN(tgl.getTime())) return false;
          tgl.setHours(tgl.getHours() + 7);
          const ts = tgl.getTime();
          return ts >= tsAwal && ts <= tsAkhir;
        })
        .map((r) => ({
          nama: r['Nama Lengkap'] || '-',
          stambuk: r['Stambuk'] || '-',
          kelas: r['Kelas'] || '-',
          keputusan: r['Keputusan'] || '-',
          alasan: r['Pelanggaran/Alasan'] || '-',
        }));

      console.log(`[📊 DAILY STATS] ✅ Pengurangan Santri (mdb-reader): ${penguranganSantri.length} orang`);

    } catch (err) {
      console.error(`[📊 DAILY STATS] ❌ Error query mdb-reader:`, err.message);
    }

  } else {
    console.error(`[📊 DAILY STATS] ❌ Database belum diinisialisasi!`);
  }

  console.log(`[📊 DAILY STATS] ═══════════════════════════════════\n`);

  return {
    totalGuruAktif,
    totalSantriAktif,
    penguranganSantri,
  };
}

// ══════════════════════════════════════════════════════════════════
//  🆕 v8: KELAS GROUP COUNT (untuk .listsantri TIER-1)
// ══════════════════════════════════════════════════════════════════

async function getKelasGroupCount() {
  console.log(`[KELAS-GROUP] Menjalankan GROUP BY [Kelas]...`);

  if (IS_WINDOWS && dbSantri) {
    const sql =
      `SELECT [Kelas], COUNT(*) AS Total ` +
      `FROM [${TABEL_MASTER_SANTRI}] ` +
      `WHERE [Status] = 'Aktif' ` +
      `GROUP BY [Kelas] ` +
      `ORDER BY [Kelas] ASC`;

    try {
      const results = await dbSantri.query(sql);
      if (!results || results.length === 0) {
        console.log(`[KELAS-GROUP] ⚠️ Tidak ada data.`);
        return [];
      }

      const mapped = results.map((r) => ({
        Kelas: r.Kelas || '(Kosong)',
        Total: parseInt(r.Total, 10) || 0,
      }));

      console.log(`[KELAS-GROUP] ✅ ${mapped.length} kelas ditemukan.`);
      return mapped;
    } catch (err) {
      console.error(`[KELAS-GROUP] ❌ Error SQL:`, err.message);
      throw new Error(`Gagal mengambil daftar kelas: ${err.message}`);
    }
  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const activeRows = rows.filter((r) => r.Status === 'Aktif');

      const countMap = new Map();
      for (const r of activeRows) {
        const kelas = String(r.Kelas || '').trim() || '(Kosong)';
        countMap.set(kelas, (countMap.get(kelas) || 0) + 1);
      }

      const mapped = Array.from(countMap.entries())
        .map(([kelas, total]) => ({ Kelas: kelas, Total: total }))
        .sort((a, b) => a.Kelas.localeCompare(b.Kelas));

      console.log(`[KELAS-GROUP] ✅ ${mapped.length} kelas ditemukan (mdb-reader).`);
      return mapped;
    } catch (err) {
      console.error(`[KELAS-GROUP] ❌ Error mdb-reader:`, err.message);
      throw new Error(`Gagal mengambil daftar kelas: ${err.message}`);
    }
  }

  throw new Error('Database belum diinisialisasi.');
}


// ══════════════════════════════════════════════════════════════════
//  🆕 v8: SANTRI BY KELAS LIKE (untuk .listsantri TIER-2)
// ══════════════════════════════════════════════════════════════════

async function getSantriByKelasLike(kelas) {
  const cleanKelas = deepSanitize(kelas).trim();
  if (!cleanKelas) {
    console.log(`[SANTRI-KELAS-LIKE] ⚠️ Kelas kosong setelah sanitasi.`);
    return [];
  }

  console.log(`[SANTRI-KELAS-LIKE] Mencari santri di kelas LIKE '%${cleanKelas}%'`);

  const safeKelas = cleanKelas.replace(/'/g, "''");

  if (IS_WINDOWS && dbSantri) {
    const sql =
      `SELECT [Stambuk], [Nama Lengkap], [Kelas] ` +
      `FROM [${TABEL_MASTER_SANTRI}] ` +
      `WHERE [Status] = 'Aktif' ` +
      `AND [Kelas] LIKE '%${safeKelas}%' ` +
      `ORDER BY [Nama Lengkap] ASC`;

    try {
      const results = await dbSantri.query(sql);
      console.log(`[SANTRI-KELAS-LIKE] ✅ Ditemukan ${results ? results.length : 0} santri.`);
      return results || [];
    } catch (err) {
      console.error(`[SANTRI-KELAS-LIKE] ❌ Error SQL:`, err.message);
      throw new Error(`Gagal mencari santri per kelas: ${err.message}`);
    }
  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const lowerKelas = cleanKelas.toLowerCase();
      const filtered = rows
        .filter((r) => {
          if (r.Status !== 'Aktif') return false;
          return String(r.Kelas || '').toLowerCase().includes(lowerKelas);
        })
        .map((r) => ({
          Stambuk: r.Stambuk,
          'Nama Lengkap': r['Nama Lengkap'],
          Kelas: r.Kelas,
        }))
        .sort((a, b) => String(a['Nama Lengkap'] || '').localeCompare(String(b['Nama Lengkap'] || '')));

      console.log(`[SANTRI-KELAS-LIKE] ✅ Ditemukan ${filtered.length} santri (mdb-reader).`);
      return filtered;
    } catch (err) {
      console.error(`[SANTRI-KELAS-LIKE] ❌ Error mdb-reader:`, err.message);
      throw new Error(`Gagal mencari santri per kelas: ${err.message}`);
    }
  }

  throw new Error('Database belum diinisialisasi.');
}


// ══════════════════════════════════════════════════════════════════
//  🆕 v8/v9: FILTERED SANTRI ALL COLUMNS (untuk .ekspor / .eksporfull)
// ══════════════════════════════════════════════════════════════════

async function getFilteredSantriAll(kolom, nilai) {
  const cleanKolom = deepSanitize(kolom).trim();
  const cleanNilai = deepSanitize(nilai).trim();
  const isSemua = cleanKolom.toLowerCase() === 'semua';

  if (!cleanKolom) {
    console.log(`[FILTER-SANTRI] ⚠️ Kolom kosong setelah sanitasi.`);
    return [];
  }

  if (isSemua) {
    console.log(`[FILTER-SANTRI] 📦 MODE SEMUA aktif.`);

    if (IS_WINDOWS && dbSantri) {
      const sql =
        `SELECT * FROM [${TABEL_MASTER_SANTRI}] ` +
        `WHERE [Status] = 'Aktif' ` +
        `ORDER BY [Nama Lengkap] ASC`;

      try {
        const results = await dbSantri.query(sql);
        console.log(`[FILTER-SANTRI] ✅ MODE SEMUA: ditemukan ${results ? results.length : 0} santri.`);
        return results || [];
      } catch (err) {
        console.error(`[FILTER-SANTRI] ❌ Error SQL MODE SEMUA:`, err.message);
        throw new Error(`Gagal mengambil semua data santri aktif: ${err.message}`);
      }
    } else if (MDBReader) {
      try {
        const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);

        const filtered = rows
          .filter((r) => r.Status === 'Aktif')
          .sort((a, b) =>
            String(a['Nama Lengkap'] || '').localeCompare(String(b['Nama Lengkap'] || ''))
          );

        console.log(`[FILTER-SANTRI] ✅ MODE SEMUA (mdb-reader): ditemukan ${filtered.length} santri.`);
        return filtered;
      } catch (err) {
        console.error(`[FILTER-SANTRI] ❌ Error mdb-reader MODE SEMUA:`, err.message);
        throw new Error(`Gagal mengambil semua data santri aktif: ${err.message}`);
      }
    }

    throw new Error('Database belum diinisialisasi.');
  }

  if (!cleanNilai) {
    console.log(`[FILTER-SANTRI] ⚠️ Nilai kosong setelah sanitasi.`);
    return [];
  }

  console.log(`[FILTER-SANTRI] SELECT * WHERE [${cleanKolom}] LIKE '%${cleanNilai}%'`);

  const safeNilai = cleanNilai.replace(/'/g, "''");

  const allowedExportColumns = [
    ...ALLOWED_STAT_COLUMNS,
    'Nama Lengkap',
    'Stambuk',
    'Status',
    'Nama Panggilan',
  ];

  const matchedColumn = allowedExportColumns.find(
    (col) => col.toLowerCase() === cleanKolom.toLowerCase()
  );

  if (!matchedColumn) {
    console.log(`[FILTER-SANTRI] ❌ Kolom "${cleanKolom}" TIDAK ada dalam whitelist.`);
    throw new Error(
      `Kolom "${cleanKolom}" tidak diizinkan untuk ekspor.\n\n` +
      `📋 *Kolom yang tersedia:*\n${allowedExportColumns.join(', ')}`
    );
  }

  if (IS_WINDOWS && dbSantri) {
    const sql =
      `SELECT * FROM [${TABEL_MASTER_SANTRI}] ` +
      `WHERE [Status] = 'Aktif' ` +
      `AND [${matchedColumn}] LIKE '%${safeNilai}%' ` +
      `ORDER BY [Nama Lengkap] ASC`;

    try {
      const results = await dbSantri.query(sql);
      console.log(`[FILTER-SANTRI] ✅ Ditemukan ${results ? results.length : 0} santri.`);
      return results || [];
    } catch (err) {
      console.error(`[FILTER-SANTRI] ❌ Error SQL:`, err.message);
      throw new Error(`Gagal mengambil data santri untuk ekspor: ${err.message}`);
    }
  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const lowerNilai = cleanNilai.toLowerCase();

      const filtered = rows
        .filter((r) => {
          if (r.Status !== 'Aktif') return false;
          const colVal = String(r[matchedColumn] || '').toLowerCase();
          return colVal.includes(lowerNilai);
        })
        .sort((a, b) =>
          String(a['Nama Lengkap'] || '').localeCompare(String(b['Nama Lengkap'] || ''))
        );

      console.log(`[FILTER-SANTRI] ✅ Ditemukan ${filtered.length} santri (mdb-reader).`);
      return filtered;
    } catch (err) {
      console.error(`[FILTER-SANTRI] ❌ Error mdb-reader:`, err.message);
      throw new Error(`Gagal mengambil data santri untuk ekspor: ${err.message}`);
    }
  }

  throw new Error('Database belum diinisialisasi.');
}

// ══════════════════════════════════════════════════════════════════
//  🆕 v8: LACAK SANTRI (untuk .lacak — Radar Lokasi Ringan)
// ══════════════════════════════════════════════════════════════════

async function lacakSantri(keyword) {
  const cleanKeyword = deepSanitize(keyword).trim();

  if (!cleanKeyword) {
    console.log(`[LACAK-SANTRI] ⚠️ Keyword kosong setelah sanitasi.`);
    return [];
  }

  console.log(`[LACAK-SANTRI] Melacak santri dengan keyword: "${cleanKeyword}"`);

  const safeKeyword = cleanKeyword.replace(/'/g, "''");

  if (IS_WINDOWS && dbSantri) {
    const sql =
      `SELECT [Nama Lengkap], [Stambuk], [Kelas], [Rayon], [Kamar Rayon] ` +
      `FROM [${TABEL_MASTER_SANTRI}] ` +
      `WHERE [Status] = 'Aktif' ` +
      `AND ([Nama Lengkap] LIKE '%${safeKeyword}%' OR [Stambuk] LIKE '%${safeKeyword}%') ` +
      `ORDER BY [Nama Lengkap] ASC`;

    try {
      const results = await dbSantri.query(sql);
      console.log(`[LACAK-SANTRI] ✅ Ditemukan ${results ? results.length : 0} santri.`);
      return results || [];
    } catch (err) {
      console.error(`[LACAK-SANTRI] ❌ Error SQL:`, err.message);
      throw new Error(`Gagal melacak santri: ${err.message}`);
    }
  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const lowerKeyword = cleanKeyword.toLowerCase();

      const filtered = rows
        .filter((r) => {
          if (r.Status !== 'Aktif') return false;
          const nama = String(r['Nama Lengkap'] || '').toLowerCase();
          const stambuk = String(r.Stambuk || '').toLowerCase();
          return nama.includes(lowerKeyword) || stambuk.includes(lowerKeyword);
        })
        .map((r) => ({
          'Nama Lengkap': r['Nama Lengkap'],
          Stambuk: r.Stambuk,
          Kelas: r.Kelas,
          Rayon: r.Rayon,
          'Kamar Rayon': r['Kamar Rayon'],
        }))
        .sort((a, b) => String(a['Nama Lengkap'] || '').localeCompare(String(b['Nama Lengkap'] || '')));

      console.log(`[LACAK-SANTRI] ✅ Ditemukan ${filtered.length} santri (mdb-reader).`);
      return filtered;
    } catch (err) {
      console.error(`[LACAK-SANTRI] ❌ Error mdb-reader:`, err.message);
      throw new Error(`Gagal melacak santri: ${err.message}`);
    }
  }

  throw new Error('Database belum diinisialisasi.');
}


// ══════════════════════════════════════════════════════════════════
//  🆕 v8: MILAD RADAR — Ambil Tanggal Lahir Guru & Santri
// ══════════════════════════════════════════════════════════════════

async function getAllTanggalLahirGuru() {
  console.log(`[MILAD-GURU] Mengambil semua Tanggal Lahir guru aktif...`);

  if (IS_WINDOWS && dbGuru) {
    const sql = `SELECT [Nama Lengkap], [Tanggal Lahir] FROM [T Master Guru] WHERE [Status] = 'Aktif'`;
    try {
      const results = await dbGuru.query(sql);
      console.log(`[MILAD-GURU] ✅ ${results ? results.length : 0} guru diambil.`);
      return (results || []).map((r) => ({
        nama: r['Nama Lengkap'] || '-',
        tanggalLahir: r['Tanggal Lahir'],
        tipe: 'Ustadz',
      }));
    } catch (err) {
      console.error(`[MILAD-GURU] ❌ Error SQL:`, err.message);
      return [];
    }
  } else if (MDBReader) {
    try {
      const rows = readTableMDB('T Master Guru', DB_GURU_PATH);
      const filtered = rows
        .filter((r) => r.Status === 'Aktif')
        .map((r) => ({
          nama: r['Nama Lengkap'] || '-',
          tanggalLahir: r['Tanggal Lahir'],
          tipe: 'Ustadz',
        }));
      console.log(`[MILAD-GURU] ✅ ${filtered.length} guru diambil (mdb-reader).`);
      return filtered;
    } catch (err) {
      console.error(`[MILAD-GURU] ❌ Error mdb-reader:`, err.message);
      return [];
    }
  }

  console.error(`[MILAD-GURU] ❌ Database belum diinisialisasi.`);
  return [];
}

async function getAllTanggalLahirSantri() {
  console.log(`[MILAD-SANTRI] Mengambil semua Tanggal Lahir santri aktif...`);

  if (IS_WINDOWS && dbSantri) {
    const sql = `SELECT [Nama Lengkap], [Tanggal Lahir], [Kelas] FROM [${TABEL_MASTER_SANTRI}] WHERE [Status] = 'Aktif'`;
    try {
      const results = await dbSantri.query(sql);
      console.log(`[MILAD-SANTRI] ✅ ${results ? results.length : 0} santri diambil.`);
      return (results || []).map((r) => ({
        nama: r['Nama Lengkap'] || '-',
        tanggalLahir: r['Tanggal Lahir'],
        kelas: r.Kelas || '-',
        tipe: 'Santri',
      }));
    } catch (err) {
      console.error(`[MILAD-SANTRI] ❌ Error SQL:`, err.message);
      return [];
    }
  } else if (MDBReader) {
    try {
      const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
      const filtered = rows
        .filter((r) => r.Status === 'Aktif')
        .map((r) => ({
          nama: r['Nama Lengkap'] || '-',
          tanggalLahir: r['Tanggal Lahir'],
          kelas: r.Kelas || '-',
          tipe: 'Santri',
        }));
      console.log(`[MILAD-SANTRI] ✅ ${filtered.length} santri diambil (mdb-reader).`);
      return filtered;
    } catch (err) {
      console.error(`[MILAD-SANTRI] ❌ Error mdb-reader:`, err.message);
      return [];
    }
  }

  console.error(`[MILAD-SANTRI] ❌ Database belum diinisialisasi.`);
  return [];
}


// ══════════════════════════════════════════════════════════════════
//  🆕 v13.3 HOTFIX: CARI GURU & CARI SANTRI BY KOLOM (LIKE)
//  Menggunakan koneksi ADODB GLOBAL yang sudah ada (dbGuru/dbSantri)
//  agar TIDAK ada spawn cscript.exe baru → konflik concurrency hilang.
//  Pola SAMA dengan cariSantri() di atas (yang sudah terbukti stabil).
// ══════════════════════════════════════════════════════════════════

/**
 *  Cari Guru/Staf di tabel [T Master Guru] berdasarkan keyword pada
 *  kolom [Nama Lengkap] atau [Stambuk] (LIKE '%keyword%').
 *
 *  GARANSI: SELALU return Array — tidak pernah throw.
 *  Aman langsung di-.filter() / .map() oleh caller.
 *
 *  Catatan kolom: Tabel [T Master Guru] tidak punya kolom [Jabatan];
 *  yang relevan adalah [Guru Tahun ke]. Field tsb di-map jadi
 *  property `Jabatan` pada hasil agar konsisten dengan plugin .cari.
 *
 *  @param {string} keyword
 *  @returns {Promise<Array<{Stambuk, 'Nama Lengkap', Jabatan, Status}>>}
 */
async function cariGuru(keyword) {
  try {
    const cleanKeyword = deepSanitize(keyword).trim();
    if (!cleanKeyword || cleanKeyword.length < 2) {
      console.log(`[CARI-GURU] ⚠️ Keyword kosong/terlalu pendek setelah sanitasi.`);
      return [];
    }

    const safeKeyword = cleanKeyword.replace(/'/g, "''");
    console.log(`[CARI-GURU] Mencari guru dengan keyword: "${cleanKeyword}"`);

    // ── Mode Windows: pakai koneksi GLOBAL dbGuru (sudah dibuka di initDB) ──
    if (IS_WINDOWS && dbGuru) {
      const sql =
        `SELECT [Stambuk], [Nama Lengkap], [Guru Tahun ke], [Status] ` +
        `FROM [T Master Guru] ` +
        `WHERE ([Nama Lengkap] LIKE '%${safeKeyword}%' OR [Stambuk] LIKE '%${safeKeyword}%') ` +
        `ORDER BY [Nama Lengkap] ASC`;
      try {
        const results = await dbGuru.query(sql);
        const rows = Array.isArray(results) ? results : [];
        const mapped = rows.map((r) => ({
          Stambuk: r.Stambuk,
          'Nama Lengkap': r['Nama Lengkap'],
          Jabatan: r['Guru Tahun ke'] || '',
          Status: r.Status || '',
        }));
        console.log(`[CARI-GURU] ✅ Ditemukan ${mapped.length} guru.`);
        return mapped;
      } catch (err) {
        console.error(`[CARI-GURU] ❌ Error SQL:`, err.message);
        return [];
      }
    }

    // ── Mode Linux/Mac: mdb-reader (read-only) ──
    if (MDBReader) {
      try {
        const rows = readTableMDB('T Master Guru', DB_GURU_PATH);
        const lowerKeyword = cleanKeyword.toLowerCase();
        const filtered = (Array.isArray(rows) ? rows : [])
          .filter((r) => {
            const nama = String(r['Nama Lengkap'] || '').toLowerCase();
            const stambuk = String(r.Stambuk || '').toLowerCase();
            return nama.includes(lowerKeyword) || stambuk.includes(lowerKeyword);
          })
          .map((r) => ({
            Stambuk: r.Stambuk,
            'Nama Lengkap': r['Nama Lengkap'],
            Jabatan: r['Guru Tahun ke'] || '',
            Status: r.Status || '',
          }))
          .sort((a, b) =>
            String(a['Nama Lengkap'] || '').localeCompare(
              String(b['Nama Lengkap'] || '')
            )
          );
        console.log(`[CARI-GURU] ✅ Ditemukan ${filtered.length} guru (mdb-reader).`);
        return filtered;
      } catch (err) {
        console.error(`[CARI-GURU] ❌ Error mdb-reader:`, err.message);
        return [];
      }
    }

    console.warn('[CARI-GURU] ⚠️ Tidak ada engine DB tersedia (dbGuru null & MDBReader null).');
    return [];
  } catch (outerErr) {
    console.error('[CARI-GURU] ❌ Outer error:', outerErr && outerErr.message ? outerErr.message : outerErr);
    return [];
  }
}

/**
 *  Cari Santri AKTIF berdasarkan keyword pada KOLOM tertentu
 *  (mis. 'Daerah', 'Konsulat', 'Kelas', dll). LIKE '%keyword%'.
 *
 *  GARANSI: SELALU return Array — tidak pernah throw.
 *
 *  @param {string} kolom  - nama kolom (case-sensitive sesuai DB)
 *  @param {string} keyword
 *  @returns {Promise<Array>}
 */
async function cariSantriByKolomLike(kolom, keyword) {
  try {
    const cleanKeyword = deepSanitize(keyword).trim();
    if (!cleanKeyword || cleanKeyword.length < 2 || !kolom) {
      return [];
    }

    const safeKeyword = cleanKeyword.replace(/'/g, "''");
    // Whitelist nama kolom (anti SQL-injection): hanya alfanum + spasi + underscore
    const safeKolom = String(kolom).replace(/[^A-Za-z0-9 _]/g, '');
    if (!safeKolom) return [];

    console.log(`[CARI-${safeKolom}] Mencari santri pada kolom [${safeKolom}] = "%${cleanKeyword}%"`);

    // ── Mode Windows: pakai koneksi GLOBAL dbSantri ──
    if (IS_WINDOWS && dbSantri) {
      const sql =
        `SELECT [Stambuk], [Nama Lengkap], [Kelas], [Daerah], [Konsulat], [${safeKolom}] ` +
        `FROM [${TABEL_MASTER_SANTRI}] ` +
        `WHERE [Status] = 'Aktif' AND [${safeKolom}] LIKE '%${safeKeyword}%' ` +
        `ORDER BY [Nama Lengkap] ASC`;
      try {
        const results = await dbSantri.query(sql);
        const rows = Array.isArray(results) ? results : [];
        console.log(`[CARI-${safeKolom}] ✅ Ditemukan ${rows.length} santri.`);
        return rows;
      } catch (err) {
        console.error(`[CARI-${safeKolom}] ❌ Error SQL:`, err.message);
        return [];
      }
    }

    // ── Mode Linux/Mac: mdb-reader ──
    if (MDBReader) {
      try {
        const rows = readTableMDB(TABEL_MASTER_SANTRI, DB_SANTRI_PATH);
        const lowerKeyword = cleanKeyword.toLowerCase();
        const filtered = (Array.isArray(rows) ? rows : [])
          .filter((r) => {
            if (r.Status !== 'Aktif') return false;
            const value = String(r[safeKolom] || '').toLowerCase();
            return value.includes(lowerKeyword);
          })
          .map((r) => ({
            Stambuk: r.Stambuk,
            'Nama Lengkap': r['Nama Lengkap'],
            Kelas: r.Kelas,
            Daerah: r.Daerah,
            Konsulat: r.Konsulat,
            [safeKolom]: r[safeKolom],
          }))
          .sort((a, b) =>
            String(a['Nama Lengkap'] || '').localeCompare(
              String(b['Nama Lengkap'] || '')
            )
          );
        console.log(`[CARI-${safeKolom}] ✅ Ditemukan ${filtered.length} santri (mdb-reader).`);
        return filtered;
      } catch (err) {
        console.error(`[CARI-${safeKolom}] ❌ Error mdb-reader:`, err.message);
        return [];
      }
    }

    console.warn(`[CARI-${safeKolom}] ⚠️ Tidak ada engine DB tersedia.`);
    return [];
  } catch (outerErr) {
    console.error(`[CARI-KOLOM] ❌ Outer error:`, outerErr && outerErr.message ? outerErr.message : outerErr);
    return [];
  }
}


// ══════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════

export {
  initDB,
  verifyGateway,
  getFullBiodata,
  getPasswordByStambuk,
  getDirektoriGuru,
  isStambukExists,
  insertGuru,
  formatBiodata,
  matchDate,
  normalizeDate,
  // 🆕 v4: Daily Stats
  getDailyPusdatStats,
  // 🆕 v5: Cek Santri Super Lengkap
  getFullBiodataSantri,
  formatBiodataSantri,
  // 🆕 v6: Mega-Update Ekspansi Fitur Santri
  getDaftarSantri,
  cariSantri,
  getSantriByKelas,
  getStatSantri,
  // 🆕 v13.3 HOTFIX: Smart Search lintas DB tanpa spawn cscript baru
  cariGuru,
  cariSantriByKolomLike,
  // 🆕 v7: Dynamic Password
  getStaffPassword,
  setStaffPassword,
  readPusdatSettings,
  writePusdatSettings,
  // 🆕 v7: Statsantri Group By & Like
  getStatSantriGroupBy,
  getStatSantriLike,
  // 🆕 v8: Listsantri Two-Tier
  getKelasGroupCount,
  getSantriByKelasLike,
  // 🆕 v8: Ekspor Excel
  getFilteredSantriAll,
  // 🆕 v8: Lacak Santri
  lacakSantri,
  // 🆕 v8: Milad Radar
  getAllTanggalLahirGuru,
  getAllTanggalLahirSantri,
  // 🆕 v10: Rekap & Lihat Berkas
  getAllSantriAktif,
  // Sanitization helpers
  deepSanitize,
  sanitizeStambuk,
  sanitizeTanggal,
  // Session management (user biasa)
  setSession,
  getSession,
  clearSession,
  gatewaySession,
  // Admin session management (terpisah)
  setAdminSession,
  getAdminSession,
  clearAdminSession,
  adminSession,
  // 🆕 v5: Cek Santri session management (terpisah)
  setCekSantriSession,
  getCekSantriSession,
  clearCekSantriSession,
  cekSantriSession,
  // 🆕 v6: Audit Berkas session management (terpisah)
  setAuditBerkasSession,
  getAuditBerkasSession,
  clearAuditBerkasSession,
  auditBerkasSession,
  // 🆕 v9: Ekspor Full session management
  setEksporSession,
  getEksporSession,
  clearEksporSession,
  eksporSession,
  // 🆕 v10: Lihat Berkas session management (terpisah)
  setLihatBerkasSession,
  getLihatBerkasSession,
  clearLihatBerkasSession,
  lihatBerkasSession,
  // 🆕 v10: Rekap Berkas session management (terpisah)
  setRekapBerkasSession,
  getRekapBerkasSession,
  clearRekapBerkasSession,
  rekapBerkasSession,
  // Pending registration
  addPendingRegistration,
  getPendingRegistration,
  removePendingRegistration,
  pendingRegistrations,
  // Constants
  DB_PATH,
  DB_GURU_PATH,
  DB_SANTRI_PATH,
  CONNECTION_STRING,
  CONN_STR_GURU,
  CONN_STR_SANTRI,
  enrichGuruRecord,
  extractPhoneFromRecord,
  normalizePhoneValue,
  firstFilledValue,
};

export default {
  initDB,
  verifyGateway,
  getFullBiodata,
  getPasswordByStambuk,
  getDirektoriGuru,
  isStambukExists,
  insertGuru,
  formatBiodata,
  normalizeDate,
  getDailyPusdatStats,
  // 🆕 v5
  getFullBiodataSantri,
  formatBiodataSantri,
  // 🆕 v6
  getDaftarSantri,
  cariSantri,
  getSantriByKelas,
  getStatSantri,
  // 🆕 v13.3 HOTFIX
  cariGuru,
  cariSantriByKolomLike,
  // 🆕 v7: Dynamic Password
  getStaffPassword,
  setStaffPassword,
  readPusdatSettings,
  writePusdatSettings,
  // 🆕 v7: Statsantri Group By & Like
  getStatSantriGroupBy,
  getStatSantriLike,
  // 🆕 v8
  getKelasGroupCount,
  getSantriByKelasLike,
  getFilteredSantriAll,
  lacakSantri,
  getAllTanggalLahirGuru,
  getAllTanggalLahirSantri,
  // 🆕 v10
  getAllSantriAktif,
  deepSanitize,
  sanitizeStambuk,
  sanitizeTanggal,
  setSession,
  getSession,
  clearSession,
  setAdminSession,
  getAdminSession,
  clearAdminSession,
  // 🆕 v5
  setCekSantriSession,
  getCekSantriSession,
  clearCekSantriSession,
  // 🆕 v6
  setAuditBerkasSession,
  getAuditBerkasSession,
  clearAuditBerkasSession,
  addPendingRegistration,
  getPendingRegistration,
  removePendingRegistration,
  // 🆕 v9
  setEksporSession,
  getEksporSession,
  clearEksporSession,
  // 🆕 v10
  setLihatBerkasSession,
  getLihatBerkasSession,
  clearLihatBerkasSession,
  setRekapBerkasSession,
  getRekapBerkasSession,
  clearRekapBerkasSession,
};
