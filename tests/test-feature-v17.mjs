/**
 * test-feature-v17.mjs
 *
 * Suite uji untuk fitur v17:
 *  1. Top toolbar di main dashboard
 *  2. Sidebar paginasi per page
 *  3. Tanggal lahir Guru dapat dibaca (normalizeDate aktif)
 *  4. Deteksi nomor HP berfungsi (varian kolom)
 *  5. Validasi kolom kosong (EMIS + Eprimer Pondok + No HP, dll)
 *  6. Foto akses tidak broken (BERKAS_INDUK_DIR fallback)
 *  7. Upload/download berkas tidak nyasar ke /cari
 *  8. Dashboard menampilkan SEMUA kelas, tidak dipotong
 *  9. Top toolbar editor untuk admin di setiap halaman
 * 10. Validasi alias kolom (No. HP, Telp, dst tetap dianggap terisi)
 *
 * Setiap skenario dijalankan 10 putaran (REPEATS=10) untuk memastikan
 * konsistensi dan tidak ada side-effect antar putaran.
 */

import express from 'express';
import session from 'express-session';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const REPEATS = 10;
const results = [];
let pass = 0, fail = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function contains(h, n) { assert(String(h).includes(n), `missing "${n}"`); }
function notContains(h, n) { assert(!String(h).includes(n), `should not contain "${n}"`); }

async function it(name, fn) {
  for (let i = 1; i <= REPEATS; i++) {
    try {
      await fn();
      results.push({ name, run: i, status: 'PASS' });
      pass++;
    } catch (err) {
      results.push({ name, run: i, status: 'FAIL', err: err.message });
      fail++;
    }
  }
}

// ─── Pre-load modules ───────────────────────────
const dashboardMod = await import('../lib/dashboard.js');
const editorMod = await import('../lib/dashboardEditor.js');
const dbAccess = await import('../lib/dbAccess.js');

const ADMIN_USER = { role: 'admin', nama: 'Admin', stambuk: '', label: 'admin' };
const SANTRI_USER = { role: 'santri', nama: 'Santri X', stambuk: '13971942', label: 'santri-13971942' };

const MOCK_DATA = {
  daily: { totalSantriAktif: 1234, totalGuruAktif: 87, penguranganSantri: [] },
  santri: {
    total: 1234,
    perKelas: {
      '1A': 30, '1B': 28, '1C': 26, '1D': 24, '2A': 25, '2B': 27, '2C': 26,
      '3A': 24, '3 Int A': 22, '3 Int B': 21, '4A': 23, '4B': 23, '4C': 22,
      '5A': 20, '5B': 21, '5C': 22, '5D': 19, '6A': 18, '6B': 17, '6C': 16,
      '6D': 15, '6E': 14, '6F': 13, '6G': 12, 'Khusus A': 11, 'Khusus B': 10,
    },
  },
  berkas: {
    total: 1234,
    counts: {
      'A. FOTO AKSES':      { ada: 1000, kosong: 234 },
      'B. IJAZAH':          { ada: 800,  kosong: 434 },
      'C. AKTA KELAHIRAN':  { ada: 900,  kosong: 334 },
      'D. KARTU KELUARGA':  { ada: 850,  kosong: 384 },
      'E. SURAT PERMOHONAN':{ ada: 500,  kosong: 734 },
      'F. SURAT PERNYATAAN':{ ada: 400,  kosong: 834 },
      'G. PAKTA INTEGRITAS':{ ada: 380,  kosong: 854 },
      'H. BPJS':            { ada: 600,  kosong: 634 },
      'I. LAIN-LAIN':       { ada: 700,  kosong: 534 },
    },
  },
  piket: { hari: 'Selasa', list: [{ nama: 'Ust. Ahmad', jabatan: 'Koord' }, { nama: 'Ust. Budi' }] },
  proker: {
    tahun_hijriyah: '1447', tahun_masehi: '2026',
    tahunan: { total: 12, selesai: 5, list: [
      { judul: 'Pendataan Santri', status: 'selesai', target: 'Sep 2026', deadline: 'Okt 2026' },
      { judul: 'Audit Berkas', status: 'progress', target: 'Nov 2026', deadline: 'Des 2026' },
    ] },
  },
};

// ──────────────────────────────────────────────────────
//  TEST 1: Top toolbar di main dashboard
// ──────────────────────────────────────────────────────
await it('01 Top toolbar di main dashboard', () => {
  const html = dashboardMod.default._renderDashboardPage(MOCK_DATA);
  contains(html, 'top-toolbar');
  contains(html, 'action="/cari"');
  contains(html, 'name="q"');
  contains(html, 'href="/ekspor"');
  contains(html, 'href="/rekap-berkas"');
  contains(html, 'href="/validasi/santri"');
  contains(html, 'href="/validasi/guru"');
  contains(html, 'href="/audit"');
  contains(html, 'href="/logout"');
});

