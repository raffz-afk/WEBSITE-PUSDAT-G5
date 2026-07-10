/**
 * ============================================================
 * handle/gateway.js — Handler Gateway Autentikasi Pusdat
 * ============================================================
 *
 * Handler ini berjalan SEBELUM plugin diproses.
 * ⚠️ PRIORITY HARUS 0 agar berjalan SEBELUM MODE ON handler (priority 2)
 * yang bisa mencuri input user (autoai, autosimi, autorusuh).
 *
 * Menangkap pesan balasan user saat sedang dalam sesi gateway
 * (memasukkan Stambuk / Password / Tanggal Lahir).
 *
 * ============================================================
 *
 * CHANGELOG v11 (REKAP BERKAS DETAIL PRIMER, TUTORIAL, MENU SYNC):
 *
 * TUGAS 1 — ROMBAK Output .rekapberkas:
 *   - Berkas Primer: Hitung spesifik eksistensi MASING-MASING file
 *     (A. FOTO AKSES, B. IJAZAH, C. AKTA KELAHIRAN, D. KARTU KELUARGA)
 *   - Berkas Sekunder: Hitung anak lengkap 5/5 vs kurang
 *   - Format output baru: Detail per-folder primer + ringkasan sekunder
 *
 * TUGAS 2 — Fitur .tutorial:
 *   - Ditangani oleh plugin baru tutorial.js (bukan di gateway)
 *
 * TUGAS 3 — Sinkronisasi teks .menu:
 *   - Ditangani oleh plugin menu (bukan di gateway)
 *
 * ============================================================
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  getSession,
  setSession,
  clearSession,
  verifyGateway,
  getFullBiodata,
  formatBiodata,
  // Sanitization
  deepSanitize,
  sanitizeStambuk,
  sanitizeTanggal,
  // Admin session
  getAdminSession,
  setAdminSession,
  clearAdminSession,
  getPasswordByStambuk,
  // 🆕 v5: CekSantri session
  getCekSantriSession,
  setCekSantriSession,
  clearCekSantriSession,
  getFullBiodataSantri,
  formatBiodataSantri,
  // 🆕 v6: AuditBerkas session + getSantriByKelas
  getAuditBerkasSession,
  setAuditBerkasSession,
  clearAuditBerkasSession,
  getSantriByKelas,
  getStaffPassword,     // ★ 🆕 v7: Dynamic Password
  // 🆕 v9: EksporFull session
  getEksporSession,
  clearEksporSession,
  // 🆕 v10: LihatBerkas session
  getLihatBerkasSession,
  setLihatBerkasSession,
  clearLihatBerkasSession,
  // 🆕 v10: RekapBerkas session
  getRekapBerkasSession,
  setRekapBerkasSession,
  clearRekapBerkasSession,
  getAllSantriAktif,
} from '../lib/dbAccess.js';
import pusdatConfig from '../pusdat-config.js';
import { processEksporFullAuthorized } from '../plugins/PUSDAT/ekspor.js';
import {
  getEditDataSession,
  setEditDataSession,
  clearEditDataSession,
  parseDbTypeInput,
  getDbTypeLabel,
  getEditableRecordByStambuk,
  formatEditableRecordSummary,
  formatEditableFieldList,
  resolveEditableField,
  getFieldSuggestions,
  formatEditValue,
  inferAndNormalizeNewValue,
  updateRecordField,
} from '../lib/dbEditor.js';

// ══════════════════════════════════════════════════
//  🛠️ v13.1 FIX (Bug #1): Helper safeCwd() resilient
// ──────────────────────────────────────────────────
//  Mengembalikan working directory secara aman.
//  Walaupun process.cwd entah kenapa ter-shadow oleh
//  konteks lain (worker_threads / monkey-patching),
//  generator Excel & path lain tetap mendapatkan path
//  yang valid. Mencegah crash:
//    "process.cwd is not a function"
// ══════════════════════════════════════════════════
// 🛠️ v13.2: detektor path "rusak" — dipakai untuk menolak
// hasil cwd yang sudah ter-corrupt (mis. `D:\D:\...` atau
// mengandung `%20`). Selama path lulus pemeriksaan ini,
// kita anggap aman untuk dipakai oleh fs.mkdirSync.
function _isPathSane(p) {
  if (!p || typeof p !== 'string') return false;
  if (p.includes('%20') || p.includes('%2F')) return false;       // url-encoded leak
  if (/[A-Za-z]:\\[A-Za-z]:\\/.test(p)) return false;             // D:\D:\... double drive
  if (/^\/[A-Za-z]:\//.test(p)) return false;                     // /D:/... posix-style
  return true;
}

function safeCwd() {
  // ──────────────────────────────────────────────────
  // 🛠️ v13.2 FIX (Bug #1 — D:\D:\ + %20):
  //   Versi sebelumnya pakai `new URL(import.meta.url).pathname`
  //   yang di Windows menghasilkan string rusak:
  //     '/D:/PUSAT%20DATA%202026/...'
  //   → leading slash bikin path.resolve menempelkan drive
  //     letter dua kali (D:\D:\...)
  //   → '%20' tidak di-decode jadi spasi.
  //   Sekarang pakai fileURLToPath() yang menangani kedua
  //   masalah di atas dengan benar di semua platform,
  //   PLUS validator _isPathSane() untuk menolak hasil rusak.
  // ──────────────────────────────────────────────────
  try {
    if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
      const cwd = process.cwd();
      if (_isPathSane(cwd)) return cwd;
    }
  } catch (_) { /* swallow */ }

  // Fallback 1: env var (Windows)
  if (typeof process !== 'undefined' && process.env && _isPathSane(process.env.INIT_CWD)) {
    return process.env.INIT_CWD;
  }
  // Fallback 2: env var (Linux/Mac)
  if (typeof process !== 'undefined' && process.env && _isPathSane(process.env.PWD)) {
    return process.env.PWD;
  }
  // Fallback 3: derive dari import.meta.url SECARA AMAN
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const resolved = path.resolve(here, '..');
    if (_isPathSane(resolved)) return resolved;
  } catch (_) { /* swallow */ }

  // Fallback 4: regex parser manual (kalau fileURLToPath ikut kacau)
  try {
    let raw = String(import.meta.url || '').replace(/^file:\/\/\/?/, '');
    raw = decodeURIComponent(raw);
    if (/^\/[A-Za-z]:\//.test(raw)) raw = raw.slice(1);   // '/D:/...' → 'D:/...'
    raw = raw.replace(/\//g, path.sep);
    const resolved = path.resolve(path.dirname(raw), '..');
    if (_isPathSane(resolved)) return resolved;
  } catch (_) { /* swallow */ }

  // Fallback 5: terakhir — pakai os.tmpdir() biar tidak crash
  try {
    return os.tmpdir();
  } catch (_) {
    return '.';
  }
}

// ══════════════════════════════════════════════════
//  🛠️ v13.2 FIX (Bug #1): Helper safeTmpDir()
//  Beberapa kasus path cwd valid tapi BUKAN tempat
//  yang aman untuk menulis (mis. read-only). Kita
//  pilih tmp dir secara cerdas dengan urutan:
//    1. <cwd>/tmp                  (preferred)
//    2. os.tmpdir()/pusdat-tmp     (fallback OS-level)
// ══════════════════════════════════════════════════
function safeTmpDir() {
  const candidates = [];
  try {
    const cwd = safeCwd();
    if (_isPathSane(cwd)) candidates.push(path.join(cwd, 'tmp'));
  } catch (_) {}
  try { candidates.push(path.join(os.tmpdir(), 'pusdat-tmp')); } catch (_) {}

  for (const dir of candidates) {
    if (!_isPathSane(dir)) {
      console.warn(`[safeTmpDir] ⏭ Lewati path rusak: ${dir}`);
      continue;
    }
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // tes write akses
      const testFile = path.join(dir, '.write-test');
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return dir;
    } catch (e) {
      console.warn(`[safeTmpDir] ❌ ${dir} tidak bisa ditulis: ${e.message}`);
    }
  }
  // last resort: os.tmpdir() apapun adanya
  return os.tmpdir();
}

// ══════════════════════════════════════════════════
//  🆕 v7: PASSWORD STAF SEKARANG DINAMIS
//  Dibaca real-time dari database/pusdat_settings.json
//  via fungsi getStaffPassword() dari dbAccess.js.
//  Tidak ada lagi hardcoded password di file ini.
// ══════════════════════════════════════════════════

// ══════════════════════════════════════════════════
//  🆕 v5: KONSTANTA FOLDER FOTO AKSES SANTRI
//  Path Absolute ke Local Drive Windows.
//  Gunakan double backslash \\ agar aman di environment Windows.
// ══════════════════════════════════════════════════
const FOTO_AKSES_DIR = 'D:\\PUSAT DATA 2026\\01. MASTER DATA SANTRI\\01. BERKAS SANTRI\\A. FOTO AKSES';

// ══════════════════════════════════════════════════
//  🆕 v10: KONSTANTA & FUNGSI PENGECEKAN KELENGKAPAN BERKAS
//
//  BERKAS PRIMER (A-D) & BERKAS SEKUNDER (E-I)
//
//  Folder induk berkas santri di Local Drive Windows.
//  Di dalamnya terdapat 9 sub-folder (A sampai I).
//  Nama file di dalam setiap sub-folder menggunakan
//  Nomor Stambuk (contoh: 140123.jpg, 140123.pdf).
//
//  Pengecekan dilakukan untuk 4 ekstensi: .jpg, .jpeg, .png, .pdf
//  Jika SALAH SATU ekstensi ditemukan → berkas dianggap ADA.
// ══════════════════════════════════════════════════
const BERKAS_INDUK_DIR = 'D:\\PUSAT DATA 2026\\01. MASTER DATA SANTRI\\01. BERKAS SANTRI';

// ── BERKAS PRIMER (A-D) ──
const DAFTAR_FOLDER_PRIMER = [
  'A. FOTO AKSES',
  'B. IJAZAH',
  'C. AKTA KELAHIRAN',
  'D. KARTU KELUARGA',
];

// ── BERKAS SEKUNDER (E-I) ──
const DAFTAR_FOLDER_SEKUNDER = [
  'E. SURAT PERMOHONAN',
  'F. SURAT PERNYATAAN',
  'G. PAKTA INTEGRITAS',
  'H. BPJS',
  'I. LAIN-LAIN',
];

// ── GABUNGAN (untuk backward compatibility) ──
const DAFTAR_FOLDER_BERKAS = [...DAFTAR_FOLDER_PRIMER, ...DAFTAR_FOLDER_SEKUNDER];

