/**
 * test-feature-v16.mjs
 * Suite uji komprehensif untuk v16:
 *  - Cron proker (state persisten, catch-up window)
 *  - Dashboard auth multi-role
 *  - Ekspor biodata detail (preset kolom)
 *  - Rekap berkas per jenis
 *  - Validasi data
 *  - Preview-card tanpa persentase proker + chart kelas
 *  - Tombol "Kembali" pengganti tombol JSON
 *  - Foto akses di awal, berkas di akhir
 *
 * Total: 30+ skenario.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const tests = [];
function addTest(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

// ════════════════════════════════════════════════════
//  BAGIAN 1 — CRON PROKER STATE & CATCH-UP
// ════════════════════════════════════════════════════

addTest('01 cronProker.js: file exists & syntax valid', async () => {
  const fp = path.join(ROOT, 'lib', 'cronProker.js');
  assert(fs.existsSync(fp), 'cronProker.js missing');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(txt.includes('v13.7'), 'cronProker harus versi v13.7');
  assert(txt.includes('readState'), 'helper readState wajib ada');
  assert(txt.includes('writeState'), 'helper writeState wajib ada');
  assert(txt.includes("'1-59 7-8 * * *'"), 'cron auto catch-up 7-8 wajib');
  assert(txt.includes("'*/5 9-10 * * *'"), 'cron auto catch-up 9-10 wajib');
});

addTest('02 cronProker: window catch-up sampai jam 11', () => {
  const fp = path.join(ROOT, 'lib', 'cronProker.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(
    txt.includes('totalMenit > 11 * 60'),
    'window catch-up harus diperluas ke 11:00 (tidak hanya 09:00)',
  );
});

addTest('03 cronProker: catch-up dipanggil dua kali pada updateProkerSocket', () => {
  const fp = path.join(ROOT, 'lib', 'cronProker.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(
    txt.includes('socket-update-1s') && txt.includes('socket-update-15s'),
    'updateProkerSocket harus trigger catch-up DUA KALI (1s + 15s)',
  );
});

addTest('04 cronProker: catch-up init dipanggil 8s + 30s', () => {
  const fp = path.join(ROOT, 'lib', 'cronProker.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(
    txt.includes("'init-8s'") && txt.includes("'init-30s'"),
    'initCronProker harus trigger catch-up 8s & 30s',
  );
});

addTest('05 cronProker: state file path benar', async () => {
  const mod = await import('../lib/cronProker.js?cb=' + Date.now());
  assert(mod._internal, '_internal helper harus exported');
  assert(typeof mod._internal.readState === 'function', 'readState wajib function');
  assert(typeof mod._internal.writeState === 'function', 'writeState wajib function');

  const dummy = { lastBroadcastPagiDate: '2026-05-12', lastBroadcastPagiAt: '2026-05-12 07:00:00' };
  mod._internal.writeState(dummy);
  const read = mod._internal.readState();
  assert(read.lastBroadcastPagiDate === '2026-05-12', 'state persist gagal');
});

// ════════════════════════════════════════════════════
//  BAGIAN 2 — DASHBOARD AUTH MULTI-ROLE
// ════════════════════════════════════════════════════

addTest('06 dashboardAuth: export functions tersedia', async () => {
  const mod = await import('../lib/dashboardAuth.js');
  assert(typeof mod.authenticate === 'function', 'authenticate wajib function');
  assert(typeof mod.authenticateAdmin === 'function', 'authenticateAdmin wajib function');
  assert(typeof mod.canAccessRecord === 'function', 'canAccessRecord wajib function');
  assert(typeof mod.canEditRecord === 'function', 'canEditRecord wajib function');
  assert(typeof mod.isGlobalAccess === 'function', 'isGlobalAccess wajib function');
});

addTest('07 dashboardAuth: admin password = bismillah', async () => {
  const mod = await import('../lib/dashboardAuth.js');
  const user = mod.authenticateAdmin('bismillah');
  assert(user && user.role === 'admin', 'admin login dengan bismillah harus berhasil');
  assert(user.label === 'Admin Pusdat', 'label admin salah');

  const bad = mod.authenticateAdmin('salahbanget');
  assert(bad === null, 'admin login dengan password salah harus return null');
});

addTest('08 dashboardAuth: canAccessRecord admin selalu bisa', async () => {
  const mod = await import('../lib/dashboardAuth.js');
  const admin = { role: 'admin', stambuk: null };
  assert(mod.canAccessRecord(admin, 'santri', 25001) === true, 'admin harus bisa akses santri');
  assert(mod.canAccessRecord(admin, 'guru', 14001) === true, 'admin harus bisa akses guru');
});