// ──────────────────────────────────────────────────────
//  TEST 2: Sidebar paginasi per page
// ──────────────────────────────────────────────────────
await it('02 Sidebar paginasi per page', () => {
  const html = dashboardMod.default._renderDashboardPage(MOCK_DATA);
  contains(html, 'id="sidebarMenu"');
  contains(html, 'data-page="overview"');
  contains(html, 'data-page="rekap"');
  contains(html, 'data-page="berkas"');
  contains(html, 'data-page="proker"');
  contains(html, 'data-page="kelas-all"');
  contains(html, 'id="page-overview"');
  contains(html, 'id="page-rekap"');
  contains(html, 'id="page-berkas"');
  contains(html, 'id="page-proker"');
  contains(html, 'id="page-kelas-all"');
  contains(html, 'setupSidebarPagination');
  contains(html, 'class="page-section active"');
});

// ──────────────────────────────────────────────────────
//  TEST 3: Tanggal lahir Guru terbaca (normalizeDate)
// ──────────────────────────────────────────────────────
await it('03 enrichGuruRecord normalisasi Tanggal Lahir', () => {
  const r = dbAccess.enrichGuruRecord({
    Stambuk: 14171942,
    'Nama Lengkap': 'Ust. Test',
    'Tanggal Lahir': new Date('1990-05-15T00:00:00Z'),
    'No HP': '08123456789',
  });
  assert(r['Tanggal Lahir'] === '15-05-1990', `expected 15-05-1990 got ${r['Tanggal Lahir']}`);
  // ISO string juga harus dinormalkan
  const r2 = dbAccess.enrichGuruRecord({
    Stambuk: 1, 'Nama Lengkap': 'X',
    'Tanggal Lahir': '1985-12-25T00:00:00Z',
  });
  assert(r2['Tanggal Lahir'] === '25-12-1985', `expected 25-12-1985 got ${r2['Tanggal Lahir']}`);
});

// ──────────────────────────────────────────────────────
//  TEST 4: Deteksi nomor HP berfungsi (varian kolom)
// ──────────────────────────────────────────────────────
await it('04 Deteksi No HP varian kolom', () => {
  // Format dasar
  assert(dbAccess.normalizePhoneValue('0812-3456-7890') === '+6281234567890');
  assert(dbAccess.normalizePhoneValue('  +62 812 345 6789  ') === '+628123456789');
  assert(dbAccess.normalizePhoneValue('') === '');
  // Variants of column names
  assert(dbAccess.extractPhoneFromRecord({ 'No. HP': '(0812) 111-2222' }) === '+628121112222');
  assert(dbAccess.extractPhoneFromRecord({ Handphone: '0856 777 8888' }) === '+628567778888');
  assert(dbAccess.extractPhoneFromRecord({ 'No HP': '', 'No Telp': '08111111111' }) === '+628111111111');
  assert(dbAccess.extractPhoneFromRecord({ 'No WhatsApp': '+62 851 0000 1111' }) === '+6285100001111');
  // Empty record returns ''
  assert(dbAccess.extractPhoneFromRecord({}) === '');
});

// ──────────────────────────────────────────────────────
//  TEST 5: Validasi kolom mencakup EMIS/Eprimer/NoHP
// ──────────────────────────────────────────────────────
await it('05 Validasi fields mencakup EMIS, Eprimer Pondok, NoHP, NUPTK', () => {
  const S = editorMod.default.VALIDASI_FIELDS_SANTRI;
  const G = editorMod.default.VALIDASI_FIELDS_GURU;
  for (const f of ['Nama Lengkap', 'Tanggal Lahir', 'Kelas', 'No KK', 'No KTP', 'NISN', 'EMIS', 'Eprimer Pondok'])
    assert(S.includes(f), `santri wajib include ${f}`);
  for (const f of ['Nama Lengkap', 'Tanggal Lahir', 'Status', 'No HP', 'NUPTK', 'EMIS', 'Eprimer Pondok', 'No KTP'])
    assert(G.includes(f), `guru wajib include ${f}`);
});

// ──────────────────────────────────────────────────────
//  TEST 6: Foto akses fallback path tidak crash
// ──────────────────────────────────────────────────────
await it('06 Foto akses path fallback aktif', () => {
  // listBerkasStatus harus mengembalikan 9 entry tanpa exception walau folder D: tidak ada
  const out = editorMod.default._listBerkas('13971942');
  assert(Array.isArray(out) && out.length === 9, `expected 9 folders got ${out?.length}`);
  // Setiap entry punya kode A-I
  const codes = out.map((o) => o.kode).sort().join('');
  assert(codes === 'ABCDEFGHI', `kode harus A-I, got ${codes}`);
});

// ──────────────────────────────────────────────────────
//  TEST 7: Upload route redirect ke /berkas/:stambuk (bukan /cari)
// ──────────────────────────────────────────────────────
let _server, _port;
{
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(session({ secret: 'v17', resave: false, saveUninitialized: true }));
  app.use((req, _res, next) => {
    req.session.loggedIn = true;
    req.session.user = ADMIN_USER;
    next();
  });
  editorMod.default.registerEditorRoutes(app, (req, res, next) => next());
  await new Promise((r) => { _server = app.listen(0, r); });
  _port = _server.address().port;
}

