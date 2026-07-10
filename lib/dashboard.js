/**
 * ============================================================
 *  lib/dashboard.js — Mini Web Dashboard Pusdat
 *  ★ VERSI v19.0 — Data Center G5 + Inspeksi Pendataan
 *
 *  Perubahan v19.0:
 *   - Sidebar kiri DIHAPUS → layout full-width dengan topnav satu baris
 *   - Navigasi halaman internal (Overview/Rekap/Berkas/Proker/Kelas)
 *     dipindah ke topnav dropdown/tab satu baris
 *   - Semua menu non-dashboard: satu baris topnav, tidak bertingkat
 *   - Tambah menu "Inspeksi Pendataan" di topnav
 *   - Import registerInspeksiRoutes dari dashboardInspeksi.js
 * ============================================================
 */

import express from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pusdatConfig from '../pusdat-config.js';
import { registerEditorRoutes } from './dashboardEditor.js';
import { registerEventValidasiRoutes } from './dashboardEventValidasi.js';
import { registerInspeksiRoutes } from './dashboardInspeksi.js';
import { authenticate, requireAuthSession, requireAuthRoles } from './dashboardAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DASHBOARD_DIR = path.join(ROOT_DIR, 'dashboard');

const PORT = pusdatConfig.DASHBOARD_PORT || 3000;
const PASSWORD = pusdatConfig.DASHBOARD_PASSWORD || 'gontor5';
const SESSION_SECRET =
  pusdatConfig.DASHBOARD_SESSION_SECRET || `pusdat-secret-${Date.now()}`;

const BRAND_NAME = 'Data Center G5';
const BRAND_TAGLINE = 'Pusat Data PMDG Kampus 5 Magelang';

