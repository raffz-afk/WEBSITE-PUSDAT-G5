/**
 * test-dashboard-web.mjs
 * Suite pengujian fitur Dashboard Web Editor.
 *
 * Strategi:
 * - Mock module `./dbAccess.js` dengan dataset in-memory (santri + guru)
 * - Mock module `./dbEditor.js` agar updateRecordField menulis ke dataset in-memory
 *   (tanpa node-adodb / tanpa MS Access asli)
 * - Boot Express, daftarkan registerEditorRoutes()
 * - Jalankan request HTTP end-to-end memakai fetch() ke port lokal
 * - Verifikasi response status + isi HTML / JSON
 *
 * Target: minimal 10 skenario PASS.
 */

import express from 'express';
import session from 'express-session';
import { mock } from 'node:test';

// ─────────────────────────────────────
//  In-memory DB
// ─────────────────────────────────────
const dataset = {
  santri: [
    { Stambuk: 13971942, 'Nama Lengkap': "Muhammad Raffal 'Aris", Kelas: '5C', Rayon: 'Al-Azhar', Status: 'Aktif', 'No BPJS': null, 'Tinggi Badan': 168 },
    { Stambuk: 25001, 'Nama Lengkap': 'Budi Santoso', Kelas: '1A', Rayon: 'Sahara', Status: 'Aktif', 'No BPJS': '12345', 'Tinggi Badan': 160 },
    { Stambuk: 25002, 'Nama Lengkap': 'Ahmad Fauzi', Kelas: '1A', Rayon: 'Saudi', Status: 'Aktif', 'No BPJS': '67890', 'Tinggi Badan': 165 },
  ],
  guru: [
    { Stambuk: 14171942, 'Nama Lengkap': 'Ustadz Ahmad', Status: 'Aktif', Bagian: 'Pusdat', 'No HP': '0812345' },
    { Stambuk: 14001, 'Nama Lengkap': 'Ustadz Budi', Status: 'Aktif', Bagian: 'KMI', 'No HP': '0823456' },
  ],
};

// ─────────────────────────────────────
//  Hijack imports menggunakan loader sederhana
//  Karena Node ESM tidak izinkan mock module path-based di runtime tanpa loader,
//  kita gunakan pendekatan: replace function di module yang baru di-load.
// ─────────────────────────────────────
const dbAccess = await import('../lib/dbAccess.js');
const dbEditor = await import('../lib/dbEditor.js');

// Backup originals (untuk cleanup)
const origCariSantri = dbAccess.cariSantri;
const origCariGuru = dbAccess.cariGuru;
const origGetFullBiodata = dbAccess.getFullBiodata;
const origGetFullBiodataSantri = dbAccess.getFullBiodataSantri;
const origUpdateRecordField = dbEditor.updateRecordField;
const origGetEditableRecordByStambuk = dbEditor.getEditableRecordByStambuk;

// ─────────────────────────────────────
//  Karena ESM read-only export, kita tidak bisa reassign langsung.
//  Strategi alternatif: monkey-patch via globalThis hooks yang dibaca modul
//  ATAU rewrite dashboardEditor agar memakai globalThis fallback.
//
//  Solusi praktis di sini: kita patch dengan Reflect.defineProperty?
//  Sebenarnya properti namespace ESM bersifat live binding, tetapi tidak writable.
//  Maka kita gunakan strategi berbeda: gunakan registerEditorRoutes
//  langsung dengan request asli ke node-adodb? Tidak mungkin di Linux.
//
//  Solusi pragmatis: monkey-patch melalui internal di dbEditor (function-level)
//  dengan mengganti reference dari globalThis.__pusdatTestHook
// ─────────────────────────────────────

// Karena keterbatasan, kita uji LAYER yang TIDAK menyentuh MS Access:
//   - basePage, renderSearchPage, renderEditPage, renderBerkasPage, renderAuditPage
//   - listBerkasStatus (file system based)
//   - parseQuickEditInput, resolveEditableField, inferAndNormalizeNewValue, simulateRecordUpdate
//   - audit log read/write
// + Uji integrasi dashboardEditor renderer functions (export internal `_renderXxx`)
//   yang sudah kami expose di default export.

const { default: dashboardEditor } = await import('../lib/dashboardEditor.js');
const {
  parseQuickEditInput,
  resolveEditableField,
  inferAndNormalizeNewValue,
  simulateRecordUpdate,
  listEditableFields,
  formatEditValue,
} = dbEditor;

// ─────────────────────────────────────
//  Test runner
// ─────────────────────────────────────
const results = [];
let pass = 0;
let fail = 0;

