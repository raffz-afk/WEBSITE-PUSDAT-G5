/**
 * ============================================================
 *  lib/prokerManager.js — 🆕 Manajer Proker Pusdat Gontor 5
 *  ★ VERSI v13.6 — BUG FIX `proker_pagi undefined` + JUMAT AUTO-LIBUR
 * ============================================================
 *
 *  PERBAIKAN v13.6 (4 Mei 2026):
 *  ────────────────────────────────────────────────────────
 *  🐛 BUG LAMA (v13.5):
 *    - simpanProkerPagi(), simpanLaporanBakdiyah(), setLiburHariIni(),
 *      logSpamMulai/Tambah/Berhenti() membaca `all` dari file SEBELUM
 *      memanggil ensureRecordHariIni(). Akibatnya `all.data[tgl]`
 *      adalah undefined → TypeError: Cannot set properties of
 *      undefined (setting 'proker_pagi'). Terjadi saat record hari
 *      ini belum ada di file.
 *
 *  ✅ FIX:
 *    - ensureRecordHariIni() sekarang mengembalikan { all, tgl }
 *      yang sudah pasti up-to-date dan punya record hari ini.
 *    - Semua consumer pakai hasil return tsb, tidak readJSON ulang.
 *
 *  🆕 TAMBAHAN v13.6:
 *    - isJumatHariIni()  → helper hari Jumat (index 5).
 *    - ensureRecordHariIni() otomatis set status='libur' saat Jumat,
 *      dengan field libur_via='auto-jumat', sehingga:
 *         · spam 07:30 di-skip
 *         · reminder 12:00 di-skip
 *         · evaluasi besok pagi tetap menampilkan "Kemarin libur"
 *    - Daftar keyword libur diperluas: tambah "jumat", "jum'at".
 *
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import XLSX from 'xlsx';

// ══════════════════════════════════════════════════
//  PATH FILE DATABASE
// ══════════════════════════════════════════════════
const ROOT = process.cwd();
const DIR_PROKER = path.resolve(ROOT, 'database', 'proker');
const FILE_STAF = path.join(DIR_PROKER, 'staf_piket.json');
const FILE_TAHUNAN = path.join(DIR_PROKER, 'proker_tahunan.json');
const FILE_BULANAN = path.join(DIR_PROKER, 'proker_bulanan.json');
const FILE_LAPORAN = path.join(DIR_PROKER, 'laporan_harian.json');
const DIR_REKAP = path.join(DIR_PROKER, 'rekap');

// Pastikan folder ada
if (!fs.existsSync(DIR_PROKER)) fs.mkdirSync(DIR_PROKER, { recursive: true });
if (!fs.existsSync(DIR_REKAP)) fs.mkdirSync(DIR_REKAP, { recursive: true });

const NAMA_HARI_ID = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// ══════════════════════════════════════════════════
//  HELPER UMUM (anti-corrupt JSON)
// ══════════════════════════════════════════════════
function readJSON(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8');
      return JSON.parse(JSON.stringify(fallback));
    }
    const raw = fs.readFileSync(filePath, 'utf-8') || '';
    const trimmed = raw.trim();
    if (!trimmed) {
      // file kosong → tulis ulang fallback
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8');
      return JSON.parse(JSON.stringify(fallback));
    }
    return JSON.parse(trimmed);
  } catch (err) {
    console.error(`[PROKER] ❌ Gagal baca ${filePath}: ${err.message} → fallback dipakai.`);
    return JSON.parse(JSON.stringify(fallback));
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`[PROKER] ❌ Gagal tulis ${filePath}:`, err.message);
    return false;
  }
}

export function getTanggalWIB() {
  return moment().tz('Asia/Jakarta').format('YYYY-MM-DD');
}

export function getHariIniIndex() {
  return moment().tz('Asia/Jakarta').day();
}

export function getNamaHariIni() {
  return NAMA_HARI_ID[getHariIniIndex()];
}

// 🆕 v13.6: helper Jumat
export function isJumatHariIni() {
  return getHariIniIndex() === 5;
}

// ══════════════════════════════════════════════════
//  HIJRIYAH HELPER
// ══════════════════════════════════════════════════
export function getHijriyahHariIni() {
  try {
    const fmt = new Intl.DateTimeFormat('en-TN-u-ca-islamic', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });
    const parts = fmt.formatToParts(new Date());
    const day = parseInt(parts.find((p) => p.type === 'day')?.value || '0', 10);
    const month = parts.find((p) => p.type === 'month')?.value || '';
    const year = parseInt(parts.find((p) => p.type === 'year')?.value || '0', 10);
    return { hari: day, bulan: month, tahun: year };
  } catch (err) {
    console.error('[PROKER] ❌ Hijriyah error:', err.message);
    return { hari: 0, bulan: '-', tahun: 0 };
  }
}

export function isAwalBulanHijriyah() {
  return getHijriyahHariIni().hari === 1;
}

// ══════════════════════════════════════════════════
//  STAF PIKET
// ══════════════════════════════════════════════════
export function getAllStaf() {
  return readJSON(FILE_STAF, { staf: [] }).staf || [];
}

export function getStafPiketHariIni() {
  const hariIdx = getHariIniIndex();
  return getAllStaf().filter(
    (s) => s.aktif !== false && Array.isArray(s.hari) && s.hari.includes(hariIdx),
  );
}

export function getStafByWA(nomor) {
  const bersih = String(nomor).replace(/[^0-9]/g, '');
  return getAllStaf().find((s) => s.wa === bersih) || null;
}

// ══════════════════════════════════════════════════
//  PROKER TAHUNAN & BULANAN
// ══════════════════════════════════════════════════
export function getProkerTahunan() {
  return readJSON(FILE_TAHUNAN, { list: [] });
}

export function getProkerBulanan() {
  return readJSON(FILE_BULANAN, { list: [] });
}

export function setFlagPerluPerbaruiBulanan(flag = true) {
  const data = getProkerBulanan();
  data.perlu_diperbarui = flag;
  if (flag) {
    const hijri = getHijriyahHariIni();
    data.hijriyah_baru = `${hijri.bulan} ${hijri.tahun} H`;
  }
  writeJSON(FILE_BULANAN, data);
}

export function formatProkerTahunanText() {
  const t = getProkerTahunan();
  if (!t.list || t.list.length === 0) return '_Belum ada Proker Tahunan terdaftar._';
  const head = `📅 *PROKER TAHUNAN ${t.tahun_hijriyah || ''}* ${t.tahun_masehi ? `(${t.tahun_masehi})` : ''}`;
  const body = t.list
    .map((p) => `┃ ${p.no}. *${p.judul}*\n┃    🎯 ${p.target}\n┃    ⏳ ${p.deadline} • ${p.status || '-'}`)
    .join('\n');
  return `${head}\n${body}`;
}

export function formatProkerBulananText() {
  const b = getProkerBulanan();
  if (!b.list || b.list.length === 0) return '_Belum ada Proker Bulanan terdaftar._';
  const head = `🗓️ *PROKER BULANAN ${b.bulan_hijriyah || ''}* ${b.bulan_masehi ? `(${b.bulan_masehi})` : ''}`;
  const warn = b.perlu_diperbarui
    ? '\n⚠️ _Awal bulan Hijriyah baru — mohon perbarui daftar di file proker_bulanan.json_'
    : '';
  const body = b.list
    .map((p) => `┃ ${p.no}. *${p.judul}*\n┃    🎯 ${p.target}\n┃    👤 ${p.pic || '-'}`)
    .join('\n');
  return `${head}${warn}\n${body}`;
}

// ══════════════════════════════════════════════════
//  LAPORAN HARIAN — Catatan masuk dari staf
//  🆕 v13.6: return { all, tgl } supaya consumer tidak readJSON ulang
// ══════════════════════════════════════════════════
function ensureRecordHariIni() {
  const all = readJSON(FILE_LAPORAN, { data: {} });
  if (!all.data || typeof all.data !== 'object') all.data = {};

  const tgl = getTanggalWIB();
  let dirty = false;

  if (!all.data[tgl]) {
    const stafs = getStafPiketHariIni();
    const isJumat = isJumatHariIni();
    const ts = moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');

    all.data[tgl] = {
      tanggal: tgl,
      hari: getNamaHariIni(),
      staf_piket: stafs[0]
        ? { id: stafs[0].id, nama: stafs[0].nama, wa: stafs[0].wa }
        : null,
      // 🆕 v13.6: Jumat → otomatis libur
      status: isJumat ? 'libur' : 'normal',
      proker_pagi: isJumat
        ? {
            submitted: true,
            submitted_at: ts,
            isi: '(LIBUR JUMAT — otomatis, tidak ada agenda)',
          }
        : { submitted: false, submitted_at: null, isi: null },
      laporan_bakdiyah: isJumat
        ? {
            submitted: true,
            submitted_at: ts,
            selesai: [],
            belum_selesai: [],
          }
        : {
            submitted: false,
            submitted_at: null,
            selesai: [],
            belum_selesai: [],
          },
      spam_log: { started_at: null, stopped_at: null, total_kirim: 0 },
    };
    if (isJumat) all.data[tgl].libur_via = 'auto-jumat';
    dirty = true;
  } else {
    // Migrasi record lama yang belum punya field status
    if (typeof all.data[tgl].status === 'undefined') {
      all.data[tgl].status = 'normal';
      dirty = true;
    }
    // 🆕 v13.6: bila record dibuat sebelum sistem auto-Jumat aktif, upgrade
    if (
      isJumatHariIni() &&
      all.data[tgl].status !== 'libur' &&
      !all.data[tgl].proker_pagi?.submitted
    ) {
      const ts = moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');
      all.data[tgl].status = 'libur';
      all.data[tgl].libur_via = 'auto-jumat';
      all.data[tgl].proker_pagi = {
        submitted: true,
        submitted_at: ts,
        isi: '(LIBUR JUMAT — otomatis, tidak ada agenda)',
      };
      all.data[tgl].laporan_bakdiyah = {
        submitted: true,
        submitted_at: ts,
        selesai: [],
        belum_selesai: [],
      };
      dirty = true;
    }
  }

  if (dirty) writeJSON(FILE_LAPORAN, all);
  return { all, tgl };
}

export function getRecordHariIni() {
  const { all, tgl } = ensureRecordHariIni();
  return all.data[tgl];
}

export function getRecordKemarin() {
  const all = readJSON(FILE_LAPORAN, { data: {} });
  const tgl = moment().tz('Asia/Jakarta').subtract(1, 'day').format('YYYY-MM-DD');
  return all.data[tgl] || null;
}

// ══════════════════════════════════════════════════
//  PARSER ROBUST UNTUK #selesai / #belum
// ══════════════════════════════════════════════════
export function parseSelesaiBelum(isiTeks) {
  if (!isiTeks || typeof isiTeks !== 'string') {
    return { selesai: [], belum: [] };
  }

  const reSelesai = /#\s*selesai(?:\s+selesai)?\s*:?/i;
  const reBelum = /#\s*belum(?:\s+selesai)?\s*:?/i;

  const matchSelesai = isiTeks.match(reSelesai);
  const matchBelum = isiTeks.match(reBelum);

  const idxSelesai = matchSelesai ? matchSelesai.index : -1;
  const lenSelesai = matchSelesai ? matchSelesai[0].length : 0;
  const idxBelum = matchBelum ? matchBelum.index : -1;
  const lenBelum = matchBelum ? matchBelum[0].length : 0;

  const cleanItem = (line) =>
    line
      .replace(/^[\s]*[-•*▪▫]\s*/, '')        // hapus bullet "- ", "• ", "* "
      .replace(/^[\s]*\d+[.)]\s*/, '')         // hapus numbering "1. ", "2) "
      .trim();

  const splitBlok = (s) =>
    s
      .split(/\r?\n/)
      .map(cleanItem)
      .filter((l) => l.length > 0);

  let selesai = [];
  let belum = [];

  if (idxSelesai !== -1 && idxBelum !== -1) {
    if (idxSelesai < idxBelum) {
      selesai = splitBlok(isiTeks.substring(idxSelesai + lenSelesai, idxBelum));
      belum = splitBlok(isiTeks.substring(idxBelum + lenBelum));
    } else {
      belum = splitBlok(isiTeks.substring(idxBelum + lenBelum, idxSelesai));
      selesai = splitBlok(isiTeks.substring(idxSelesai + lenSelesai));
    }
  } else if (idxSelesai !== -1) {
    selesai = splitBlok(isiTeks.substring(idxSelesai + lenSelesai));
  } else if (idxBelum !== -1) {
    belum = splitBlok(isiTeks.substring(idxBelum + lenBelum));
  } else {
    // Tidak ada tag sama sekali — semua poin dianggap selesai
    selesai = splitBlok(isiTeks);
  }

  return { selesai, belum };
}

