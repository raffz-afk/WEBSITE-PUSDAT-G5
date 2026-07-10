/**
 * ============================================================
 *  lib/dashboardExport.js — Helper Ekspor Excel untuk Web Dashboard
 * ============================================================
 *
 *  Modul khusus untuk fitur ekspor di website:
 *  - Ekspor biodata santri/guru detail (semua kolom) dengan filter
 *  - Rekap berkas per jenis (menampilkan siapa saja yang belum ada
 *    file di tiap folder berkas) dalam format Excel multi-sheet
 *
 *  Ekspor di sini bukan menggantikan plugin bot WA `.ekspor` /
 *  `.eksporfull` — ini versi web yang memberi opsi filter lebih
 *  detail dan langsung download .xlsx via browser.
 *
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getFilteredSantriAll,
  getAllSantriAktif,
  getDirektoriGuru,
  cariGuru,
  normalizeDate,
  deepSanitize,
} from './dbAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const BERKAS_INDUK_DIR =
  'D:\\PUSAT DATA 2026\\01. MASTER DATA SANTRI\\01. BERKAS SANTRI';

export const DAFTAR_FOLDER_PRIMER = [
  'A. FOTO AKSES',
  'B. IJAZAH',
  'C. AKTA KELAHIRAN',
  'D. KARTU KELUARGA',
];
export const DAFTAR_FOLDER_SEKUNDER = [
  'E. SURAT PERMOHONAN',
  'F. SURAT PERNYATAAN',
  'G. PAKTA INTEGRITAS',
  'H. BPJS',
  'I. LAIN-LAIN',
];
export const DAFTAR_FOLDER_BERKAS = [
  ...DAFTAR_FOLDER_PRIMER,
  ...DAFTAR_FOLDER_SEKUNDER,
];
const EKSTENSI_BERKAS = ['.jpg', '.jpeg', '.png', '.pdf'];

// ════════════════════════════════════════════════════════
//  XLSX LOADER (lazy)
// ════════════════════════════════════════════════════════
let xlsxModule = null;
export async function loadXLSX() {
  if (xlsxModule) return xlsxModule;
  try {
    xlsxModule = await import('xlsx');
    return xlsxModule;
  } catch (err) {
    throw new Error(
      `Modul "xlsx" belum terpasang. Jalankan: npm install xlsx (detail: ${err.message})`
    );
  }
}

// ════════════════════════════════════════════════════════
//  HELPER: Cek file di folder berkas
// ════════════════════════════════════════════════════════
function cekFileBerkas(folder, stambuk) {
  for (const ext of EKSTENSI_BERKAS) {
    const fp = path.join(BERKAS_INDUK_DIR, folder, `${stambuk}${ext}`);
    try {
      if (fs.existsSync(fp)) {
        const stat = fs.statSync(fp);
        return { found: true, ext, filePath: fp, size: stat.size };
      }
    } catch (_) {}
  }
  return { found: false, ext: '', filePath: '', size: 0 };
}

// ════════════════════════════════════════════════════════
//  HELPER: Normalisasi nilai untuk Excel
// ════════════════════════════════════════════════════════
function normalizeCellValue(key, value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return normalizeDate(value);

  const lowerKey = String(key).toLowerCase();
  const isTanggalColumn = lowerKey.includes('tanggal') || lowerKey.includes('tgl');
  if (isTanggalColumn) return normalizeDate(value);

  return value;
}

function rowToFullObject(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = normalizeCellValue(key, value);
  }
  return out;
}

// ════════════════════════════════════════════════════════
//  EKSPOR BIODATA SANTRI
//  Mendukung berbagai mode filter & berbagai preset kolom
// ════════════════════════════════════════════════════════

export const PRESET_KOLOM_SANTRI = {
  lite: [
    'Stambuk',
    'Nama Lengkap',
    'Kelas',
    'Rayon',
    'Kamar Rayon',
  ],
  identitas: [
    'Stambuk',
    'Nama Lengkap',
    'Nama Panggilan',
    'Tempat Lahir',
    'Tanggal Lahir',
    'Jenis Kelamin',
    'Kewarganegaraan',
    'No KTP',
    'No KK',
    'NISN',
    'Suku',
    'Daerah',
    'Konsulat',
  ],
  akademik: [
    'Stambuk',
    'Nama Lengkap',
    'Kelas',
    'Kls Asal',
    'Th Masuk Gontor',
    'Aktif Tahun Ajaran',
    'Rayon',
    'Kamar Rayon',
    'Status',
    'Posisi',
  ],
  ortu: [
    'Stambuk',
    'Nama Lengkap',
    'Ayah_Nama',
    'Ayah_Pekerjaan',
    'Ayah_NoHP',
    'Ibu_Nama',
    'Ibu_Pekerjaan',
    'Ibu_NoHP',
    'Wali_Nama',
    'Wali_NoHP',
    'Alamat',
  ],
  full: null, // semua kolom dari row
};

export function listPresetSantri() {
  return Object.keys(PRESET_KOLOM_SANTRI);
}

/**
 * @param {Object} opts
 * @param {string} opts.kolomFilter  Nama kolom filter (atau 'Semua')
 * @param {string} opts.nilaiFilter  Nilai filter
 * @param {string} opts.preset       Nama preset kolom (lite/identitas/akademik/ortu/full)
 * @returns {Promise<{rows: Array, kolomList: Array, count: number}>}
 */