let serverInstance = null;
let appInstance = null;

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn && req.session.user) return next();
  return res.redirect('/login');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTanggalIndonesia(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

function formatJamIndonesia(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

function formatTanggalRingkas(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

const PRIMARY_DOC_KEYS = [
  'A. FOTO AKSES',
  'B. IJAZAH',
  'C. AKTA KELAHIRAN',
  'D. KARTU KELUARGA',
];

function shortDocLabel(label = '') {
  return String(label)
    .replace(/^[A-Z]\.\s*/i, '')
    .replace(/SURAT PERMOHONAN/i, 'Permohonan')
    .replace(/SURAT PERNYATAAN/i, 'Pernyataan')
    .replace(/PAKTA INTEGRITAS/i, 'Pakta')
    .replace(/AKTA KELAHIRAN/i, 'Akta')
    .replace(/KARTU KELUARGA/i, 'KK')
    .replace(/LAIN-LAIN/i, 'Lain-lain')
    .replace(/FOTO AKSES/i, 'Foto');
}

function pickPrimaryBerkas(counts = {}) {
  const result = {};
  for (const key of PRIMARY_DOC_KEYS) {
    if (counts[key]) result[key] = counts[key];
  }
  return result;
}

function getBerkasSummary(berkas, useOnlyPrimary = false) {
  const sourceCounts = useOnlyPrimary
    ? pickPrimaryBerkas(berkas?.counts || {})
    : (berkas?.counts || {});
  const entries = Object.entries(sourceCounts);
  const totalJenis = entries.length;
  const totalTarget = (berkas?.total || 0) * totalJenis;
  const totalAda = entries.reduce((sum, [, v]) => sum + (v?.ada || 0), 0);
  const totalKosong = entries.reduce((sum, [, v]) => sum + (v?.kosong || 0), 0);
  const coveragePct = totalTarget > 0 ? Math.round((totalAda / totalTarget) * 100) : 0;

  const ranked = entries
    .map(([label, value]) => {
      const ada = value?.ada || 0;
      const kosong = value?.kosong || 0;
      const total = ada + kosong;
      const pct = total > 0 ? Math.round((ada / total) * 100) : 0;
      return { label, shortLabel: shortDocLabel(label), ada, kosong, total, pct };
    })
    .sort((a, b) => b.pct - a.pct || a.label.localeCompare(b.label));

  return {
    totalJenis,
    totalTarget,
    totalAda,
    totalKosong,
    coveragePct,
    strongest: ranked[0] || null,
    weakest: ranked[ranked.length - 1] || null,
    ranked,
  };
}

function naturalKelasSort(a, b) {
  const re = /^(\d+)([A-Za-z]*)/;
  const ma = a.match(re);
  const mb = b.match(re);
  if (ma && mb) {
    const na = parseInt(ma[1], 10);
    const nb = parseInt(mb[1], 10);
    if (na !== nb) return na - nb;
    return (ma[2] || '').localeCompare(mb[2] || '');
  }
  return a.localeCompare(b);
}

function getKelasRekap(perKelas = {}) {
  return Object.entries(perKelas || {})
    .map(([kelas, total]) => ({ kelas, total: Number(total) || 0 }))
    .sort((a, b) => naturalKelasSort(a.kelas, b.kelas));
}

async function getDailySummary() {
  try {
    const dbAccess = await import('./dbAccess.js');
    const daily = await dbAccess.getDailyPusdatStats?.();
    return {
      totalGuruAktif: Number(daily?.totalGuruAktif || 0),
      totalSantriAktif: Number(daily?.totalSantriAktif || 0),
      penguranganSantri: Array.isArray(daily?.penguranganSantri)
        ? daily.penguranganSantri
        : [],
    };
  } catch (err) {
    console.error('[DASHBOARD] getDailySummary error:', err.message);
    return {
      totalGuruAktif: 0,
      totalSantriAktif: 0,
      penguranganSantri: [],
      error: err.message,
    };
  }
}

async function getSantriStats() {
  try {
    const dbAccess = await import('./dbAccess.js');
    const raw = await dbAccess.getAllSantriAktif?.();
    const all = Array.isArray(raw) ? raw : [];
    if (all.length === 0) return { total: 0, perKelas: {} };

    const perKelas = {};
    for (const s of all) {
      const kelas = s.Kelas || '(Tanpa Kelas)';
      perKelas[kelas] = (perKelas[kelas] || 0) + 1;
    }

    return { total: all.length, perKelas };
  } catch (err) {
    console.error('[DASHBOARD] getSantriStats error:', err.message);
    return { total: 0, perKelas: {}, error: err.message };
  }
}

async function getBerkasStats() {
  try {
    const dbAccess = await import('./dbAccess.js');
    const rawAll = await dbAccess.getAllSantriAktif?.();
    const all = Array.isArray(rawAll) ? rawAll : [];

    const BERKAS_DIR =
      'D:\\PUSAT DATA 2026\\01. MASTER DATA SANTRI\\01. BERKAS SANTRI';
    const FOLDERS = [
      'A. FOTO AKSES',
      'B. IJAZAH',
      'C. AKTA KELAHIRAN',
      'D. KARTU KELUARGA',
      'E. SURAT PERMOHONAN',
      'F. SURAT PERNYATAAN',
      'G. PAKTA INTEGRITAS',
      'H. BPJS',
      'I. LAIN-LAIN',
    ];
    const EXTS = ['.jpg', '.jpeg', '.png', '.pdf'];

    const counts = {};
    for (const folder of FOLDERS) counts[folder] = { ada: 0, kosong: 0 };

    for (const s of all) {
      const stb = String(s.Stambuk || '').trim();
      if (!stb) continue;

      for (const folder of FOLDERS) {
        let found = false;
        for (const ext of EXTS) {
          try {
            if (fs.existsSync(path.join(BERKAS_DIR, folder, `${stb}${ext}`))) {
              found = true;
              break;
            }
          } catch (_) {}
        }
        if (found) counts[folder].ada++;
        else counts[folder].kosong++;
      }
    }

    return { total: all.length, counts };
  } catch (err) {
    console.error('[DASHBOARD] getBerkasStats error:', err.message);
    return { total: 0, counts: {}, error: err.message };
  }
}

async function getPiketHariIni() {
  try {
    const pm = await import('./prokerManager.js');
    const list = pm.getStafPiketHariIni?.() || [];
    const hari = pm.getNamaHariIni?.() || '-';
    return { hari, list };
  } catch (err) {
    console.error('[DASHBOARD] getPiketHariIni error:', err.message);
    return { hari: '-', list: [], error: err.message };
  }
}

async function getProkerProgress() {
  try {
    const pm = await import('./prokerManager.js');
    const raw = pm.getProkerTahunan?.() || {};
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw.list)
        ? raw.list
        : [];

    const total = list.length;
    const selesai = list.filter(
      (p) => p && (p.status === 'selesai' || p.done === true)
    ).length;

    return {
      tahun_hijriyah: raw?.tahun_hijriyah || '',
      tahun_masehi: raw?.tahun_masehi || '',
      tahunan: { total, selesai, list },
    };
  } catch (err) {
    console.error('[DASHBOARD] getProkerProgress error:', err.message);
    return {
      tahun_hijriyah: '',
      tahun_masehi: '',
      tahunan: { total: 0, selesai: 0, list: [] },
      error: err.message,
    };
  }
}

async function collectDashboardData() {
  const daily = await getDailySummary();
  const santri = await getSantriStats();
  const berkas = await getBerkasStats();
  const [piket, proker] = await Promise.all([getPiketHariIni(), getProkerProgress()]);
  return { daily, santri, berkas, piket, proker };
}

// ════════════════════════════════════════════════
//  ADAPTIVE LOGO TAG (terang ↔ gelap otomatis)
// ════════════════════════════════════════════════
function logoSwitcherStyle() {
  return `
    .logo-adaptive {
      position: relative;
      display: inline-block;
      line-height: 0;
    }
    .logo-adaptive img {
      display: block;
      max-width: 100%;
      height: auto;
    }
    .logo-adaptive .logo-light { display: none; }
    .logo-adaptive .logo-dark { display: block; }
    @media (prefers-color-scheme: dark) {
      .logo-adaptive .logo-dark { display: none; }
      .logo-adaptive .logo-light { display: block; }
    }
    [data-theme="dark"] .logo-adaptive .logo-dark { display: none; }
    [data-theme="dark"] .logo-adaptive .logo-light { display: block; }
    [data-theme="light"] .logo-adaptive .logo-light { display: none; }
    [data-theme="light"] .logo-adaptive .logo-dark { display: block; }
  `;
}

function logoTag(size = 56, alt = `${BRAND_NAME}`) {
  return `<span class="logo-adaptive" style="width:${size}px;height:${size}px;">
    <img class="logo-dark" src="/public/img/logo-dark.png" alt="${escapeHtml(alt)}" width="${size}" height="${size}">
    <img class="logo-light" src="/public/img/logo-light.png" alt="${escapeHtml(alt)}" width="${size}" height="${size}">
  </span>`;
}

// ════════════════════════════════════════════════
//  LOGIN PAGE — ★ v16: Multi-role (admin/ustadz/santri)
// ════════════════════════════════════════════════
function renderLoginPage(error = '', selectedRole = 'admin') {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${BRAND_NAME} • Login</title>
<link rel="icon" href="/public/img/favicon.png" type="image/png">
<style>
  ${logoSwitcherStyle()}
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, sans-serif; }
  body {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at top right, rgba(255,255,255,.12), transparent 25%),
      linear-gradient(135deg, #214e97 0%, #1d3f7a 45%, #15305f 100%);
    padding: 24px;
  }
  .card {
    width: 100%;
    max-width: 480px;
    background: #ffffff;
    border-radius: 22px;
    box-shadow: 0 22px 70px rgba(4, 19, 43, .28);
    overflow: hidden;
    border: 1px solid rgba(16, 24, 40, .08);
  }
  .hero {
    background: linear-gradient(135deg, #1c4485 0%, #e57f1f 130%);
    color: #fff;
    padding: 28px 28px 22px;
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .hero h1 { font-size: 26px; margin-bottom: 6px; letter-spacing: .3px; }
  .hero p { font-size: 13.5px; opacity: .92; line-height: 1.5; }
  .body { padding: 28px; }
  label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 700; color: #243b63; }
  input, select {
    width: 100%; padding: 13px 15px; border-radius: 12px;
    border: 1.6px solid #d6deea; font-size: 15px; transition: .2s ease; background: #fff;
  }
  input:focus, select:focus { outline: none; border-color: #214e97; box-shadow: 0 0 0 4px rgba(33, 78, 151, .09); }
  button {
    width: 100%; border: 0; margin-top: 18px; padding: 13px 16px;
    border-radius: 12px; color: #fff; cursor: pointer; font-weight: 700; font-size: 15px;
    background: linear-gradient(135deg, #214e97, #16376c);
  }
  .role-switch {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px;
  }
  .role-switch label {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 12px; border: 2px solid #d6deea; border-radius: 12px; cursor: pointer;
    font-size: 13px; font-weight: 700; color: #475569; text-transform: none; letter-spacing: 0;
    margin-bottom: 0; transition: all .2s;
  }
  .role-switch input[type=radio] { display: none; }
  .role-switch input[type=radio]:checked + span {
    color: #fff;
  }
  .role-switch label:has(input:checked) {
    background: linear-gradient(135deg, #214e97, #16376c); color: #fff; border-color: #16376c;
  }
  .field-row { margin-bottom: 14px; }
  .err {
    margin-bottom: 18px; background: #fff1f1; color: #b42318;
    border: 1px solid #fecaca; padding: 12px 14px; border-radius: 12px; font-size: 13px;
  }
  .info {
    margin-top: 16px; padding: 12px 14px; background: #f0f7ff; color: #214e97;
    border: 1px solid #d6e0f2; border-radius: 10px; font-size: 12px; line-height: 1.6;
  }
  .footer { margin-top: 16px; text-align: center; color: #7b879c; font-size: 12px; }
  .role-box { display: none; }
  .role-box.active { display: block; }
  /* ★ v18: Lupa Stambuk */
  .forgot-stambuk { margin-top: 8px; }
  .forgot-divider { display:flex; align-items:center; gap:10px; margin: 14px 0 10px; color:#94a3b8; font-size:11px; text-transform:uppercase; letter-spacing:1px; }
  .forgot-divider::before, .forgot-divider::after { content:''; flex:1; height:1px; background:#e2e8f0; }
  .btn-ghost-link { width:100%; background:#f0f7ff; color:#214e97; border:1.4px dashed #b6c8e6; padding:11px 14px; border-radius:10px; cursor:pointer; font-weight:700; font-size:13px; margin-top:0; }
  .btn-ghost-link:hover { background:#e3eefb; }
  .lookup-panel { margin-top:12px; padding:14px; background:#fafbff; border:1px solid #e2e8f0; border-radius:12px; }
  .lookup-help { font-size:12px; color:#475569; margin-bottom:10px; line-height:1.55; }
  .row-lookup { display:flex; gap:6px; }
  .row-lookup input { flex:1; padding:11px 13px; border:1.4px solid #d6deea; border-radius:10px; font-size:14px; }
  .btn-mini { padding:11px 16px; border:0; border-radius:10px; background:linear-gradient(135deg,#214e97,#16376c); color:#fff; font-weight:700; font-size:13px; cursor:pointer; margin-top:0; }
  .lookup-result { margin-top:12px; }
  .lookup-result .hit { display:flex; justify-content:space-between; align-items:center; padding:9px 11px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:6px; font-size:13px; }
  .lookup-result .hit b { color:#16376c; }
  .lookup-result .hit .stb { background:#dcfce7; color:#166534; padding:3px 9px; border-radius:6px; font-weight:700; font-family:'Consolas',monospace; }
  .lookup-result .empty-lookup { padding:10px; color:#b42318; background:#fff1f1; border:1px solid #fecaca; border-radius:8px; font-size:12px; }
  .small-note { font-size:11px; color:#94a3b8; margin-top:8px; line-height:1.5; }
</style>
</head>
<body>
  <div class="card">
    <div class="hero">
      ${logoTag(72, BRAND_NAME)}
      <div>
        <h1>${BRAND_NAME}</h1>
        <p>${BRAND_TAGLINE}</p>
      </div>
    </div>
    <div class="body">
      ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
      <form method="POST" action="/login" id="loginForm">
        <label>Pilih Tipe Pengguna</label>
        <div class="role-switch">
          <label>
            <input type="radio" name="role" value="admin" ${selectedRole === 'admin' ? 'checked' : ''} onchange="switchRole()">
            <span>👑 Admin</span>
          </label>
          <label>
            <input type="radio" name="role" value="ustadz" ${selectedRole === 'ustadz' ? 'checked' : ''} onchange="switchRole()">
            <span>👨‍🏫 Ustadz</span>
          </label>
          <label>
            <input type="radio" name="role" value="santri" ${selectedRole === 'santri' ? 'checked' : ''} onchange="switchRole()">
            <span>🎓 Santri</span>
          </label>
        </div>

        <!-- ADMIN FIELDS -->
        <div class="role-box ${selectedRole === 'admin' ? 'active' : ''}" data-role="admin">
          <div class="field-row">
            <label>Password Admin</label>
            <input type="password" name="password" autocomplete="current-password" placeholder="Password admin">
          </div>
          <div class="info">
            👑 <b>Admin</b> bisa akses semua data, ekspor, validasi, dan audit log. Password hanya diketahui oleh pengelola Pusdat — silakan hubungi admin Pusdat jika Anda lupa.
          </div>
        </div>

        <!-- USTADZ / SANTRI FIELDS -->
        <div class="role-box ${selectedRole === 'ustadz' || selectedRole === 'santri' ? 'active' : ''}" data-role="user">
          <div class="field-row">
            <label>Nomor Stambuk</label>
            <input type="text" name="stambuk" placeholder="Contoh: 14001 atau 25001" inputmode="numeric">
          </div>
          <div class="field-row">
            <label>Tanggal Lahir (Password)</label>
            <input type="text" name="tanggal" placeholder="DD-MM-YYYY atau DD/MM/YYYY">
          </div>
          <div class="info">
            🔐 Login menggunakan <b>Nomor Stambuk</b> + <b>Tanggal Lahir</b> Anda. Sama seperti fitur <code>.cek</code> di bot WhatsApp Pusdat. Anda hanya bisa melihat & mengedit akun sendiri.
          </div>
        </div>

        <button type="submit">Masuk ke Dashboard</button>
      </form>

      <!-- ★ v18: Fitur Lupa Stambuk (khusus ustadz/santri) -->
      <div class="forgot-stambuk" id="forgotStambukBox" style="display:${selectedRole === 'admin' ? 'none' : 'block'}">
        <div class="forgot-divider"><span>atau</span></div>
        <button type="button" class="btn-ghost-link" id="toggleLookupBtn" onclick="toggleLookup()">
          🔎 Lupa Nomor Stambuk? Cari di sini
        </button>
        <div class="lookup-panel" id="lookupPanel" style="display:none">
          <p class="lookup-help">Bagi para ustadz yang sebelumnya menggunakan <b>Ranking Guru</b> dan tidak hafal stambuk barunya, silakan ketikkan nama lengkap Anda di bawah ini.</p>
          <div class="row-lookup">
            <input type="text" id="lookupNama" placeholder="Ketik nama lengkap Anda..." autocomplete="off">
            <button type="button" class="btn-mini" onclick="doLookup()">Cari</button>
          </div>
          <div id="lookupResult" class="lookup-result"></div>
          <p class="small-note">⚠️ Jika nama Anda tidak ditemukan, hubungi admin Pusdat untuk pendataan ulang.</p>
        </div>
      </div>

      <div class="footer">Sistem Informasi Pusdat • Gontor 5 Magelang</div>
    </div>
  </div>
<script>
  function switchRole() {
    const role = document.querySelector('input[name="role"]:checked').value;
    document.querySelectorAll('.role-box').forEach(b => b.classList.remove('active'));
    if (role === 'admin') {
      document.querySelector('.role-box[data-role="admin"]').classList.add('active');
      document.getElementById('forgotStambukBox').style.display = 'none';
    } else {
      document.querySelector('.role-box[data-role="user"]').classList.add('active');
      document.getElementById('forgotStambukBox').style.display = 'block';
    }
  }

  function toggleLookup() {
    const panel = document.getElementById('lookupPanel');
    const btn = document.getElementById('toggleLookupBtn');
    if (panel.style.display === 'none' || panel.style.display === '') {
      panel.style.display = 'block';
      btn.innerHTML = '✖ Tutup pencarian stambuk';
      setTimeout(() => document.getElementById('lookupNama')?.focus(), 100);
    } else {
      panel.style.display = 'none';
      btn.innerHTML = '🔎 Lupa Nomor Stambuk? Cari di sini';
    }
  }

  async function doLookup() {
    const nama = (document.getElementById('lookupNama').value || '').trim();
    const box = document.getElementById('lookupResult');
    if (nama.length < 3) {
      box.innerHTML = '<div class="empty-lookup">Minimal 3 karakter nama.</div>';
      return;
    }
    box.innerHTML = '<div class="small-note">⏳ Mencari...</div>';
    try {
      const role = document.querySelector('input[name="role"]:checked').value;
      const res = await fetch('/api/lookup-stambuk?nama=' + encodeURIComponent(nama) + '&role=' + encodeURIComponent(role));
      const data = await res.json();
      if (!data.ok) {
        box.innerHTML = '<div class="empty-lookup">' + (data.error || 'Gagal mencari.') + '</div>';
        return;
      }
      const items = data.items || [];
      if (items.length === 0) {
        box.innerHTML = '<div class="empty-lookup">Tidak ditemukan nama yang cocok. Pastikan ejaan benar atau hubungi admin Pusdat.</div>';
        return;
      }
      box.innerHTML = items.slice(0, 8).map(it => {
        const nm = String(it.nama || '').replace(/</g,'&lt;');
        const stb = String(it.stambuk || '-');
        const meta = String(it.meta || '').replace(/</g,'&lt;');
        return '<div class="hit"><div><b>' + nm + '</b><div class="small-note" style="margin:2px 0 0">' + meta + '</div></div><div class="stb" onclick="isiStambuk(\''+stb+'\')" style="cursor:pointer" title="Klik untuk isi otomatis">' + stb + '</div></div>';
      }).join('');
      if (items.length > 8) {
        box.innerHTML += '<div class="small-note">+ ' + (items.length - 8) + ' nama lain tidak ditampilkan. Ketik nama lebih spesifik.</div>';
      }
    } catch (err) {
      box.innerHTML = '<div class="empty-lookup">Error: ' + (err.message || err) + '</div>';
    }
  }

  function isiStambuk(stb) {
    const inp = document.querySelector('input[name="stambuk"]');
    if (inp) {
      inp.value = stb;
      inp.focus();
    }
  }

  document.getElementById('lookupNama')?.addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); doLookup(); }
  });
</script>
</body>
</html>`;
}


// ════════════════════════════════════════════════
//  SUB-RENDER HELPERS
// ════════════════════════════════════════════════
function buildPiketHtml(piket) {
  const list = Array.isArray(piket?.list) ? piket.list : [];
  if (!list.length) {
    return `<div class="empty-note">Belum ada staf piket terdaftar untuk hari ini.</div>`;
  }

  return `<ul class="staff-list">
    ${list
      .map((item, index) => {
        const nama = escapeHtml(item?.nama || item?.name || '?');
        const jabatan = item?.jabatan
          ? `<span class="pill">${escapeHtml(item.jabatan)}</span>`
          : '';
        return `<li><span class="order">${index + 1}</span><div><strong>${nama}</strong>${jabatan}</div></li>`;
      })
      .join('')}
  </ul>`;
}

function buildProkerHtml(proker) {
  const list = Array.isArray(proker?.tahunan?.list)
    ? proker.tahunan.list.slice(0, 10)
    : [];
  if (!list.length) {
    return `<div class="empty-note">Belum ada proker tahunan yang tercatat.</div>`;
  }

  return `<ul class="agenda-list">
    ${list
      .map((item, index) => {
        const done = item?.status === 'selesai' || item?.done === true;
        const title = escapeHtml(
          item?.judul || item?.nama || item?.kegiatan || '(Tanpa Judul)'
        );
        const target = item?.target
          ? `<div class="agenda-meta">Target: ${escapeHtml(item.target)}</div>`
          : '';
        const deadline = item?.deadline
          ? `<div class="agenda-meta">Deadline: ${escapeHtml(item.deadline)}</div>`
          : '';
        return `<li>
          <div class="agenda-head">
            <span class="status ${done ? 'done' : 'progress'}">${done ? 'Selesai' : 'Berjalan'}</span>
            <span class="agenda-no">#${index + 1}</span>
          </div>
          <strong>${title}</strong>
          ${target}
          ${deadline}
        </li>`;
      })
      .join('')}
  </ul>`;
}

function buildInsightHtml(data) {
  const berkasSummary = getBerkasSummary(data.berkas, true);
  const kelasRekap = getKelasRekap(data.santri?.perKelas || {});
  const pengurangan = Array.isArray(data.daily?.penguranganSantri)
    ? data.daily.penguranganSantri
    : [];

  const totalSantri = (data.daily?.totalSantriAktif || data.santri?.total || 0);
  const kelasMax = kelasRekap.reduce(
    (acc, item) => (item.total > acc.total ? item : acc),
    { kelas: '-', total: 0 }
  );

  const items = [
    {
      label: 'Berkas primer terlengkap',
      value: berkasSummary.strongest
        ? `${berkasSummary.strongest.shortLabel} (${berkasSummary.strongest.pct}%)`
        : '-',
    },
    {
      label: 'Berkas primer prioritas',
      value: berkasSummary.weakest
        ? `${berkasSummary.weakest.shortLabel} (${berkasSummary.weakest.pct}%)`
        : '-',
    },
    {
      label: 'Kelas terbanyak',
      value: kelasMax.total ? `${kelasMax.kelas} (${kelasMax.total} santri)` : '-',
    },
    {
      label: 'Total santri aktif',
      value: `${totalSantri} santri • ${kelasRekap.length} kelas`,
    },
    {
      label: 'Pengurangan 24 jam',
      value: `${pengurangan.length} santri`,
    },
    {
      label: 'Cakupan berkas primer',
      value: `${berkasSummary.coveragePct}%`,
    },
  ];

  return `<div class="insight-grid">
    ${items
      .map(
        (item) => `<div class="insight-item"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`
      )
      .join('')}
  </div>`;
}

// ════════════════════════════════════════════════
//  MAIN DASHBOARD PAGE
// ════════════════════════════════════════════════
function renderDashboardPage(data) {
  const dashboardUrl = getDashboardUrl().replace(/\/$/, '');
  const tglPanjang = formatTanggalIndonesia();
  const jam = formatJamIndonesia();
  const berkasSummaryPrimer = getBerkasSummary(data.berkas, true);
  const totalKelas = Object.keys(data.santri?.perKelas || {}).length;
  const totalSantri = data.daily?.totalSantriAktif || data.santri?.total || 0;
  const totalGuru = data.daily?.totalGuruAktif || 0;
  const prokerTotal = data.proker?.tahunan?.total || 0;
  const prokerSelesai = data.proker?.tahunan?.selesai || 0;
  const prokerPct = prokerTotal > 0 ? Math.round((prokerSelesai / prokerTotal) * 100) : 0;

  const kelasRekap = getKelasRekap(data.santri?.perKelas || {});
  const kelasLabels = JSON.stringify(kelasRekap.map((k) => k.kelas));
  const kelasData = JSON.stringify(kelasRekap.map((k) => k.total));

  const primerEntries = Object.entries(pickPrimaryBerkas(data.berkas?.counts || {}));
  const berkasLabels = JSON.stringify(primerEntries.map(([label]) => shortDocLabel(label)));
  const berkasAda = JSON.stringify(primerEntries.map(([, value]) => value?.ada || 0));
  const berkasKosong = JSON.stringify(primerEntries.map(([, value]) => value?.kosong || 0));

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${BRAND_NAME} • Dashboard</title>
<link rel="icon" href="/public/img/favicon.png" type="image/png">
<meta property="og:title" content="${BRAND_NAME}">
<meta property="og:description" content="Rekapan harian santri, asatidz, staf piket, proker, dan kelengkapan berkas.">
<meta property="og:image" content="${dashboardUrl}/og-image">
<meta property="og:url" content="${dashboardUrl}">
<meta name="twitter:card" content="summary_large_image">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  ${logoSwitcherStyle()}
  :root {
    --navy: #214e97;
    --navy-dark: #17386c;
    --orange: #e57f1f;
    --bg: #f4f6fb;
    --panel: #ffffff;
    --text: #0f172a;
    --muted: #64748b;
    --line: #d9e0ec;
    --success: #18a874;
    --danger: #e04f5f;
    --shadow: 0 14px 30px rgba(18, 36, 74, .08);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, sans-serif; }
  body { background: var(--bg); color: var(--text); }
  /* ★ v19: No sidebar — full width layout */
  .layout { min-height: 100vh; display: block; }
  .main { padding: 20px 24px; }
  /* Legacy sidebar styles hidden (kept for compatibility) */
  .sidebar { display: none !important; }
  .sidebar-foot { display: none !important; }
  .topbar {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 22px; padding: 20px 24px; box-shadow: var(--shadow);
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; margin-bottom: 22px;
  }
  .topbar h2 { font-size: 30px; color: #1d3766; margin-bottom: 6px; letter-spacing: .3px; }
  .topbar p { color: var(--muted); font-size: 14px; }
  .top-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: #edf3ff; color: var(--navy); border: 1px solid #d4e0f7;
    font-weight: 700; font-size: 13px; padding: 10px 12px; border-radius: 12px;
  }
  .logout {
    text-decoration: none; color: #fff;
    background: linear-gradient(135deg, var(--navy), var(--navy-dark));
    padding: 10px 14px; border-radius: 12px; font-size: 13px; font-weight: 700;
  }
  .kpi-grid {
    display: grid; grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 16px; margin-bottom: 22px;
  }
  .kpi-card {
    background: var(--panel); border-radius: 18px; border: 1px solid var(--line);
    box-shadow: var(--shadow); padding: 18px 18px 16px;
  }
  .kpi-icon {
    width: 40px; height: 40px; border-radius: 12px;
    display: inline-grid; place-items: center;
    background: #eef4ff; color: var(--navy); font-size: 20px; margin-bottom: 12px;
  }
  .kpi-title { font-size: 13px; color: var(--muted); margin-bottom: 8px; font-weight: 700; }
  .kpi-value { font-size: 34px; line-height: 1; color: #102245; font-weight: 800; margin-bottom: 8px; }
  .kpi-sub { font-size: 12px; color: var(--muted); line-height: 1.5; }
  .panels {
    display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; margin-bottom: 18px;
  }
  .panel {
    background: var(--panel); border-radius: 22px; border: 1px solid var(--line);
    box-shadow: var(--shadow); padding: 20px;
  }
  .panel-head {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 12px; margin-bottom: 16px;
  }
  .panel-head h3 { font-size: 20px; color: #17386c; }
  .panel-head p { font-size: 13px; color: var(--muted); line-height: 1.5; }
  .chart-wrap { min-height: 360px; position: relative; }
  .summary-card {
    display: grid; grid-template-columns: repeat(2, minmax(0,1fr));
    gap: 12px; margin-bottom: 16px;
  }
  .summary-mini {
    border: 1px solid #dce4f1; background: #f8fbff;
    border-radius: 16px; padding: 14px;
  }
  .summary-mini span { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  .summary-mini strong { font-size: 20px; color: #17386c; }
  .staff-list, .agenda-list { list-style: none; display: grid; gap: 12px; }
  .staff-list li, .agenda-list li {
    border: 1px solid #e2e8f3; border-radius: 16px; padding: 14px 15px; background: #fbfdff;
  }
  .staff-list li { display: flex; gap: 12px; align-items: flex-start; }
  .order {
    width: 30px; height: 30px; flex: 0 0 auto;
    display: inline-grid; place-items: center;
    border-radius: 50%; background: #214e97; color: #fff;
    font-size: 13px; font-weight: 700;
  }
  .pill {
    display: inline-block; margin-left: 8px; font-size: 11px; font-weight: 700;
    color: var(--navy); background: #edf3ff; border: 1px solid #d4e0f7;
    border-radius: 999px; padding: 3px 8px;
  }
  .agenda-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px; gap: 10px;
  }
  .status {
    display: inline-block; border-radius: 999px; padding: 4px 10px;
    font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .3px;
  }
  .status.done { background: #e9f9f1; color: #12734f; }
  .status.progress { background: #fff4e8; color: #b25f10; }
  .agenda-no { font-size: 12px; color: var(--muted); }
  .agenda-meta { font-size: 12px; color: var(--muted); margin-top: 5px; }
  .empty-note {
    border-radius: 16px; padding: 18px; border: 1px dashed #c6d1e1;
    color: var(--muted); background: #fbfdff; text-align: center;
  }
  .insight-grid {
    display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px;
  }
  .insight-item {
    border: 1px solid #e2e8f3; border-radius: 16px;
    background: #fbfdff; padding: 14px;
  }
  .insight-item span { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  .insight-item strong { color: #17386c; font-size: 16px; }
  .footer-note {
    margin-top: 18px; color: var(--muted);
    font-size: 12px; line-height: 1.7; text-align: right;
  }
  /* ★ v19 — Topnav satu baris (no sidebar) */
  .topnav {
    position: sticky; top: 0; z-index: 100;
    background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
    box-shadow: 0 3px 16px rgba(18,36,74,.18);
    display: flex; align-items: center;
    padding: 0 20px; gap: 0; flex-wrap: nowrap; overflow-x: auto;
    scrollbar-width: none; min-height: 52px;
  }
  .topnav::-webkit-scrollbar { display: none; }
  .topnav-brand {
    display: flex; align-items: center; gap: 10px;
    color: #fff; text-decoration: none; flex: 0 0 auto;
    padding: 0 14px 0 0; border-right: 1px solid rgba(255,255,255,.18);
    margin-right: 10px;
  }
  .topnav-brand span { font-size: 15px; font-weight: 800; letter-spacing: .3px; white-space: nowrap; }
  .topnav-tabs {
    display: flex; align-items: center; gap: 2px; flex: 1; flex-wrap: nowrap;
  }
  .topnav-tabs a, .topnav-tabs button.tab-btn {
    display: inline-flex; align-items: center; gap: 5px;
    color: rgba(255,255,255,.82); text-decoration: none;
    padding: 14px 12px; font-size: 12.5px; font-weight: 600;
    border: none; background: none; cursor: pointer;
    white-space: nowrap; border-bottom: 3px solid transparent;
    transition: color .15s, border-color .15s;
  }
  .topnav-tabs a:hover, .topnav-tabs button.tab-btn:hover,
  .topnav-tabs a.active, .topnav-tabs button.tab-btn.active {
    color: #fff; border-bottom-color: var(--orange);
  }
  .topnav-tabs .divider {
    width: 1px; height: 22px; background: rgba(255,255,255,.18);
    margin: 0 4px; flex: 0 0 auto;
  }
  .topnav-search {
    display: flex; gap: 6px; flex: 0 0 auto; margin-left: 8px; padding-left: 10px;
    border-left: 1px solid rgba(255,255,255,.18);
  }
  .topnav-search input {
    width: 200px; padding: 7px 11px; border: 1.5px solid rgba(255,255,255,.3);
    border-radius: 8px; font-size: 12.5px; background: rgba(255,255,255,.12);
    color: #fff; outline: none;
  }
  .topnav-search input::placeholder { color: rgba(255,255,255,.6); }
  .topnav-search input:focus { border-color: rgba(255,255,255,.7); background: rgba(255,255,255,.18); }
  .topnav-search button {
    padding: 7px 14px; background: var(--orange); color: #fff;
    border: none; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer;
  }
  /* ★ v19 — Legacy top-toolbar (hapus) */
  .top-toolbar { display: none !important; }
  .main { padding: 20px 24px; margin-top: 0; }

  /* ★ v17 — Pagination sidebar */
  .page-section { display: none; }
  .page-section.active { display: block; }
  .pagination-info {
    display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
    color: var(--muted); font-size: 12.5px;
  }
  .pagination-info .pill { background: #edf3ff; color: var(--navy); border: 1px solid #d4e0f7;
    border-radius: 999px; padding: 3px 10px; font-size: 11.5px; font-weight: 800; }

  @media (max-width: 1400px) { .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 1100px) {
    .layout { grid-template-columns: 1fr; }
    .sidebar { position: static; height: auto; }
    .panels { grid-template-columns: 1fr; }
  }
  @media (max-width: 760px) {
    .main { padding: 16px; }
    .topbar { padding: 18px; }
    .topbar h2 { font-size: 22px; }
    .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .summary-card, .insight-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
  <!-- ★ v19: Topnav satu baris (sidebar dihapus) -->
  <nav class="topnav" role="navigation" aria-label="Navigasi utama">
    <a class="topnav-brand" href="/">
      ${logoTag(32, BRAND_NAME)}
      <span>${BRAND_NAME}</span>
    </a>
    <div class="topnav-tabs">
      <!-- Dashboard sections (tab internal) -->
      <button class="tab-btn active" data-page="overview">📊 Overview</button>
      <button class="tab-btn" data-page="rekap">🗂️ Rekap</button>
      <button class="tab-btn" data-page="berkas">📁 Berkas</button>
      <button class="tab-btn" data-page="proker">📝 Proker</button>
      <button class="tab-btn" data-page="kelas-all">🏫 Kelas</button>
      <div class="divider"></div>
      <!-- Menu eksternal (halaman baru) -->
      <a href="/cari">🔍 Cari Data</a>
      <a href="/ekspor">📤 Ekspor Excel</a>
      <a href="/rekap-berkas">🗃️ Rekap Berkas</a>
      <div class="divider"></div>
      <a href="/validasi/santri">✅ Validasi Santri</a>
      <a href="/validasi/guru">✅ Validasi Guru</a>
      <a href="/event-validasi">🎯 Event Validasi</a>
      <div class="divider"></div>
      <a href="/inspeksi" style="color:#fbbf24;font-weight:800">🔍 Inspeksi</a>
      <a href="/audit">📜 Audit Log</a>
      <a href="/preview-card" target="_blank">🖼️ Broadcast</a>
      <a href="/logout" style="color:#fca5a5">🚪 Logout</a>
    </div>
    <form class="topnav-search" method="GET" action="/cari">
      <input type="search" name="q" placeholder="Cari santri / guru..." aria-label="Pencarian">
      <button type="submit">Cari</button>
    </form>
  </nav>

  <div class="layout">
    <main class="main">

      <!-- ★ v17: Page section — Overview -->
      <section class="page-section active" id="page-overview" data-page="overview">
      <section class="topbar" id="overview">
        <div>
          <h2>${BRAND_NAME}</h2>
          <p>${BRAND_TAGLINE} • ${escapeHtml(tglPanjang)} • ${escapeHtml(jam)} WIB</p>
        </div>
        <div class="top-actions">
          <div class="badge">🟢 Realtime operasional</div>
          <a class="logout" href="/logout">Logout</a>
        </div>
      </section>

      <!-- ★ v15.1: Aksi Cepat ke fitur baru -->
      <section class="topbar" id="quick-actions" style="margin-top:14px;background:#fff;border:1px solid #e3e9f3;border-radius:18px;padding:18px 22px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">
        <div style="flex:1;min-width:240px">
          <h3 style="margin:0 0 4px;font-size:15px;color:#16376c">⚡ Aksi Cepat</h3>
          <p style="margin:0;color:#516079;font-size:13px">Akses cepat: cari, edit biodata, lihat & upload berkas, audit log.</p>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <a href="/cari" style="padding:9px 14px;border-radius:10px;background:linear-gradient(135deg,#214e97,#16376c);color:#fff;font-weight:700;font-size:13px;text-decoration:none">🔍 Cari Santri / Guru</a>
          <a href="/audit" style="padding:9px 14px;border-radius:10px;background:#fff;color:#214e97;border:1.4px solid #d6deea;font-weight:700;font-size:13px;text-decoration:none">📜 Audit Log</a>
          <a href="/preview-card" style="padding:9px 14px;border-radius:10px;background:#fff;color:#214e97;border:1.4px solid #d6deea;font-weight:700;font-size:13px;text-decoration:none">🖼️ Preview Poster</a>
        </div>
      </section>

      <section class="kpi-grid">
        <article class="kpi-card">
          <div class="kpi-icon">👦</div>
          <div class="kpi-title">Santri Aktif</div>
          <div class="kpi-value">${totalSantri}</div>
          <div class="kpi-sub">Total santri aktif terbaca dari database hari ini.</div>
        </article>
        <article class="kpi-card">
          <div class="kpi-icon">🎓</div>
          <div class="kpi-title">Asatidz Aktif</div>
          <div class="kpi-value">${totalGuru}</div>
          <div class="kpi-sub">Jumlah guru/asatidz aktif yang terdata.</div>
        </article>
        <article class="kpi-card">
          <div class="kpi-icon">👥</div>
          <div class="kpi-title">Staf Piket Hari Ini</div>
          <div class="kpi-value">${data.piket?.list?.length || 0}</div>
          <div class="kpi-sub">Jadwal piket aktif hari ${escapeHtml(data.piket?.hari || '-')}.</div>
        </article>
        <article class="kpi-card">
          <div class="kpi-icon">🏫</div>
          <div class="kpi-title">Kelas Aktif</div>
          <div class="kpi-value">${totalKelas}</div>
          <div class="kpi-sub">Sebaran kelas aktif yang sedang terdata.</div>
        </article>
        <article class="kpi-card">
          <div class="kpi-icon">📁</div>
          <div class="kpi-title">Berkas Primer Valid</div>
          <div class="kpi-value">${berkasSummaryPrimer.totalAda}</div>
          <div class="kpi-sub">${berkasSummaryPrimer.coveragePct}% dari ${berkasSummaryPrimer.totalTarget} target dokumen primer.</div>
        </article>
        <article class="kpi-card">
          <div class="kpi-icon">✅</div>
          <div class="kpi-title">Progres Proker</div>
          <div class="kpi-value">${prokerPct}%</div>
          <div class="kpi-sub">${prokerSelesai} selesai dari ${prokerTotal} proker tahunan.</div>
        </article>
      </section>

      </section><!-- /page-overview -->

      <!-- ★ v17: Page section — Rekap -->
      <section class="page-section" id="page-rekap" data-page="rekap">
      <section class="panels" id="rekap">
        <article class="panel">
          <div class="panel-head">
            <div>
              <h3>Rekap Jumlah Santri per Kelas</h3>
              <p>Menampilkan jumlah santri pada setiap kelas (semua kelas, tidak dipotong).</p>
            </div>
          </div>
          <div class="chart-wrap">
            <canvas id="kelasChart"></canvas>
          </div>
        </article>

        <article class="panel" id="piket">
          <div class="panel-head">
            <div>
              <h3>Ringkasan Operasional Hari Ini</h3>
              <p>Tanggal, hari, waktu, dan staf piket yang sedang bertugas.</p>
            </div>
          </div>
          <div class="summary-card">
            <div class="summary-mini"><span>Tanggal Hari Ini</span><strong>${escapeHtml(formatTanggalRingkas())}</strong></div>
            <div class="summary-mini"><span>Hari</span><strong>${escapeHtml(data.piket?.hari || '-')}</strong></div>
            <div class="summary-mini"><span>Jam Update</span><strong>${escapeHtml(jam)} WIB</strong></div>
            <div class="summary-mini"><span>Cakupan Berkas Primer</span><strong>${berkasSummaryPrimer.coveragePct}%</strong></div>
          </div>
          ${buildPiketHtml(data.piket)}
        </article>
      </section>

      </section><!-- /page-rekap -->

      <!-- ★ v17: Page section — Berkas -->
      <section class="page-section" id="page-berkas" data-page="berkas">
      <section class="panels" id="berkas">
        <article class="panel">
          <div class="panel-head">
            <div>
              <h3>Kelengkapan Berkas Santri (Primer)</h3>
              <p>Hanya berkas primer: Foto, Ijazah, Akta, Kartu Keluarga.</p>
            </div>
          </div>
          <div class="chart-wrap">
            <canvas id="berkasChart"></canvas>
          </div>
        </article>

        <article class="panel">
          <div class="panel-head">
            <div>
              <h3>Analisis Cepat Dashboard</h3>
              <p>Sorot kondisi berkas primer, kelas, dan dinamika santri terbaru.</p>
            </div>
          </div>
          ${buildInsightHtml(data)}
        </article>
      </section>

      </section><!-- /page-berkas -->

      <!-- ★ v17: Page section — Proker -->
      <section class="page-section" id="page-proker" data-page="proker">
      <section class="panels" id="proker">
        <article class="panel">
          <div class="panel-head">
            <div>
              <h3>Proker Tahunan</h3>
              <p>${escapeHtml(data.proker?.tahun_hijriyah || '')} ${escapeHtml(data.proker?.tahun_masehi || '')}</p>
            </div>
          </div>
          ${buildProkerHtml(data.proker)}
        </article>
      </section>

      </section><!-- /page-proker -->

      <!-- ★ v17: Page section — Semua Kelas (daftar lengkap, tidak dipotong) -->
      <section class="page-section" id="page-kelas-all" data-page="kelas-all">
        <section class="panels">
          <article class="panel" style="grid-column:1/-1">
            <div class="panel-head">
              <div>
                <h3>🏫 Daftar Semua Kelas Aktif</h3>
                <p>Menampilkan SELURUH kelas — tidak dipotong. Total ${kelasRekap.length} kelas, ${kelasRekap.reduce((a,k)=>a+k.total,0)} santri.</p>
              </div>
              <div class="pagination-info">
                <span class="pill">${kelasRekap.length} kelas</span>
              </div>
            </div>
            ${kelasRekap.length === 0
              ? '<div class="empty-note">Belum ada data kelas.</div>'
              : `<div class="summary-card" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
                  ${kelasRekap.map((k) => `<div class="summary-mini"><span>${escapeHtml(k.kelas)}</span><strong>${k.total} santri</strong></div>`).join('')}
                </div>`}
          </article>
        </section>
      </section><!-- /page-kelas-all -->

      <div class="footer-note">${BRAND_NAME} • Sistem Informasi Pusdat Gontor 5 • ${escapeHtml(tglPanjang)}</div>
    </main>
  </div>

<script>
  // ★ v19: Topnav tab pagination (sidebar dihapus)
  (function setupTopnavPagination(){
    const tabBtns = document.querySelectorAll('.topnav-tabs button.tab-btn[data-page]');
    const pages = document.querySelectorAll('.page-section[data-page]');
    const known = ['overview','rekap','berkas','proker','kelas-all'];

    function activate(pageId){
      let found = false;
      pages.forEach((p) => {
        const ok = p.dataset.page === pageId;
        p.classList.toggle('active', ok);
        if (ok) found = true;
      });
      tabBtns.forEach((b) => b.classList.toggle('active', b.dataset.page === pageId));
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(_) {}
      return found;
    }

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const pid = btn.dataset.page;
        if (!pid) return;
        if (activate(pid)) {
          ev.preventDefault();
          history.replaceState(null, '', '#' + pid);
        }
      });
    });

    // Apply page from hash if present
    const initial = (location.hash || '').replace('#', '');
    if (initial && known.includes(initial)) activate(initial);
    else activate('overview');

    window.addEventListener('hashchange', () => {
      const h = (location.hash || '').replace('#', '');
      if (known.includes(h)) activate(h);
    });
  })();

  const kelasLabels = ${kelasLabels};
  const kelasData = ${kelasData};
  const berkasLabels = ${berkasLabels};
  const berkasAda = ${berkasAda};
  const berkasKosong = ${berkasKosong};

  function classColors(n){
    const palette = ['#214e97','#2e67b8','#4f84cc','#6ea0df','#9ac0f0','#f0a34a','#e57f1f','#b55f13','#18a874','#5fbf91'];
    return Array.from({length:n}, (_,i) => palette[i % palette.length]);
  }

  new Chart(document.getElementById('kelasChart'), {
    type: 'bar',
    data: {
      labels: kelasLabels,
      datasets: [{
        label: 'Jumlah Santri',
        data: kelasData,
        backgroundColor: classColors(kelasLabels.length),
        borderRadius: 6,
        maxBarThickness: 28,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#516079', maxRotation: 60, minRotation: 30 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#516079' }, grid: { color: 'rgba(33,78,151,.08)' } },
      },
    },
  });

  new Chart(document.getElementById('berkasChart'), {
    type: 'bar',
    data: {
      labels: berkasLabels,
      datasets: [
        { label: 'Ada', data: berkasAda, backgroundColor: '#18a874', borderRadius: 8, stack: 'berkas' },
        { label: 'Kosong', data: berkasKosong, backgroundColor: '#e04f5f', borderRadius: 8, stack: 'berkas' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 14, color: '#516079' } } },
      scales: {
        x: { stacked: true, ticks: { color: '#516079' }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { color: '#516079' }, grid: { color: 'rgba(33,78,151,.08)' } },
      },
    },
  });
</script>
</body>
</html>`;
}

// ════════════════════════════════════════════════
//  BROADCAST PREVIEW (POSTER) — 1080×1350 untuk WA
// ════════════════════════════════════════════════
function renderBroadcastPreviewPage(data, options = {}) {
  const dashboardUrl = getDashboardUrl().replace(/\/$/, '');
  const tglPanjang = formatTanggalIndonesia();
  const jam = formatJamIndonesia();
  const totalSantri = data.daily?.totalSantriAktif || data.santri?.total || 0;
  const totalGuru = data.daily?.totalGuruAktif || 0;
  const berkasSummary = getBerkasSummary(data.berkas, true);
  const totalKelas = Object.keys(data.santri?.perKelas || {}).length;
  const prokerTotal = data.proker?.tahunan?.total || 0;
  const prokerSelesai = data.proker?.tahunan?.selesai || 0;
  const prokerPct = prokerTotal > 0 ? Math.round((prokerSelesai / prokerTotal) * 100) : 0;
  const pengurangan = Array.isArray(data.daily?.penguranganSantri)
    ? data.daily.penguranganSantri.slice(0, 3)
    : [];

  const kelasRekap = getKelasRekap(data.santri?.perKelas || {});
  // ★ v17: Tampilkan SEMUA kelas, tidak dipotong (sesuai permintaan)
  const kelasShow = kelasRekap;
  const kelasRest = 0;

  const berkasRows = berkasSummary.ranked;
  const stafRows = Array.isArray(data.piket?.list) ? data.piket.list.slice(0, 4) : [];

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080, initial-scale=1">
<title>${BRAND_NAME} • Broadcast Preview</title>
<link rel="icon" href="/public/img/favicon.png" type="image/png">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  ${logoSwitcherStyle()}
  :root {
    --navy: #1c4485;
    --navy-dark: #11305f;
    --orange: #e57f1f;
    --green: #18a874;
    --red: #e04f5f;
    --text: #0f172a;
    --muted: #4d5b75;
    --paper: #ffffff;
    --bg: #eef3fb;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', 'Inter', Tahoma, sans-serif; }
  html, body { background: ${options.compact ? 'transparent' : 'var(--bg)'}; color: var(--text); }
  body { padding: ${options.compact ? '0' : '24px'}; }
  .sheet {
    width: 1080px;
    min-height: 1350px;
    margin: 0 auto;
    background: linear-gradient(180deg, #ffffff 0%, #f7faff 100%);
    border-radius: 36px;
    overflow: hidden;
    box-shadow: 0 28px 80px rgba(19, 37, 71, .18);
    border: 1px solid rgba(33,78,151,.12);
    position: relative;
  }
  .ribbon {
    position: absolute; top: 0; left: 0; right: 0;
    height: 18px;
    background: linear-gradient(90deg, var(--navy), var(--orange));
  }
  .header {
    padding: 50px 56px 32px;
    display: grid;
    grid-template-columns: 150px 1fr auto;
    gap: 28px;
    align-items: center;
    border-bottom: 1px solid #e2eaf6;
  }
  .header .logo-adaptive { width: 150px; height: 150px; }
  .header h1 { font-size: 56px; color: var(--navy-dark); letter-spacing: .5px; line-height: 1.05; }
  .header .sub { color: var(--muted); font-size: 22px; margin-top: 8px; }
  .header .stamp {
    background: linear-gradient(135deg, var(--navy), var(--navy-dark));
    color: #fff; padding: 18px 22px; border-radius: 22px;
    text-align: center; min-width: 240px;
  }
  .header .stamp small { display: block; font-size: 14px; opacity: .85; }
  .header .stamp strong { display: block; font-size: 28px; margin-top: 4px; }
  .kpis {
    padding: 28px 56px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
  }
  .kpi {
    border-radius: 22px;
    padding: 22px 22px 20px;
    border: 1px solid #d6e0f1;
    background: #fff;
  }
  .kpi span { font-size: 16px; color: var(--muted); display: block; margin-bottom: 10px; font-weight: 600; }
  .kpi strong { font-size: 48px; color: var(--navy-dark); display: block; line-height: 1; }
  .kpi small { font-size: 14px; color: var(--muted); display: block; margin-top: 8px; line-height: 1.45; }

  .grid {
    padding: 8px 56px 36px;
    display: grid;
    grid-template-columns: 1.15fr .85fr;
    gap: 22px;
  }
  .card {
    background: #fff;
    border-radius: 24px;
    border: 1px solid #dbe4f1;
    padding: 24px 24px 20px;
  }
  .card h3 { font-size: 26px; color: var(--navy-dark); margin-bottom: 6px; }
  .card p.lead { color: var(--muted); font-size: 15px; margin-bottom: 16px; line-height: 1.5; }

  .kelas-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .kelas-pill {
    border: 1px solid #e2e8f3;
    background: linear-gradient(180deg, #ffffff, #f5f8ff);
    border-radius: 14px;
    padding: 10px 12px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .kelas-pill b { color: var(--navy-dark); font-size: 16px; }
  .kelas-pill span { color: var(--muted); font-size: 14px; font-weight: 600; }
  .kelas-rest { grid-column: span 4; text-align: center; color: var(--muted); font-size: 14px; padding: 6px; }

  .doc-list { display: grid; gap: 14px; margin-top: 4px; }
  .doc-row { display: grid; gap: 8px; }
  .doc-meta { display: flex; justify-content: space-between; font-size: 17px; }
  .doc-meta strong { color: var(--navy-dark); }
  .doc-meta span { color: var(--muted); font-weight: 600; }
  .stack {
    display: flex; width: 100%; height: 16px;
    background: #edf2fa; border-radius: 999px; overflow: hidden;
  }
  .fill-green { background: linear-gradient(90deg, #19a573, #2cc08c); height: 100%; }
  .fill-red { background: linear-gradient(90deg, #ef6877, #db4354); height: 100%; }

  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
  .mini-card { background: #f9fbff; border: 1px solid #e2e8f3; border-radius: 16px; padding: 14px 16px; }
  .mini-card span { display: block; color: var(--muted); font-size: 13px; margin-bottom: 6px; }
  .mini-card strong { color: var(--navy-dark); font-size: 20px; }

  .full {
    grid-column: 1 / -1;
  }
  .row-list { display: grid; gap: 10px; margin-top: 6px; }
  .row-item {
    border: 1px solid #e2e8f3; border-radius: 14px; padding: 12px 14px;
    background: #fbfdff; display: flex; justify-content: space-between; gap: 14px; align-items: center;
  }
  .row-item strong { color: var(--navy-dark); font-size: 16px; }
  .row-item span { color: var(--muted); font-size: 14px; }

  .footer {
    padding: 18px 56px 36px;
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid #e2eaf6; margin-top: 8px;
    color: var(--muted); font-size: 14px;
  }
  .footer .url { color: var(--navy); font-weight: 700; font-size: 15px; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="ribbon"></div>

    <header class="header">
      ${logoTag(150, BRAND_NAME)}
      <div>
        <h1>${BRAND_NAME}</h1>
        <div class="sub">Laporan Harian Pusdat • ${escapeHtml(tglPanjang)}</div>
      </div>
      <div class="stamp">
        <small>Pukul</small>
        <strong>${escapeHtml(jam)} WIB</strong>
      </div>
    </header>

    <section class="kpis">
      <div class="kpi"><span>Santri Aktif</span><strong>${totalSantri}</strong><small>${totalKelas} kelas aktif</small></div>
      <div class="kpi"><span>Asatidz Aktif</span><strong>${totalGuru}</strong><small>Guru/asatidz terdata</small></div>
      <div class="kpi"><span>Berkas Primer</span><strong>${berkasSummary.totalAda}</strong><small>${berkasSummary.coveragePct}% dari ${berkasSummary.totalTarget}</small></div>
      <div class="kpi"><span>Staf Piket</span><strong>${data.piket?.list?.length || 0}</strong><small>${escapeHtml(data.piket?.hari || '-')}</small></div>
    </section>

    <section class="grid">
      <div class="card">
        <h3>Rekap Jumlah Santri per Kelas</h3>
        <p class="lead">Visualisasi distribusi santri pada setiap kelas aktif (diagram batang).</p>
        <div style="position:relative;width:100%;height:520px;">
          <canvas id="kelasChartPreview"></canvas>
        </div>
      </div>

      <div class="card">
        <h3>Kelengkapan Berkas Primer</h3>
        <p class="lead">Foto, Ijazah, Akta, Kartu Keluarga.</p>
        <div class="doc-list">
          ${berkasRows
            .map((row) => {
              const adaPct = row.total > 0 ? Math.round((row.ada / row.total) * 100) : 0;
              const kosongPct = Math.max(0, 100 - adaPct);
              return `<div class="doc-row">
                <div class="doc-meta"><strong>${escapeHtml(row.shortLabel)}</strong><span>${row.ada}/${row.total} • ${adaPct}%</span></div>
                <div class="stack">
                  <div class="fill-green" style="width:${adaPct}%"></div>
                  <div class="fill-red" style="width:${kosongPct}%"></div>
                </div>
              </div>`;
            })
            .join('')}
        </div>

        <div class="split">
          <div class="mini-card"><span>Berkas terlengkap</span><strong>${escapeHtml(berkasSummary.strongest?.shortLabel || '-')}</strong></div>
          <div class="mini-card"><span>Prioritas pembenahan</span><strong>${escapeHtml(berkasSummary.weakest?.shortLabel || '-')}</strong></div>
          <div class="mini-card"><span>Berkas tervalidasi</span><strong>${berkasSummary.totalAda}</strong></div>
        </div>
      </div>

      <div class="card full">
        <h3>Staf Piket Hari Ini & Pengurangan 24 Jam</h3>
        <div class="split">
          <div>
            <p class="lead">Staf piket aktif hari ${escapeHtml(data.piket?.hari || '-')}.</p>
            <div class="row-list">
              ${
                stafRows.length
                  ? stafRows
                      .map(
                        (s, i) => `<div class="row-item"><strong>${i + 1}. ${escapeHtml(s?.nama || s?.name || '?')}</strong><span>${escapeHtml(data.piket?.hari || '-')}</span></div>`
                      )
                      .join('')
                  : '<div class="row-item"><strong>Belum ada staf piket</strong><span>-</span></div>'
              }
            </div>
          </div>
          <div>
            <p class="lead">Pengurangan santri 24 jam terakhir.</p>
            <div class="row-list">
              ${
                pengurangan.length
                  ? pengurangan
                      .map(
                        (item) => `<div class="row-item"><strong>${escapeHtml(item?.nama || '-')}</strong><span>${escapeHtml(item?.kelas || '-')} • ${escapeHtml(item?.keputusan || '-')}</span></div>`
                      )
                      .join('')
                  : '<div class="row-item"><strong>Nihil / stabil</strong><span>Tidak ada pengurangan</span></div>'
              }
            </div>
          </div>
        </div>
      </div>
    </section>

    <footer class="footer">
      <span>${BRAND_TAGLINE}</span>
      <span class="url">${escapeHtml(dashboardUrl)}</span>
    </footer>
  </div>
<script>
  (function() {
    const kelasLabels = ${JSON.stringify(kelasRekap.map((k) => k.kelas))};
    const kelasData = ${JSON.stringify(kelasRekap.map((k) => k.total))};
    const palette = ['#214e97','#2e67b8','#4f84cc','#6ea0df','#9ac0f0','#f0a34a','#e57f1f','#b55f13','#18a874','#5fbf91'];
    const colors = kelasLabels.map((_, i) => palette[i % palette.length]);
    if (window.Chart && document.getElementById('kelasChartPreview')) {
      new Chart(document.getElementById('kelasChartPreview'), {
        type: 'bar',
        data: {
          labels: kelasLabels,
          datasets: [{
            label: 'Jumlah Santri',
            data: kelasData,
            backgroundColor: colors,
            borderRadius: 8,
            maxBarThickness: 36,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: true }
          },
          scales: {
            x: {
              ticks: { color: '#374151', maxRotation: 60, minRotation: 30, font: { size: 12, weight: '600' } },
              grid: { display: false }
            },
            y: {
              beginAtZero: true,
              ticks: { color: '#374151', font: { size: 12, weight: '600' } },
              grid: { color: 'rgba(33,78,151,.08)' }
            }
          }
        }
      });
    }
  })();
</script>
</body>
</html>`;
}

// ════════════════════════════════════════════════
//  EXPRESS APP
// ════════════════════════════════════════════════
export async function startDashboard() {
  if (serverInstance) {
    console.log('[DASHBOARD] ⚠️ Server sudah berjalan, skip start ulang');
    return;
  }

  const app = express();
  appInstance = app;

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 6 * 60 * 60 * 1000 },
    })
  );

  // Static files (logo dsb)
  if (fs.existsSync(path.join(DASHBOARD_DIR, 'public'))) {
    app.use('/public', express.static(path.join(DASHBOARD_DIR, 'public')));
  }

  app.get('/', requireAuth, async (req, res) => {
    const user = req.session.user;
    if (user && user.role !== 'admin') {
      return res.redirect('/me');
    }
    try {
      const data = await collectDashboardData();
      res.send(renderDashboardPage(data));
    } catch (err) {
      res.status(500).send(`<h1>❌ Error: ${escapeHtml(err.message)}</h1>`);
    }
  });

  app.get('/preview-card', async (_req, res) => {
    try {
      const data = await collectDashboardData();
      res.send(renderBroadcastPreviewPage(data));
    } catch (err) {
      res.status(500).send(`<h1>❌ Error preview: ${escapeHtml(err.message)}</h1>`);
    }
  });

  app.get('/login', (req, res) => {
    if (req.session?.loggedIn) return res.redirect(req.session.user?.role === 'admin' ? '/' : '/me');
    res.send(renderLoginPage());
  });

  app.post('/login', async (req, res) => {
    const body = req.body || {};
    const role = String(body.role || 'admin').toLowerCase();
    try {
      const user = await authenticate(role, {
        password: body.password || '',
        stambuk: body.stambuk || '',
        tanggal: body.tanggal || '',
      });

      if (!user) {
        const errMsg =
          role === 'admin'
            ? 'Password admin salah. Silakan coba lagi.'
            : 'Verifikasi gagal. Pastikan Stambuk dan Tanggal Lahir sesuai data di database.';
        return res.send(renderLoginPage(errMsg, role));
      }

      req.session.loggedIn = true;
      req.session.user = user;
      console.log(`[DASHBOARD-LOGIN] ✅ ${user.role.toUpperCase()} login: ${user.label}`);

      return res.redirect(user.role === 'admin' ? '/' : '/me');
    } catch (err) {
      console.error('[DASHBOARD-LOGIN] ❌ Error:', err.message);
      res.send(renderLoginPage(`Error sistem: ${err.message}`, role));
    }
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
  });

  // ★ v18: Endpoint publik untuk "Lupa Stambuk?" — hanya mengembalikan
  // pasangan {nama, stambuk, meta} tanpa data sensitif.
  app.get('/api/lookup-stambuk', async (req, res) => {
    try {
      const nama = String(req.query.nama || '').trim();
      const role = String(req.query.role || 'ustadz').toLowerCase();
      if (nama.length < 3) {
        return res.json({ ok: false, error: 'Minimal 3 karakter nama.' });
      }
      // Pencarian hanya berdasarkan NAMA (tidak boleh berdasarkan stambuk
      // — supaya tidak bisa enumerasi stambuk acak).
      if (/^\d+$/.test(nama)) {
        return res.json({ ok: false, error: 'Masukkan NAMA, bukan angka.' });
      }
      const dbAccess = await import('./dbAccess.js');
      let items = [];
      if (role === 'santri') {
        if (typeof dbAccess.cariSantri === 'function') {
          const r = await dbAccess.cariSantri(nama);
          items = (Array.isArray(r) ? r : [])
            .filter((s) => {
              const n = String(s['Nama Lengkap'] || '').toLowerCase();
              return n.includes(nama.toLowerCase());
            })
            .map((s) => ({
              nama: s['Nama Lengkap'] || '-',
              stambuk: s.Stambuk || '-',
              meta: [s.Kelas, s.Rayon].filter(Boolean).join(' • '),
            }));
        }
      } else {
        if (typeof dbAccess.cariGuru === 'function') {
          const r = await dbAccess.cariGuru(nama);
          items = (Array.isArray(r) ? r : [])
            .filter((g) => {
              const n = String(g['Nama Lengkap'] || '').toLowerCase();
              return n.includes(nama.toLowerCase());
            })
            .map((g) => ({
              nama: g['Nama Lengkap'] || '-',
              stambuk: g.Stambuk || '-',
              meta: [g.Status, g.Jabatan].filter(Boolean).join(' • '),
            }));
        }
      }
      res.json({ ok: true, items: items.slice(0, 20), total: items.length });
    } catch (err) {
      console.error('[LOOKUP-STAMBUK] error:', err.message);
      res.json({ ok: false, error: 'Gagal mencari: ' + err.message });
    }
  });

  app.get('/api/stats', requireAuth, async (_req, res) => {
    const data = await collectDashboardData();
    res.json({ ...data, ts: Date.now() });
  });

  // Endpoint screenshot poster broadcast (PNG, 1080×1350)
  app.get('/og-image', async (_req, res) => {
    let browser = null;
    try {
      const puppeteer = await import('puppeteer').catch(() => null);
      if (!puppeteer?.default) {
        return res.redirect('https://api.autoresbot.com/api/maker/pp-default');
      }

      const data = await collectDashboardData();
      browser = await puppeteer.default.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
      await page.setContent(
        renderBroadcastPreviewPage(data, { compact: true }),
        { waitUntil: 'networkidle0', timeout: 30000 }
      );
      const raw = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1080, height: 1350 },
      });
      // Puppeteer v23 mengembalikan Uint8Array; bungkus paksa ke Buffer
      // agar Express mengirimnya sebagai binary murni (bukan JSON-stringified).
      const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(buffer.length));
      res.set('Cache-Control', 'public, max-age=120');
      res.end(buffer);
    } catch (err) {
      console.error('[DASHBOARD] og-image error:', err.message);
      try { res.redirect('https://api.autoresbot.com/api/maker/pp-default'); }
      catch (_) {}
    } finally {
      if (browser) {
        try { await browser.close(); } catch (_) {}
      }
    }
  });

  // ★ v15.1: Register rute editor data (cari, edit, berkas, audit log)
  try {
    registerEditorRoutes(app, requireAuth);
    console.log('[✔] Dashboard editor routes loaded (cari/edit/berkas/audit)');
  } catch (err) {
    console.error('[DASHBOARD] Gagal mendaftarkan editor routes:', err.message);
  }

  // ★ v18.0: Register rute Event Validasi Data Guru
  try {
    registerEventValidasiRoutes(app, requireAuth);
    console.log('[✔] Dashboard event-validasi routes loaded (event admin + ustadz validasi)');
  } catch (err) {
    console.error('[DASHBOARD] Gagal mendaftarkan event-validasi routes:', err.message);
  }

  // ★ v19.0: Register rute Inspeksi Pendataan
  try {
    registerInspeksiRoutes(app, requireAuth);
    console.log('[✔] Dashboard inspeksi routes loaded → /inspeksi');
  } catch (err) {
    console.error('[DASHBOARD] Gagal mendaftarkan inspeksi routes:', err.message);
  }

  serverInstance = app.listen(PORT, () => {
    console.log(`[✔] 🌐 ${BRAND_NAME} aktif → http://localhost:${PORT}`);
    console.log(`    └─ Login: Admin (password) / Ustadz / Santri (stambuk + tgl lahir)`);
  });

  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[DASHBOARD] ❌ Port ${PORT} sudah dipakai. Dashboard tidak start.`);
    } else {
      console.error('[DASHBOARD] ❌ Error:', err.message);
    }
  });
}

export function stopDashboard() {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
    console.log('[DASHBOARD] 🛑 Server dihentikan');
  }
}

export function getDashboardUrl() {
  return pusdatConfig.DASHBOARD_PUBLIC_URL || `http://localhost:${PORT}`;
}

export default {
  startDashboard,
  stopDashboard,
  getDashboardUrl,
  // ★ v17: expose internal renderers for testing
  _renderDashboardPage: renderDashboardPage,
  _renderBroadcastPreviewPage: renderBroadcastPreviewPage,
  _renderLoginPage: renderLoginPage,
  _getKelasRekap: getKelasRekap,
  _getBerkasSummary: getBerkasSummary,
};