// ══════════════════════════════════════════════════
//  SIMPAN PROKER PAGI  (🛠️ FIX v13.6)
// ══════════════════════════════════════════════════
export function simpanProkerPagi(waPengirim, isiTeks) {
  const staf = getStafByWA(waPengirim);
  if (!staf) return { ok: false, reason: 'BUKAN_STAF' };

  const stafPiket = getStafPiketHariIni();
  if (!stafPiket.find((s) => s.id === staf.id)) {
    return { ok: false, reason: 'BUKAN_PIKET_HARI_INI' };
  }

  // 🛠️ FIX: ensureRecordHariIni() sekarang return { all, tgl } yang up-to-date
  const { all, tgl } = ensureRecordHariIni();

  all.data[tgl].proker_pagi = {
    submitted: true,
    submitted_at: moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
    isi: isiTeks.trim(),
  };
  writeJSON(FILE_LAPORAN, all);
  appendRekapExcel(all.data[tgl]);
  return { ok: true, staf, record: all.data[tgl] };
}

// ══════════════════════════════════════════════════
//  SIMPAN LAPORAN BAKDIYAH  (🛠️ FIX v13.6)
// ══════════════════════════════════════════════════
export function simpanLaporanBakdiyah(waPengirim, isiTeks) {
  const staf = getStafByWA(waPengirim);
  if (!staf) return { ok: false, reason: 'BUKAN_STAF' };

  const { selesai, belum } = parseSelesaiBelum(isiTeks);

  const { all, tgl } = ensureRecordHariIni();

  all.data[tgl].laporan_bakdiyah = {
    submitted: true,
    submitted_at: moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
    selesai,
    belum_selesai: belum,
  };
  writeJSON(FILE_LAPORAN, all);
  appendRekapExcel(all.data[tgl]);
  return { ok: true, staf, selesai, belum };
}