export async function buildSantriRows(opts = {}) {
  const kolomFilter = deepSanitize(opts.kolomFilter || 'Semua').trim() || 'Semua';
  const nilaiFilter = deepSanitize(opts.nilaiFilter || '').trim();
  const preset = String(opts.preset || 'lite').toLowerCase();

  let results;
  if (kolomFilter.toLowerCase() === 'semua' || !nilaiFilter) {
    results = await getFilteredSantriAll('Semua', '');
  } else {
    results = await getFilteredSantriAll(kolomFilter, nilaiFilter);
  }

  if (!Array.isArray(results)) results = [];

  const presetKolom = PRESET_KOLOM_SANTRI[preset];

  let rows;
  let kolomList;
  if (preset === 'full' || presetKolom === null) {
    rows = results.map(rowToFullObject);
    kolomList = rows.length > 0 ? Object.keys(rows[0]) : [];
  } else {
    rows = results.map((r) => {
      const out = {};
      for (const k of presetKolom) out[k] = normalizeCellValue(k, r[k]);
      return out;
    });
    kolomList = presetKolom;
  }

  return { rows, kolomList, count: rows.length };
}

export async function generateSantriExcel(opts = {}) {
  const XLSX = await loadXLSX();
  const built = await buildSantriRows(opts);

  if (built.count === 0) {
    throw new Error('Tidak ada data sesuai filter yang dipilih.');
  }

  const ws = XLSX.utils.json_to_sheet(built.rows, { header: built.kolomList });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Santri');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, ...built };
}

// ════════════════════════════════════════════════════════
//  EKSPOR BIODATA GURU
// ════════════════════════════════════════════════════════
export const PRESET_KOLOM_GURU = {
  lite: ['Stambuk', 'Nama Lengkap', 'Status', 'Bagian', 'No HP'],
  identitas: [
    'Stambuk',
    'Nama Lengkap',
    'Tempat Lahir',
    'Tanggal Lahir',
    'Jenis Kelamin',
    'No HP',
    'No KTP',
    'Alamat',
  ],
  full: null,
};

export async function buildGuruRows(opts = {}) {
  const keyword = deepSanitize(opts.keyword || '').trim();
  const preset = String(opts.preset || 'lite').toLowerCase();

  let results;
  if (keyword) {
    results = await cariGuru(keyword);
  } else {
    results = await getDirektoriGuru();
  }

  if (!Array.isArray(results)) results = [];

  const presetKolom = PRESET_KOLOM_GURU[preset];
  let rows;
  let kolomList;
  if (preset === 'full' || presetKolom === null) {
    rows = results.map(rowToFullObject);
    kolomList = rows.length > 0 ? Object.keys(rows[0]) : [];
  } else {
    rows = results.map((r) => {
      const out = {};
      for (const k of presetKolom) out[k] = normalizeCellValue(k, r[k]);
      return out;
    });
    kolomList = presetKolom;
  }

  return { rows, kolomList, count: rows.length };
}