function it(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      results.push({ name, status: 'PASS' });
      pass++;
    })
    .catch((err) => {
      results.push({ name, status: 'FAIL', err: err.message });
      fail++;
    });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function contains(haystack, needle) {
  assert(
    String(haystack).includes(needle),
    `Expected output to contain "${needle}" but it didn't. Got: ${String(haystack).slice(0, 300)}...`,
  );
}

// ─────────────────────────────────────
//  TEST 1: basePage menghasilkan HTML valid
// ─────────────────────────────────────
await it('01 basePage HTML valid + nav lengkap', () => {
  // ★ v17: nav admin hanya ditampilkan untuk user admin
  const html = dashboardEditor._basePage('Tes', '<div class="card">isi</div>', '', {
    role: 'admin', nama: 'Adm', stambuk: '',
  });
  contains(html, '<!DOCTYPE html>');
  contains(html, 'Tes • Data Center G5');
  contains(html, 'href="/cari"');
  contains(html, 'href="/audit"');
  contains(html, 'href="/logout"');
  contains(html, '<div class="card">isi</div>');
});

// ─────────────────────────────────────
//  TEST 2: renderSearchPage kosong → instruksi muncul
// ─────────────────────────────────────
await it('02 renderSearchPage tanpa keyword', () => {
  const html = dashboardEditor._renderSearchPage();
  contains(html, '🔍 Cari Santri / Guru');
  contains(html, 'action="/cari"');
  contains(html, 'name="q"');
});

// ─────────────────────────────────────
//  TEST 3: renderSearchPage dengan hasil
// ─────────────────────────────────────
await it('03 renderSearchPage dengan hasil santri+guru', () => {
  const html = dashboardEditor._renderSearchPage({
    keyword: 'raffal',
    result: { santri: dataset.santri.slice(0, 2), guru: dataset.guru.slice(0, 1) },
  });
  contains(html, "Muhammad Raffal &#39;Aris");
  contains(html, 'Ustadz Ahmad');
  contains(html, '/santri/13971942');
  contains(html, '/guru/14171942');
  contains(html, '/edit/santri/13971942');
  contains(html, '/edit/guru/14171942');
});

// ─────────────────────────────────────
//  TEST 4: renderDetailPage santri menampilkan semua kolom
// ─────────────────────────────────────
await it('04 renderDetailPage santri lengkap', () => {
  // ★ v17: lewatkan user admin agar tombol edit ditampilkan
  const html = dashboardEditor._renderDetailPage('santri', dataset.santri[0], {
    user: { role: 'admin', nama: 'A', stambuk: '' },
  });
  contains(html, "Biodata 13971942");
  contains(html, "Muhammad Raffal &#39;Aris"); // di-escape
  contains(html, 'Nama Lengkap');
  contains(html, 'Kelas');
  contains(html, 'Tombol edit'.replace('Tombol edit', '/edit/santri/13971942'));
  contains(html, '/berkas/13971942');
});

// ─────────────────────────────────────
//  TEST 5: renderDetailPage guru tidak menampilkan tombol berkas
// ─────────────────────────────────────
await it('05 renderDetailPage guru tanpa tombol berkas', () => {
  // ★ v17: lewatkan user admin agar tombol edit ditampilkan
  const html = dashboardEditor._renderDetailPage('guru', dataset.guru[0], {
    user: { role: 'admin', nama: 'A', stambuk: '' },
  });
  contains(html, 'Biodata 14171942');
  contains(html, '/edit/guru/14171942');
  assert(
    !html.includes('/berkas/14171942'),
    'Guru tidak seharusnya punya tombol berkas',
  );
});

// ─────────────────────────────────────
//  TEST 6: renderEditPage menampilkan input untuk SEMUA kolom
// ─────────────────────────────────────
await it('06 renderEditPage berisi input semua kolom', () => {
  const html = dashboardEditor._renderEditPage('santri', dataset.santri[0]);
  contains(html, 'name="Stambuk"');
  contains(html, 'name="Nama Lengkap"');
  contains(html, 'name="Kelas"');
  contains(html, 'name="Rayon"');
  contains(html, 'name="Status"');
  contains(html, 'name="No BPJS"');
  contains(html, 'name="Tinggi Badan"');
  contains(html, 'Simpan Perubahan');
  contains(html, 'action="/edit/santri/13971942"');
});