// ══════════════════════════════════════════════════
//  SET STATUS LIBUR — bypass total  (🛠️ FIX v13.6)
// ══════════════════════════════════════════════════
export function setLiburHariIni(waPengirim, sumber = 'lapharian') {
  const staf = getStafByWA(waPengirim);
  if (!staf) return { ok: false, reason: 'BUKAN_STAF' };

  const { all, tgl } = ensureRecordHariIni();

  const ts = moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');
  all.data[tgl].status = 'libur';
  all.data[tgl].proker_pagi = {
    submitted: true,
    submitted_at: ts,
    isi: '(LIBUR — tidak ada agenda hari ini)',
  };
  all.data[tgl].laporan_bakdiyah = {
    submitted: true,
    submitted_at: ts,
    selesai: [],
    belum_selesai: [],
  };
  all.data[tgl].libur_via = sumber;

  writeJSON(FILE_LAPORAN, all);
  appendRekapExcel(all.data[tgl]);
  return { ok: true, staf, record: all.data[tgl] };
}

// ══════════════════════════════════════════════════
//  Cek apakah hari ini berstatus libur
// ══════════════════════════════════════════════════
export function isHariIniLibur() {
  // Jumat selalu libur (otomatis)
  if (isJumatHariIni()) return true;
  const rec = getRecordHariIni();
  return rec?.status === 'libur';
}