export async function generateGuruExcel(opts = {}) {
  const XLSX = await loadXLSX();
  const built = await buildGuruRows(opts);

  if (built.count === 0) {
    throw new Error('Tidak ada data guru yang ditemukan.');
  }

  const ws = XLSX.utils.json_to_sheet(built.rows, { header: built.kolomList });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Guru');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, ...built };
}

// ════════════════════════════════════════════════════════
//  REKAP BERKAS PER JENIS
//  Menghasilkan list santri yang BELUM punya file per folder
// ════════════════════════════════════════════════════════

/**
 * Bangun rekap berkas per folder.
 * @param {Object} opts
 * @param {string} opts.kelas - Filter kelas (opsional). Pakai 'Semua' untuk semua.
 * @returns {Promise<{folders: Array<{folder,kode,tipe,ada,kosong,total,belumPunya: Array}>, total: number}>}
 */
export async function buildRekapBerkasPerJenis(opts = {}) {
  const kelasFilter = deepSanitize(opts.kelas || 'Semua').trim();
  const rawAll = await getAllSantriAktif();
  let all = Array.isArray(rawAll) ? rawAll : [];

  if (kelasFilter && kelasFilter.toLowerCase() !== 'semua') {
    const keyLower = kelasFilter.toLowerCase();
    all = all.filter((s) => String(s.Kelas || '').toLowerCase().includes(keyLower));
  }

  const folders = DAFTAR_FOLDER_BERKAS.map((folder) => ({
    folder,
    kode: folder.charAt(0),
    tipe: DAFTAR_FOLDER_PRIMER.includes(folder) ? 'Primer' : 'Sekunder',
    ada: 0,
    kosong: 0,
    total: all.length,
    belumPunya: [],
  }));

  for (const s of all) {
    const stb = String(s.Stambuk || '').trim();
    if (!stb) continue;
    for (const f of folders) {
      const info = cekFileBerkas(f.folder, stb);
      if (info.found) {
        f.ada++;
      } else {
        f.kosong++;
        f.belumPunya.push({
          Stambuk: stb,
          'Nama Lengkap': s['Nama Lengkap'] || '-',
          Kelas: s['Kelas'] || '-',
        });
      }
    }
  }

  return { folders, total: all.length, kelasFilter };
}

export async function generateRekapBerkasExcel(opts = {}) {
  const XLSX = await loadXLSX();
  const rekap = await buildRekapBerkasPerJenis(opts);

  const wb = XLSX.utils.book_new();

  // Sheet ringkasan
  const ringkasanRows = rekap.folders.map((f) => ({
    'Kode': f.kode,
    'Folder Berkas': f.folder,
    'Tipe': f.tipe,
    'Jumlah Ada': f.ada,
    'Jumlah Belum': f.kosong,
    'Total Target': f.total,
    'Persentase Ada (%)': f.total > 0 ? Math.round((f.ada / f.total) * 100) : 0,
  }));

  const wsRingkas = XLSX.utils.json_to_sheet(ringkasanRows, {
    header: [
      'Kode',
      'Folder Berkas',
      'Tipe',
      'Jumlah Ada',
      'Jumlah Belum',
      'Total Target',
      'Persentase Ada (%)',
    ],
  });
  XLSX.utils.book_append_sheet(wb, wsRingkas, 'Ringkasan');

  // Sheet per folder: daftar yang BELUM punya berkas
  for (const f of rekap.folders) {
    const sheetName = `${f.kode} - ${f.folder.replace(/[\\/*?:[\]]/g, '')}`.slice(0, 31);
    const data = f.belumPunya.length > 0
      ? f.belumPunya
      : [{ Stambuk: '', 'Nama Lengkap': '✅ Semua santri sudah punya berkas ini', Kelas: '' }];
    const ws = XLSX.utils.json_to_sheet(data, {
      header: ['Stambuk', 'Nama Lengkap', 'Kelas'],
    });
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, rekap };
}

export default {
  PRESET_KOLOM_SANTRI,
  PRESET_KOLOM_GURU,
  DAFTAR_FOLDER_PRIMER,
  DAFTAR_FOLDER_SEKUNDER,
  DAFTAR_FOLDER_BERKAS,
  listPresetSantri,
  buildSantriRows,
  generateSantriExcel,
  buildGuruRows,
  generateGuruExcel,
  buildRekapBerkasPerJenis,
  generateRekapBerkasExcel,
  loadXLSX,
};
