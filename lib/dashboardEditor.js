/**
 * ============================================================
 *  lib/dashboardEditor.js — Extension Dashboard Web Pusdat
 *  ★ v16 — Role-based + Ekspor Detail + Rekap Berkas per Jenis
 *           + Validasi Data + Tombol Kembali (ganti JSON)
 *           + Foto akses di awal, berkas lengkap di akhir
 * ============================================================
 *
 *  Rute baru:
 *  - /cari            : pencarian santri/guru (admin only)
 *  - /santri/:stambuk : detail biodata + berkas di akhir
 *  - /guru/:stambuk   : detail biodata
 *  - /edit/:db/:stb   : form edit per-kolom
 *  - /berkas/:stb     : panel berkas santri (A-I)
 *  - /berkas/file     : streaming gambar/PDF
 *  - /audit           : audit log
 *  - /ekspor          : ekspor biodata detail (admin)
 *  - /rekap-berkas    : rekap berkas per jenis (admin)
 *  - /validasi/santri : validasi data santri (admin)
 *  - /validasi/guru   : validasi data guru (admin)
 *  - /me              : halaman akun saya (ustadz/santri)
 *
 *  Semua rute memerlukan login session.
 *  Akses fitur global (cari semua, ekspor, rekap, validasi)
 *  HANYA untuk role 'admin'. Ustadz/santri hanya akses /me.
 *
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pusdatConfig from '../pusdat-config.js';
import * as dbAccess from './dbAccess.js';
import {
  updateRecordField,
  getEditableRecordByStambuk,
  listEditableFields,
  formatEditValue,
  inferAndNormalizeNewValue,
} from './dbEditor.js';
import {
  canAccessRecord,
  canEditRecord,
  isGlobalAccess,
  requireAuthRoles,
} from './dashboardAuth.js';
import * as validasiEvent from './validasiEvent.js';
import {
  generateSantriExcel,
  generateGuruExcel,
  generateRekapBerkasExcel,
  buildRekapBerkasPerJenis,
  PRESET_KOLOM_SANTRI,
  PRESET_KOLOM_GURU,
  DAFTAR_FOLDER_PRIMER,
  DAFTAR_FOLDER_SEKUNDER,
  DAFTAR_FOLDER_BERKAS as DAFTAR_FOLDER_BERKAS_EXT,
} from './dashboardExport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ════════════════════════════════════════════════
//  KONSTANTA FOLDER BERKAS
// ════════════════════════════════════════════════
// ★ v17: Fallback berlapis agar foto akses tetap muncul walau drive D: tidak ada.
function resolveBerkasInduk() {
  const candidates = [];
  if (pusdatConfig?.UPLOAD_BERKAS_ROOT) candidates.push(pusdatConfig.UPLOAD_BERKAS_ROOT);
  candidates.push('D:\\PUSAT DATA 2026\\01. MASTER DATA SANTRI\\01. BERKAS SANTRI');
  candidates.push(path.resolve(ROOT_DIR, 'database', 'berkas'));
  candidates.push(path.resolve(ROOT_DIR, 'tmp', 'berkas'));
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch (_) {}
  }
  // Auto-buat folder lokal untuk dev / Linux server
  const local = path.resolve(ROOT_DIR, 'database', 'berkas');
  try { fs.mkdirSync(local, { recursive: true }); } catch (_) {}
  return local;
}
const BERKAS_INDUK_DIR = resolveBerkasInduk();

const DAFTAR_FOLDER_BERKAS = DAFTAR_FOLDER_BERKAS_EXT;
const EKSTENSI_BERKAS = ['.jpg', '.jpeg', '.png', '.pdf'];

const AUDIT_LOG_PATH = path.resolve(ROOT_DIR, 'tmp', 'logs', 'pusdat-edit-data.log');
const BERKAS_LOG_PATH = path.resolve(ROOT_DIR, 'tmp', 'logs', 'pusdat-berkas-web.log');

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}
ensureDir(path.dirname(AUDIT_LOG_PATH));

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function writeBerkasLog(entry) {
  try {
    fs.appendFileSync(BERKAS_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch (_) {}
}

// ════════════════════════════════════════════════
//  HELPER: Cek file berkas
// ════════════════════════════════════════════════
function findBerkasFile(folder, stambuk) {
  for (const ext of EKSTENSI_BERKAS) {
    const fp = path.join(BERKAS_INDUK_DIR, folder, `${stambuk}${ext}`);
    try {
      if (fs.existsSync(fp)) {
        const stat = fs.statSync(fp);
        return { found: true, ext, filePath: fp, size: stat.size, mtime: stat.mtimeMs };
      }
    } catch (_) {}
  }
  return { found: false };
}

function listBerkasStatus(stambuk) {
  const out = [];
  for (const folder of DAFTAR_FOLDER_BERKAS) {
    const info = findBerkasFile(folder, stambuk);
    out.push({
      folder,
      kode: folder.charAt(0),
      tipe: DAFTAR_FOLDER_PRIMER.includes(folder) ? 'Primer' : 'Sekunder',
      ada: info.found,
      ext: info.ext || '',
      size: info.size || 0,
      mtime: info.mtime || 0,
    });
  }
  return out;
}

function getFotoAksesInfo(stambuk) {
  return findBerkasFile('A. FOTO AKSES', stambuk);
}

// ════════════════════════════════════════════════
//  HELPER: Pencarian lintas DB
// ════════════════════════════════════════════════
async function searchCombined(keyword) {
  const key = String(keyword || '').trim();
  if (!key) return { santri: [], guru: [] };

  const out = { santri: [], guru: [] };
  try {
    if (typeof dbAccess.cariSantri === 'function') {
      const r = await dbAccess.cariSantri(key);
      if (Array.isArray(r)) out.santri = r.slice(0, 50);
    }
  } catch (_) {}
  try {
    if (typeof dbAccess.cariGuru === 'function') {
      const r = await dbAccess.cariGuru(key);
      if (Array.isArray(r)) out.guru = r.slice(0, 50);
    }
  } catch (_) {}
  return out;
}

// ════════════════════════════════════════════════
//  TEMPLATE: layout HTML standar
// ════════════════════════════════════════════════
function basePage(title, body, extraHead = '', user = null) {
  const userBadge = user
    ? `<span style="background:rgba(255,255,255,.15);padding:5px 12px;border-radius:20px;font-size:12px;margin-right:10px">${escapeHtml(user.role.toUpperCase())} • ${escapeHtml(user.nama)}</span>`
    : '';

  const navLinks = user?.role === 'admin'
    ? `
      <a href="/">📊 Dashboard</a>
      <a href="/cari">🔍 Cari</a>
      <a href="/ekspor">📤 Ekspor</a>
      <a href="/rekap-berkas">🗃️ Rekap Berkas</a>
      <a href="/event-validasi">🎯 Event Validasi</a>
      <a href="/validasi/santri">✅ Val. Santri</a>
      <a href="/validasi/guru">✅ Val. Guru</a>
      <a href="/inspeksi" style="color:#fbbf24;font-weight:800">🔍 Inspeksi</a>
      <a href="/audit">📜 Audit Log</a>
      <a href="/logout">🚪 Logout</a>`
    : (user?.role === 'ustadz'
      ? `
      <a href="/me">👤 Akun Saya</a>
      <a href="/me/validasi">✅ Validasi Data</a>
      <a href="/logout">🚪 Logout</a>`
      : `
      <a href="/me">👤 Akun Saya</a>
      <a href="/logout">🚪 Logout</a>`);

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} • Data Center G5</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;font-family:'Segoe UI',Inter,Arial,sans-serif;background:#eef2f8;color:#1e293b;}
    a{color:#214e97;text-decoration:none}
    .topbar{display:flex;align-items:center;justify-content:space-between;
      background:linear-gradient(135deg,#214e97,#16376c);color:#fff;
      padding:0 20px;box-shadow:0 4px 16px rgba(0,0,0,.12);
      overflow-x:auto;scrollbar-width:none;min-height:52px;flex-wrap:nowrap;gap:0}
    .topbar::-webkit-scrollbar{display:none}
    .topbar h1{font-size:15px;margin:0;letter-spacing:.3px;white-space:nowrap;
      padding:0 14px 0 0;border-right:1px solid rgba(255,255,255,.2);margin-right:10px;flex:0 0 auto}
    .topbar nav{display:flex;align-items:center;flex:1;overflow-x:auto;scrollbar-width:none}
    .topbar nav::-webkit-scrollbar{display:none}
    .topbar nav a{color:rgba(255,255,255,.85);padding:17px 12px;font-size:12.5px;font-weight:600;
      white-space:nowrap;border-bottom:3px solid transparent;display:inline-flex;align-items:center}
    .topbar nav a:hover{color:#fff;border-bottom-color:#e57f1f;text-decoration:none}
    .topbar .right{display:flex;align-items:center;flex:0 0 auto;margin-left:8px;
      padding-left:10px;border-left:1px solid rgba(255,255,255,.2)}
    .container{max-width:1200px;margin:24px auto;padding:0 18px}
    .card{background:#fff;border-radius:16px;padding:22px 24px;
      box-shadow:0 6px 24px rgba(15,23,42,.06);margin-bottom:20px}
    .card h2{margin:0 0 14px;font-size:18px;color:#16376c;
      border-bottom:1px solid #e2e8f0;padding-bottom:10px}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    @media (max-width:900px){.grid-2,.grid-3{grid-template-columns:1fr}}
    input[type=text],input[type=search],input[type=password],select,textarea,input[type=file]{
      width:100%;padding:11px 13px;border:1.4px solid #d6deea;border-radius:10px;
      font-size:14px;background:#fff;color:#0f172a}
    input:focus,select:focus,textarea:focus{outline:none;border-color:#214e97;
      box-shadow:0 0 0 4px rgba(33,78,151,.10)}
    label{display:block;font-size:12px;font-weight:700;color:#243b63;margin-bottom:6px;
      text-transform:uppercase;letter-spacing:.6px}
    .btn{display:inline-block;padding:10px 18px;border:0;border-radius:10px;
      background:linear-gradient(135deg,#214e97,#16376c);color:#fff;font-weight:700;
      cursor:pointer;font-size:13px;text-decoration:none}
    .btn:hover{filter:brightness(1.06)}
    .btn-ghost{background:#fff;color:#214e97;border:1.4px solid #d6deea}
    .btn-danger{background:linear-gradient(135deg,#b42318,#7f1d1d)}
    .btn-success{background:linear-gradient(135deg,#15803d,#166534)}
    .btn-sm{padding:6px 12px;font-size:12px}
    .pill{display:inline-block;padding:3px 10px;background:#eaf0fa;color:#214e97;
      border-radius:999px;font-size:11px;font-weight:600}
    .pill.ok{background:#dcfce7;color:#166534}
    .pill.bad{background:#fee2e2;color:#991b1b}
    .pill.warn{background:#fef9c3;color:#854d0e}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{padding:9px 10px;text-align:left;border-bottom:1px solid #e2e8f0}
    th{background:#f8fafc;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
    tr:hover td{background:#f8fafc}
    .flash{padding:12px 14px;border-radius:10px;font-size:13px;margin-bottom:14px}
    .flash.ok{background:#dcfce7;color:#166534;border:1px solid #86efac}
    .flash.err{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
    .field-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px 18px}
    @media (max-width:900px){.field-grid{grid-template-columns:1fr}}
    .field-grid .full{grid-column:1/-1}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .breadcrumb{font-size:12px;color:#64748b;margin-bottom:14px}
    .breadcrumb a{color:#214e97}
    .empty{padding:30px;text-align:center;color:#64748b;font-style:italic}
    .berkas-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    @media (max-width:900px){.berkas-grid{grid-template-columns:1fr}}
    .berkas-card{border:1.4px solid #e2e8f0;border-radius:12px;padding:12px}
    .berkas-card h4{margin:0 0 4px;font-size:13px;color:#16376c}
    .berkas-card .actions{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}
    code.kbd{background:#f1f5f9;padding:2px 6px;border-radius:5px;font-size:12px;color:#0f172a}
    .small{font-size:12px;color:#64748b}
    .foto-akses-frame{display:flex;justify-content:center;align-items:center;
      padding:20px;background:#f8fafc;border-radius:14px;margin-bottom:18px}
    .foto-akses-frame img{max-width:240px;max-height:300px;border-radius:12px;
      box-shadow:0 6px 24px rgba(0,0,0,.12);border:3px solid #fff}
    .foto-akses-frame .no-foto{color:#64748b;font-style:italic;padding:80px 30px;
      text-align:center;background:#fff;border-radius:12px;width:100%}
    .stat-bar{height:18px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin:8px 0}
    .stat-bar .fill{height:100%;background:linear-gradient(90deg,#15803d,#22c55e);
      transition:width .3s ease}
    .stat-bar .fill.bad{background:linear-gradient(90deg,#b42318,#ef4444)}
    .toolbar-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;
      background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 22px;box-shadow:0 2px 8px rgba(15,23,42,.04)}
    .toolbar-top .toolbar-search{display:flex;gap:6px;flex:1;min-width:240px;max-width:480px}
    .toolbar-top .toolbar-search input{flex:1}
    .toolbar-top .toolbar-actions{display:flex;gap:6px;flex-wrap:wrap}
    @media (max-width:760px){.toolbar-top{padding:10px 14px}.toolbar-top .toolbar-search{max-width:100%}}
  </style>
  ${extraHead}
</head>
<body>
  <div class="topbar">
    <h1>🏫 Data Center G5 — Pusat Data PMDG Kampus 5</h1>
    <nav class="right">
      ${userBadge}
      ${navLinks}
    </nav>
  </div>
  ${user?.role === 'admin' ? `
  <div class="toolbar-top" role="toolbar" aria-label="Aksi Cepat">
    <form method="GET" action="/cari" class="toolbar-search">
      <input type="search" name="q" placeholder="🔍 Cari santri / guru..." aria-label="Pencarian global">
      <button class="btn btn-sm" type="submit">Cari</button>
    </form>
    <div class="toolbar-actions">
      <a class="btn btn-sm" href="/ekspor">📊 Ekspor</a>
      <a class="btn btn-sm btn-ghost" href="/rekap-berkas">📁 Rekap Berkas</a>
      <a class="btn btn-sm btn-ghost" href="/event-validasi">📅 Event Validasi</a>
      <a class="btn btn-sm btn-ghost" href="/validasi/santri">✅ Validasi Santri</a>
      <a class="btn btn-sm btn-ghost" href="/validasi/guru">✅ Validasi Guru</a>
      <a class="btn btn-sm btn-ghost" href="/audit">📜 Audit Log</a>
    </div>
  </div>` : ''}
  <div class="container">${body}</div>
</body>
</html>`;
}

// ════════════════════════════════════════════════
//  Renderer halaman: Search
// ════════════════════════════════════════════════
function renderSearchPage({ keyword = '', result = null, error = '', user = null } = {}) {
  let resultHtml = '';
  if (result) {
    const s = result.santri || [];
    const g = result.guru || [];
    resultHtml = `
      <div class="card">
        <h2>🎓 Hasil Pencarian Santri (${s.length})</h2>
        ${
          s.length
            ? `<table><thead><tr><th>Stambuk</th><th>Nama</th><th>Kelas</th><th>Rayon</th><th></th></tr></thead><tbody>
              ${s
                .map(
                  (it) => `<tr>
                    <td><code class="kbd">${escapeHtml(it.Stambuk || '')}</code></td>
                    <td>${escapeHtml(it['Nama Lengkap'] || '-')}</td>
                    <td>${escapeHtml(it.Kelas || '-')}</td>
                    <td>${escapeHtml(it.Rayon || '-')}</td>
                    <td class="row">
                      <a class="btn btn-sm" href="/santri/${encodeURIComponent(it.Stambuk)}">Detail</a>
                      <a class="btn btn-sm btn-ghost" href="/edit/santri/${encodeURIComponent(it.Stambuk)}">Edit</a>
                      <a class="btn btn-sm btn-ghost" href="/berkas/${encodeURIComponent(it.Stambuk)}">Berkas</a>
                    </td>
                  </tr>`,
                )
                .join('')}
              </tbody></table>`
            : '<div class="empty">Tidak ada santri ditemukan.</div>'
        }
      </div>
      <div class="card">
        <h2>👨‍🏫 Hasil Pencarian Guru (${g.length})</h2>
        ${
          g.length
            ? `<table><thead><tr><th>Stambuk</th><th>Nama</th><th>Status</th><th>Bagian</th><th></th></tr></thead><tbody>
              ${g
                .map(
                  (it) => `<tr>
                    <td><code class="kbd">${escapeHtml(it.Stambuk || '')}</code></td>
                    <td>${escapeHtml(it['Nama Lengkap'] || '-')}</td>
                    <td>${escapeHtml(it.Status || '-')}</td>
                    <td>${escapeHtml(it.Bagian || '-')}</td>
                    <td class="row">
                      <a class="btn btn-sm" href="/guru/${encodeURIComponent(it.Stambuk)}">Detail</a>
                      <a class="btn btn-sm btn-ghost" href="/edit/guru/${encodeURIComponent(it.Stambuk)}">Edit</a>
                    </td>
                  </tr>`,
                )
                .join('')}
              </tbody></table>`
            : '<div class="empty">Tidak ada guru ditemukan.</div>'
        }
      </div>`;
  }

  return basePage(
    'Pencarian',
    `<div class="breadcrumb"><a href="/">Beranda</a> » Pencarian</div>
     <div class="card">
       <h2>🔍 Cari Santri / Guru</h2>
       <form method="GET" action="/cari" class="row">
         <input type="search" name="q" value="${escapeHtml(keyword)}"
                placeholder="Ketik nama, stambuk, kelas, rayon, dll..." autofocus required>
         <button class="btn" type="submit">Cari</button>
       </form>
       <p class="small">_Tip: hasil akan muncul dari DB Santri DAN DB Guru sekaligus._</p>
       ${error ? `<div class="flash err">${escapeHtml(error)}</div>` : ''}
     </div>
     ${resultHtml}`,
    '',
    user,
  );
}

// ════════════════════════════════════════════════
//  Renderer: Detail biodata
//  ★ v16: foto akses di awal, berkas lengkap di akhir
// ════════════════════════════════════════════════
function renderDetailPage(dbType, record, options = {}) {
  const stambuk = record?.Stambuk || '-';
  const fields = listEditableFields(record);
  const user = options.user || null;

  const rows = fields
    .map((f) => {
      const val = formatEditValue(record[f]);
      return `<tr><th style="width:34%">${escapeHtml(f)}</th><td>${escapeHtml(val)}</td></tr>`;
    })
    .join('');

  // Foto akses di awal (khusus santri)
  let fotoAksesHtml = '';
  if (dbType === 'santri') {
    const fotoInfo = getFotoAksesInfo(String(stambuk));
    if (fotoInfo.found && ['.jpg', '.jpeg', '.png'].includes(fotoInfo.ext.toLowerCase())) {
      fotoAksesHtml = `
        <div class="foto-akses-frame">
          <img src="/berkas/file?stambuk=${encodeURIComponent(stambuk)}&kode=A" alt="Foto Akses ${escapeHtml(String(stambuk))}">
        </div>`;
    } else {
      fotoAksesHtml = `
        <div class="foto-akses-frame">
          <div class="no-foto">📷 Foto akses belum tersedia</div>
        </div>`;
    }
  }

  // Berkas lengkap di akhir (untuk santri)
  let berkasHtml = '';
  if (dbType === 'santri') {
    const statusList = listBerkasStatus(String(stambuk));
    const cards = statusList
      .map((it) => {
        const pill = it.ada
          ? `<span class="pill ok">Ada • ${escapeHtml(it.ext)}</span>`
          : `<span class="pill bad">Kosong</span>`;
        const tipePill = `<span class="pill ${it.tipe === 'Primer' ? 'warn' : ''}">${it.tipe}</span>`;
        const sizeKb = it.ada ? `${(it.size / 1024).toFixed(0)} KB` : '-';
        const viewBtn = it.ada
          ? `<a class="btn btn-sm" target="_blank" href="/berkas/file?stambuk=${encodeURIComponent(stambuk)}&kode=${encodeURIComponent(it.kode)}">👁️ Lihat</a>`
          : '';
        return `<div class="berkas-card">
          <h4>${escapeHtml(it.folder)}</h4>
          <div class="row">${pill} ${tipePill}</div>
          <div class="small" style="margin-top:6px">Ukuran: ${sizeKb}</div>
          <div class="actions">${viewBtn}</div>
        </div>`;
      })
      .join('');
    berkasHtml = `
      <div class="card">
        <h2>📁 Berkas Santri</h2>
        <p class="small">Klik <b>Lihat</b> untuk membuka file. Upload/replace bisa lewat halaman <a href="/berkas/${encodeURIComponent(stambuk)}">manajemen berkas</a>.</p>
        <div class="berkas-grid">${cards}</div>
      </div>`;
  }

  const canEdit = user && canEditRecord(user, dbType, stambuk);
  const editButton = canEdit
    ? `<a class="btn" href="/edit/${dbType}/${encodeURIComponent(stambuk)}">✏️ Edit Biodata</a>`
    : '';
  const berkasButton =
    dbType === 'santri' && (user?.role === 'admin' || canEdit)
      ? `<a class="btn btn-ghost" href="/berkas/${encodeURIComponent(stambuk)}">📁 Kelola Berkas</a>`
      : '';

  // ★ TOMBOL KEMBALI menggantikan tombol JSON
  const backTarget = user?.role === 'admin' ? '/cari' : '/';
  const backLabel = user?.role === 'admin' ? '← Kembali ke Pencarian' : '← Kembali';
  const backButton = `<a class="btn btn-ghost" href="${backTarget}">${backLabel}</a>`;

  const flash = options.flash || '';

  return basePage(
    `Detail ${dbType === 'santri' ? 'Santri' : 'Guru'} ${stambuk}`,
    `<div class="breadcrumb"><a href="/">Beranda</a> » <a href="${backTarget}">${user?.role === 'admin' ? 'Cari' : 'Beranda'}</a> » ${escapeHtml(String(stambuk))}</div>
     ${flash}
     ${fotoAksesHtml}
     <div class="card">
       <h2>${dbType === 'santri' ? '🎓' : '👨‍🏫'} Biodata ${escapeHtml(String(stambuk))} — ${escapeHtml(record['Nama Lengkap'] || '-')}</h2>
       <div class="row" style="margin-bottom:10px">
         ${editButton}
         ${berkasButton}
         ${backButton}
       </div>
       <table>${rows}</table>
     </div>
     ${berkasHtml}`,
    '',
    user,
  );
}

// ════════════════════════════════════════════════
//  Renderer: Form Edit
// ════════════════════════════════════════════════
function renderEditPage(dbType, record, flash = '', user = null) {
  const stambuk = record?.Stambuk || '-';
  const fields = listEditableFields(record);

  const inputs = fields
    .map((f) => {
      const val = formatEditValue(record[f]);
      const safeId = `f_${f.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const valForInput = val === '(kosong)' ? '' : val;
      return `<div>
        <label for="${safeId}">${escapeHtml(f)}</label>
        <input type="text" name="${escapeHtml(f)}" id="${safeId}" value="${escapeHtml(valForInput)}">
      </div>`;
    })
    .join('');

  const backTarget = `/${dbType}/${encodeURIComponent(stambuk)}`;

  // ★ Foto akses di awal untuk santri saat edit
  let fotoAksesHtml = '';
  if (dbType === 'santri') {
    const fotoInfo = getFotoAksesInfo(String(stambuk));
    if (fotoInfo.found && ['.jpg', '.jpeg', '.png'].includes(fotoInfo.ext.toLowerCase())) {
      fotoAksesHtml = `
        <div class="foto-akses-frame">
          <img src="/berkas/file?stambuk=${encodeURIComponent(stambuk)}&kode=A" alt="Foto Akses ${escapeHtml(String(stambuk))}">
        </div>`;
    }
  }

  // ★ Berkas di akhir form edit (info-only, link ke kelola berkas)
  let berkasInfoHtml = '';
  if (dbType === 'santri') {
    const statusList = listBerkasStatus(String(stambuk));
    const items = statusList
      .map((it) => {
        const pill = it.ada
          ? `<span class="pill ok">Ada (${escapeHtml(it.ext)})</span>`
          : `<span class="pill bad">Belum ada</span>`;
        return `<tr><td>${escapeHtml(it.folder)}</td><td><span class="pill ${it.tipe === 'Primer' ? 'warn' : ''}">${it.tipe}</span></td><td>${pill}</td></tr>`;
      })
      .join('');
    berkasInfoHtml = `
      <div class="card">
        <h2>📁 Status Berkas Santri</h2>
        <p class="small">Untuk mengelola berkas, gunakan halaman <a href="/berkas/${encodeURIComponent(stambuk)}">manajemen berkas</a>.</p>
        <table>
          <thead><tr><th>Folder</th><th>Tipe</th><th>Status</th></tr></thead>
          <tbody>${items}</tbody>
        </table>
      </div>`;
  }

  return basePage(
    `Edit ${dbType === 'santri' ? 'Santri' : 'Guru'} ${stambuk}`,
    `<div class="breadcrumb"><a href="/">Beranda</a> » <a href="${backTarget}">${escapeHtml(String(stambuk))}</a> » Edit</div>
     ${flash}
     ${fotoAksesHtml}
     <div class="card">
       <h2>✏️ Edit ${dbType === 'santri' ? 'Santri' : 'Guru'} — ${escapeHtml(String(stambuk))}</h2>
       <p class="small">Ubah nilai yang ingin diperbarui lalu klik <b>Simpan Perubahan</b>.
       Kosongkan input untuk mengosongkan kolom. Tanggal: <code class="kbd">DD-MM-YYYY</code>.</p>
       <form method="POST" action="/edit/${dbType}/${encodeURIComponent(stambuk)}">
         <div class="field-grid">${inputs}</div>
         <div class="row" style="margin-top:18px">
           <button type="submit" class="btn">💾 Simpan Perubahan</button>
           <a class="btn btn-ghost" href="${backTarget}">← Kembali</a>
         </div>
       </form>
     </div>
     ${berkasInfoHtml}`,
    '',
    user,
  );
}

// ════════════════════════════════════════════════
//  Renderer: Halaman Berkas Santri
// ════════════════════════════════════════════════
function renderBerkasPage(stambuk, santri, statusList, flash = '', user = null) {
  const nama = santri?.['Nama Lengkap'] || '-';
  const kelas = santri?.Kelas || '-';

  const cards = statusList
    .map((it) => {
      const pill = it.ada
        ? `<span class="pill ok">Ada • ${escapeHtml(it.ext)}</span>`
        : `<span class="pill bad">Kosong</span>`;
      const tipePill = `<span class="pill ${it.tipe === 'Primer' ? 'warn' : ''}">${it.tipe}</span>`;
      const sizeKb = it.ada ? `${(it.size / 1024).toFixed(0)} KB` : '-';
      const viewBtn = it.ada
        ? `<a class="btn btn-sm" target="_blank" href="/berkas/file?stambuk=${encodeURIComponent(stambuk)}&kode=${encodeURIComponent(it.kode)}">👁️ Lihat</a>`
        : '';
      const dlBtn = it.ada
        ? `<a class="btn btn-sm btn-ghost" href="/berkas/download?stambuk=${encodeURIComponent(stambuk)}&kode=${encodeURIComponent(it.kode)}">⬇️ Download</a>`
        : '';
      return `<div class="berkas-card">
        <h4>${escapeHtml(it.folder)}</h4>
        <div class="row">${pill} ${tipePill}</div>
        <div class="small" style="margin-top:6px">Ukuran: ${sizeKb}</div>
        <div class="actions">
          ${viewBtn}
          ${dlBtn}
          <form method="POST" action="/berkas/upload" enctype="multipart/form-data" class="row" style="display:inline-flex">
            <input type="hidden" name="stambuk" value="${escapeHtml(stambuk)}">
            <input type="hidden" name="kode" value="${escapeHtml(it.kode)}">
            <input type="file" name="file" accept=".jpg,.jpeg,.png,.pdf" required style="font-size:11px">
            <button type="submit" class="btn btn-sm btn-ghost">⬆️ ${it.ada ? 'Replace' : 'Upload'}</button>
          </form>
        </div>
      </div>`;
    })
    .join('');

  return basePage(
    `Berkas Santri ${stambuk}`,
    `<div class="breadcrumb"><a href="/">Beranda</a> » <a href="/santri/${encodeURIComponent(stambuk)}">${escapeHtml(String(stambuk))}</a> » Berkas</div>
     ${flash}
     <div class="card">
       <h2>📁 Berkas — ${escapeHtml(String(stambuk))} • ${escapeHtml(nama)} • ${escapeHtml(kelas)}</h2>
       <div class="row" style="margin-bottom:12px">
         <a class="btn btn-ghost" href="/santri/${encodeURIComponent(stambuk)}">← Kembali ke Detail</a>
       </div>
       <p class="small">Upload akan menggantikan file existing dengan nomor stambuk yang sama.</p>
       <div class="berkas-grid">${cards}</div>
     </div>`,
    '',
    user,
  );
}

// ════════════════════════════════════════════════
//  Renderer: Audit Log
// ════════════════════════════════════════════════
function renderAuditPage(entries, user = null) {
  const rows = entries
    .map(
      (e) => `<tr>
        <td>${escapeHtml(e.time || '-')}</td>
        <td><span class="pill">${escapeHtml(e.dbLabel || e.dbType || '-')}</span></td>
        <td><code class="kbd">${escapeHtml(e.stambuk || '-')}</code></td>
        <td>${escapeHtml(e.field || '-')}</td>
        <td>${escapeHtml(e.before || '-')}</td>
        <td>${escapeHtml(e.after || '-')}</td>
        <td>${escapeHtml(e.actor || '-')}</td>
      </tr>`,
    )
    .join('');

  return basePage(
    'Audit Log',
    `<div class="breadcrumb"><a href="/">Beranda</a> » Audit Log</div>
     <div class="card">
       <h2>📜 Audit Log Perubahan Data (${entries.length} entri terakhir)</h2>
       <div class="row" style="margin-bottom:12px">
         <a class="btn btn-ghost" href="/">← Kembali ke Beranda</a>
       </div>
       ${
         entries.length
           ? `<table><thead><tr><th>Waktu</th><th>DB</th><th>Stambuk</th><th>Kolom</th><th>Sebelum</th><th>Sesudah</th><th>Aktor</th></tr></thead><tbody>${rows}</tbody></table>`
           : '<div class="empty">Belum ada riwayat perubahan.</div>'
       }
     </div>`,
    '',
    user,
  );
}

// ════════════════════════════════════════════════
//  Renderer: Halaman Ekspor (admin)
// ════════════════════════════════════════════════
function renderEksporPage(user = null, flash = '') {
  const presetSantriOpts = Object.keys(PRESET_KOLOM_SANTRI)
    .map((k) => `<option value="${k}">${k.toUpperCase()}</option>`)
    .join('');
  const presetGuruOpts = Object.keys(PRESET_KOLOM_GURU)
    .map((k) => `<option value="${k}">${k.toUpperCase()}</option>`)
    .join('');

  return basePage(
    'Ekspor Biodata',
    `<div class="breadcrumb"><a href="/">Beranda</a> » Ekspor Biodata</div>
     ${flash}
     <div class="card">
       <h2>📊 Ekspor Biodata Santri (Excel)</h2>
       <p class="small">Sama seperti fitur <code class="kbd">.eksporfull</code> di bot WA, tapi dengan opsi preset & filter yang lebih detail.</p>
       <form method="GET" action="/ekspor/santri" target="_blank">
         <div class="field-grid">
           <div>
             <label>Preset Kolom</label>
             <select name="preset">
               ${presetSantriOpts}
             </select>
           </div>
           <div>
             <label>Kolom Filter</label>
             <input type="text" name="kolom" placeholder="Contoh: Kelas, Rayon, Daerah, atau ketik 'Semua'" value="Semua">
           </div>
           <div class="full">
             <label>Nilai Filter</label>
             <input type="text" name="nilai" placeholder="Contoh: 3 Int B (kosongkan jika 'Semua')">
           </div>
         </div>
         <div class="row" style="margin-top:18px">
           <button type="submit" class="btn">⬇️ Download Excel Santri</button>
           <a class="btn btn-ghost" href="/">← Kembali</a>
         </div>
       </form>
     </div>

     <div class="card">
       <h2>📊 Ekspor Biodata Guru (Excel)</h2>
       <form method="GET" action="/ekspor/guru" target="_blank">
         <div class="field-grid">
           <div>
             <label>Preset Kolom</label>
             <select name="preset">
               ${presetGuruOpts}
             </select>
           </div>
           <div>
             <label>Keyword (opsional)</label>
             <input type="text" name="keyword" placeholder="Cari guru tertentu, atau kosongkan untuk semua">
           </div>
         </div>
         <div class="row" style="margin-top:18px">
           <button type="submit" class="btn">⬇️ Download Excel Guru</button>
           <a class="btn btn-ghost" href="/">← Kembali</a>
         </div>
       </form>
     </div>

     <div class="card">
       <h2>ℹ️ Penjelasan Preset</h2>
       <table>
         <thead><tr><th>Preset</th><th>Kolom</th></tr></thead>
         <tbody>
           ${Object.entries(PRESET_KOLOM_SANTRI)
             .map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v ? v.join(', ') : '(semua kolom dari DB)'}</td></tr>`)
             .join('')}
         </tbody>
       </table>
     </div>`,
    '',
    user,
  );
}

// ════════════════════════════════════════════════
//  Renderer: Halaman Rekap Berkas (admin)
// ════════════════════════════════════════════════
function renderRekapBerkasPage(rekap, flash = '', user = null) {
  const folderRows = rekap.folders
    .map((f) => {
      const pct = f.total > 0 ? Math.round((f.ada / f.total) * 100) : 0;
      const tipeClass = f.tipe === 'Primer' ? 'warn' : '';
      return `<tr>
        <td><b>${escapeHtml(f.kode)}</b></td>
        <td>${escapeHtml(f.folder)}</td>
        <td><span class="pill ${tipeClass}">${f.tipe}</span></td>
        <td><span class="pill ok">${f.ada}</span></td>
        <td><span class="pill bad">${f.kosong}</span></td>
        <td>${f.total}</td>
        <td>
          <div class="stat-bar"><div class="fill ${pct < 50 ? 'bad' : ''}" style="width:${pct}%"></div></div>
          <span class="small">${pct}%</span>
        </td>
        <td>
          <a class="btn btn-sm btn-ghost" href="/rekap-berkas/detail?kode=${encodeURIComponent(f.kode)}&kelas=${encodeURIComponent(rekap.kelasFilter || 'Semua')}">📋 Daftar</a>
        </td>
      </tr>`;
    })
    .join('');

  return basePage(
    'Rekap Berkas per Jenis',
    `<div class="breadcrumb"><a href="/">Beranda</a> » Rekap Berkas per Jenis</div>
     ${flash}
     <div class="card">
       <h2>📁 Rekap Berkas per Jenis</h2>
       <p class="small">Menampilkan jumlah berkas yang ada/kosong per jenis berkas (A-I). Bisa di-filter per kelas. Hasil bisa di-download dalam Excel multi-sheet.</p>
       <form method="GET" action="/rekap-berkas" class="row">
         <input type="text" name="kelas" value="${escapeHtml(rekap.kelasFilter || 'Semua')}" placeholder="Filter kelas (Contoh: 3 Int B, atau 'Semua')">
         <button class="btn" type="submit">Filter</button>
         <a class="btn btn-success" href="/rekap-berkas/excel?kelas=${encodeURIComponent(rekap.kelasFilter || 'Semua')}">⬇️ Download Excel</a>
         <a class="btn btn-ghost" href="/">← Kembali</a>
       </form>
     </div>

     <div class="card">
       <h2>📊 Ringkasan (Total santri target: ${rekap.total})</h2>
       <table>
         <thead><tr>
           <th>Kode</th><th>Folder</th><th>Tipe</th>
           <th>Ada</th><th>Belum</th><th>Total</th><th>% Ada</th><th>Aksi</th>
         </tr></thead>
         <tbody>${folderRows}</tbody>
       </table>
     </div>`,
    '',
    user,
  );
}

function renderRekapBerkasDetailPage(folder, belumPunya, user = null) {
  const rows = belumPunya
    .map(
      (s, i) => `<tr>
        <td>${i + 1}</td>
        <td><code class="kbd">${escapeHtml(s.Stambuk || '-')}</code></td>
        <td>${escapeHtml(s['Nama Lengkap'] || '-')}</td>
        <td>${escapeHtml(s.Kelas || '-')}</td>
        <td><a class="btn btn-sm" href="/santri/${encodeURIComponent(s.Stambuk)}">Detail</a></td>
      </tr>`,
    )
    .join('');

  return basePage(
    `Daftar Belum Punya Berkas: ${folder}`,
    `<div class="breadcrumb"><a href="/">Beranda</a> » <a href="/rekap-berkas">Rekap Berkas</a> » Detail</div>
     <div class="card">
       <h2>📋 Daftar Santri Belum Punya Berkas: ${escapeHtml(folder)}</h2>
       <div class="row" style="margin-bottom:12px">
         <a class="btn btn-ghost" href="/rekap-berkas">← Kembali ke Rekap</a>
       </div>
       ${
         belumPunya.length === 0
           ? '<div class="empty">✅ Semua santri sudah punya berkas ini.</div>'
           : `<p class="small">Total: <b>${belumPunya.length}</b> santri belum punya berkas.</p>
              <table>
                <thead><tr><th>#</th><th>Stambuk</th><th>Nama</th><th>Kelas</th><th>Aksi</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>`
       }
     </div>`,
    '',
    user,
  );
}

// ════════════════════════════════════════════════
//  Renderer: Halaman Validasi Data (admin)
// ════════════════════════════════════════════════
function renderValidasiPage(dbType, result, flash = '', user = null) {
  const dbLabel = dbType === 'santri' ? 'Santri' : 'Guru';
  const dbIcon = dbType === 'santri' ? '🎓' : '👨‍🏫';

  let rowsHtml = '';
  if (result?.items?.length) {
    rowsHtml = result.items
      .slice(0, 200)
      .map(
        (it, i) => `<tr>
          <td>${i + 1}</td>
          <td><code class="kbd">${escapeHtml(it.Stambuk || '-')}</code></td>
          <td>${escapeHtml(it['Nama Lengkap'] || '-')}</td>
          <td>${escapeHtml(it.Kelas || it.Status || '-')}</td>
          <td>${it.kosongFields.map((f) => `<span class="pill bad">${escapeHtml(f)}</span>`).join(' ')}</td>
          <td><a class="btn btn-sm" href="/${dbType}/${encodeURIComponent(it.Stambuk)}">Detail</a></td>
        </tr>`,
      )
      .join('');
  }

  return basePage(
    `Validasi Data ${dbLabel}`,
    `<div class="breadcrumb"><a href="/">Beranda</a> » Validasi Data ${escapeHtml(dbLabel)}</div>
     ${flash}
     <div class="card">
       <h2>${dbIcon} Validasi Data ${escapeHtml(dbLabel)}</h2>
       <p class="small">Halaman ini memeriksa kelengkapan kolom penting dari data ${dbLabel.toLowerCase()} aktif. Data dianggap "kurang lengkap" bila salah satu kolom penting masih kosong.</p>
       <div class="row" style="margin-bottom:12px">
         <a class="btn btn-ghost" href="/">← Kembali ke Beranda</a>
       </div>
     </div>

     <div class="card">
       <h2>📊 Ringkasan</h2>
       <div class="grid-3">
         <div>
           <label>Total ${dbLabel} Aktif</label>
           <div style="font-size:32px;font-weight:800;color:#16376c">${result?.total || 0}</div>
         </div>
         <div>
           <label>Lengkap</label>
           <div style="font-size:32px;font-weight:800;color:#15803d">${result?.lengkap || 0}</div>
         </div>
         <div>
           <label>Kurang Lengkap</label>
           <div style="font-size:32px;font-weight:800;color:#b42318">${result?.items?.length || 0}</div>
         </div>
       </div>
       <p class="small" style="margin-top:14px">Kolom yang diperiksa: <code class="kbd">${(result?.checkFields || []).join(', ')}</code></p>
     </div>

     <div class="card">
       <h2>📋 Daftar ${dbLabel} dengan Data Kurang Lengkap</h2>
       ${
         result?.items?.length
           ? `<p class="small">Menampilkan ${Math.min(result.items.length, 200)} dari ${result.items.length} entri.</p>
              <table>
                <thead><tr><th>#</th><th>Stambuk</th><th>Nama</th><th>${dbType === 'santri' ? 'Kelas' : 'Status'}</th><th>Kolom Kosong</th><th>Aksi</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
              </table>`
           : '<div class="empty">✅ Semua data sudah lengkap.</div>'
       }
     </div>`,
    '',
    user,
  );
}

// ════════════════════════════════════════════════
//  Renderer: Halaman /me (ustadz / santri)
// ════════════════════════════════════════════════
function renderMePage(user, record, flash = '') {
  const dbType = user.role === 'santri' ? 'santri' : 'guru';
  const stambuk = user.stambuk;
  if (!record) {
    return basePage(
      'Akun Saya',
      `<div class="card flash err">❌ Data Anda tidak ditemukan di database (stambuk ${escapeHtml(String(stambuk))}).</div>`,
      '',
      user,
    );
  }

  // ★ v18: Tampilkan banner event validasi yang aktif (khusus ustadz)
  let eventBanner = '';
  if (user.role === 'ustadz') {
    try {
      const openEv = validasiEvent.getOpenEvent();
      if (openEv) {
        const sudah = !!openEv.submissions?.[String(stambuk)];
        const eff = validasiEvent.getEffectiveDeadline(openEv);
        const exts = Array.isArray(openEv.extensions) ? openEv.extensions : [];
        if (sudah) {
          eventBanner = `<div class="card" style="border-left:5px solid #15803d;background:#f0fdf4">
            <h2 style="border:0;margin:0 0 6px;color:#166534">✅ Validasi Data: ${escapeHtml(openEv.title)}</h2>
            <p style="margin:0">Anda <b>sudah</b> validasi. Batas waktu: <b>${escapeHtml(validasiEvent.formatTanggalRingkasWIB(eff))}</b>.
            <a href="/me/validasi/${encodeURIComponent(openEv.id)}" style="margin-left:8px">Lihat detail →</a></p>
          </div>`;
        } else {
          eventBanner = `<div class="card" style="border-left:5px solid #b42318;background:#fff5f5">
            <h2 style="border:0;margin:0 0 6px;color:#991b1b">📅 Validasi Data Aktif: ${escapeHtml(openEv.title)}</h2>
            <p style="margin:0 0 8px">${escapeHtml(openEv.description || '')}</p>
            <p style="margin:0 0 10px">⏰ Batas waktu: <b>${escapeHtml(validasiEvent.formatTanggalRingkasWIB(eff))}</b>
            ${exts.length ? `<span class="pill warn" style="margin-left:6px">Diperpanjang ${exts.length}×</span>` : ''}</p>
            <a class="btn" href="/me/validasi/${encodeURIComponent(openEv.id)}">✍️ Validasi Data Saya Sekarang</a>
          </div>`;
        }
      }
    } catch (err) {
      console.error('[ME-VALIDASI-BANNER]', err.message);
    }
  }

  const combinedFlash = (eventBanner || '') + (flash || '');
  return renderDetailPage(dbType, record, { flash: combinedFlash, user });
}

// ════════════════════════════════════════════════
//  HELPER: flash message via session
// ════════════════════════════════════════════════
function takeFlash(req) {
  if (!req.session) return '';
  const f = req.session.flash;
  if (!f) return '';
  req.session.flash = null;
  const cls = f.kind === 'err' ? 'err' : 'ok';
  return `<div class="flash ${cls}">${escapeHtml(f.text)}</div>`;
}

function setFlash(req, kind, text) {
  if (!req.session) return;
  req.session.flash = { kind, text };
}

// ════════════════════════════════════════════════
//  HELPER: Validasi data
// ════════════════════════════════════════════════
// ★ v17: Validasi mencakup seluruh kolom penting + EMIS + Eprimer Pondok.
const VALIDASI_FIELDS_SANTRI = [
  'Nama Lengkap',
  'Tempat Lahir',
  'Tanggal Lahir',
  'Jenis Kelamin',
  'Kelas',
  'Rayon',
  'Kamar Rayon',
  'No KK',
  'No KTP',
  'NISN',
  'EMIS',
  'Eprimer Pondok',
  'Ayah_Nama',
  'Ibu_Nama',
  'Alamat',
];
const VALIDASI_FIELDS_GURU = [
  'Nama Lengkap',
  'Tempat Lahir',
  'Tanggal Lahir',
  'Jenis Kelamin',
  'Status',
  'Bagian',
  'No HP',
  'No KTP',
  'NUPTK',
  'EMIS',
  'Eprimer Pondok',
];

function isCellEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

async function buildValidasiData(dbType) {
  let all = [];
  const checkFields =
    dbType === 'santri' ? VALIDASI_FIELDS_SANTRI : VALIDASI_FIELDS_GURU;
  // ★ v17: alias kolom untuk validasi (kalau salah satu terisi maka dianggap lengkap)
  const FIELD_ALIASES = {
    'No HP': ['No HP', 'No. HP', 'NoHp', 'No_HP', 'No Telp', 'No. Telp', 'Handphone', 'HP', 'WA'],
    'EMIS': ['EMIS', 'Emis', 'E M I S'],
    'Eprimer Pondok': ['Eprimer Pondok', 'Eprimer', 'E Primer Pondok', 'EprimerPondok'],
    'NUPTK': ['NUPTK', 'Nuptk'],
    'No KTP': ['No KTP', 'NIK'],
    'No KK': ['No KK', 'No. KK', 'NoKK'],
    'Tempat Lahir': ['Tempat Lahir', 'Tempatlahir', 'TempatLahir'],
  };
  const hasValueWithAliases = (row, field) => {
    const variants = FIELD_ALIASES[field] || [field];
    for (const k of variants) {
      if (!isCellEmpty(row[k])) return true;
    }
    return false;
  };

  if (dbType === 'santri') {
    try {
      const raw = await dbAccess.getFilteredSantriAll('Semua', '');
      all = Array.isArray(raw) ? raw : [];
    } catch (err) {
      console.error('[VALIDASI] getFilteredSantriAll error:', err.message);
    }
  } else {
    try {
      const raw = await dbAccess.getDirektoriGuru();
      all = Array.isArray(raw) ? raw : [];
    } catch (err) {
      console.error('[VALIDASI] getDirektoriGuru error:', err.message);
    }
  }

  let lengkap = 0;
  const items = [];
  for (const row of all) {
    const kosong = [];
    for (const f of checkFields) {
      if (!hasValueWithAliases(row, f)) kosong.push(f);
    }
    if (kosong.length === 0) {
      lengkap++;
    } else {
      items.push({
        Stambuk: row.Stambuk,
        'Nama Lengkap': row['Nama Lengkap'],
        Kelas: row.Kelas,
        Status: row.Status,
        kosongFields: kosong,
      });
    }
  }

  return { total: all.length, lengkap, items, checkFields };
}

// ════════════════════════════════════════════════
//  EXPORT: register routes ke Express app
// ════════════════════════════════════════════════
export function registerEditorRoutes(app, requireAuth) {
  // ──────── /me (ustadz / santri) ────────
  app.get('/me', requireAuth, async (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');
    if (user.role === 'admin') return res.redirect('/');

    const dbType = user.role === 'santri' ? 'santri' : 'guru';
    try {
      const record = await getEditableRecordByStambuk(dbType, user.stambuk);
      res.send(renderMePage(user, record, takeFlash(req)));
    } catch (err) {
      res.status(500).send(basePage('Error', `<div class="card flash err">${escapeHtml(err.message)}</div>`, '', user));
    }
  });

  // ──────── /cari (admin only) ────────
  app.get('/cari', requireAuthRoles(['admin']), async (req, res) => {
    const keyword = String(req.query.q || '').trim();
    try {
      const result = keyword ? await searchCombined(keyword) : null;
      res.send(renderSearchPage({ keyword, result, user: req.session.user }));
    } catch (err) {
      res.send(renderSearchPage({ keyword, error: err.message, user: req.session.user }));
    }
  });

  app.get('/api/cari', requireAuthRoles(['admin']), async (req, res) => {
    const keyword = String(req.query.q || '').trim();
    try {
      const result = await searchCombined(keyword);
      res.json({ ok: true, keyword, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ──────── /santri/:stambuk ────────
  app.get('/santri/:stambuk', requireAuth, async (req, res) => {
    const user = req.session.user;
    if (!canAccessRecord(user, 'santri', req.params.stambuk)) {
      return res.status(403).send(basePage('Akses Ditolak', `<div class="card flash err">🚫 Anda tidak diizinkan melihat data ini.</div>`, '', user));
    }
    try {
      const r = await getEditableRecordByStambuk('santri', req.params.stambuk);
      if (!r) {
        setFlash(req, 'err', `Stambuk ${req.params.stambuk} tidak ditemukan di DB Santri.`);
        return res.redirect(user.role === 'admin' ? '/cari' : '/me');
      }
      res.send(renderDetailPage('santri', r, { flash: takeFlash(req), user }));
    } catch (err) {
      res.status(500).send(basePage('Error', `<div class="card flash err">${escapeHtml(err.message)}</div>`, '', user));
    }
  });

  app.get('/guru/:stambuk', requireAuth, async (req, res) => {
    const user = req.session.user;
    if (!canAccessRecord(user, 'guru', req.params.stambuk)) {
      return res.status(403).send(basePage('Akses Ditolak', `<div class="card flash err">🚫 Anda tidak diizinkan melihat data ini.</div>`, '', user));
    }
    try {
      const r = await getEditableRecordByStambuk('guru', req.params.stambuk);
      if (!r) {
        setFlash(req, 'err', `Stambuk ${req.params.stambuk} tidak ditemukan di DB Guru.`);
        return res.redirect(user.role === 'admin' ? '/cari' : '/me');
      }
      res.send(renderDetailPage('guru', r, { flash: takeFlash(req), user }));
    } catch (err) {
      res.status(500).send(basePage('Error', `<div class="card flash err">${escapeHtml(err.message)}</div>`, '', user));
    }
  });

  // ──────── /edit/:db/:stambuk (GET & POST) ────────
  app.get('/edit/:db/:stambuk', requireAuth, async (req, res) => {
    const user = req.session.user;
    const db = req.params.db === 'guru' ? 'guru' : 'santri';
    if (!canEditRecord(user, db, req.params.stambuk)) {
      return res.status(403).send(basePage('Akses Ditolak', `<div class="card flash err">🚫 Anda tidak diizinkan mengedit data ini. Anda hanya bisa mengedit akun Anda sendiri.</div>`, '', user));
    }
    try {
      const r = await getEditableRecordByStambuk(db, req.params.stambuk);
      if (!r) {
        setFlash(req, 'err', `Stambuk ${req.params.stambuk} tidak ditemukan.`);
        return res.redirect(user.role === 'admin' ? '/cari' : '/me');
      }
      res.send(renderEditPage(db, r, takeFlash(req), user));
    } catch (err) {
      res.status(500).send(basePage('Error', `<div class="card flash err">${escapeHtml(err.message)}</div>`, '', user));
    }
  });

  app.post('/edit/:db/:stambuk', requireAuth, async (req, res) => {
    const user = req.session.user;
    const db = req.params.db === 'guru' ? 'guru' : 'santri';
    const stambuk = req.params.stambuk;
    if (!canEditRecord(user, db, stambuk)) {
      setFlash(req, 'err', '🚫 Anda tidak diizinkan mengedit data ini.');
      return res.redirect(user.role === 'admin' ? '/cari' : '/me');
    }
    const actor = `web:${user.role}:${user.stambuk || user.label}`;
    try {
      const current = await getEditableRecordByStambuk(db, stambuk);
      if (!current) {
        setFlash(req, 'err', `Stambuk ${stambuk} tidak ditemukan.`);
        return res.redirect(user.role === 'admin' ? '/cari' : '/me');
      }

      const changes = [];
      for (const [field, raw] of Object.entries(req.body || {})) {
        if (!(field in current)) continue;
        const currentVal = current[field];
        const currentDisplay = formatEditValue(currentVal);
        const newRaw = String(raw == null ? '' : raw).trim();
        const newDisplay = newRaw === '' ? '(kosong)' : newRaw;
        if (currentDisplay === newDisplay) continue;
        changes.push({ field, raw: newRaw === '' ? '[KOSONGKAN]' : newRaw });
      }

      if (changes.length === 0) {
        setFlash(req, 'ok', 'Tidak ada perubahan yang dideteksi.');
        return res.redirect(`/${db}/${encodeURIComponent(stambuk)}`);
      }

      const results = [];
      for (const ch of changes) {
        try {
          const r = await updateRecordField(db, stambuk, ch.field, ch.raw, actor);
          results.push({ ok: true, field: ch.field, before: r.beforeDisplay, after: r.afterDisplay });
        } catch (err) {
          results.push({ ok: false, field: ch.field, error: err.message });
        }
      }

      const ok = results.filter((r) => r.ok).length;
      const fail = results.length - ok;
      const msg =
        fail === 0
          ? `✅ ${ok} kolom berhasil disimpan: ${results.map((r) => r.field).join(', ')}`
          : `⚠️ ${ok} berhasil, ${fail} gagal. Detail: ${results
              .map((r) => `${r.field}=${r.ok ? 'ok' : r.error}`)
              .join(' | ')}`;
      setFlash(req, fail === 0 ? 'ok' : 'err', msg);
      res.redirect(`/${db}/${encodeURIComponent(stambuk)}`);
    } catch (err) {
      setFlash(req, 'err', `Gagal menyimpan: ${err.message}`);
      res.redirect(`/edit/${db}/${encodeURIComponent(stambuk)}`);
    }
  });

  // ──────── /api/edit (JSON, untuk integrasi) ────────
  app.post('/api/edit', requireAuth, async (req, res) => {
    const user = req.session.user;
    const { db, stambuk, field, value } = req.body || {};
    const dbType = db === 'guru' ? 'guru' : 'santri';
    if (!canEditRecord(user, dbType, stambuk)) {
      return res.status(403).json({ ok: false, error: 'Akses ditolak — Anda tidak boleh mengedit data ini.' });
    }
    try {
      const r = await updateRecordField(
        dbType,
        stambuk,
        field,
        value == null ? '' : String(value),
        `web-api:${user.role}:${user.stambuk || user.label}`,
      );
      res.json({
        ok: true,
        db: r.dbLabel,
        stambuk: r.stambuk,
        field: r.field,
        before: r.beforeDisplay,
        after: r.afterDisplay,
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ──────── /berkas/:stambuk ────────
  app.get('/berkas/:stambuk', requireAuth, async (req, res) => {
    const user = req.session.user;
    const stambuk = String(req.params.stambuk || '').replace(/[^0-9]/g, '');
    if (!canAccessRecord(user, 'santri', stambuk)) {
      return res.status(403).send(basePage('Akses Ditolak', `<div class="card flash err">🚫 Anda tidak diizinkan mengakses berkas ini.</div>`, '', user));
    }
    try {
      const santri = await getEditableRecordByStambuk('santri', stambuk);
      if (!santri) {
        setFlash(req, 'err', `Stambuk ${stambuk} tidak ditemukan di DB Santri.`);
        return res.redirect(user.role === 'admin' ? '/cari' : '/me');
      }
      const statusList = listBerkasStatus(stambuk);
      res.send(renderBerkasPage(stambuk, santri, statusList, takeFlash(req), user));
    } catch (err) {
      res.status(500).send(basePage('Error', `<div class="card flash err">${escapeHtml(err.message)}</div>`, '', user));
    }
  });

  app.get('/api/berkas/list', requireAuth, async (req, res) => {
    const user = req.session.user;
    const stambuk = String(req.query.stambuk || '').replace(/[^0-9]/g, '');
    if (!stambuk) return res.status(400).json({ ok: false, error: 'stambuk wajib' });
    if (!canAccessRecord(user, 'santri', stambuk)) {
      return res.status(403).json({ ok: false, error: 'akses ditolak' });
    }
    res.json({ ok: true, stambuk, items: listBerkasStatus(stambuk) });
  });

  // ──────── /berkas/file (stream gambar/pdf) ────────
  app.get('/berkas/file', requireAuth, async (req, res) => {
    const user = req.session.user;
    const stambuk = String(req.query.stambuk || '').replace(/[^0-9]/g, '');
    const kode = String(req.query.kode || '').toUpperCase();
    const folder = DAFTAR_FOLDER_BERKAS.find((f) => f.charAt(0) === kode);
    if (!stambuk || !folder) return res.status(400).send('Parameter tidak valid');
    if (!canAccessRecord(user, 'santri', stambuk)) {
      return res.status(403).send('Akses ditolak');
    }
    const info = findBerkasFile(folder, stambuk);
    if (!info.found) {
      // ★ v17: 404 user-friendly, tidak tampil broken-image
      res.set('Cache-Control', 'no-store');
      return res.status(404).send('File tidak ditemukan');
    }
    const ext = String(info.ext || '').toLowerCase();
    const mime = ext === '.pdf' ? 'application/pdf'
              : ext === '.png' ? 'image/png'
              : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
              : 'application/octet-stream';
    res.set('Content-Type', mime);
    res.set('Cache-Control', 'private, max-age=60');
    res.sendFile(info.filePath);
  });

  // ★ v17: /berkas/download — paksa attachment header agar tombol "Download" bekerja
  app.get('/berkas/download', requireAuth, async (req, res) => {
    const user = req.session.user;
    const stambuk = String(req.query.stambuk || '').replace(/[^0-9]/g, '');
    const kode = String(req.query.kode || '').toUpperCase();
    const folder = DAFTAR_FOLDER_BERKAS.find((f) => f.charAt(0) === kode);
    if (!stambuk || !folder) return res.status(400).send('Parameter tidak valid');
    if (!canAccessRecord(user, 'santri', stambuk)) {
      return res.status(403).send('Akses ditolak');
    }
    const info = findBerkasFile(folder, stambuk);
    if (!info.found) return res.status(404).send('File tidak ditemukan');
    const filename = `${stambuk}_${folder}${info.ext}`.replace(/[^a-zA-Z0-9_.\- ]/g, '_');
    res.download(info.filePath, filename);
  });

  // ──────── /berkas/upload (multipart) ────────
  app.post('/berkas/upload', requireAuth, async (req, res) => {
    const user = req.session.user;
    // ★ v17: Helper redirect yang menjamin tidak pernah jatuh ke /cari
    const backToBerkas = (stambukSafe) => {
      const stb = String(stambukSafe || req.body.stambuk || '').replace(/[^0-9]/g, '');
      if (stb) return res.redirect(`/berkas/${encodeURIComponent(stb)}`);
      if (user?.role === 'admin') return res.redirect('/');
      return res.redirect('/me');
    };
    try {
      const multerMod = await import('multer').catch(() => null);
      if (!multerMod?.default) {
        setFlash(req, 'err', 'Modul "multer" belum terpasang. Jalankan: npm install multer');
        return backToBerkas();
      }
      const multer = multerMod.default;
      const tmpDir = path.resolve(ROOT_DIR, 'tmp', 'upload-berkas');
      ensureDir(tmpDir);
      const upload = multer({
        storage: multer.diskStorage({
          destination: tmpDir,
          filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
        }),
        limits: { fileSize: 20 * 1024 * 1024 },
      }).single('file');

      upload(req, res, async (err) => {
        if (err) {
          setFlash(req, 'err', `Upload gagal: ${err.message}`);
          return backToBerkas();
        }
        const stambuk = String(req.body.stambuk || '').replace(/[^0-9]/g, '');
        const kode = String(req.body.kode || '').toUpperCase();
        const folder = DAFTAR_FOLDER_BERKAS.find((f) => f.charAt(0) === kode);
        if (!stambuk || !folder || !req.file) {
          setFlash(req, 'err', 'Parameter atau file tidak valid.');
          return backToBerkas(stambuk);
        }
        if (!canEditRecord(user, 'santri', stambuk)) {
          try { fs.unlinkSync(req.file.path); } catch (_) {}
          setFlash(req, 'err', '🚫 Anda tidak diizinkan upload berkas untuk stambuk ini.');
          return backToBerkas(stambuk);
        }
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (!EKSTENSI_BERKAS.includes(ext)) {
          try { fs.unlinkSync(req.file.path); } catch (_) {}
          setFlash(req, 'err', `Ekstensi ${ext} tidak diizinkan. Hanya: ${EKSTENSI_BERKAS.join(', ')}`);
          return backToBerkas(stambuk);
        }
        try {
          for (const e of EKSTENSI_BERKAS) {
            const old = path.join(BERKAS_INDUK_DIR, folder, `${stambuk}${e}`);
            if (fs.existsSync(old)) {
              try { fs.unlinkSync(old); } catch (_) {}
            }
          }
          const target = path.join(BERKAS_INDUK_DIR, folder, `${stambuk}${ext}`);
          ensureDir(path.dirname(target));
          fs.copyFileSync(req.file.path, target);
          try { fs.unlinkSync(req.file.path); } catch (_) {}
          writeBerkasLog({
            time: new Date().toISOString(),
            action: 'upload',
            stambuk,
            folder,
            ext,
            actor: `web:${user.role}:${user.stambuk || user.label}`,
          });
          setFlash(req, 'ok', `Berkas ${folder} untuk stambuk ${stambuk} berhasil diunggah (${ext}).`);
        } catch (e) {
          setFlash(req, 'err', `Gagal menulis file: ${e.message}`);
        }
        res.redirect(`/berkas/${encodeURIComponent(stambuk)}`);
      });
    } catch (e) {
      setFlash(req, 'err', `Upload error: ${e.message}`);
      const stb = String(req.body?.stambuk || '').replace(/[^0-9]/g, '');
      return stb ? res.redirect(`/berkas/${encodeURIComponent(stb)}`)
                 : res.redirect((user?.role === 'admin') ? '/' : '/me');
    }
  });

  // ──────── /audit ────────
  app.get('/audit', requireAuthRoles(['admin']), async (req, res) => {
    let entries = [];
    try {
      if (fs.existsSync(AUDIT_LOG_PATH)) {
        const raw = fs.readFileSync(AUDIT_LOG_PATH, 'utf-8');
        entries = raw
          .split('\n')
          .filter(Boolean)
          .map((l) => {
            try { return JSON.parse(l); } catch { return null; }
          })
          .filter(Boolean)
          .reverse()
          .slice(0, 200);
      }
    } catch (_) {}
    res.send(renderAuditPage(entries, req.session.user));
  });

  app.get('/api/audit', requireAuthRoles(['admin']), async (_req, res) => {
    let entries = [];
    try {
      if (fs.existsSync(AUDIT_LOG_PATH)) {
        const raw = fs.readFileSync(AUDIT_LOG_PATH, 'utf-8');
        entries = raw
          .split('\n')
          .filter(Boolean)
          .map((l) => {
            try { return JSON.parse(l); } catch { return null; }
          })
          .filter(Boolean)
          .reverse()
          .slice(0, 500);
      }
    } catch (_) {}
    res.json({ ok: true, total: entries.length, entries });
  });

  // ──────── /ekspor (admin) ────────
  app.get('/ekspor', requireAuthRoles(['admin']), async (req, res) => {
    res.send(renderEksporPage(req.session.user, takeFlash(req)));
  });

  app.get('/ekspor/santri', requireAuthRoles(['admin']), async (req, res) => {
    try {
      const opts = {
        kolomFilter: String(req.query.kolom || 'Semua'),
        nilaiFilter: String(req.query.nilai || ''),
        preset: String(req.query.preset || 'lite'),
      };
      const { buffer, count } = await generateSantriExcel(opts);
      const fname = `EksporSantri_${opts.preset}_${opts.kolomFilter}_${count}.xlsx`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${fname}"`);
      res.send(buffer);
    } catch (err) {
      setFlash(req, 'err', `Ekspor santri gagal: ${err.message}`);
      res.redirect('/ekspor');
    }
  });

  app.get('/ekspor/guru', requireAuthRoles(['admin']), async (req, res) => {
    try {
      const opts = {
        keyword: String(req.query.keyword || ''),
        preset: String(req.query.preset || 'lite'),
      };
      const { buffer, count } = await generateGuruExcel(opts);
      const fname = `EksporGuru_${opts.preset}_${count}.xlsx`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${fname}"`);
      res.send(buffer);
    } catch (err) {
      setFlash(req, 'err', `Ekspor guru gagal: ${err.message}`);
      res.redirect('/ekspor');
    }
  });

  // ──────── /rekap-berkas (admin) ────────
  app.get('/rekap-berkas', requireAuthRoles(['admin']), async (req, res) => {
    try {
      const kelas = String(req.query.kelas || 'Semua');
      const rekap = await buildRekapBerkasPerJenis({ kelas });
      res.send(renderRekapBerkasPage(rekap, takeFlash(req), req.session.user));
    } catch (err) {
      res.status(500).send(basePage('Error', `<div class="card flash err">${escapeHtml(err.message)}</div>`, '', req.session.user));
    }
  });

  app.get('/rekap-berkas/detail', requireAuthRoles(['admin']), async (req, res) => {
    try {
      const kode = String(req.query.kode || '').toUpperCase();
      const kelas = String(req.query.kelas || 'Semua');
      const rekap = await buildRekapBerkasPerJenis({ kelas });
      const f = rekap.folders.find((x) => x.kode === kode);
      if (!f) {
        return res.status(404).send(basePage('Tidak Ada', `<div class="card flash err">Folder kode ${escapeHtml(kode)} tidak ditemukan.</div>`, '', req.session.user));
      }
      res.send(renderRekapBerkasDetailPage(f.folder, f.belumPunya, req.session.user));
    } catch (err) {
      res.status(500).send(basePage('Error', `<div class="card flash err">${escapeHtml(err.message)}</div>`, '', req.session.user));
    }
  });

  app.get('/rekap-berkas/excel', requireAuthRoles(['admin']), async (req, res) => {
    try {
      const kelas = String(req.query.kelas || 'Semua');
      const { buffer } = await generateRekapBerkasExcel({ kelas });
      const fname = `RekapBerkas_${kelas}.xlsx`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${fname}"`);
      res.send(buffer);
    } catch (err) {
      setFlash(req, 'err', `Ekspor rekap gagal: ${err.message}`);
      res.redirect('/rekap-berkas');
    }
  });

  // ──────── /validasi/santri (admin) ────────
  app.get('/validasi/santri', requireAuthRoles(['admin']), async (req, res) => {
    try {
      const result = await buildValidasiData('santri');
      res.send(renderValidasiPage('santri', result, takeFlash(req), req.session.user));
    } catch (err) {
      res.status(500).send(basePage('Error', `<div class="card flash err">${escapeHtml(err.message)}</div>`, '', req.session.user));
    }
  });

  app.get('/validasi/guru', requireAuthRoles(['admin']), async (req, res) => {
    try {
      const result = await buildValidasiData('guru');
      res.send(renderValidasiPage('guru', result, takeFlash(req), req.session.user));
    } catch (err) {
      res.status(500).send(basePage('Error', `<div class="card flash err">${escapeHtml(err.message)}</div>`, '', req.session.user));
    }
  });
}

export default {
  registerEditorRoutes,
  _search: searchCombined,
  _listBerkas: listBerkasStatus,
  _findFile: findBerkasFile,
  _basePage: basePage,
  _renderSearchPage: renderSearchPage,
  _renderDetailPage: renderDetailPage,
  _renderEditPage: renderEditPage,
  _renderBerkasPage: renderBerkasPage,
  _renderAuditPage: renderAuditPage,
  _renderEksporPage: renderEksporPage,
  _renderRekapBerkasPage: renderRekapBerkasPage,
  _renderValidasiPage: renderValidasiPage,
  _buildValidasiData: buildValidasiData,
  _isCellEmpty: isCellEmpty,
  VALIDASI_FIELDS_SANTRI,
  VALIDASI_FIELDS_GURU,
};