// ══════════════════════════════════════════════════
//  SPAM LOG  (🛠️ FIX v13.6)
// ══════════════════════════════════════════════════
export function logSpamMulai() {
  const { all, tgl } = ensureRecordHariIni();
  all.data[tgl].spam_log = all.data[tgl].spam_log || {
    started_at: null,
    stopped_at: null,
    total_kirim: 0,
  };
  all.data[tgl].spam_log.started_at =
    moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');
  writeJSON(FILE_LAPORAN, all);
}

export function logSpamTambah() {
  const { all, tgl } = ensureRecordHariIni();
  all.data[tgl].spam_log = all.data[tgl].spam_log || {
    started_at: null,
    stopped_at: null,
    total_kirim: 0,
  };
  all.data[tgl].spam_log.total_kirim = (all.data[tgl].spam_log.total_kirim || 0) + 1;
  writeJSON(FILE_LAPORAN, all);
}

export function logSpamBerhenti() {
  const { all, tgl } = ensureRecordHariIni();
  all.data[tgl].spam_log = all.data[tgl].spam_log || {
    started_at: null,
    stopped_at: null,
    total_kirim: 0,
  };
  all.data[tgl].spam_log.stopped_at =
    moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');
  writeJSON(FILE_LAPORAN, all);
}