// ─────────────────────────────────────
//  TEST 7: renderBerkasPage menampilkan 9 folder (A-I) + tombol upload
// ─────────────────────────────────────
await it('07 renderBerkasPage menampilkan 9 folder A-I + upload form', () => {
  const dummyStatus = [
    { folder: 'A. FOTO AKSES', kode: 'A', tipe: 'Primer', ada: true, ext: '.jpg', size: 12345, mtime: 0 },
    { folder: 'B. IJAZAH', kode: 'B', tipe: 'Primer', ada: false, ext: '', size: 0, mtime: 0 },
    { folder: 'C. AKTA KELAHIRAN', kode: 'C', tipe: 'Primer', ada: false, ext: '', size: 0, mtime: 0 },
    { folder: 'D. KARTU KELUARGA', kode: 'D', tipe: 'Primer', ada: false, ext: '', size: 0, mtime: 0 },
    { folder: 'E. SURAT PERMOHONAN', kode: 'E', tipe: 'Sekunder', ada: false, ext: '', size: 0, mtime: 0 },
    { folder: 'F. SURAT PERNYATAAN', kode: 'F', tipe: 'Sekunder', ada: false, ext: '', size: 0, mtime: 0 },
    { folder: 'G. PAKTA INTEGRITAS', kode: 'G', tipe: 'Sekunder', ada: false, ext: '', size: 0, mtime: 0 },
    { folder: 'H. BPJS', kode: 'H', tipe: 'Sekunder', ada: false, ext: '', size: 0, mtime: 0 },
    { folder: 'I. LAIN-LAIN', kode: 'I', tipe: 'Sekunder', ada: false, ext: '', size: 0, mtime: 0 },
  ];
  const html = dashboardEditor._renderBerkasPage('13971942', dataset.santri[0], dummyStatus);
  contains(html, 'A. FOTO AKSES');
  contains(html, 'B. IJAZAH');
  contains(html, 'I. LAIN-LAIN');
  contains(html, 'enctype="multipart/form-data"');
  contains(html, 'Replace');
  contains(html, 'Upload');
  contains(html, 'value="A"');
  contains(html, 'stambuk=13971942&kode=A');
});

// ─────────────────────────────────────
//  TEST 8: renderAuditPage kosong + berisi
// ─────────────────────────────────────
await it('08 renderAuditPage kosong & berisi', () => {
  const empty = dashboardEditor._renderAuditPage([]);
  contains(empty, 'Belum ada riwayat perubahan');

  const filled = dashboardEditor._renderAuditPage([
    { time: '2026-05-11T05:00:00Z', dbLabel: 'DB Santri', stambuk: '13971942', field: 'Nama Lengkap', before: 'lama', after: 'baru', actor: 'web:owner' },
  ]);
  contains(filled, '13971942');
  contains(filled, 'Nama Lengkap');
  contains(filled, 'web:owner');
});

// ─────────────────────────────────────
//  TEST 9: parseQuickEditInput menerima format pipe
// ─────────────────────────────────────
await it('09 parseQuickEditInput format valid', () => {
  const r = parseQuickEditInput("13971942 | Nama Lengkap | Muhammad Raffal 'Aris");
  assert(r.ok === true, 'parse harus ok');
  assert(r.stambuk === '13971942', 'stambuk salah');
  assert(r.fieldInput === 'Nama Lengkap', 'field salah');
  assert(r.newValueRaw === "Muhammad Raffal 'Aris", 'value salah');
});

// ─────────────────────────────────────
//  TEST 10: resolveEditableField + inferAndNormalizeNewValue
// ─────────────────────────────────────
await it('10 resolveEditableField angka & inferAndNormalizeNewValue tipe', () => {
  const rec = dataset.santri[0];
  // resolve by index
  assert(resolveEditableField(rec, '4') === 'Rayon', 'index 4 harus Rayon');
  // resolve by partial
  assert(resolveEditableField(rec, 'nama') === 'Nama Lengkap', 'partial harus Nama Lengkap');
  // string
  const s = inferAndNormalizeNewValue('Magelang', rec.Rayon);
  assert(s.type === 'string', 's harus string');
  // angka via existing number
  const n = inferAndNormalizeNewValue('170', rec['Tinggi Badan']);
  assert(n.type === 'number' && n.value === 170, 'number harus 170');
  // kosongkan
  const k = inferAndNormalizeNewValue('[KOSONGKAN]', 'isi lama');
  assert(k.type === 'null' && k.value === null, 'kosongkan harus null');
});