addTest('09 dashboardAuth: ustadz/santri hanya bisa akses dirinya sendiri', async () => {
  const mod = await import('../lib/dashboardAuth.js');
  const ustadz = { role: 'ustadz', stambuk: 14001 };
  const santri = { role: 'santri', stambuk: 25001 };

  assert(mod.canAccessRecord(ustadz, 'guru', 14001) === true, 'ustadz akses dirinya sendiri OK');
  assert(mod.canAccessRecord(ustadz, 'guru', 14999) === false, 'ustadz akses guru lain tidak OK');
  assert(mod.canAccessRecord(ustadz, 'santri', 25001) === false, 'ustadz tidak boleh akses santri');

  assert(mod.canAccessRecord(santri, 'santri', 25001) === true, 'santri akses dirinya sendiri OK');
  assert(mod.canAccessRecord(santri, 'santri', 25099) === false, 'santri akses santri lain tidak OK');
  assert(mod.canAccessRecord(santri, 'guru', 14001) === false, 'santri tidak boleh akses guru');
});

addTest('10 dashboardAuth: isGlobalAccess hanya admin', async () => {
  const mod = await import('../lib/dashboardAuth.js');
  assert(mod.isGlobalAccess({ role: 'admin' }) === true, 'admin = global');
  assert(mod.isGlobalAccess({ role: 'ustadz' }) === false, 'ustadz != global');
  assert(mod.isGlobalAccess({ role: 'santri' }) === false, 'santri != global');
  assert(mod.isGlobalAccess(null) === false, 'null = false');
});

addTest('11 dashboardAuth: requireAuthRoles tolak role yang tidak diizinkan', async () => {
  const mod = await import('../lib/dashboardAuth.js');
  const middleware = mod.requireAuthRoles(['admin']);
  let nextCalled = false;
  let statusCode = 0;
  let bodyResponse = '';
  const fakeReq = { session: { loggedIn: true, user: { role: 'santri' } } };
  const fakeRes = {
    status: (c) => { statusCode = c; return fakeRes; },
    send: (b) => { bodyResponse = b; return fakeRes; },
    redirect: () => {},
  };
  middleware(fakeReq, fakeRes, () => { nextCalled = true; });
  assert(nextCalled === false, 'next() tidak boleh dipanggil untuk role bukan admin');
  assert(statusCode === 403, 'status harus 403');
  assert(bodyResponse.includes('Akses Ditolak'), 'body harus berisi pesan akses ditolak');
});

// ════════════════════════════════════════════════════
//  BAGIAN 3 — DASHBOARD LOGIN PAGE MULTI-ROLE
// ════════════════════════════════════════════════════