// ══════════════════════════════════════════════════
//  EKSPOR REKAP EXCEL — sekarang menyertakan kolom Status
// ══════════════════════════════════════════════════
export function appendRekapExcel(recordHari) {
  try {
    const all = readJSON(FILE_LAPORAN, { data: {} });
    const ymBulan = recordHari.tanggal.substring(0, 7);
    const filePath = path.join(DIR_REKAP, `Rekap-${ymBulan}.xlsx`);

    const rows = Object.values(all.data)
      .filter((r) => r && r.tanggal && r.tanggal.startsWith(ymBulan))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
      .map((r) => ({
        Tanggal: r.tanggal,
        Hari: r.hari,
        Status: (r.status || 'normal').toUpperCase(),
        'Staf Piket': r.staf_piket?.nama || '-',
        'WA Staf': r.staf_piket?.wa || '-',
        'Proker Pagi (Submit)': r.proker_pagi?.submitted ? 'YA' : 'TIDAK',
        'Jam Submit Pagi': r.proker_pagi?.submitted_at || '-',
        'Isi Proker Pagi': (r.proker_pagi?.isi || '').replace(/\n/g, ' | '),
        'Laporan Bakdiyah (Submit)': r.laporan_bakdiyah?.submitted ? 'YA' : 'TIDAK',
        'Jam Submit Bakdiyah': r.laporan_bakdiyah?.submitted_at || '-',
        Selesai: (r.laporan_bakdiyah?.selesai || []).join(' | '),
        'Belum Selesai': (r.laporan_bakdiyah?.belum_selesai || []).join(' | '),
        'Spam Total': r.spam_log?.total_kirim || 0,
      }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RekapProker');
    XLSX.writeFile(wb, filePath);
    return filePath;
  } catch (err) {
    console.error('[PROKER] ❌ Gagal generate rekap Excel:', err.message);
    return null;
  }
}

// ══════════════════════════════════════════════════
//  STATUS WINDOW
// ══════════════════════════════════════════════════
export function inWindowSubmitPagi() {
  const m = moment().tz('Asia/Jakarta');
  const menit = m.hour() * 60 + m.minute();
  return menit >= 7 * 60 && menit < 7 * 60 + 30;
}

// ══════════════════════════════════════════════════
//  Utility: format mention staf untuk WA group
// ══════════════════════════════════════════════════
export function buildMentionStafPiket() {
  const stafs = getStafPiketHariIni();
  const teksMention = stafs.map((s) => `@${s.wa}`).join(' ');
  const mentions = stafs.map((s) => `${s.wa}@s.whatsapp.net`);
  return { teksMention, mentions, stafs };
}

// ══════════════════════════════════════════════════
//  HELPER kata kunci LIBUR (dipakai handler plugin)
// ══════════════════════════════════════════════════
/**
 * Cek apakah CONTENT (setelah command, mis. " libur") berisi keyword libur.
 * Tangani:  "libur", "Libur", "LIBUR", "off", "cuti", "nihil", "tidak ada",
 *           "kosong", "jumat", "jum'at"
 */
export function isLiburKeyword(content) {
  if (!content) return false;
  const firstLine = String(content)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.length > 0) || '';
  return /^(libur|off|cuti|nihil|tidak\s*ada|kosong|jum'?at)$/i.test(firstLine);
}