const EKSTENSI_BERKAS = ['.jpg', '.jpeg', '.png', '.pdf'];

// ══════════════════════════════════════════════════
//  🆕 v10: MAPPING KODE FOLDER (untuk .lihatberkas)
//  User menginput huruf A-I, kita mapping ke nama folder.
// ══════════════════════════════════════════════════
const KODE_FOLDER_MAP = {
  'A': 'A. FOTO AKSES',
  'B': 'B. IJAZAH',
  'C': 'C. AKTA KELAHIRAN',
  'D': 'D. KARTU KELUARGA',
  'E': 'E. SURAT PERMOHONAN',
  'F': 'F. SURAT PERNYATAAN',
  'G': 'G. PAKTA INTEGRITAS',
  'H': 'H. BPJS',
  'I': 'I. LAIN-LAIN',
};

// ── LABEL SINGKAT PRIMER (untuk output rekap) ──
const LABEL_PRIMER = {
  'A. FOTO AKSES': 'A. FOTO AKSES',
  'B. IJAZAH': 'B. IJAZAH',
  'C. AKTA KELAHIRAN': 'C. AKTA LAHIR',
  'D. KARTU KELUARGA': 'D. KK',
};

/**
 * ★ FUNGSI v10: Helper — Cek apakah file ada di suatu folder
 * dengan mencoba beberapa ekstensi.
 *
 * @param {string} folderName - Nama subfolder (contoh: 'A. FOTO AKSES')
 * @param {string} stambuk - Nomor Stambuk
 * @returns {{ found: boolean, ext: string, filePath: string }}
 */
function cekFileExist(folderName, stambuk) {
  for (const ext of EKSTENSI_BERKAS) {
    const filePath = path.join(BERKAS_INDUK_DIR, folderName, `${stambuk}${ext}`);
    try {
      if (fs.existsSync(filePath)) {
        return { found: true, ext, filePath };
      }
    } catch (fsErr) {
      // Folder/path tidak bisa diakses
    }
  }
  return { found: false, ext: '', filePath: '' };
}

/**
 * ★ FUNGSI v10 (ROMBAK TOTAL): Mengecek kelengkapan berkas santri
 * dengan SPLIT PRIMER (A-D) dan SEKUNDER (E-I).
 *
 * Output menampilkan 2 blok terpisah + rekap status masing-masing.
 *
 * @param {string} stambuk - Nomor Stambuk santri (sudah di-sanitize)
 * @returns {string} - Teks rekapitulasi kelengkapan berkas
 */
function cekKelengkapanBerkas(stambuk) {
  console.log(`\n[📂 CEK BERKAS] ════════════════════════════════`);
  console.log(`[📂 CEK BERKAS] Mulai pengecekan kelengkapan berkas untuk Stambuk: ${stambuk}`);
  console.log(`[📂 CEK BERKAS] Folder induk: ${BERKAS_INDUK_DIR}`);

  // ── CEK BERKAS PRIMER ──
  let primerAda = 0;
  let primerKosong = 0;
  const hasilPrimer = [];

  for (const namaFolder of DAFTAR_FOLDER_PRIMER) {
    const result = cekFileExist(namaFolder, stambuk);
    if (result.found) {
      primerAda++;
      hasilPrimer.push(`┃  ┣⌬ ${namaFolder} : ✅ Ada (${result.ext})`);
      console.log(`[📂 CEK BERKAS] ✅ PRIMER ${namaFolder} → DITEMUKAN: ${stambuk}${result.ext}`);
    } else {
      primerKosong++;
      hasilPrimer.push(`┃  ┣⌬ ${namaFolder} : ❌ Kosong`);
      console.log(`[📂 CEK BERKAS] ❌ PRIMER ${namaFolder} → TIDAK DITEMUKAN`);
    }
  }

  // ── CEK BERKAS SEKUNDER ──
  let sekunderAda = 0;
  let sekunderKosong = 0;
  const hasilSekunder = [];

  for (const namaFolder of DAFTAR_FOLDER_SEKUNDER) {
    const result = cekFileExist(namaFolder, stambuk);
    if (result.found) {
      sekunderAda++;
      hasilSekunder.push(`┃  ┣⌬ ${namaFolder} : ✅ Ada (${result.ext})`);
      console.log(`[📂 CEK BERKAS] ✅ SEKUNDER ${namaFolder} → DITEMUKAN: ${stambuk}${result.ext}`);
    } else {
      sekunderKosong++;
      hasilSekunder.push(`┃  ┣⌬ ${namaFolder} : ❌ Kosong`);
      console.log(`[📂 CEK BERKAS] ❌ SEKUNDER ${namaFolder} → TIDAK DITEMUKAN`);
    }
  }

  console.log(`[📂 CEK BERKAS] Primer: ${primerAda} Ada, ${primerKosong} Kosong`);
  console.log(`[📂 CEK BERKAS] Sekunder: ${sekunderAda} Ada, ${sekunderKosong} Kosong`);
  console.log(`[📂 CEK BERKAS] ═══════════════════════════════════\n`);

  // ── Status Primer ──
  const primerTotal = DAFTAR_FOLDER_PRIMER.length;
  const primerLengkap = primerAda === primerTotal;
  const statusPrimerIcon = primerLengkap ? '✅' : '❌';
  const statusPrimerText = primerLengkap ? 'Lengkap' : 'Kurang';

  // ── Status Sekunder ──
  const sekunderTotal = DAFTAR_FOLDER_SEKUNDER.length;
  const sekunderLengkap = sekunderAda === sekunderTotal;
  const statusSekunderIcon = sekunderLengkap ? '✅' : '❌';
  const statusSekunderText = sekunderLengkap ? 'Lengkap' : 'Kurang';

  // ── Rakit output ──
  const rekapText =
    `\n┣━━━『 📁 *BERKAS PRIMER (A-D)* 』━━━\n` +
    `┃\n` +
    hasilPrimer.join('\n') + '\n' +
    `┃\n` +
    `┃  📊 *Status Primer*: ${statusPrimerIcon} ${statusPrimerText} (${primerAda}/${primerTotal})\n` +
    `┃\n` +
    `┣━━━『 📁 *BERKAS SEKUNDER (E-I)* 』━━━\n` +
    `┃\n` +
    hasilSekunder.join('\n') + '\n' +
    `┃\n` +
    `┃  📊 *Status Sekunder*: ${statusSekunderIcon} ${statusSekunderText} (${sekunderAda}/${sekunderTotal})\n` +
    `┃\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛`;

  return rekapText;
}

/**
 * 🆕 v10 (ROMBAK): Mengecek kelengkapan berkas santri
 * dan mengembalikan status PRIMER dan SEKUNDER terpisah.
 *
 * @param {string} stambuk - Nomor Stambuk santri
 * @returns {{ primerKurang: Array<string>, sekunderKurang: Array<string>, primerLengkap: boolean, sekunderLengkap: boolean }}
 */
function getStatusBerkas(stambuk) {
  const primerKurang = [];
  const sekunderKurang = [];

  for (const namaFolder of DAFTAR_FOLDER_PRIMER) {
    const result = cekFileExist(namaFolder, stambuk);
    if (!result.found) {
      primerKurang.push(namaFolder);
    }
  }

  for (const namaFolder of DAFTAR_FOLDER_SEKUNDER) {
    const result = cekFileExist(namaFolder, stambuk);
    if (!result.found) {
      sekunderKurang.push(namaFolder);
    }
  }

  return {
    primerKurang,
    sekunderKurang,
    primerLengkap: primerKurang.length === 0,
    sekunderLengkap: sekunderKurang.length === 0,
  };
}

/**
 * 🆕 v11: Mengecek eksistensi file per folder primer untuk SATU santri.
 * Return object { 'A. FOTO AKSES': true/false, 'B. IJAZAH': true/false, ... }
 *
 * @param {string} stambuk
 * @returns {Object<string, boolean>}
 */
function cekDetailPrimer(stambuk) {
  const hasil = {};
  for (const namaFolder of DAFTAR_FOLDER_PRIMER) {
    const result = cekFileExist(namaFolder, stambuk);
    hasil[namaFolder] = result.found;
  }
  return hasil;
}

/**
 * 🆕 v11: Mengecek apakah semua 5 folder sekunder (E-I) lengkap.
 *
 * @param {string} stambuk
 * @returns {boolean}
 */
function cekSekunderLengkap(stambuk) {
  for (const namaFolder of DAFTAR_FOLDER_SEKUNDER) {
    const result = cekFileExist(namaFolder, stambuk);
    if (!result.found) return false;
  }
  return true;
}

/**
 * BACKWARD COMPAT: getFolderKurang — masih digunakan oleh .auditberkas lama
 */
function getFolderKurang(stambuk) {
  const folderKurang = [];

  for (const namaFolder of DAFTAR_FOLDER_BERKAS) {
    const result = cekFileExist(namaFolder, stambuk);
    if (!result.found) {
      folderKurang.push(namaFolder);
    }
  }

  return folderKurang;
}

// ══════════════════════════════════════════════════
//  HANDLER UTAMA
// ══════════════════════════════════════════════════