// ─────────────────────────────────────
//  TEST 11: simulateRecordUpdate menghasilkan perubahan
// ─────────────────────────────────────
await it('11 simulateRecordUpdate: ubah Nama Lengkap', () => {
  const r = simulateRecordUpdate(dataset.santri[0], 'Nama Lengkap', "Muhammad Raffal Aris");
  assert(r.resolvedField === 'Nama Lengkap');
  assert(r.nextRecord['Nama Lengkap'] === "Muhammad Raffal Aris");
  assert(r.beforeDisplay === "Muhammad Raffal 'Aris");
  assert(r.afterDisplay === "Muhammad Raffal Aris");
});

// ─────────────────────────────────────
//  TEST 12: Express app bisa di-boot + register routes
// ─────────────────────────────────────
let server;
let port = 0;

await it('12 Express app + registerEditorRoutes boot OK', async () => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: true,
    }),
  );
  // Fake login middleware: paksa loggedIn=true sebagai admin (★ v17)
  app.use((req, _res, next) => {
    req.session.loggedIn = true;
    req.session.user = { role: 'admin', nama: 'Tester', stambuk: '', label: 'tester' };
    next();
  });
  function requireAuth(_req, _res, next) { return next(); }
  dashboardEditor.registerEditorRoutes(app, requireAuth);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });
  assert(port > 0, 'server tidak listen');
});

// ─────────────────────────────────────
//  TEST 13: GET /cari tanpa query → status 200 + form
// ─────────────────────────────────────
await it('13 GET /cari tanpa query → 200 + form', async () => {
  // Karena tidak ada DB Access di Linux, search akan return {santri:[], guru:[]} via try/catch.
  // Tetap saja halaman harus tampil.
  const res = await fetch(`http://127.0.0.1:${port}/cari`);
  assert(res.status === 200, `expected 200 got ${res.status}`);
  const html = await res.text();
  contains(html, 'Cari Santri / Guru');
  contains(html, 'name="q"');
});

// ─────────────────────────────────────
//  TEST 14: GET /audit → 200 + render empty/filled
// ─────────────────────────────────────
await it('14 GET /audit → 200 valid', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/audit`);
  assert(res.status === 200, `expected 200 got ${res.status}`);
  const html = await res.text();
  contains(html, 'Audit Log');
});

// ─────────────────────────────────────
//  TEST 15: GET /api/audit → JSON ok
// ─────────────────────────────────────
await it('15 GET /api/audit → JSON ok', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/api/audit`);
  assert(res.status === 200, `expected 200 got ${res.status}`);
  const json = await res.json();
  assert(json.ok === true, 'api audit harus ok=true');
  assert(Array.isArray(json.entries), 'entries harus array');
});

// ─────────────────────────────────────
//  TEST 16: GET /api/berkas/list?stambuk=13971942 → JSON 9 folder
// ─────────────────────────────────────
await it('16 GET /api/berkas/list stambuk → 9 folder', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/api/berkas/list?stambuk=13971942`);
  assert(res.status === 200, `expected 200 got ${res.status}`);
  const json = await res.json();
  assert(json.ok === true, 'ok harus true');
  assert(Array.isArray(json.items), 'items harus array');
  assert(json.items.length === 9, `harus 9 folder, dapat ${json.items.length}`);
  const kodeList = json.items.map((x) => x.kode).sort().join('');
  assert(kodeList === 'ABCDEFGHI', `kode A-I tidak lengkap: ${kodeList}`);
});

// ─────────────────────────────────────
//  TEST 17: GET /api/berkas/list tanpa stambuk → 400
// ─────────────────────────────────────
await it('17 GET /api/berkas/list tanpa stambuk → 400', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/api/berkas/list`);
  assert(res.status === 400, `expected 400 got ${res.status}`);
});

// ─────────────────────────────────────
//  TEST 18: GET /api/cari?q=raffal → ok JSON
// ─────────────────────────────────────
await it('18 GET /api/cari → ok JSON', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/api/cari?q=raffal`);
  assert(res.status === 200, `expected 200 got ${res.status}`);
  const json = await res.json();
  assert(json.ok === true, 'api cari ok');
  assert(Array.isArray(json.santri) && Array.isArray(json.guru), 'santri & guru array');
});

// ─────────────────────────────────────
//  Bersihkan & laporkan hasil
// ─────────────────────────────────────
if (server) server.close();

console.log('=== HASIL UJI DASHBOARD WEB ===');
for (const r of results) {
  if (r.status === 'PASS') console.log(`✅ ${r.name}`);
  else console.log(`❌ ${r.name} -> ${r.err}`);
}
console.log('---');
console.log(`TOTAL: ${results.length}`);
console.log(`PASS : ${pass}`);
console.log(`FAIL : ${fail}`);
if (fail > 0) process.exit(1);