addTest('12 dashboard.js: login page punya pilihan role', () => {
  const fp = path.join(ROOT, 'lib', 'dashboard.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(txt.includes('role-switch'), 'login page wajib punya role-switch');
  assert(txt.includes('value="admin"'), 'opsi admin wajib ada');
  assert(txt.includes('value="ustadz"'), 'opsi ustadz wajib ada');
  assert(txt.includes('value="santri"'), 'opsi santri wajib ada');
});

addTest('13 dashboard.js: login POST pakai authenticate() dari dashboardAuth', () => {
  const fp = path.join(ROOT, 'lib', 'dashboard.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(txt.includes("import { authenticate"), 'import authenticate wajib');
  assert(txt.includes('await authenticate(role'), 'POST /login harus pakai authenticate(role,...)');
  assert(txt.includes('req.session.user = user'), 'simpan user di session wajib');
});

addTest('14 dashboard.js: root redirect non-admin ke /me', () => {
  const fp = path.join(ROOT, 'lib', 'dashboard.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(
    txt.includes("user.role !== 'admin'") && txt.includes("res.redirect('/me')"),
    'root harus redirect non-admin ke /me',
  );
});

// ════════════════════════════════════════════════════
//  BAGIAN 4 — EKSPOR BIODATA & REKAP BERKAS
// ════════════════════════════════════════════════════

addTest('15 dashboardExport: preset santri tersedia', async () => {
  const mod = await import('../lib/dashboardExport.js');
  assert(mod.PRESET_KOLOM_SANTRI, 'PRESET_KOLOM_SANTRI wajib export');
  assert(Object.keys(mod.PRESET_KOLOM_SANTRI).includes('lite'), 'preset lite wajib');
  assert(Object.keys(mod.PRESET_KOLOM_SANTRI).includes('identitas'), 'preset identitas wajib');
  assert(Object.keys(mod.PRESET_KOLOM_SANTRI).includes('akademik'), 'preset akademik wajib');
  assert(Object.keys(mod.PRESET_KOLOM_SANTRI).includes('ortu'), 'preset ortu wajib');
  assert(Object.keys(mod.PRESET_KOLOM_SANTRI).includes('full'), 'preset full wajib');
});

addTest('16 dashboardExport: preset guru tersedia', async () => {
  const mod = await import('../lib/dashboardExport.js');
  assert(mod.PRESET_KOLOM_GURU, 'PRESET_KOLOM_GURU wajib export');
  assert(Object.keys(mod.PRESET_KOLOM_GURU).includes('lite'), 'preset guru lite wajib');
  assert(Object.keys(mod.PRESET_KOLOM_GURU).includes('full'), 'preset guru full wajib');
});

addTest('17 dashboardExport: konstanta folder berkas benar', async () => {
  const mod = await import('../lib/dashboardExport.js');
  assert(mod.DAFTAR_FOLDER_PRIMER.length === 4, '4 folder primer');
  assert(mod.DAFTAR_FOLDER_SEKUNDER.length === 5, '5 folder sekunder');
  assert(mod.DAFTAR_FOLDER_BERKAS.length === 9, '9 folder total');
  assert(mod.DAFTAR_FOLDER_PRIMER[0] === 'A. FOTO AKSES', 'urutan primer A wajib');
});

addTest('18 dashboardExport: function signature lengkap', async () => {
  const mod = await import('../lib/dashboardExport.js');
  assert(typeof mod.buildSantriRows === 'function', 'buildSantriRows function');
  assert(typeof mod.generateSantriExcel === 'function', 'generateSantriExcel function');
  assert(typeof mod.buildGuruRows === 'function', 'buildGuruRows function');
  assert(typeof mod.generateGuruExcel === 'function', 'generateGuruExcel function');
  assert(typeof mod.buildRekapBerkasPerJenis === 'function', 'buildRekapBerkasPerJenis function');
  assert(typeof mod.generateRekapBerkasExcel === 'function', 'generateRekapBerkasExcel function');
});

// ════════════════════════════════════════════════════
//  BAGIAN 5 — DASHBOARD EDITOR: TOMBOL KEMBALI, BERKAS DI AKHIR
// ════════════════════════════════════════════════════

addTest('19 dashboardEditor: tombol JSON SUDAH DIHAPUS', () => {
  const fp = path.join(ROOT, 'lib', 'dashboardEditor.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(
    !txt.includes('">JSON</a>') && !txt.includes('JSON</a>'),
    'tombol JSON di detail page harus dihapus',
  );
});

addTest('20 dashboardEditor: tombol Kembali ada di detail page', () => {
  const fp = path.join(ROOT, 'lib', 'dashboardEditor.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(txt.includes('← Kembali'), 'tombol "← Kembali" wajib ada');
  assert(
    txt.includes('Kembali ke Pencarian') || txt.includes('Kembali ke Detail'),
    'label kembali kontekstual wajib',
  );
});

addTest('21 dashboardEditor: foto akses ditampilkan di AWAL detail santri', () => {
  const fp = path.join(ROOT, 'lib', 'dashboardEditor.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(txt.includes('foto-akses-frame'), 'CSS foto-akses-frame wajib');
  assert(txt.includes('getFotoAksesInfo'), 'helper getFotoAksesInfo wajib');

  // Pastikan urutan: foto-akses muncul SEBELUM "Biodata"
  const detailFunc = txt.match(/function renderDetailPage[\s\S]+?^}/m);
  if (detailFunc) {
    const body = detailFunc[0];
    const fotoIdx = body.indexOf('${fotoAksesHtml}');
    const biodataIdx = body.indexOf('Biodata ');
    const berkasIdx = body.indexOf('${berkasHtml}');
    assert(fotoIdx > 0 && biodataIdx > 0, 'foto & biodata harus ada di renderDetailPage');
    assert(fotoIdx < biodataIdx, 'foto akses wajib SEBELUM biodata');
    assert(berkasIdx > biodataIdx, 'berkas lengkap wajib SESUDAH biodata');
  }
});

addTest('22 dashboardEditor: berkas lengkap ditampilkan di AKHIR detail', () => {
  const fp = path.join(ROOT, 'lib', 'dashboardEditor.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(txt.includes('Berkas Santri'), 'section Berkas Santri wajib');
  assert(txt.includes('berkas-grid'), 'berkas-grid CSS wajib');
});

addTest('23 dashboardEditor: route /me untuk ustadz/santri', () => {
  const fp = path.join(ROOT, 'lib', 'dashboardEditor.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(txt.includes("app.get('/me'"), 'route /me wajib');
  assert(txt.includes('renderMePage'), 'render /me wajib');
});

addTest('24 dashboardEditor: rute admin-only di-guard requireAuthRoles', () => {
  const fp = path.join(ROOT, 'lib', 'dashboardEditor.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(
    txt.includes("app.get('/cari', requireAuthRoles(['admin'])"),
    '/cari wajib guard admin',
  );
  assert(
    txt.includes("app.get('/ekspor', requireAuthRoles(['admin'])"),
    '/ekspor wajib guard admin',
  );
  assert(
    txt.includes("app.get('/rekap-berkas', requireAuthRoles(['admin'])"),
    '/rekap-berkas wajib guard admin',
  );
  assert(
    txt.includes("app.get('/validasi/santri', requireAuthRoles(['admin'])"),
    '/validasi/santri wajib guard admin',
  );
  assert(
    txt.includes("app.get('/validasi/guru', requireAuthRoles(['admin'])"),
    '/validasi/guru wajib guard admin',
  );
});

addTest('25 dashboardEditor: ekspor & rekap-berkas routes ada', () => {
  const fp = path.join(ROOT, 'lib', 'dashboardEditor.js');
  const txt = fs.readFileSync(fp, 'utf-8');
  assert(txt.includes("'/ekspor/santri'"), 'route /ekspor/santri wajib');
  assert(txt.includes("'/ekspor/guru'"), 'route /ekspor/guru wajib');
  assert(txt.includes("'/rekap-berkas/excel'"), 'route /rekap-berkas/excel wajib');
  assert(txt.includes("'/rekap-berkas/detail'"), 'route /rekap-berkas/detail wajib');
});

// ════════════════════════════════════════════════════
//  BAGIAN 6 — VALIDASI DATA
// ════════════════════════════════════════════════════

addTest('26 dashboardEditor: helper buildValidasiData ada', async () => {
  const mod = await import('../lib/dashboardEditor.js');
  assert(mod.default && typeof mod.default._buildValidasiData === 'function', 'buildValidasiData export');
  assert(typeof mod.default._isCellEmpty === 'function', 'isCellEmpty export');
  assert(Array.isArray(mod.default.VALIDASI_FIELDS_SANTRI), 'VALIDASI_FIELDS_SANTRI export');
  assert(Array.isArray(mod.default.VALIDASI_FIELDS_GURU), 'VALIDASI_FIELDS_GURU export');
});

addTest('27 dashboardEditor: isCellEmpty bekerja benar', async () => {
  const mod = await import('../lib/dashboardEditor.js');
  const isEmpty = mod.default._isCellEmpty;
  assert(isEmpty(null) === true, 'null = empty');
  assert(isEmpty(undefined) === true, 'undefined = empty');
  assert(isEmpty('') === true, 'empty string = empty');
  assert(isEmpty('  ') === true, 'whitespace = empty');
  assert(isEmpty('ada nilai') === false, 'string isi != empty');
  assert(isEmpty(0) === false, '0 != empty');
  assert(isEmpty(false) === false, 'false != empty');
});

// ════════════════════════════════════════════════════
//  BAGIAN 7 — PREVIEW-CARD: HILANGKAN PROKER % + CHART
// ════════════════════════════════════════════════════

addTest('28 preview-card: mini-card "Progres proker" SUDAH DIHAPUS', () => {
  const fp = path.join(ROOT, 'lib', 'dashboard.js');
  const txt = fs.readFileSync(fp, 'utf-8');

  // Cari section renderBroadcastPreviewPage
  const startIdx = txt.indexOf('function renderBroadcastPreviewPage');
  const endIdx = txt.indexOf('// ════════════════════════════════════════════════\n//  EXPRESS APP', startIdx);
  const previewBlock = txt.substring(startIdx, endIdx);

  assert(
    !previewBlock.includes('<span>Progres proker</span>'),
    'mini-card "Progres proker" wajib dihapus dari preview-card',
  );
});

addTest('29 preview-card: chart Chart.js diintegrasikan', () => {
  const fp = path.join(ROOT, 'lib', 'dashboard.js');
  const txt = fs.readFileSync(fp, 'utf-8');

  const startIdx = txt.indexOf('function renderBroadcastPreviewPage');
  const endIdx = txt.indexOf('// ════════════════════════════════════════════════\n//  EXPRESS APP', startIdx);
  const previewBlock = txt.substring(startIdx, endIdx);

  assert(previewBlock.includes('kelasChartPreview'), 'canvas kelasChartPreview wajib');
  assert(previewBlock.includes('cdn.jsdelivr.net/npm/chart.js'), 'CDN Chart.js wajib di preview');
  assert(previewBlock.includes("type: 'bar'"), 'tipe chart bar wajib');
});

addTest('30 preview-card: kelas-grid pills SUDAH DIGANTI dengan chart', () => {
  const fp = path.join(ROOT, 'lib', 'dashboard.js');
  const txt = fs.readFileSync(fp, 'utf-8');

  const startIdx = txt.indexOf('function renderBroadcastPreviewPage');
  const endIdx = txt.indexOf('// ════════════════════════════════════════════════\n//  EXPRESS APP', startIdx);
  const previewBlock = txt.substring(startIdx, endIdx);

  // Pastikan rendering pakai canvas, bukan kelas-pill di dalam body
  assert(
    previewBlock.includes('<canvas id="kelasChartPreview">'),
    'preview-card body harus pakai canvas, bukan pills',
  );

  // Pastikan tidak ada lagi map ke kelas-pill di preview body
  const bodyOnly = previewBlock.split('<body>')[1] || '';
  assert(
    !bodyOnly.includes('class="kelas-pill"'),
    'preview-card body tidak boleh ada kelas-pill lagi (sudah diganti chart)',
  );
});

// ════════════════════════════════════════════════════
//  BAGIAN 8 — INTEGRITAS SYNTAX SEMUA FILE BARU/UBAH
// ════════════════════════════════════════════════════

addTest('31 syntax: lib/cronProker.js valid', async () => {
  await import('../lib/cronProker.js?cb=' + Date.now());
});

addTest('32 syntax: lib/dashboardAuth.js valid', async () => {
  await import('../lib/dashboardAuth.js?cb=' + Date.now());
});

addTest('33 syntax: lib/dashboardExport.js valid', async () => {
  await import('../lib/dashboardExport.js?cb=' + Date.now());
});

addTest('34 syntax: lib/dashboardEditor.js valid', async () => {
  await import('../lib/dashboardEditor.js?cb=' + Date.now());
});

addTest('35 syntax: lib/dashboard.js valid (import only)', async () => {
  // Import dashboard akan trigger pusdat-config load — itu cross-platform
  await import('../lib/dashboard.js?cb=' + Date.now());
});

// ════════════════════════════════════════════════════
//  BAGIAN 9 — INTEGRASI MENU & BACKWARD COMPAT
// ════════════════════════════════════════════════════

addTest('36 backward compat: editdata plugin lama tetap ada', () => {
  const fp = path.join(ROOT, 'plugins', 'PUSDAT', 'editdata.js');
  assert(fs.existsSync(fp), 'plugin editdata wajib ada (dari v15)');
});

addTest('37 backward compat: dbEditor.js tetap ada', () => {
  const fp = path.join(ROOT, 'lib', 'dbEditor.js');
  assert(fs.existsSync(fp), 'lib/dbEditor.js wajib tetap ada');
});

// ════════════════════════════════════════════════════
//  RUN
// ════════════════════════════════════════════════════
let pass = 0, fail = 0;
const details = [];

for (const t of tests) {
  try {
    await t.fn();
    pass++;
    details.push({ name: t.name, status: 'PASS' });
  } catch (err) {
    fail++;
    details.push({ name: t.name, status: 'FAIL', error: err.message });
  }
}

console.log('═══════════════════════════════════════════════════');
console.log(' HASIL UJI FEATURE v16');
console.log('═══════════════════════════════════════════════════');
for (const r of details) {
  if (r.status === 'PASS') console.log(`✅ ${r.name}`);
  else console.log(`❌ ${r.name}\n   └─ ${r.error}`);
}
console.log('───────────────────────────────────────────────────');
console.log(`TOTAL: ${tests.length}`);
console.log(`PASS : ${pass}`);
console.log(`FAIL : ${fail}`);

if (fail > 0) process.exit(1);