async function process(sock, messageInfo) {
  const { remoteJid, sender, message, content, fullText, command } = messageInfo;

  // ══════════════════════════════════════════════════
  //  PRIORITAS -4: CEK REKAP BERKAS SESSION DULU
  //  (terpisah total dari session lainnya)
  // ══════════════════════════════════════════════════
  const rekapSess = getRekapBerkasSession(sender);
  if (rekapSess) {
    if (command && command !== false && !['rekapberkas'].includes(command)) {
      console.log(`[GATEWAY-REKAP] ⚠️ RekapBerkas session dibatalkan karena command: ${command}`);
      clearRekapBerkasSession(sender);
      return true;
    }

    if (command && command !== false && ['rekapberkas'].includes(command)) {
      clearRekapBerkasSession(sender);
      return true;
    }

    const rawText = (fullText || content || '').trim();
    const text = deepSanitize(rawText);

    console.log(`[REKAP] step handler aktif untuk sender — input diproses`);

    if (!text) return true;

    // ── REKAP STEP 1: Menunggu Password Staf ──
    if (rekapSess.step === 'await_password') {
      const cleanPassword = deepSanitize(text).toLowerCase();

      console.log(`[GATEWAY-REKAP] 🔑 Password input: "${cleanPassword}" (len=${cleanPassword.length})`);

      if (cleanPassword !== String(getStaffPassword()).toLowerCase()) {
        clearRekapBerkasSession(sender);
        await sock.sendMessage(remoteJid, {
          react: { text: '🚫', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          { text: '🚫 *Akses Ditolak!*\n\n_Password Staf salah. Session dihapus._' },
          { quoted: message }
        );
        return false;
      }

      // Password benar! Langsung proses rekap
      const targetKelas = rekapSess.target;
      const isSemua = targetKelas.toLowerCase() === 'semua';

      console.log(`[GATEWAY-REKAP] ✅ Password benar. Memproses rekap untuk: "${targetKelas}"`);

      await sock.sendMessage(remoteJid, {
        react: { text: '⏳', key: message.key },
      });

      await sock.sendMessage(
        remoteJid,
        {
          text: `🔓 *Akses Staf Diterima!*\n\n⏳ Sedang merekap berkas ${isSemua ? '*SELURUH SANTRI*' : `kelas *${targetKelas}*`}...\n_Mohon tunggu, proses ini mungkin memakan waktu._`,
        },
        { quoted: message }
      );

      try {
        // ═══ QUERY: Ambil santri sesuai target ═══
        let santriList;
        if (isSemua) {
          santriList = await getAllSantriAktif();
        } else {
          santriList = await getSantriByKelas(targetKelas);
        }

        if (!santriList || santriList.length === 0) {
          clearRekapBerkasSession(sender);
          await sock.sendMessage(remoteJid, {
            react: { text: '❌', key: message.key },
          });
          await sock.sendMessage(
            remoteJid,
            {
              text: `❌ *Tidak ada santri aktif ${isSemua ? 'di database' : `di kelas "${targetKelas}"`}.*\n\n_Pastikan nama kelas sesuai database._\n_Contoh: 3 Int B, 4 KMI A, 1A_`,
            },
            { quoted: message }
          );
          return false;
        }

        // ══════════════════════════════════════════════════
        //  🆕 v11: LOGIKA REKAP BARU — DETAIL PRIMER + RINGKASAN SEKUNDER
        // ══════════════════════════════════════════════════

        // ── BERKAS PRIMER: Hitung per-folder ──
        const primerCount = {};
        for (const namaFolder of DAFTAR_FOLDER_PRIMER) {
          primerCount[namaFolder] = { ada: 0, kosong: 0 };
        }

        // ── BERKAS SEKUNDER: Hitung lengkap vs kurang ──
        let sekunderLengkapCount = 0;
        let sekunderKurangCount = 0;

        for (const santri of santriList) {
          const stambuk = String(santri.Stambuk || '').trim();
          if (!stambuk) continue;

          // Cek detail primer per folder
          const detailPrimer = cekDetailPrimer(stambuk);
          for (const namaFolder of DAFTAR_FOLDER_PRIMER) {
            if (detailPrimer[namaFolder]) {
              primerCount[namaFolder].ada++;
            } else {
              primerCount[namaFolder].kosong++;
            }
          }

          // Cek sekunder lengkap/kurang
          if (cekSekunderLengkap(stambuk)) {
            sekunderLengkapCount++;
          } else {
            sekunderKurangCount++;
          }
        }

        // ═══ FORMAT OUTPUT v11: Detail Primer + Ringkasan Sekunder ═══
        const labelTarget = isSemua ? 'SELURUH SANTRI' : targetKelas.toUpperCase();
        const totalAnak = santriList.length;

        // Bangun baris detail primer
        const primerLines = DAFTAR_FOLDER_PRIMER.map((namaFolder) => {
          const label = LABEL_PRIMER[namaFolder] || namaFolder;
          const ada = primerCount[namaFolder].ada;
          const kosong = primerCount[namaFolder].kosong;
          return `┣⌬ *${label}* : ✅ Ada ${ada} | ❌ Kosong ${kosong}`;
        }).join('\n');

        const outputText =
          `📊 *REKAP BERKAS ${isSemua ? '' : 'KELAS: '}${labelTarget}* (Total ${totalAnak} Anak)\n` +
          ` \n` +
          `┏━━━『 🗂️ *DETAIL BERKAS PRIMER* 』\n` +
          `${primerLines}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          ` \n` +
          `┏━━━『 📂 *STATUS BERKAS SEKUNDER* 』\n` +
          `┣⌬ ✅ Lengkap Keseluruhan : ${sekunderLengkapCount} Anak\n` +
          `┣⌬ ❌ Ada yang Kurang     : ${sekunderKurangCount} Anak\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `\n🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

        clearRekapBerkasSession(sender);

        await sock.sendMessage(remoteJid, {
          react: { text: '✅', key: message.key },
        });

        await sock.sendMessage(
          remoteJid,
          { text: outputText },
          { quoted: message }
        );

        return false;
      } catch (err) {
        clearRekapBerkasSession(sender);
        console.error('[GATEWAY-REKAP] Error:', err.message);
        await sock.sendMessage(
          remoteJid,
          { text: `❌ _Terjadi kesalahan sistem: ${err.message}_` },
          { quoted: message }
        );
        return false;
      }
    }

    clearRekapBerkasSession(sender);
    return true;
  }

  // ══════════════════════════════════════════════════
  //  PRIORITAS -3: CEK LIHAT BERKAS SESSION
  //  (terpisah total dari session lainnya)
  // ══════════════════════════════════════════════════
  const lihatSess = getLihatBerkasSession(sender);
  if (lihatSess) {
    if (command && command !== false && !['lihatberkas'].includes(command)) {
      console.log(`[GATEWAY-LIHAT] ⚠️ LihatBerkas session dibatalkan karena command: ${command}`);
      clearLihatBerkasSession(sender);
      return true;
    }

    if (command && command !== false && ['lihatberkas'].includes(command)) {
      clearLihatBerkasSession(sender);
      return true;
    }

    const rawText = (fullText || content || '').trim();
    const text = deepSanitize(rawText);

    console.log(`[LIHAT] step handler aktif untuk sender — input diproses`);

    if (!text) return true;

    // ── LIHAT STEP 1: Menunggu Password Staf ──
    if (lihatSess.step === 'await_password') {
      const cleanPassword = deepSanitize(text).toLowerCase();

      console.log(`[GATEWAY-LIHAT] 🔑 Password input: "${cleanPassword}" (len=${cleanPassword.length})`);

      if (cleanPassword !== String(getStaffPassword()).toLowerCase()) {
        clearLihatBerkasSession(sender);
        await sock.sendMessage(remoteJid, {
          react: { text: '🚫', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          { text: '🚫 *Akses Ditolak!*\n\n_Password Staf salah. Session dihapus._' },
          { quoted: message }
        );
        return false;
      }

      // Password benar! Lanjut ke step minta Stambuk # Kode Folder
      setLihatBerkasSession(sender, {
        step: 'await_input',
        authenticated: true,
      });

      console.log(`[GATEWAY-LIHAT] ✅ Password benar. Menunggu input Stambuk # Kode Folder...`);

      await sock.sendMessage(remoteJid, {
        react: { text: '🔓', key: message.key },
      });

      const folderList = Object.entries(KODE_FOLDER_MAP)
        .map(([kode, nama]) => `┃  ${kode} → ${nama}`)
        .join('\n');

      await sock.sendMessage(
        remoteJid,
        {
          text:
            '🔓 *Akses Staf Diterima!*\n\n' +
            '📝 Masukkan *Stambuk # Kode Folder*:\n\n' +
            '_Contoh: 140123 # B_\n\n' +
            '📂 *Daftar Kode Folder:*\n' +
            `${folderList}\n\n` +
            '_⏳ Session berlaku 3 menit._',
        },
        { quoted: message }
      );
      return false;
    }

    // ── LIHAT STEP 2: Menunggu Input Stambuk # Kode Folder ──
    if (lihatSess.step === 'await_input' && lihatSess.authenticated) {
      // Parse input: STAMBUK # KODE
      const parts = text.split('#').map((s) => s.trim());

      if (parts.length < 2 || !parts[0] || !parts[1]) {
        await sock.sendMessage(
          remoteJid,
          {
            text: '❌ _Format salah!_\n\n_Gunakan format: STAMBUK # KODE_FOLDER_\n_Contoh: 140123 # B_\n\nSilakan coba lagi:',
          },
          { quoted: message }
        );
        return false;
      }

      const inputStambuk = sanitizeStambuk(parts[0]);
      const inputKode = parts[1].toUpperCase().trim();

      console.log(`[GATEWAY-LIHAT] 📂 Input: Stambuk="${inputStambuk}", Kode="${inputKode}"`);

      // Validasi kode folder
      if (!KODE_FOLDER_MAP[inputKode]) {
        await sock.sendMessage(
          remoteJid,
          {
            text: `❌ _Kode folder "${inputKode}" tidak valid!_\n\n_Gunakan kode A sampai I._\n_Contoh: 140123 # B_\n\nSilakan coba lagi:`,
          },
          { quoted: message }
        );
        return false;
      }

      if (!inputStambuk || isNaN(parseInt(inputStambuk, 10))) {
        await sock.sendMessage(
          remoteJid,
          {
            text: '❌ _Nomor Stambuk tidak valid!_\n\n_Masukkan angka yang benar._\n_Contoh: 140123 # B_\n\nSilakan coba lagi:',
          },
          { quoted: message }
        );
        return false;
      }

      // Loading
      await sock.sendMessage(remoteJid, {
        react: { text: '⏳', key: message.key },
      });

      const namaFolder = KODE_FOLDER_MAP[inputKode];

      // Coba cari file dengan berbagai ekstensi
      const result = cekFileExist(namaFolder, inputStambuk);

      clearLihatBerkasSession(sender);

      if (!result.found) {
        await sock.sendMessage(remoteJid, {
          react: { text: '❌', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          {
            text: `❌ *File tidak ditemukan*\n\nStambuk: *${inputStambuk}*\nFolder: *${namaFolder}*\n\n_Tidak ada file .jpg, .jpeg, .png, atau .pdf di folder ini._`,
          },
          { quoted: message }
        );
        return false;
      }

      // File ditemukan!
      console.log(`[GATEWAY-LIHAT] ✅ File ditemukan: ${result.filePath} (${result.ext})`);

      await sock.sendMessage(remoteJid, {
        react: { text: '✅', key: message.key },
      });

      const captionText = `📂 *${namaFolder}*\n👤 Stambuk: *${inputStambuk}*\nFormat: ${result.ext}\n\n🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

      if (result.ext === '.pdf') {
        // Kirim sebagai document
        await sock.sendMessage(
          remoteJid,
          {
            document: { url: result.filePath },
            mimetype: 'application/pdf',
            fileName: `${inputStambuk}_${inputKode}${result.ext}`,
            caption: captionText,
          },
          { quoted: message }
        );
      } else {
        // Kirim sebagai image (.jpg, .jpeg, .png)
        await sock.sendMessage(
          remoteJid,
          {
            image: { url: result.filePath },
            caption: captionText,
          },
          { quoted: message }
        );
      }

      return false;
    }

    clearLihatBerkasSession(sender);
    return true;
  }

  // ══════════════════════════════════════════════════
  //  PRIORITAS -2: CEK EKSPOR FULL SESSION DULU
  //  (terpisah total dari user session & admin session)
  // ══════════════════════════════════════════════════
  const eksporSess = getEksporSession(sender);
  if (eksporSess) {
    // Jika user mengetik command lain saat dalam ekspor session, batalkan
    if (command && command !== false && !['eksporfull', 'exportfull'].includes(command)) {
      console.log(`[GATEWAY-EKSPOR] ⚠️ EksporFull session dibatalkan karena command: ${command}`);
      clearEksporSession(sender);
      return true;
    }

    // Jika user mengetik .eksporfull lagi, biarkan plugin handle ulang
    if (command && command !== false && ['eksporfull', 'exportfull'].includes(command)) {
      clearEksporSession(sender);
      return true;
    }

    const rawText = (fullText || content || '').trim();
    const text = deepSanitize(rawText);

    console.log(`\n[🟣 GATEWAY-EKSPOR DEBUG] ──────────────────────`);
    console.log(`│ Sender    : ${sender}`);
    console.log(`│ Step      : ${eksporSess.step}`);
    console.log(`│ Mode      : ${eksporSess.mode || 'full'}`);
    console.log(`│ Kolom     : ${eksporSess.kolom || '(kosong)'}`);
    console.log(`│ Nilai     : ${eksporSess.nilai || '(kosong)'}`);
    console.log(`│ IsSemua   : ${Boolean(eksporSess.isSemua)}`);
    console.log(`│ Raw text  : "${rawText}" (len=${rawText.length})`);
    console.log(`│ Clean text: "${text}" (len=${text.length})`);
    console.log(`[──────────────────────────────────────────────]\n`);

    if (!text) return true;

    if (eksporSess.step === 'await_password') {
      const cleanPassword = deepSanitize(text).toLowerCase();

      console.log(`[GATEWAY-EKSPOR] 🔑 Password input: "${cleanPassword}" (len=${cleanPassword.length})`);

      if (cleanPassword !== String(getStaffPassword()).toLowerCase()) {
        clearEksporSession(sender);

        await sock.sendMessage(remoteJid, {
          react: { text: '🚫', key: message.key },
        });

        await sock.sendMessage(
          remoteJid,
          {
            text: '🚫 *Akses Ditolak!*\n\n_Password Staf salah. Session dihapus._',
          },
          { quoted: message }
        );

        return false;
      }

      await sock.sendMessage(remoteJid, {
        react: { text: '⏳', key: message.key },
      });

      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🔓 *Akses Staf Diterima!*\n\n` +
            `⏳ Sedang menyiapkan ekspor FULL...\n` +
            `_Mohon tunggu, proses ini mungkin memakan waktu._`,
        },
        { quoted: message }
      );

      try {
        await processEksporFullAuthorized(sock, messageInfo, eksporSess);
        clearEksporSession(sender);
        return false;
      } catch (err) {
        clearEksporSession(sender);
        console.error('[GATEWAY-EKSPOR] Error:', err.message);

        await sock.sendMessage(
          remoteJid,
          {
            text: `❌ _Terjadi kesalahan sistem: ${err.message}_`,
          },
          { quoted: message }
        );

        return false;
      }
    }

    clearEksporSession(sender);
    return true;
  }

  // ══════════════════════════════════════════════════
  //  PRIORITAS -1: CEK AUDIT BERKAS SESSION DULU
  //  (terpisah total dari session lainnya)
  // ══════════════════════════════════════════════════
  const auditSess = getAuditBerkasSession(sender);
  if (auditSess) {
    // Jika user mengetik command lain saat dalam audit session, batalkan
    if (command && command !== false && !['auditberkas'].includes(command)) {
      console.log(`[GATEWAY-AUDIT] ⚠️ AuditBerkas session dibatalkan karena command: ${command}`);
      clearAuditBerkasSession(sender);
      return true; // Lanjut ke plugin
    }

    // Jika user mengetik .auditberkas lagi, biarkan plugin handle ulang
    if (command && command !== false && ['auditberkas'].includes(command)) {
      clearAuditBerkasSession(sender);
      return true;
    }

    // Ambil teks dan sanitasi
    const rawText = (fullText || content || '').trim();
    const text = deepSanitize(rawText);

    console.log(`\n[🟠 GATEWAY-AUDIT DEBUG] ──────────────────────`);
    console.log(`│ Sender    : ${sender}`);
    console.log(`│ Step      : ${auditSess.step}`);
    console.log(`│ Kelas     : ${auditSess.kelas || '(belum set)'}`);
    console.log(`│ Raw text  : "${rawText}" (len=${rawText.length})`);
    console.log(`│ Clean text: "${text}" (len=${text.length})`);
    console.log(`[──────────────────────────────────────────────]\n`);

    if (!text) return true;

    // ── AUDIT STEP 1: Menunggu Password Staf ──
    if (auditSess.step === 'await_password') {
      // Sanitasi password
      const cleanPassword = deepSanitize(text).toLowerCase();

      console.log(`[GATEWAY-AUDIT] 🔑 Password input: "${cleanPassword}" (len=${cleanPassword.length})`);

      if (cleanPassword !== String(getStaffPassword()).toLowerCase()) {
        clearAuditBerkasSession(sender);
        await sock.sendMessage(remoteJid, {
          react: { text: '🚫', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          {
            text: '🚫 *Akses Ditolak!*\n\n_Password Staf salah. Session dihapus._',
          },
          { quoted: message }
        );
        return false;
      }

      // Password benar! Langsung proses audit karena kelas sudah tersimpan
      const kelasTarget = auditSess.kelas;
      const isAllMode = !!auditSess.isAll; // 🆕 v12

      console.log(
        `[GATEWAY-AUDIT] ✅ Password benar. Memproses audit untuk: "${kelasTarget}" ` +
        `(mode: ${isAllMode ? 'ALL' : 'PER-KELAS'})`
      );

      await sock.sendMessage(remoteJid, {
        react: { text: '⏳', key: message.key },
      });

      await sock.sendMessage(
        remoteJid,
        {
          text: isAllMode
            ? `🔓 *Akses Staf Diterima!*\n\n⏳ Sedang mengaudit berkas *SELURUH SANTRI AKTIF*...\n_Proses ini mungkin memakan waktu beberapa menit._\n_Hasil akan dikirim sebagai file Excel._`
            : `🔓 *Akses Staf Diterima!*\n\n⏳ Sedang mengaudit berkas kelas *${kelasTarget}*...\n_Mohon tunggu, proses ini mungkin memakan waktu._`,
        },
        { quoted: message }
      );

      try {
        // ═══ QUERY: Ambil santri sesuai mode ═══
        let santriList;
        if (isAllMode) {
          santriList = await getAllSantriAktif();
        } else {
          santriList = await getSantriByKelas(kelasTarget);
        }

        if (!santriList || santriList.length === 0) {
          clearAuditBerkasSession(sender);
          await sock.sendMessage(remoteJid, {
            react: { text: '❌', key: message.key },
          });
          await sock.sendMessage(
            remoteJid,
            {
              text: isAllMode
                ? `❌ *Tidak ada santri aktif di database.*`
                : `❌ *Tidak ada santri aktif di kelas "${kelasTarget}".*\n\n_Pastikan nama kelas sesuai dengan yang ada di database._\n_Contoh: 3 Int B, 4 KMI A, 1A_`,
            },
            { quoted: message }
          );
          return false;
        }

        // ═══ LOOPING: Cek kelengkapan berkas per santri ═══
        const santriTidakLengkap = [];
        let totalLengkap = 0;
        // 🆕 v12: simpan per-kelas untuk mode ALL
        const perKelas = {}; // { kelas: { total, lengkap, kurang: [...] } }

        for (const santri of santriList) {
          const stambuk = String(santri.Stambuk || '').trim();
          const nama = santri['Nama Lengkap'] || '(tanpa nama)';
          const kelasSantri = String(santri.Kelas || '(Tanpa Kelas)').trim();

          if (!stambuk) continue;

          const folderKurang = getFolderKurang(stambuk);

          if (!perKelas[kelasSantri]) {
            perKelas[kelasSantri] = { total: 0, lengkap: 0, kurang: [] };
          }
          perKelas[kelasSantri].total++;

          if (folderKurang.length > 0) {
            const data = { nama, stambuk, kelas: kelasSantri, folderKurang };
            santriTidakLengkap.push(data);
            perKelas[kelasSantri].kurang.push(data);
          } else {
            totalLengkap++;
            perKelas[kelasSantri].lengkap++;
          }
        }

        // ═══════════════════════════════════════════════
        //  🆕 v12: MODE ALL — kirim ringkasan per kelas + Excel
        // ═══════════════════════════════════════════════
        if (isAllMode) {
          // Ringkasan per kelas
          const kelasNames = Object.keys(perKelas).sort();
          let ringkasan =
            `┏━━━『 🌐 *AUDIT BERKAS — SELURUH SANTRI* 』━━━\n` +
            `┃\n` +
            `┃ 📊 Total Santri: *${santriList.length}*\n` +
            `┃ ✅ Lengkap: *${totalLengkap}*\n` +
            `┃ ❌ Kurang: *${santriTidakLengkap.length}*\n` +
            `┃\n` +
            `┣━━━『 *RINGKASAN PER KELAS* 』━━━\n` +
            `┃\n`;

          for (const kls of kelasNames) {
            const stat = perKelas[kls];
            const persen = stat.total > 0 ? Math.round((stat.lengkap / stat.total) * 100) : 0;
            const icon = persen === 100 ? '🟢' : persen >= 70 ? '🟡' : '🔴';
            ringkasan += `┣⌬ ${icon} *${kls}* — ${stat.lengkap}/${stat.total} (${persen}%)\n`;
          }

          ringkasan +=
            `┃\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
            (santriTidakLengkap.length > 0
              ? `📎 _File Excel detail dikirim setelah ini..._`
              : `🎉 _Seluruh santri memiliki berkas LENGKAP!_`) +
            `\n\n🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

          // Kirim ringkasan dalam beberapa chunk (sebab daftar kelas bisa banyak)
          const ringkasanChunks = chunkText(ringkasan, 3800);
          for (let i = 0; i < ringkasanChunks.length; i++) {
            const head = ringkasanChunks.length > 1 ? `📄 *Halaman ${i + 1}/${ringkasanChunks.length}*\n\n` : '';
            await sock.sendMessage(
              remoteJid,
              { text: head + ringkasanChunks[i] },
              i === 0 ? { quoted: message } : {}
            );
          }

          // Kirim file Excel jika ada yang kurang
          if (santriTidakLengkap.length > 0) {
            try {
              // ──────────────────────────────────────────────────
              // 🛠️ FIX v13.1 (Bug #1):
              //  - Hapus dynamic import path/fs (top-level sudah
              //    import keduanya). Dynamic import + .default
              //    pada built-in modules di ESM kadang membuat
              //    `pathMod.join` tidak terbaca → terjadi shadowing
              //    yang men-trigger error "process.cwd is not a
              //    function" pada beberapa versi Node.
              //  - Pakai helper `safeCwd()` agar resilient walau
              //    process.cwd entah kenapa ter-shadow.
              // ──────────────────────────────────────────────────
              const xlsxMod = await import('xlsx');
              const XLSX = xlsxMod.default || xlsxMod;

              const rows = santriTidakLengkap.map((s, idx) => ({
                No: idx + 1,
                Kelas: s.kelas,
                Stambuk: s.stambuk,
                'Nama Lengkap': s.nama,
                'Jumlah Folder Kurang': s.folderKurang.length,
                'Detail Folder Kurang': s.folderKurang.join(' | '),
              }));

              const ws = XLSX.utils.json_to_sheet(rows);
              ws['!cols'] = [
                { wch: 5 }, { wch: 18 }, { wch: 12 },
                { wch: 32 }, { wch: 8 }, { wch: 60 },
              ];
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'AuditBerkas-ALL');

              // 🛠️ v13.2: pakai safeTmpDir() yang sudah
              // memvalidasi path & write-access. Mencegah error
              // mkdir 'D:\D:\PUSAT%20DATA%202026\...\tmp'.
              const tmpDir = safeTmpDir();
              const fname = `AuditBerkas-ALL-${Date.now()}.xlsx`;
              const fpath = path.join(tmpDir, fname);
              console.log(`[GATEWAY-AUDIT-ALL] 📁 Excel akan ditulis ke: ${fpath}`);
              XLSX.writeFile(wb, fpath);

              await sock.sendMessage(
                remoteJid,
                {
                  document: { url: fpath },
                  fileName: fname,
                  mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  caption:
                    `📎 *AUDIT BERKAS — SELURUH SANTRI*\n\n` +
                    `Total santri kurang berkas: *${santriTidakLengkap.length}*\n` +
                    `Tersebar di *${kelasNames.length}* kelas.\n\n` +
                    `_File ini bisa dibuka pakai Excel/Google Sheet._`,
                },
                { quoted: message }
              );

              // Hapus file temp setelah dikirim (delay 30 detik untuk pastikan terkirim)
              setTimeout(() => {
                try { fs.unlinkSync(fpath); } catch (_) {}
              }, 30000);
            } catch (xlsErr) {
              console.error('[GATEWAY-AUDIT-ALL] Gagal generate Excel:', xlsErr && xlsErr.message ? xlsErr.message : xlsErr);
              await sock.sendMessage(
                remoteJid,
                { text: `⚠️ _Gagal generate file Excel: ${xlsErr && xlsErr.message ? xlsErr.message : 'Unknown error'}_\n_Silakan cek server log untuk detail._` },
                { quoted: message }
              );
            }
          }

          clearAuditBerkasSession(sender);
          await sock.sendMessage(remoteJid, {
            react: { text: '✅', key: message.key },
          });
          return false;
        }

        // ═══════════════════════════════════════════════
        //  MODE PER-KELAS (perilaku lama)
        // ═══════════════════════════════════════════════
        let outputText = '';

        if (santriTidakLengkap.length === 0) {
          outputText =
            `✅ *AUDIT BERKAS KELAS ${kelasTarget.toUpperCase()}*\n\n` +
            `🎉 *Selamat!* Seluruh *${santriList.length}* santri di kelas ini memiliki berkas yang LENGKAP!\n\n` +
            `📊 Total Dicek: ${santriList.length} santri\n` +
            `✅ Lengkap: ${santriList.length}\n` +
            `❌ Kurang: 0`;
        } else {
          const headerText =
            `┏━━━『 📋 *AUDIT BERKAS: ${kelasTarget.toUpperCase()}* 』━━━\n` +
            `┃\n` +
            `┃ 📊 Total: ${santriList.length} santri\n` +
            `┃ ✅ Lengkap: ${totalLengkap}\n` +
            `┃ ❌ Tidak Lengkap: ${santriTidakLengkap.length}\n` +
            `┃\n` +
            `┣━━━『 *DAFTAR BERKAS KURANG* 』━━━\n` +
            `┃\n`;

          const bodyLines = santriTidakLengkap.map((s, idx) => {
            const kurangStr = s.folderKurang.join(', ');
            return `┣⌬ ${idx + 1}. *${s.nama}* (${s.stambuk})\n┃     ↳ Kurang: _${kurangStr}_`;
          });

          const footerText =
            `┃\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
            `🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

          outputText = headerText + bodyLines.join('\n') + '\n' + footerText;
        }

        // ═══ CHUNKING: Pecah pesan jika > 4000 karakter ═══
        clearAuditBerkasSession(sender);

        await sock.sendMessage(remoteJid, {
          react: { text: '✅', key: message.key },
        });

        const chunks = chunkText(outputText, 3800);
        for (let i = 0; i < chunks.length; i++) {
          const chunkHeader = chunks.length > 1 ? `📄 *Halaman ${i + 1}/${chunks.length}*\n\n` : '';
          await sock.sendMessage(
            remoteJid,
            { text: chunkHeader + chunks[i] },
            i === 0 ? { quoted: message } : {}
          );
        }

        return false;
      } catch (err) {
        clearAuditBerkasSession(sender);
        console.error('[GATEWAY-AUDIT] Error:', err.message);
        await sock.sendMessage(
          remoteJid,
          { text: `❌ _Terjadi kesalahan sistem: ${err.message}_` },
          { quoted: message }
        );
        return false;
      }
    }

    // Audit session ada tapi step tidak dikenali, hapus
    clearAuditBerkasSession(sender);
    return true;
  }


  // ══════════════════════════════════════════════════
  //  PRIORITAS 0: CEK EDIT-DATA SESSION DULU
  //  (fitur edit langsung seperti MS Access via WA)
  // ══════════════════════════════════════════════════
  const editDataSess = getEditDataSession(sender);
  if (editDataSess) {
    if (command && command !== false && !['editdata', 'editsantri', 'editguru'].includes(command)) {
      console.log(`[GATEWAY-EDITDATA] ⚠️ Session edit data dibatalkan karena command: ${command}`);
      clearEditDataSession(sender);
      return true;
    }

    if (command && command !== false && ['editdata', 'editsantri', 'editguru'].includes(command)) {
      clearEditDataSession(sender);
      return true;
    }

    const rawText = (fullText || content || '').trim();
    const text = deepSanitize(rawText);

    // ★ v15.1: log ringkas 1 baris (menggantikan blok debug box 6 baris)
    console.log(`[EDITDATA] step=${editDataSess.step} from=${sender.split('@')[0]} input="${rawText}"`);

    if (!text) return true;

    if (editDataSess.step === 'await_password') {
      const cleanPassword = deepSanitize(text).toLowerCase();

      if (cleanPassword !== String(getStaffPassword()).toLowerCase()) {
        clearEditDataSession(sender);
        await sock.sendMessage(remoteJid, {
          react: { text: '🚫', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          {
            text: '🚫 *Akses Ditolak!*\n\n_Password Staf salah. Session edit data dihapus._',
          },
          { quoted: message }
        );
        return false;
      }

      if (editDataSess.mode === 'quick' && editDataSess.quickPayload) {
        await sock.sendMessage(remoteJid, {
          react: { text: '⏳', key: message.key },
        });

        try {
          const result = await updateRecordField(
            editDataSess.quickPayload.dbType,
            editDataSess.quickPayload.stambuk,
            editDataSess.quickPayload.fieldInput,
            editDataSess.quickPayload.newValueRaw,
            `staff:${sender}`,
          );

          clearEditDataSession(sender);

          await sock.sendMessage(remoteJid, {
            react: { text: '✅', key: message.key },
          });
          await sock.sendMessage(
            remoteJid,
            {
              text:
                `✅ *EDIT BERHASIL*\n\n` +
                `Database : ${result.dbLabel}\n` +
                `Stambuk  : ${result.stambuk}\n` +
                `Kolom    : ${result.field}\n` +
                `Sebelum  : ${result.beforeDisplay}\n` +
                `Sesudah  : ${result.afterDisplay}\n\n` +
                `_Perubahan sudah tersimpan ke database._`,
            },
            { quoted: message }
          );
          return false;
        } catch (err) {
          clearEditDataSession(sender);
          console.error('[GATEWAY-EDITDATA] Quick edit gagal:', err.message);
          await sock.sendMessage(remoteJid, {
            react: { text: '❌', key: message.key },
          });
          await sock.sendMessage(
            remoteJid,
            {
              text: `❌ *EDIT GAGAL*\n\n${err.message}`,
            },
            { quoted: message }
          );
          return false;
        }
      }

      setEditDataSession(sender, {
        ...editDataSess,
        step: 'await_db_type',
        authenticated: true,
      });

      await sock.sendMessage(remoteJid, {
        react: { text: '🔓', key: message.key },
      });
      await sock.sendMessage(
        remoteJid,
        {
          text:
            '🔓 *Akses Edit Data Diterima!*\n\n' +
            'Pilih database yang ingin diedit:\n' +
            '1. *Santri*\n' +
            '2. *Guru*\n\n' +
            '_Balas dengan: 1 / 2 / santri / guru_',
        },
        { quoted: message }
      );
      return false;
    }

    if (editDataSess.step === 'await_db_type' && editDataSess.authenticated) {
      const dbType = parseDbTypeInput(text);
      if (!dbType) {
        await sock.sendMessage(
          remoteJid,
          {
            text: '❌ _Pilihan database tidak dikenali._\n\nBalas dengan: *1 / 2 / santri / guru*',
          },
          { quoted: message }
        );
        return false;
      }

      setEditDataSession(sender, {
        ...editDataSess,
        step: 'await_stambuk',
        authenticated: true,
        dbType,
      });

      await sock.sendMessage(remoteJid, {
        react: { text: '🗂️', key: message.key },
      });
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `🗂️ *${getDbTypeLabel(dbType)} dipilih*\n\n` +
            `Masukkan *Nomor Stambuk* yang ingin diedit.\n\n` +
            `_Contoh: 25001_`,
        },
        { quoted: message }
      );
      return false;
    }

    if (editDataSess.step === 'await_stambuk' && editDataSess.authenticated) {
      const cleanStambuk = sanitizeStambuk(text);
      const stambukNum = parseInt(cleanStambuk, 10);

      if (isNaN(stambukNum)) {
        await sock.sendMessage(
          remoteJid,
          {
            text: '❌ _Nomor Stambuk tidak valid._\n\nSilakan kirim ulang nomor Stambuk yang benar.',
          },
          { quoted: message }
        );
        return false;
      }

      await sock.sendMessage(remoteJid, {
        react: { text: '⏳', key: message.key },
      });

      try {
        const record = await getEditableRecordByStambuk(editDataSess.dbType, cleanStambuk);
        if (!record) {
          await sock.sendMessage(
            remoteJid,
            {
              text: `❌ *Stambuk ${cleanStambuk} tidak ditemukan di ${getDbTypeLabel(editDataSess.dbType)}.*\n\nSilakan kirim Stambuk lain.`,
            },
            { quoted: message }
          );
          return false;
        }

        const summary = formatEditableRecordSummary(editDataSess.dbType, record);
        const fieldText = formatEditableFieldList(record);
        const intro =
          `${summary}\n\n` +
          `🧩 *DAFTAR KOLOM YANG BISA DIEDIT*\n` +
          `_Kirim nama kolom persis, nama kolom yang mirip, atau nomor urut kolom._\n\n` +
          fieldText;

        setEditDataSession(sender, {
          ...editDataSess,
          step: 'await_field',
          authenticated: true,
          stambuk: cleanStambuk,
          dbType: editDataSess.dbType,
        });

        const chunks = chunkText(intro, 3500);
        for (let i = 0; i < chunks.length; i++) {
          await sock.sendMessage(
            remoteJid,
            { text: chunks[i] },
            i === 0 ? { quoted: message } : undefined,
          );
        }
        await sock.sendMessage(
          remoteJid,
          {
            text: '✏️ Sekarang kirim *nama kolom* atau *nomor kolom* yang ingin diedit.',
          },
          { quoted: message }
        );
        return false;
      } catch (err) {
        console.error('[GATEWAY-EDITDATA] Gagal mengambil record:', err.message);
        await sock.sendMessage(
          remoteJid,
          {
            text: `❌ _Terjadi kesalahan saat membaca data: ${err.message}_`,
          },
          { quoted: message }
        );
        return false;
      }
    }

    if (editDataSess.step === 'await_field' && editDataSess.authenticated) {
      try {
        const record = await getEditableRecordByStambuk(editDataSess.dbType, editDataSess.stambuk);
        if (!record) {
          clearEditDataSession(sender);
          await sock.sendMessage(
            remoteJid,
            {
              text: '❌ _Data target tidak ditemukan lagi. Session edit data ditutup._',
            },
            { quoted: message }
          );
          return false;
        }

        if (['list', 'kolom', 'fields', 'daftarkolom'].includes(text.toLowerCase())) {
          const chunks = chunkText(formatEditableFieldList(record), 3500);
          for (let i = 0; i < chunks.length; i++) {
            await sock.sendMessage(
              remoteJid,
              { text: chunks[i] },
              i === 0 ? { quoted: message } : undefined,
            );
          }
          return false;
        }

        const resolvedField = resolveEditableField(record, text);
        if (!resolvedField) {
          const suggestions = getFieldSuggestions(record, text, 8);
          await sock.sendMessage(
            remoteJid,
            {
              text:
                `❌ *Kolom tidak ditemukan.*\n\n` +
                (suggestions.length > 0
                  ? `Saran kolom terdekat:\n• ${suggestions.join('\n• ')}\n\n`
                  : '') +
                `_Kirim nama kolom lain, nomor kolom, atau ketik_ *list* _untuk menampilkan daftar kolom lagi._`,
            },
            { quoted: message }
          );
          return false;
        }

        setEditDataSession(sender, {
          ...editDataSess,
          step: 'await_value',
          authenticated: true,
          selectedField: resolvedField,
        });

        await sock.sendMessage(remoteJid, {
          react: { text: '✏️', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          {
            text:
              `✏️ *Kolom dipilih:* ${resolvedField}\n` +
              `📌 *Nilai saat ini:* ${formatEditValue(record[resolvedField])}\n\n` +
              `Sekarang kirim *nilai baru*.\n` +
              `Jika ingin mengosongkan isi kolom, kirim: *[KOSONGKAN]*`,
          },
          { quoted: message }
        );
        return false;
      } catch (err) {
        console.error('[GATEWAY-EDITDATA] Gagal memilih field:', err.message);
        await sock.sendMessage(
          remoteJid,
          {
            text: `❌ _Terjadi kesalahan saat memproses kolom: ${err.message}_`,
          },
          { quoted: message }
        );
        return false;
      }
    }

    if (editDataSess.step === 'await_value' && editDataSess.authenticated) {
      try {
        const record = await getEditableRecordByStambuk(editDataSess.dbType, editDataSess.stambuk);
        if (!record) {
          clearEditDataSession(sender);
          await sock.sendMessage(
            remoteJid,
            { text: '❌ _Data target tidak ditemukan lagi. Session edit data ditutup._' },
            { quoted: message }
          );
          return false;
        }

        const field = editDataSess.selectedField;
        const preview = inferAndNormalizeNewValue(text, record[field]);

        setEditDataSession(sender, {
          ...editDataSess,
          step: 'await_confirm',
          authenticated: true,
          pendingValueRaw: text,
        });

        await sock.sendMessage(remoteJid, {
          react: { text: '🧾', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          {
            text:
              `🧾 *KONFIRMASI PERUBAHAN*\n\n` +
              `Database : ${getDbTypeLabel(editDataSess.dbType)}\n` +
              `Stambuk  : ${editDataSess.stambuk}\n` +
              `Kolom    : ${field}\n` +
              `Sebelum  : ${formatEditValue(record[field])}\n` +
              `Sesudah  : ${preview.display}\n\n` +
              `Ketik *YA* untuk menyimpan, atau *BATAL* untuk membatalkan.`,
          },
          { quoted: message }
        );
        return false;
      } catch (err) {
        await sock.sendMessage(
          remoteJid,
          {
            text: `❌ *Nilai tidak valid*\n\n${err.message}`,
          },
          { quoted: message }
        );
        return false;
      }
    }

    if (editDataSess.step === 'await_confirm' && editDataSess.authenticated) {
      const lower = text.toLowerCase();

      if (['batal', 'cancel', 'tidak', 'no', 'n'].includes(lower)) {
        clearEditDataSession(sender);
        await sock.sendMessage(remoteJid, {
          react: { text: '🛑', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          {
            text: '🛑 *Perubahan dibatalkan.*\n\nSession edit data ditutup.',
          },
          { quoted: message }
        );
        return false;
      }

      if (!['ya', 'y', 'yes', 'simpan', 'ok'].includes(lower)) {
        await sock.sendMessage(
          remoteJid,
          {
            text: '❓ _Balas dengan_ *YA* _untuk menyimpan atau_ *BATAL* _untuk membatalkan._',
          },
          { quoted: message }
        );
        return false;
      }

      await sock.sendMessage(remoteJid, {
        react: { text: '⏳', key: message.key },
      });

      try {
        const result = await updateRecordField(
          editDataSess.dbType,
          editDataSess.stambuk,
          editDataSess.selectedField,
          editDataSess.pendingValueRaw,
          `${editDataSess.accessLevel || 'staff'}:${sender}`,
        );

        clearEditDataSession(sender);

        await sock.sendMessage(remoteJid, {
          react: { text: '✅', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          {
            text:
              `✅ *EDIT BERHASIL DISIMPAN*\n\n` +
              `Database : ${result.dbLabel}\n` +
              `Stambuk  : ${result.stambuk}\n` +
              `Kolom    : ${result.field}\n` +
              `Sebelum  : ${result.beforeDisplay}\n` +
              `Sesudah  : ${result.afterDisplay}\n\n` +
              `_Perubahan sudah masuk ke database._`,
          },
          { quoted: message }
        );
        return false;
      } catch (err) {
        clearEditDataSession(sender);
        console.error('[GATEWAY-EDITDATA] Simpan edit gagal:', err.message);
        await sock.sendMessage(remoteJid, {
          react: { text: '❌', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          {
            text: `❌ *Gagal menyimpan perubahan*\n\n${err.message}`,
          },
          { quoted: message }
        );
        return false;
      }
    }

    clearEditDataSession(sender);
    return true;
  }

  // ══════════════════════════════════════════════════
  //  PRIORITAS 0: CEK CEK-SANTRI SESSION DULU
  //  (terpisah total dari user session & admin session)
  // ══════════════════════════════════════════════════
  const cekSantriSess = getCekSantriSession(sender);
  if (cekSantriSess) {
    // Jika user mengetik command lain saat dalam ceksantri session, batalkan
    if (command && command !== false && !['ceksantri'].includes(command)) {
      console.log(`[GATEWAY-CEKSANTRI] ⚠️ CekSantri session dibatalkan karena command: ${command}`);
      clearCekSantriSession(sender);
      return true; // Lanjut ke plugin
    }

    // Jika user mengetik .ceksantri lagi, biarkan plugin handle ulang
    if (command && command !== false && ['ceksantri'].includes(command)) {
      clearCekSantriSession(sender);
      return true;
    }

    // Ambil teks dan sanitasi
    const rawText = (fullText || content || '').trim();
    const text = deepSanitize(rawText);

    console.log(`[CEKSANTRI] step handler aktif untuk sender — input diproses`);

    if (!text) return true;

    // ── CEKSANTRI STEP 1: Menunggu Password Staf ──
    if (cekSantriSess.step === 'await_password') {
      // Sanitasi password — strip semua kecuali alfanumerik
      const cleanPassword = deepSanitize(text).toLowerCase();

      console.log(`[GATEWAY-CEKSANTRI] 🔑 Password input: "${cleanPassword}" (len=${cleanPassword.length})`);

      if (cleanPassword !== String(getStaffPassword()).toLowerCase()) {
        clearCekSantriSession(sender);
        await sock.sendMessage(remoteJid, {
          react: { text: '🚫', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          {
            text: '🚫 *Akses Ditolak!*\n\n_Password Staf salah. Session dihapus._',
          },
          { quoted: message }
        );
        return false;
      }

      // Password benar! Lanjut ke step minta stambuk santri
      setCekSantriSession(sender, {
        step: 'await_stambuk',
        authenticated: true,
      });

      console.log(`[GATEWAY-CEKSANTRI] ✅ Password benar. Menunggu input Stambuk Santri...`);

      await sock.sendMessage(remoteJid, {
        react: { text: '🔓', key: message.key },
      });
      await sock.sendMessage(
        remoteJid,
        {
          text:
            '🔓 *Akses Staf Diterima!*\n\n' +
            '📝 Masukkan *Nomor Stambuk Santri* yang ingin dicek:\n\n' +
            '_Contoh: 25001_\n' +
            '_⏳ Session berlaku 3 menit._',
        },
        { quoted: message }
      );
      return false;
    }

    // ── CEKSANTRI STEP 2: Menunggu Stambuk Santri untuk di-query ──
    if (cekSantriSess.step === 'await_stambuk' && cekSantriSess.authenticated) {
      const cleanStambuk = sanitizeStambuk(text);
      const stambukNum = parseInt(cleanStambuk, 10);

      console.log(`[GATEWAY-CEKSANTRI] 🔢 Stambuk input: "${text}" → clean: "${cleanStambuk}" → num: ${stambukNum}`);

      if (isNaN(stambukNum)) {
        await sock.sendMessage(
          remoteJid,
          {
            text: '❌ _Nomor Stambuk tidak valid. Masukkan angka yang benar._\n\n_Ketik ulang Nomor Stambuk Santri:_',
          },
          { quoted: message }
        );
        return false;
      }

      // Loading
      await sock.sendMessage(remoteJid, {
        react: { text: '⏳', key: message.key },
      });

      try {
        // ═══ QUERY ke DB SANTRI ═══
        const santri = await getFullBiodataSantri(stambukNum);

        if (!santri) {
          clearCekSantriSession(sender);
          await sock.sendMessage(remoteJid, {
            react: { text: '❌', key: message.key },
          });
          await sock.sendMessage(
            remoteJid,
            {
              text: `❌ *Stambuk ${stambukNum} tidak ditemukan di Database Santri.*\n\n_Session ceksantri ditutup._`,
            },
            { quoted: message }
          );
          return false;
        }

        // ═══ FORMAT BIODATA SUPER LENGKAP ═══
        const biodataText = formatBiodataSantri(santri);

        // ═══ 🆕 v10: PENGECEKAN KELENGKAPAN BERKAS (PRIMER + SEKUNDER) ═══
        const kelengkapanBerkasText = cekKelengkapanBerkas(cleanStambuk);

        // ═══ GABUNGKAN BIODATA + KELENGKAPAN BERKAS ═══
        const fullBiodataText = biodataText + '\n' + kelengkapanBerkasText + '\n\n🏫 _Pusat Data PMDG Kampus 5 Magelang_';

        // ═══ INTEGRASI FOTO AKSES VIA ABSOLUTE LOCAL PATH ═══
        // Rakit path foto menggunakan library path + Stambuk santri
        const fotoPath = path.join(FOTO_AKSES_DIR, `${cleanStambuk}.jpg`);

        console.log(`[GATEWAY-CEKSANTRI] 📷 Cek foto akses: ${fotoPath}`);

        let fotoExists = false;
        try {
          fotoExists = fs.existsSync(fotoPath);
        } catch (fsErr) {
          console.error(`[GATEWAY-CEKSANTRI] ⚠️ Error cek file foto: ${fsErr.message}`);
          fotoExists = false;
        }

        // Berhasil! Hapus session
        clearCekSantriSession(sender);

        await sock.sendMessage(remoteJid, {
          react: { text: '✅', key: message.key },
        });

        if (fotoExists) {
          // ── FOTO DITEMUKAN → Kirim sebagai image + caption biodata + kelengkapan berkas ──
          console.log(`[GATEWAY-CEKSANTRI] ✅ Foto akses DITEMUKAN: ${fotoPath}`);
          await sock.sendMessage(
            remoteJid,
            {
              image: { url: fotoPath },
              caption: `✅ *Data Santri Ditemukan!*\n\n${fullBiodataText}`,
            },
            { quoted: message }
          );
        } else {
          // ── FOTO TIDAK DITEMUKAN → Kirim teks biodata + kelengkapan berkas ──
          console.log(`[GATEWAY-CEKSANTRI] ⚠️ Foto akses TIDAK ditemukan: ${fotoPath}`);
          await sock.sendMessage(
            remoteJid,
            {
              text:
                `✅ *Data Santri Ditemukan!*\n\n` +
                `${fullBiodataText}\n\n` +
                `📷 _Foto akses tidak tersedia untuk Stambuk ${cleanStambuk}._`,
            },
            { quoted: message }
          );
        }

        return false;
      } catch (err) {
        clearCekSantriSession(sender);
        console.error('[GATEWAY-CEKSANTRI] Error:', err.message);
        await sock.sendMessage(
          remoteJid,
          { text: `❌ _Terjadi kesalahan sistem: ${err.message}_` },
          { quoted: message }
        );
        return false;
      }
    }

    clearCekSantriSession(sender);
    return true;
  }

  // ══════════════════════════════════════════════════
  //  PRIORITAS 1: CEK ADMIN SESSION
  // ══════════════════════════════════════════════════
  const adminSess = getAdminSession(sender);
  if (adminSess) {
    if (command && command !== false && !['admin', 'cekpass'].includes(command)) {
      console.log(`[GATEWAY-ADMIN] ⚠️ Admin session dibatalkan karena command: ${command}`);
      clearAdminSession(sender);
      return true;
    }

    if (command && command !== false && ['admin', 'cekpass'].includes(command)) {
      clearAdminSession(sender);
      return true;
    }

    const rawText = (fullText || content || '').trim();
    const text = deepSanitize(rawText);

    console.log(`[ADMIN] step handler aktif untuk sender — input diproses`);

    if (!text) return true;

    // Admin Step 1: Menunggu password superadmin
    if (adminSess.step === 'await_password') {
      const cleanPassword = deepSanitize(text).toLowerCase();

      if (cleanPassword !== String(getStaffPassword()).toLowerCase()) {
        clearAdminSession(sender);
        await sock.sendMessage(remoteJid, {
          react: { text: '🚫', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          { text: '🚫 *Akses Ditolak!*\n\n_Password salah. Session dihapus._' },
          { quoted: message }
        );
        return false;
      }

      setAdminSession(sender, {
        step: 'await_stambuk',
        authenticated: true,
      });

      await sock.sendMessage(remoteJid, {
        react: { text: '🔓', key: message.key },
      });
      await sock.sendMessage(
        remoteJid,
        {
          text: '🔓 *Akses Diterima!*\n\n📝 Masukkan *Nomor Stambuk Guru* yang ingin dicek password-nya:\n\n_⏳ Session berlaku 3 menit._',
        },
        { quoted: message }
      );
      return false;
    }

    // Admin Step 2: Menunggu stambuk
    if (adminSess.step === 'await_stambuk' && adminSess.authenticated) {
      const cleanStambuk = sanitizeStambuk(text);
      const stambukNum = parseInt(cleanStambuk, 10);

      if (isNaN(stambukNum)) {
        await sock.sendMessage(
          remoteJid,
          { text: '❌ _Nomor Stambuk tidak valid._\n\n_Ketik ulang Nomor Stambuk:_' },
          { quoted: message }
        );
        return false;
      }

      await sock.sendMessage(remoteJid, {
        react: { text: '⏳', key: message.key },
      });

      try {
        const result = await getPasswordByStambuk(stambukNum);

        clearAdminSession(sender);

        if (!result) {
          await sock.sendMessage(remoteJid, {
            react: { text: '❌', key: message.key },
          });
          await sock.sendMessage(
            remoteJid,
            { text: `❌ *Stambuk ${stambukNum} tidak ditemukan di database.*` },
            { quoted: message }
          );
          return false;
        }

        await sock.sendMessage(remoteJid, {
          react: { text: '✅', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          {
            text:
              `✅ *Data Ditemukan!*\n\n` +
              `👤 *Nama* : ${result.nama}\n` +
              `🔢 *Stambuk* : ${result.stambuk}\n` +
              `🔑 *Password (Tgl Lahir)* : ${result.tanggalLahir}\n\n` +
              `_Format password: DD-MM-YYYY_\n` +
              `_Saat login gunakan format: DD/MM/YYYY atau DD-MM-YYYY_`,
          },
          { quoted: message }
        );

        return false;
      } catch (err) {
        clearAdminSession(sender);
        console.error('[GATEWAY-ADMIN] Error:', err.message);
        await sock.sendMessage(
          remoteJid,
          { text: `❌ _Terjadi kesalahan sistem: ${err.message}_` },
          { quoted: message }
        );
        return false;
      }
    }

    clearAdminSession(sender);
    return true;
  }

  // ══════════════════════════════════════════════════
  //  PRIORITAS 2: CEK USER SESSION (GATEWAY BIASA)
  // ══════════════════════════════════════════════════
  const session = getSession(sender);
  if (!session) return true;

  // ══════════════════════════════════════════════════
  //  COMMAND FILTER: Jika user mengetik command lain, batalkan session
  // ══════════════════════════════════════════════════
  if (command && command !== false && !['cek', 'revisi'].includes(command)) {
    console.log(`[GATEWAY] ⚠️ Session dibatalkan karena command: ${command}`);
    clearSession(sender);
    return true; // Lanjut ke plugin
  }

  // Jika user mengetik command yang sama (.cek/.revisi), biarkan plugin handle ulang
  if (command && command !== false && ['cek', 'revisi'].includes(command)) {
    return true;
  }

  // ══════════════════════════════════════════════════
  //  AMBIL TEKS & SANITASI AGRESIF
  // ══════════════════════════════════════════════════
  const rawText = (fullText || content || '').trim();
  const text = deepSanitize(rawText);

  console.log(`[GATEWAY] 📝 Raw text: "${rawText}" (len=${rawText.length})`);
  console.log(`[GATEWAY] 📝 Clean text: "${text}" (len=${text.length})`);

  if (rawText.length !== text.length) {
    console.log(`[GATEWAY] ⚠️ KARAKTER GAIB TERDETEKSI! Selisih: ${rawText.length - text.length} karakter phantom`);
  }

  if (!text) return true;

  // ── STEP 1: Menunggu Stambuk ──
  if (session.step === 'await_stambuk') {
    // Sanitasi khusus stambuk: hanya angka
    const cleanStambuk = sanitizeStambuk(text);
    const stambuk = parseInt(cleanStambuk, 10);

    console.log(`[GATEWAY] 🔢 Parsing stambuk: raw="${text}" → clean="${cleanStambuk}" → parsed=${stambuk} (isNaN: ${isNaN(stambuk)})`);

    if (isNaN(stambuk)) {
      await sock.sendMessage(
        remoteJid,
        { text: '❌ _Nomor Stambuk tidak valid. Masukkan angka yang benar._\n\n_Ketik ulang Nomor Stambuk Anda:_' },
        { quoted: message }
      );
      return false; // Stop processing, tunggu input berikutnya
    }

    // Simpan stambuk sebagai String agar konsisten
    setSession(sender, {
      step: 'await_password',
      stambuk: String(stambuk),
      command: session.command,
      revisiContent: session.revisiContent || null,
    });

    console.log(`[GATEWAY] ✅ Stambuk ${stambuk} tersimpan. Menunggu password...`);

    await sock.sendMessage(
      remoteJid,
      {
        text: `🔐 *Verifikasi Identitas*\n\nStambuk: *${stambuk}*\n\n📅 Silakan masukkan *Tanggal Lahir* Anda sebagai password.\n_Format: DD/MM/YYYY atau DD-MM-YYYY_\n_Contoh: 15/08/2003 atau 15-08-2003_`,
      },
      { quoted: message }
    );

    return false; // Stop processing
  }

  // ── STEP 2: Menunggu Password (Tanggal Lahir) ──
  if (session.step === 'await_password') {
    // ═══ SANITASI AGRESIF: Bersihkan tanggal dari karakter gaib ═══
    const cleanTgl = sanitizeTanggal(text);

    // Normalisasi: ganti semua '-' menjadi '/' agar konsisten
    const normalizedText = cleanTgl.replace(/-/g, '/');

    console.log(`[GATEWAY] 📅 Input password: raw="${text}" (len=${text.length})`);
    console.log(`[GATEWAY] 📅 After sanitize: "${cleanTgl}" (len=${cleanTgl.length})`);
    console.log(`[GATEWAY] 📅 After normalize: "${normalizedText}" (len=${normalizedText.length})`);

    // Validasi format DD/MM/YYYY (setelah normalisasi)
    const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    if (!dateRegex.test(normalizedText)) {
      console.log(`[GATEWAY] ❌ Format tanggal gagal regex: "${normalizedText}"`);
      await sock.sendMessage(
        remoteJid,
        {
          text: '❌ _Format tanggal tidak valid!_\n\n_Gunakan format: DD/MM/YYYY atau DD-MM-YYYY_\n_Contoh: 15/08/2003 atau 15-08-2003_\n\nSilakan coba lagi:',
        },
        { quoted: message }
      );
      return false;
    }

    // Loading reaction
    await sock.sendMessage(remoteJid, {
      react: { text: '⏳', key: message.key },
    });

    try {
      console.log(`[GATEWAY] 🔍 Memanggil verifyGateway("${session.stambuk}", "${normalizedText}")`);

      // Verifikasi ke database (verifyGateway juga sudah ada sanitasi internal)
      const guru = await verifyGateway(session.stambuk, normalizedText);

      if (!guru) {
        console.log(`[GATEWAY] ❌ Verifikasi GAGAL untuk stambuk=${session.stambuk}, tgl=${normalizedText}`);
        clearSession(sender);
        await sock.sendMessage(remoteJid, {
          react: { text: '❌', key: message.key },
        });
        await sock.sendMessage(
          remoteJid,
          {
            text: `❌ *Verifikasi Gagal!*\n\nNomor Stambuk atau Tanggal Lahir tidak cocok.\n\n_Pastikan data yang Anda masukkan benar._\n_Jika yakin data benar tapi tidak bisa login, gunakan perintah *.lapor* untuk melaporkan masalah._`,
          },
          { quoted: message }
        );
        return false;
      }

      // ✅ VERIFIKASI BERHASIL
      console.log(`[GATEWAY] ✅ Verifikasi BERHASIL untuk: ${guru['Nama Lengkap']}`);

      await sock.sendMessage(remoteJid, {
        react: { text: '✅', key: message.key },
      });

      // Proses sesuai command asal
      if (session.command === 'cek') {
        // Tampilkan biodata lengkap
        const biodata = formatBiodata(guru);
        clearSession(sender);
        await sock.sendMessage(
          remoteJid,
          { text: `✅ *Login Berhasil!*\n\n${biodata}` },
          { quoted: message }
        );
      } else if (session.command === 'revisi') {
        // Kirim revisi ke grup staf
        const revisiContent = session.revisiContent || '(tidak ada detail revisi)';
        clearSession(sender);

        const namaGuru = guru['Nama Lengkap'] || 'Unknown';
        const stambukGuru = guru.Stambuk || session.stambuk;

        // Pesan ke user
        await sock.sendMessage(
          remoteJid,
          {
            text: `✅ *Login Berhasil & Revisi Terkirim!*\n\n📝 Pengajuan revisi Anda telah dikirim ke Staf Pusdat.\n\n*Detail Revisi:*\n${revisiContent}\n\n_Mohon tunggu konfirmasi dari staf._`,
          },
          { quoted: message }
        );

        // Kirim notifikasi ke Grup Staf Pusdat
        const grupStafId = pusdatConfig.GRUP_STAF_PUSDAT_ID;
        if (grupStafId && grupStafId !== '120363xxxxxxxxxxxx@g.us') {
          await sock.sendMessage(grupStafId, {
            text: `📋 *PENGAJUAN REVISI DATA*\n\n👤 *Stambuk* : ${stambukGuru}\n📛 *Nama* : ${namaGuru}\n📱 *Pengirim*: @${sender.split('@')[0]}\n\n📝 *Detail Revisi:*\n${revisiContent}\n\n_⚠️ Harap cek dan perbarui data di database Access secara manual._`,
            mentions: [sender],
          });
        }
      } else if (session.command === 'validasidata') {
        // ★ v18: Validasi Data via WA Bot
        try {
          const validasiMod = await import('../lib/validasiEvent.js');
          const openEv = validasiMod.getOpenEvent();
          if (!openEv) {
            clearSession(sender);
            await sock.sendMessage(
              remoteJid,
              { text: `ℹ️ *Tidak Ada Event Validasi*\n\nSaat ini belum ada event validasi data guru yang aktif.\n\nSilakan hubungi admin Pusdat untuk informasi.` },
              { quoted: message }
            );
            return false;
          }
          const stambukGuru = String(guru.Stambuk || session.stambuk);
          const namaGuru = guru['Nama Lengkap'] || 'Unknown';
          const eff = validasiMod.getEffectiveDeadline(openEv);
          const exts = Array.isArray(openEv.extensions) ? openEv.extensions : [];
          const biodata = formatBiodata(guru);

          // Submit langsung — user sudah lewat .validasidata yang memberi penjelasan
          validasiMod.submitValidation(openEv.id, stambukGuru, {
            channel: 'wa',
            nama: namaGuru,
            note: '(via WhatsApp bot)',
          });
          clearSession(sender);

          let dashboardUrl = '';
          try {
            const dashMod = await import('../lib/dashboard.js');
            dashboardUrl = dashMod.getDashboardUrl ? dashMod.getDashboardUrl() : '';
          } catch (_) {}
          const extNote = exts.length
            ? `\n\n⚠️ *Catatan*: Deadline event ini sudah diperpanjang ${exts.length}×. Mohon segera periksa data Anda sebelum *${validasiMod.formatTanggalWIB(eff)}*.`
            : '';

          await sock.sendMessage(
            remoteJid,
            {
              text:
                `✅ *VALIDASI DATA BERHASIL!*\n\n` +
                `📋 Event: *${openEv.title}*\n` +
                `⏰ Deadline: ${validasiMod.formatTanggalRingkasWIB(eff)}\n` +
                `👤 Stambuk: ${stambukGuru}\n` +
                `📛 Nama: ${namaGuru}\n` +
                `✅ Waktu validasi: ${validasiMod.formatTanggalRingkasWIB(new Date().toISOString())}\n` +
                `${extNote}\n\n` +
                `📖 *DATA ANDA SAAT INI:*\n${biodata}\n\n` +
                `⚠️ *Penting:* Jika ada data di atas yang masih SALAH atau KOSONG, segera perbaiki dengan perintah *.revisi*` +
                (dashboardUrl ? ` atau lewat dashboard web: ${dashboardUrl}` : '') +
                `\n\nTerima kasih atas partisipasinya 🙏`,
            },
            { quoted: message }
          );
        } catch (errInner) {
          clearSession(sender);
          console.error('[GATEWAY-VALIDASIDATA]', errInner);
          await sock.sendMessage(
            remoteJid,
            { text: `❌ Gagal menyimpan validasi: ${errInner.message}` },
            { quoted: message }
          );
        }
      }

      return false; // Stop processing
    } catch (err) {
      clearSession(sender);
      console.error('[Gateway] Error:', err.message);
      await sock.sendMessage(
        remoteJid,
        { text: `❌ _Terjadi kesalahan sistem: ${err.message}_` },
        { quoted: message }
      );
      return false;
    }
  }

  return true; // Tidak ada session yang cocok, lanjut ke plugin
}

// ══════════════════════════════════════════════════
//  🆕 v6: FUNGSI PEMECAH PESAN (CHUNKING)
//  Memecah pesan panjang agar WhatsApp tidak crash
// ══════════════════════════════════════════════════

/**
 * Memecah teks panjang menjadi beberapa bagian berdasarkan batas karakter.
 * Pemecahan dilakukan di batas baris (\n) terdekat agar tidak memotong
 * di tengah kata/kalimat.
 *
 * @param {string} text - Teks yang akan dipecah
 * @param {number} maxLength - Batas maksimum karakter per bagian (default: 3800)
 * @returns {Array<string>} - Array of text chunks
 */
function chunkText(text, maxLength = 3800) {
  if (!text || text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Cari batas baris terdekat sebelum maxLength
    let cutPoint = remaining.lastIndexOf('\n', maxLength);

    // Jika tidak ada newline, potong di maxLength
    if (cutPoint === -1 || cutPoint < maxLength * 0.5) {
      cutPoint = maxLength;
    }

    chunks.push(remaining.substring(0, cutPoint));
    remaining = remaining.substring(cutPoint).replace(/^\n/, ''); // Hapus newline di awal potongan berikutnya
  }

  return chunks;
}

export default {
  name: 'Gateway Pusdat',
  priority: 0, // ⚠️ HARUS 0! Agar jalan sebelum MODE ON handler (priority 2)
  process,
};