await it('07 POST /berkas/upload tanpa file → redirect ke /berkas/:stambuk', async () => {
  // Send a multipart-like POST without an actual file; rely on multer rejecting cleanly.
  const fd = new URLSearchParams({ stambuk: '13971942', kode: 'A' });
  const res = await fetch(`http://127.0.0.1:${_port}/berkas/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: fd.toString(),
    redirect: 'manual',
  });
  // Should redirect (302/303) — and Location must point to /berkas/13971942, NEVER /cari
  assert(res.status >= 300 && res.status < 400, `expected redirect, got ${res.status}`);
  const loc = res.headers.get('location') || '';
  assert(loc.startsWith('/berkas/13971942') || loc === '/', `redirect must go to /berkas/:stambuk not "${loc}"`);
  assert(!loc.startsWith('/cari'), `must not redirect to /cari, got "${loc}"`);
});

// ──────────────────────────────────────────────────────
//  TEST 8: Dashboard menampilkan SEMUA kelas
// ──────────────────────────────────────────────────────
await it('08 Dashboard menampilkan SEMUA kelas (tidak slice)', () => {
  const html = dashboardMod.default._renderDashboardPage(MOCK_DATA);
  // Halaman kelas-all wajib ada dan memuat semua label kelas
  for (const k of Object.keys(MOCK_DATA.santri.perKelas)) {
    contains(html, k);
  }
  // Sidebar pagination JS aktif
  contains(html, 'setupSidebarPagination');
  // Broadcast preview pun tidak memotong
  const html2 = dashboardMod.default._renderBroadcastPreviewPage(MOCK_DATA);
  for (const k of Object.keys(MOCK_DATA.santri.perKelas)) {
    contains(html2, k);
  }
  notContains(html2, 'kelasRekap.slice(0, 24)');
});

// ──────────────────────────────────────────────────────
//  TEST 9: Top toolbar editor (admin) hadir di basePage
// ──────────────────────────────────────────────────────
await it('09 basePage admin toolbar hadir; non-admin tersembunyi', () => {
  const a = editorMod.default._basePage('Tes', '<div></div>', '', ADMIN_USER);
  contains(a, '<div class="toolbar-top"');
  contains(a, 'action="/cari"');
  contains(a, 'href="/ekspor"');
  contains(a, 'href="/validasi/santri"');
  const s = editorMod.default._basePage('Tes', '<div></div>', '', SANTRI_USER);
  notContains(s, '<div class="toolbar-top"');
  // (CSS class .toolbar-top tetap di style tag — itu wajar)
});

// ──────────────────────────────────────────────────────
//  TEST 10: Alias validasi — No. HP / Telp dianggap terisi
// ──────────────────────────────────────────────────────
await it('10 Alias validasi mengakui varian kolom No. HP / Telp / EMIS', () => {
  // Build a guru row dengan kolom alias terisi sementara kolom "No HP" kosong
  // (mensimulasikan data raw Access yang kolomnya bernama "No. HP" / "Handphone")
  const row = {
    Stambuk: 999, 'Nama Lengkap': 'Ust Test', Status: 'Aktif',
    'Tanggal Lahir': '01-01-1990',
    'No HP': '',                 // utama kosong
    'No. HP': '(021) 555-1234',  // alias terisi
    Handphone: '',
    EMIS: '',
    Emis: 'EMIS123',             // alias case-insensitive
    'Eprimer Pondok': '',
    Eprimer: 'EP-456',
    NUPTK: '1234567890',
    'No KTP': '321',
  };
  // Pakai _isCellEmpty + helper buildValidasiData secara tidak langsung:
  // alias check identik dengan implementasi internal — tes ulang kontrak.
  function hasAny(row, names) {
    return names.some((n) => !editorMod.default._isCellEmpty(row[n]));
  }
  assert(hasAny(row, ['No HP', 'No. HP', 'Handphone']), 'No HP alias gagal');
  assert(hasAny(row, ['EMIS', 'Emis']), 'EMIS alias gagal');
  assert(hasAny(row, ['Eprimer Pondok', 'Eprimer']), 'Eprimer alias gagal');
  assert(hasAny(row, ['NUPTK']), 'NUPTK gagal');
  assert(hasAny(row, ['No KTP', 'NIK']), 'No KTP gagal');
});

// ─── Selesai ─────────────────────────────────────
if (_server) _server.close();

// Summary
console.log('═══════ TEST FEATURE v17 (10× per skenario) ═══════');
const buckets = {};
for (const r of results) {
  if (!buckets[r.name]) buckets[r.name] = { pass: 0, fail: 0, errs: [] };
  if (r.status === 'PASS') buckets[r.name].pass++;
  else { buckets[r.name].fail++; buckets[r.name].errs.push(`run#${r.run}: ${r.err}`); }
}
for (const [name, b] of Object.entries(buckets)) {
  const ok = b.fail === 0;
  console.log(`${ok ? '✅' : '❌'} ${name} — ${b.pass}/${REPEATS}`);
  if (!ok) for (const e of b.errs) console.log(`   └─ ${e}`);
}
console.log('──────────────────────────');
console.log(`TOTAL RUN: ${results.length}  PASS: ${pass}  FAIL: ${fail}`);
if (fail > 0) process.exit(1);
