/**
 * ============================================================
 *  lib/dashboardInspeksi.js — Fitur Inspeksi Pendataan Pusat
 *  ★ v19.0 — Data Center G5
 *
 *  Berdasarkan dokumen resmi "POIN INSPEKSI PENDATAAN
 *  PONDOK MODERN DARUSSALAM GONTOR" — Pusat Data Pimpinan.
 *
 *  Poin Inspeksi:
 *  A. PENDATAAN
 *     1. Data Santri (status, kampus, kelas, rayon, konsulat,
 *        identitas diri, ortu & wali, alamat KK, keluarga)
 *     2. Data Majalah Gontor (alamat, nama, no.telp, kode pos)
 *        → Manual via EMIGO (emigo.gontor.ac.id)
 *  B. KOMPUTERISASI
 *     - Perangkat komputer, jaringan, operasional EMIGO
 *     → Manual check
 *  C. PEMBERKASAN
 *     - Berkas hardfile+softfile, urutan/penamaan, rekap, upload EMIGO
 *  D. PASFOTO
 *     - Kelengkapan, ukuran ≤500KB, folder/format, email, upload EMIGO
 *
 *  Fitur:
 *  - GET /inspeksi             → halaman daftar & history inspeksi
 *  - GET /inspeksi/cek         → form rekap auto-cek semua poin
 *  - POST /inspeksi/cek        → simpan hasil manual EMIGO poin
 *  - GET /inspeksi/hasil/:id   → detail hasil inspeksi
 *  - POST /inspeksi/hapus/:id  → hapus catatan inspeksi
 *  - GET /api/inspeksi/auto    → JSON rekap otomatis poin yang bisa dicek
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getAllSantriAktif,
  getDirektoriGuru,
} from './dbAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const BERKAS_INDUK_DIR =
  'D:\\PUSAT DATA 2026\\01. MASTER DATA SANTRI\\01. BERKAS SANTRI';
const FOTO_INDUK_DIR =
  'D:\\PUSAT DATA 2026\\01. MASTER DATA SANTRI\\02. FOTO SANTRI';

const INSPEKSI_DB_PATH = path.join(ROOT_DIR, 'database', 'inspeksi_history.json');

function escapeHtml(v = '') {
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ──────────────────────────────────────────────
//  DB HELPER
// ──────────────────────────────────────────────
function loadInspeksiHistory() {
  try {
    if (fs.existsSync(INSPEKSI_DB_PATH)) {
      return JSON.parse(fs.readFileSync(INSPEKSI_DB_PATH, 'utf8'));
    }
  } catch (_) {}
  return [];
}

function saveInspeksiHistory(data) {
  try {
    fs.mkdirSync(path.dirname(INSPEKSI_DB_PATH), { recursive: true });
    fs.writeFileSync(INSPEKSI_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[INSPEKSI] Gagal simpan history:', e.message);
  }
}

function generateId() {
  return `INS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ──────────────────────────────────────────────
//  AUTO CEK — Poin yang bisa dicek otomatis
// ──────────────────────────────────────────────
export async function autoCheckInspeksi() {
  const santri = await getAllSantriAktif();
  const result = {
    timestamp: new Date().toISOString(),
    total_santri: santri.length,
    seksi: {},
  };

  // ── A1. DATA SANTRI ──────────────────────────
  const a1 = {
    judul: 'A.1 Data Santri',
    total: santri.length,
    poin: [],
  };

  // Kesesuaian status, kampus, kelas, rayon, konsulat
  let a1_status_ok = 0, a1_status_kosong = 0;
  let a1_kelas_kosong = [], a1_rayon_kosong = [], a1_konsulat_kosong = [];

  // Identitas diri
  let a1_nama_kosong = [], a1_ttl_kosong = [], a1_jk_kosong = [], a1_kewarganegaraan_kosong = [];
  // Ortu & Wali
  let a1_ayah_kosong = [], a1_ibu_kosong = [], a1_wali_kosong = [];
  // Alamat KK
  let a1_alamat_kosong = [], a1_kodepos_kosong = [];
  // Keluarga
  let a1_keluarga_kosong = [];

  for (const s of santri) {
    const stambuk = s.Stambuk || s['No. Stambuk'] || '-';
    const nama = s['Nama Lengkap'] || s.Nama || '-';

    // Status/kampus/kelas/rayon/konsulat
    if (!s.Kelas || String(s.Kelas).trim() === '') a1_kelas_kosong.push({ stambuk, nama });
    if (!s.Rayon || String(s.Rayon).trim() === '') a1_rayon_kosong.push({ stambuk, nama });
    if (!s.Konsulat || String(s.Konsulat).trim() === '') a1_konsulat_kosong.push({ stambuk, nama });

    // Identitas diri
    if (!s['Nama Lengkap'] || String(s['Nama Lengkap']).trim() === '') a1_nama_kosong.push({ stambuk, nama });
    const hasTTL = (s['Tempat Lahir'] || s['Tempat, Tanggal Lahir']) && (s['Tanggal Lahir'] || s['Tgl Lahir']);
    if (!hasTTL) a1_ttl_kosong.push({ stambuk, nama });
    if (!s['Jenis Kelamin'] && !s['JK']) a1_jk_kosong.push({ stambuk, nama });
    if (!s['Kewarganegaraan'] && !s['WNI/WNA']) a1_kewarganegaraan_kosong.push({ stambuk, nama });

    // Ortu
    const namaAyah = s['Nama Ayah'] || s['Ayah'] || '';
    const namaIbu = s['Nama Ibu'] || s['Ibu'] || '';
    if (!namaAyah.trim()) a1_ayah_kosong.push({ stambuk, nama });
    if (!namaIbu.trim()) a1_ibu_kosong.push({ stambuk, nama });

    // Alamat KK
    const alamat = s['Alamat'] || s['Alamat KK'] || s['Alamat Sesuai KK'] || '';
    if (!alamat.trim()) a1_alamat_kosong.push({ stambuk, nama });
    const kodepos = s['Kode Pos'] || s['Kodepos'] || '';
    if (!kodepos.toString().trim()) a1_kodepos_kosong.push({ stambuk, nama });
  }

  a1.poin = [
    { kode: 'A.1.1', label: 'Kesesuaian data status santri, kampus, kelas, rayon, konsulat', type: 'auto',
      detail: `Kelas kosong: ${a1_kelas_kosong.length} santri | Rayon kosong: ${a1_rayon_kosong.length} santri | Konsulat kosong: ${a1_konsulat_kosong.length} santri`,
      ok: a1_kelas_kosong.length + a1_rayon_kosong.length + a1_konsulat_kosong.length === 0,
      masalah: [...a1_kelas_kosong.slice(0,5), ...a1_rayon_kosong.slice(0,5), ...a1_konsulat_kosong.slice(0,5)] },
    { kode: 'A.1.2', label: 'Kelengkapan data identitas diri santri', type: 'auto',
      detail: `TTL kosong: ${a1_ttl_kosong.length} | JK kosong: ${a1_jk_kosong.length} | Kewarganegaraan kosong: ${a1_kewarganegaraan_kosong.length}`,
      ok: a1_ttl_kosong.length + a1_jk_kosong.length + a1_kewarganegaraan_kosong.length === 0,
      masalah: [...a1_ttl_kosong.slice(0,5)] },
    { kode: 'A.1.3', label: 'Kelengkapan data orang tua dan wali santri', type: 'auto',
      detail: `Nama Ayah kosong: ${a1_ayah_kosong.length} | Nama Ibu kosong: ${a1_ibu_kosong.length}`,
      ok: a1_ayah_kosong.length + a1_ibu_kosong.length === 0,
      masalah: [...a1_ayah_kosong.slice(0,5)] },
    { kode: 'A.1.4', label: 'Kelengkapan dan keakuratan data alamat sesuai Kartu Keluarga', type: 'auto',
      detail: `Alamat KK kosong: ${a1_alamat_kosong.length} | Kode Pos kosong: ${a1_kodepos_kosong.length}`,
      ok: a1_alamat_kosong.length + a1_kodepos_kosong.length === 0,
      masalah: [...a1_alamat_kosong.slice(0,5)] },
    { kode: 'A.1.5', label: 'Kelengkapan data keluarga santri', type: 'auto',
      detail: `Data keluarga yang perlu dicek manual (saudara kandung, dll). Cek via EMIGO untuk detail.`,
      ok: null, masalah: [] },
  ];
  result.seksi.A1 = a1;

  // ── A2. DATA MAJALAH GONTOR (EMIGO — MANUAL) ──
  result.seksi.A2 = {
    judul: 'A.2 Data Majalah Gontor (via EMIGO — cek manual)',
    type: 'manual',
    poin: [
      { kode: 'A.2.1', label: 'Kesesuaian alamat pengiriman majalah', type: 'manual', emigo: true },
      { kode: 'A.2.2', label: 'Kesesuaian nama penerima majalah', type: 'manual', emigo: true },
      { kode: 'A.2.3', label: 'Kelengkapan dan keaktifan nomor telepon penerima majalah', type: 'manual', emigo: true },
      { kode: 'A.2.4', label: 'Kesesuaian kode pos alamat pengiriman', type: 'manual', emigo: true },
    ],
  };

  // ── B. KOMPUTERISASI (MANUAL) ──────────────────
  result.seksi.B = {
    judul: 'B. Komputerisasi (cek manual)',
    type: 'manual',
    poin: [
      { kode: 'B.1', label: 'Ketersediaan dan kondisi perangkat komputer', type: 'manual' },
      { kode: 'B.2', label: 'Kondisi dan stabilitas jaringan antarbagian', type: 'manual' },
      { kode: 'B.3', label: 'Kelancaran operasional aplikasi EMIGO dan aplikasi pendukung', type: 'manual', emigo: true },
    ],
  };

  // ── C. PEMBERKASAN ─────────────────────────────
  const FOLDER_PRIMER = ['A. FOTO AKSES', 'B. IJAZAH', 'C. AKTA KELAHIRAN', 'D. KARTU KELUARGA'];
  const EKSTENSI = ['.jpg', '.jpeg', '.png', '.pdf'];

  let c_hardfile_ada = 0, c_hardfile_kosong = [];
  let c_softfile_ada = 0, c_softfile_kosong = [];

  for (const s of santri) {
    const stambuk = s.Stambuk || s['No. Stambuk'] || '-';
    const nama = s['Nama Lengkap'] || s.Nama || '-';
    let adaSoftfile = false;
    for (const folder of FOLDER_PRIMER) {
      for (const ext of EKSTENSI) {
        try {
          const fp = path.join(BERKAS_INDUK_DIR, folder, `${stambuk}${ext}`);
          if (fs.existsSync(fp)) { adaSoftfile = true; break; }
        } catch (_) {}
      }
      if (adaSoftfile) break;
    }
    if (adaSoftfile) c_softfile_ada++;
    else c_softfile_kosong.push({ stambuk, nama });
  }

  result.seksi.C = {
    judul: 'C. Pemberkasan',
    total: santri.length,
    poin: [
      { kode: 'C.1', label: 'Kelengkapan berkas santri aktif (hardfile)', type: 'manual',
        detail: 'Hardfile harus dicek fisik langsung di rak/almari berkas.' },
      { kode: 'C.2', label: 'Kelengkapan berkas santri aktif (softfile)', type: 'auto',
        detail: `Softfile di server: Ada ${c_softfile_ada} santri | Belum ada: ${c_softfile_kosong.length} santri`,
        ok: c_softfile_kosong.length === 0,
        masalah: c_softfile_kosong.slice(0, 10) },
      { kode: 'C.3', label: 'Kesesuaian urutan, penamaan, serta sistem penyimpanan berkas', type: 'auto',
        detail: 'Berkas yang tidak sesuai format stambuk akan terdeteksi sebagai kosong otomatis.',
        ok: c_softfile_kosong.length === 0, masalah: [] },
      { kode: 'C.4', label: 'Ketersediaan rekapitulasi data berkas', type: 'auto',
        detail: `Rekap tersedia via fitur "Rekap Berkas/Jenis" di dashboard.`,
        ok: true, masalah: [] },
      { kode: 'C.5', label: 'Pengunggahan berkas santri aktif ke dalam sistem EMIGO', type: 'manual', emigo: true,
        detail: 'Perlu dicek manual di emigo.gontor.ac.id — apakah berkas sudah terupload.' },
    ],
  };

  // ── D. PASFOTO ────────────────────────────────
  let d_ada = 0, d_kosong = [], d_oversize = [], d_formatOk = 0, d_formatSalah = [];
  const MAX_FOTO_SIZE = 500 * 1024; // 500KB

  for (const s of santri) {
    const stambuk = s.Stambuk || s['No. Stambuk'] || '-';
    const nama = s['Nama Lengkap'] || s.Nama || '-';
    let found = false;
    let fileSize = 0;
    let ext = '';
    for (const e of ['.jpg', '.jpeg', '.png']) {
      try {
        const fp = path.join(FOTO_INDUK_DIR, `${stambuk}${e}`);
        if (fs.existsSync(fp)) {
          found = true;
          const stat = fs.statSync(fp);
          fileSize = stat.size;
          ext = e;
          break;
        }
      } catch (_) {}
    }
    if (found) {
      d_ada++;
      if (fileSize > MAX_FOTO_SIZE) d_oversize.push({ stambuk, nama, size: fileSize });
      d_formatOk++;
    } else {
      d_kosong.push({ stambuk, nama });
    }
  }

  result.seksi.D = {
    judul: 'D. Pasfoto',
    total: santri.length,
    ada: d_ada,
    kosong: d_kosong.length,
    poin: [
      { kode: 'D.1', label: 'Kelengkapan pasfoto santri aktif', type: 'auto',
        detail: `Ada: ${d_ada} foto | Kosong: ${d_kosong.length} santri`,
        ok: d_kosong.length === 0,
        masalah: d_kosong.slice(0, 10) },
      { kode: 'D.2', label: 'Kesesuaian ukuran file (maksimal 500 KB)', type: 'auto',
        detail: `Oversize (>500KB): ${d_oversize.length} foto`,
        ok: d_oversize.length === 0,
        masalah: d_oversize.slice(0, 10) },
      { kode: 'D.3', label: 'Kesesuaian struktur folder dan format penamaan file', type: 'auto',
        detail: `Format penamaan file pasfoto: [stambuk].jpg/jpeg/png. File tidak ditemukan = salah nama atau belum ada.`,
        ok: d_kosong.length === 0, masalah: [] },
      { kode: 'D.4', label: 'Pengiriman pasfoto ke alamat email Pusat Data', type: 'manual',
        detail: 'Cek manual apakah sudah terkirim ke pusatdata@gontor.ac.id.' },
      { kode: 'D.5', label: 'Pengunggahan pasfoto ke dalam sistem EMIGO', type: 'manual', emigo: true,
        detail: 'Perlu dicek manual di emigo.gontor.ac.id.' },
    ],
  };

  // ── SUMMARY ───────────────────────────────────
  let totalPoin = 0, okPoin = 0, masalahPoin = 0, manualPoin = 0;
  for (const s of Object.values(result.seksi)) {
    for (const p of (s.poin || [])) {
      totalPoin++;
      if (p.type === 'manual') manualPoin++;
      else if (p.ok === true) okPoin++;
      else if (p.ok === false) masalahPoin++;
    }
  }
  result.summary = { totalPoin, okPoin, masalahPoin, manualPoin };
  return result;
}

// ──────────────────────────────────────────────
//  RENDER — Halaman Inspeksi List
// ──────────────────────────────────────────────
function renderInspeksiListPage(history, basePage) {
  const rows = history
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((item) => {
      const tgl = new Date(item.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      const badge = item.status === 'selesai'
        ? `<span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:99px;font-weight:700;font-size:12px">✅ Selesai</span>`
        : `<span style="background:#fef9c3;color:#854d0e;padding:3px 10px;border-radius:99px;font-weight:700;font-size:12px">🔄 Draft</span>`;
      return `<tr>
        <td style="padding:12px 14px;font-weight:700;color:#214e97">${escapeHtml(item.id)}</td>
        <td style="padding:12px 14px">${escapeHtml(tgl)}</td>
        <td style="padding:12px 14px">${escapeHtml(item.keterangan || '-')}</td>
        <td style="padding:12px 14px">${badge}</td>
        <td style="padding:12px 14px;display:flex;gap:8px">
          <a href="/inspeksi/hasil/${encodeURIComponent(item.id)}" style="padding:6px 12px;background:#214e97;color:#fff;border-radius:8px;font-size:12px;text-decoration:none;font-weight:700">📋 Detail</a>
          <form method="POST" action="/inspeksi/hapus/${encodeURIComponent(item.id)}" style="margin:0" onsubmit="return confirm('Hapus catatan ini?')">
            <button type="submit" style="padding:6px 12px;background:#fee2e2;color:#991b1b;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-weight:700">🗑️ Hapus</button>
          </form>
        </td>
      </tr>`;
    }).join('');

  const body = `
<div style="max-width:1100px;margin:0 auto;padding:24px">
  <div style="background:#fff;border-radius:18px;border:1px solid #e2e8f3;padding:24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">
    <div>
      <h2 style="font-size:22px;color:#1d3766;margin:0 0 4px">🔍 Inspeksi Pendataan</h2>
      <p style="color:#516079;font-size:13px;margin:0">Berdasarkan Poin Inspeksi Resmi PMDG — Pusat Data Pimpinan</p>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a href="/inspeksi/cek" style="padding:10px 18px;background:linear-gradient(135deg,#214e97,#16376c);color:#fff;border-radius:12px;font-weight:700;font-size:13px;text-decoration:none">🚀 Jalankan Auto-Cek</a>
    </div>
  </div>

  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:14px;padding:16px 20px;margin-bottom:20px;font-size:13px;color:#92400e;line-height:1.6">
    <strong>📌 Catatan:</strong> Fitur ini mencerminkan poin inspeksi resmi dari Pusat Data Pimpinan PMDG.
    Poin yang bertanda <strong>EMIGO</strong> harus dicek manual di 
    <a href="https://emigo.gontor.ac.id" target="_blank" style="color:#214e97;font-weight:700">emigo.gontor.ac.id</a>
    karena tidak bisa diverifikasi secara otomatis oleh sistem lokal.
    Poin lainnya akan dicek otomatis dari database lokal saat tombol "Jalankan Auto-Cek" ditekan.
  </div>

  <div style="background:#fff;border-radius:18px;border:1px solid #e2e8f3;padding:24px">
    <h3 style="font-size:16px;color:#1d3766;margin:0 0 16px">📚 History Inspeksi (${history.length} catatan)</h3>
    ${history.length === 0
      ? `<div style="text-align:center;padding:40px;color:#94a3b8;border:2px dashed #e2e8f3;border-radius:14px">
           <div style="font-size:40px;margin-bottom:12px">📋</div>
           <p>Belum ada catatan inspeksi.<br>Klik <strong>"Jalankan Auto-Cek"</strong> untuk memulai inspeksi pertama.</p>
         </div>`
      : `<div style="overflow-x:auto">
           <table style="width:100%;border-collapse:collapse;font-size:13px">
             <thead><tr style="background:#f8faff">
               <th style="padding:10px 14px;text-align:left;color:#516079;font-weight:700;border-bottom:1px solid #e2e8f3">ID</th>
               <th style="padding:10px 14px;text-align:left;color:#516079;font-weight:700;border-bottom:1px solid #e2e8f3">Waktu</th>
               <th style="padding:10px 14px;text-align:left;color:#516079;font-weight:700;border-bottom:1px solid #e2e8f3">Keterangan</th>
               <th style="padding:10px 14px;text-align:left;color:#516079;font-weight:700;border-bottom:1px solid #e2e8f3">Status</th>
               <th style="padding:10px 14px;text-align:left;color:#516079;font-weight:700;border-bottom:1px solid #e2e8f3">Aksi</th>
             </tr></thead>
             <tbody>${rows}</tbody>
           </table>
         </div>`}
  </div>
</div>`;
  return basePage('🔍 Inspeksi Pendataan', body);
}

// ──────────────────────────────────────────────
//  RENDER — Halaman Hasil Inspeksi (Auto-Cek)
// ──────────────────────────────────────────────
function renderHasilInspeksiPage(hasil, savedRecord, basePage) {
  const { seksi, summary, timestamp, total_santri } = hasil;
  const tgl = new Date(timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  function renderPoin(p) {
    let statusIcon, statusColor, statusBg;
    if (p.type === 'manual' || p.ok === null) {
      statusIcon = '📋'; statusColor = '#854d0e'; statusBg = '#fef9c3';
    } else if (p.ok === true) {
      statusIcon = '✅'; statusColor = '#166534'; statusBg = '#dcfce7';
    } else {
      statusIcon = '❌'; statusColor = '#991b1b'; statusBg = '#fee2e2';
    }

    const emigoTag = p.emigo
      ? `<a href="https://emigo.gontor.ac.id" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:99px;font-size:11px;font-weight:700;text-decoration:none">🌐 Cek di EMIGO</a>`
      : '';

    const masalahList = p.masalah && p.masalah.length > 0
      ? `<div style="margin-top:8px;background:#fff8f0;border:1px solid #fed7aa;border-radius:8px;padding:8px 12px;font-size:12px;color:#92400e">
           <strong>⚠️ Sampel masalah (maks 10):</strong><br>
           ${p.masalah.slice(0,10).map(m => `• ${escapeHtml(m.stambuk)} — ${escapeHtml(m.nama)}${m.size ? ` (${Math.round(m.size/1024)}KB)` : ''}`).join('<br>')}
         </div>`
      : '';

    return `<div style="border:1px solid ${p.ok === false ? '#fca5a5' : '#e2e8f3'};border-radius:12px;padding:14px 16px;margin-bottom:10px;background:#fff">
      <div style="display:flex;align-items:flex-start;gap:12px;justify-content:space-between;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="background:${statusBg};color:${statusColor};padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">${statusIcon} ${p.type === 'manual' ? 'Manual' : (p.ok === null ? 'Perlu Cek' : (p.ok ? 'OK' : 'Ada Masalah'))}</span>
            ${emigoTag}
            <span style="font-size:11px;color:#94a3b8;font-weight:600">${escapeHtml(p.kode)}</span>
          </div>
          <p style="margin:6px 0 0;font-size:14px;font-weight:700;color:#1e3a5f">${escapeHtml(p.label)}</p>
          ${p.detail ? `<p style="margin:4px 0 0;font-size:12.5px;color:#516079">${escapeHtml(p.detail)}</p>` : ''}
        </div>
      </div>
      ${masalahList}
    </div>`;
  }

  function renderSeksi(key, s) {
    const isManual = s.type === 'manual';
    return `<div style="background:#fff;border-radius:18px;border:1px solid #e2e8f3;padding:22px;margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <h3 style="font-size:16px;color:#1d3766;margin:0">${escapeHtml(s.judul)}</h3>
        ${isManual ? `<span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">📋 Semua Manual</span>` : ''}
        ${s.total ? `<span style="background:#eff6ff;color:#1d4ed8;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">${s.total} santri</span>` : ''}
      </div>
      ${(s.poin || []).map(renderPoin).join('')}
    </div>`;
  }

  // Form manual input
  const manualFormItems = [];
  for (const [secKey, s] of Object.entries(seksi)) {
    for (const p of (s.poin || [])) {
      if (p.type === 'manual') {
        manualFormItems.push({ kode: p.kode, label: p.label, emigo: !!p.emigo });
      }
    }
  }

  const savedId = savedRecord?.id || '';
  const manualForm = `
<div style="background:#fff;border-radius:18px;border:1px solid #e2e8f3;padding:22px;margin-bottom:18px">
  <h3 style="font-size:16px;color:#1d3766;margin:0 0 8px">📝 Catatan Poin Manual</h3>
  <p style="font-size:13px;color:#516079;margin:0 0 16px">Isi status poin yang harus dicek manual (EMIGO, fisik, dll). Simpan setelah selesai.</p>
  <form method="POST" action="/inspeksi/cek">
    <input type="hidden" name="inspeksiId" value="${escapeHtml(savedId)}">
    <input type="hidden" name="autoData" value="${escapeHtml(JSON.stringify(hasil))}">
    ${manualFormItems.map(item => `
    <div style="margin-bottom:14px;border:1px solid #e2e8f3;border-radius:12px;padding:14px 16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:700;color:#64748b">${escapeHtml(item.kode)}</span>
        ${item.emigo ? `<a href="https://emigo.gontor.ac.id" target="_blank" style="font-size:11px;font-weight:700;color:#1d4ed8;text-decoration:none">🌐 EMIGO</a>` : ''}
      </div>
      <label style="display:block;font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px">${escapeHtml(item.label)}</label>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="radio" name="manual_${escapeHtml(item.kode)}" value="ok"> <span style="color:#166534;font-weight:700">✅ Sudah OK</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="radio" name="manual_${escapeHtml(item.kode)}" value="masalah"> <span style="color:#991b1b;font-weight:700">❌ Ada Masalah</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="radio" name="manual_${escapeHtml(item.kode)}" value="belum" checked> <span style="color:#92400e;font-weight:700">📋 Belum Dicek</span>
        </label>
      </div>
      <input type="text" name="catatan_${escapeHtml(item.kode)}" placeholder="Catatan (opsional)..."
        style="margin-top:8px;width:100%;padding:8px 12px;border:1px solid #e2e8f3;border-radius:8px;font-size:12.5px">
    </div>`).join('')}
    <div style="margin-bottom:14px">
      <label style="display:block;font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:6px">Keterangan Inspeksi (opsional)</label>
      <input type="text" name="keterangan" placeholder="Misal: Inspeksi dadakan dari Pusat, 9 Juli 2026..."
        style="width:100%;padding:10px 12px;border:1px solid #e2e8f3;border-radius:8px;font-size:13px">
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button type="submit" name="action" value="simpan"
        style="padding:11px 22px;background:linear-gradient(135deg,#214e97,#16376c);color:#fff;border:none;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer">
        💾 Simpan Catatan
      </button>
      <button type="submit" name="action" value="selesai"
        style="padding:11px 22px;background:linear-gradient(135deg,#166534,#14532d);color:#fff;border:none;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer">
        ✅ Tandai Selesai
      </button>
    </div>
  </form>
</div>`;

  const body = `
<div style="max-width:1100px;margin:0 auto;padding:24px">
  <!-- Header -->
  <div style="background:#fff;border-radius:18px;border:1px solid #e2e8f3;padding:22px;margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:22px;color:#1d3766;margin:0 0 4px">🔍 Hasil Auto-Cek Inspeksi Pendataan</h2>
        <p style="color:#516079;font-size:13px;margin:0">Dijalankan: ${escapeHtml(tgl)} WIB • Total Santri: ${total_santri}</p>
      </div>
      <a href="/inspeksi" style="padding:9px 16px;background:#f1f5f9;color:#475569;border-radius:10px;font-weight:700;font-size:12px;text-decoration:none">← Kembali</a>
    </div>
  </div>

  <!-- Summary Score -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:18px">
    <div style="background:#dcfce7;border-radius:14px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#166534">${summary.okPoin}</div>
      <div style="font-size:12px;color:#166534;font-weight:700">✅ Poin OK</div>
    </div>
    <div style="background:#fee2e2;border-radius:14px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#991b1b">${summary.masalahPoin}</div>
      <div style="font-size:12px;color:#991b1b;font-weight:700">❌ Ada Masalah</div>
    </div>
    <div style="background:#fef9c3;border-radius:14px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#854d0e">${summary.manualPoin}</div>
      <div style="font-size:12px;color:#854d0e;font-weight:700">📋 Cek Manual</div>
    </div>
    <div style="background:#eff6ff;border-radius:14px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#1d4ed8">${summary.totalPoin}</div>
      <div style="font-size:12px;color:#1d4ed8;font-weight:700">📊 Total Poin</div>
    </div>
  </div>

  <!-- Poin per seksi -->
  ${renderSeksi('A1', seksi.A1)}
  ${renderSeksi('A2', seksi.A2)}
  ${renderSeksi('B', seksi.B)}
  ${renderSeksi('C', seksi.C)}
  ${renderSeksi('D', seksi.D)}

  <!-- Form Manual -->
  ${manualForm}
</div>`;

  return basePage('🔍 Hasil Inspeksi', body);
}

// ──────────────────────────────────────────────
//  RENDER — Detail Saved Inspeksi
// ──────────────────────────────────────────────
function renderDetailSavedPage(record, basePage) {
  const tgl = new Date(record.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const autoResult = record.autoResult || {};
  const manual = record.manual || {};

  function statusBadge(v) {
    if (v === 'ok') return `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">✅ OK</span>`;
    if (v === 'masalah') return `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">❌ Masalah</span>`;
    return `<span style="background:#fef9c3;color:#854d0e;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">📋 Belum</span>`;
  }

  const manualRows = Object.entries(manual)
    .filter(([k]) => k.startsWith('status_'))
    .map(([k, v]) => {
      const kode = k.replace('status_', '');
      const catatan = manual[`catatan_${kode}`] || '-';
      return `<tr>
        <td style="padding:10px 12px;font-weight:700;color:#214e97">${escapeHtml(kode)}</td>
        <td style="padding:10px 12px">${statusBadge(v)}</td>
        <td style="padding:10px 12px;color:#516079;font-size:12.5px">${escapeHtml(catatan)}</td>
      </tr>`;
    }).join('');

  const summary = autoResult.summary || {};

  const body = `
<div style="max-width:1100px;margin:0 auto;padding:24px">
  <div style="background:#fff;border-radius:18px;border:1px solid #e2e8f3;padding:22px;margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:22px;color:#1d3766;margin:0 0 4px">📋 Detail Inspeksi: ${escapeHtml(record.id)}</h2>
        <p style="color:#516079;font-size:13px;margin:0">Waktu: ${escapeHtml(tgl)} WIB • Keterangan: ${escapeHtml(record.keterangan || '-')}</p>
      </div>
      <a href="/inspeksi" style="padding:9px 16px;background:#f1f5f9;color:#475569;border-radius:10px;font-weight:700;font-size:12px;text-decoration:none">← Kembali</a>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:18px">
    <div style="background:#dcfce7;border-radius:14px;padding:14px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:#166534">${summary.okPoin || 0}</div>
      <div style="font-size:11px;color:#166534;font-weight:700">✅ Poin OK</div>
    </div>
    <div style="background:#fee2e2;border-radius:14px;padding:14px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:#991b1b">${summary.masalahPoin || 0}</div>
      <div style="font-size:11px;color:#991b1b;font-weight:700">❌ Ada Masalah</div>
    </div>
    <div style="background:#fef9c3;border-radius:14px;padding:14px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:#854d0e">${summary.manualPoin || 0}</div>
      <div style="font-size:11px;color:#854d0e;font-weight:700">📋 Manual</div>
    </div>
  </div>

  <div style="background:#fff;border-radius:18px;border:1px solid #e2e8f3;padding:22px;margin-bottom:18px">
    <h3 style="font-size:15px;color:#1d3766;margin:0 0 14px">📝 Catatan Poin Manual</h3>
    ${manualRows
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px">
           <thead><tr style="background:#f8faff">
             <th style="padding:8px 12px;text-align:left;color:#516079;border-bottom:1px solid #e2e8f3">Kode</th>
             <th style="padding:8px 12px;text-align:left;color:#516079;border-bottom:1px solid #e2e8f3">Status</th>
             <th style="padding:8px 12px;text-align:left;color:#516079;border-bottom:1px solid #e2e8f3">Catatan</th>
           </tr></thead>
           <tbody>${manualRows}</tbody>
         </table>`
      : '<p style="color:#94a3b8;text-align:center;padding:20px">Belum ada catatan manual tersimpan.</p>'}
  </div>
</div>`;
  return basePage(`📋 Detail Inspeksi ${record.id}`, body);
}

// ──────────────────────────────────────────────
//  REGISTER ROUTES
// ──────────────────────────────────────────────
export function registerInspeksiRoutes(app, requireAuth) {

  async function getBasePage() {
    try {
      const mod = await import('./dashboardEditor.js');
      return mod.default?._basePage || fallbackBasePage;
    } catch (_) { return fallbackBasePage; }
  }

  function fallbackBasePage(title, body) {
    return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{font-family:'Segoe UI',sans-serif;background:#f4f6fb;margin:0;padding:0}
    a{color:#214e97}</style></head><body>${body}</body></html>`;
  }

  // GET /inspeksi — list
  app.get('/inspeksi', requireAuth, async (req, res) => {
    try {
      const basePage = await getBasePage();
      const history = loadInspeksiHistory();
      res.send(renderInspeksiListPage(history, basePage));
    } catch (e) {
      res.status(500).send(`<h1>Error: ${escapeHtml(e.message)}</h1>`);
    }
  });

  // GET /inspeksi/cek — jalankan auto-cek
  app.get('/inspeksi/cek', requireAuth, async (req, res) => {
    try {
      const basePage = await getBasePage();
      const hasil = await autoCheckInspeksi();
      // Simpan draft
      const newRecord = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        status: 'draft',
        keterangan: '',
        autoResult: hasil,
        manual: {},
      };
      const history = loadInspeksiHistory();
      history.push(newRecord);
      saveInspeksiHistory(history);
      res.send(renderHasilInspeksiPage(hasil, newRecord, basePage));
    } catch (e) {
      res.status(500).send(`<h1>Error Auto-Cek: ${escapeHtml(e.message)}</h1>`);
    }
  });

  // POST /inspeksi/cek — simpan manual
  app.post('/inspeksi/cek', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const { inspeksiId, action, keterangan, autoData } = body;
      const history = loadInspeksiHistory();
      let record = history.find((h) => h.id === inspeksiId);
      if (!record) {
        // Buat baru jika tidak ketemu
        record = {
          id: inspeksiId || generateId(),
          createdAt: new Date().toISOString(),
          status: 'draft',
          keterangan: '',
          autoResult: {},
          manual: {},
        };
        try { record.autoResult = JSON.parse(autoData || '{}'); } catch (_) {}
        history.push(record);
      }
      // Simpan semua field manual
      const manualData = {};
      for (const [k, v] of Object.entries(body)) {
        if (k.startsWith('manual_') || k.startsWith('catatan_')) {
          const cleanKey = k.replace('manual_', 'status_').replace('catatan_', 'catatan_');
          manualData[cleanKey] = v;
        }
      }
      record.manual = manualData;
      record.keterangan = keterangan || '';
      record.updatedAt = new Date().toISOString();
      if (action === 'selesai') record.status = 'selesai';
      saveInspeksiHistory(history);
      res.redirect('/inspeksi');
    } catch (e) {
      res.status(500).send(`<h1>Error simpan: ${escapeHtml(e.message)}</h1>`);
    }
  });

  // GET /inspeksi/hasil/:id — detail
  app.get('/inspeksi/hasil/:id', requireAuth, async (req, res) => {
    try {
      const basePage = await getBasePage();
      const history = loadInspeksiHistory();
      const record = history.find((h) => h.id === decodeURIComponent(req.params.id));
      if (!record) return res.status(404).send('<h1>Inspeksi tidak ditemukan</h1>');
      res.send(renderDetailSavedPage(record, basePage));
    } catch (e) {
      res.status(500).send(`<h1>Error: ${escapeHtml(e.message)}</h1>`);
    }
  });

  // POST /inspeksi/hapus/:id — hapus
  app.post('/inspeksi/hapus/:id', requireAuth, async (req, res) => {
    try {
      const id = decodeURIComponent(req.params.id);
      let history = loadInspeksiHistory();
      history = history.filter((h) => h.id !== id);
      saveInspeksiHistory(history);
      res.redirect('/inspeksi');
    } catch (e) {
      res.status(500).send(`<h1>Error hapus: ${escapeHtml(e.message)}</h1>`);
    }
  });

  // GET /api/inspeksi/auto — JSON auto check
  app.get('/api/inspeksi/auto', requireAuth, async (_req, res) => {
    try {
      const hasil = await autoCheckInspeksi();
      res.json({ ok: true, data: hasil });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log('[✔] Inspeksi routes loaded → /inspeksi');
}

export default { registerInspeksiRoutes, autoCheckInspeksi };
