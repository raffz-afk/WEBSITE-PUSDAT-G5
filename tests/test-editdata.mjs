/**
 * test-editdata.mjs
 * Suite uji logika inti edit data (dbEditor.js).
 *
 * Total 16 skenario. Tidak menyentuh MS Access (cross-platform safe).
 */

import {
  parseDbTypeInput,
  parseQuickEditInput,
  resolveEditableField,
  inferAndNormalizeNewValue,
  simulateRecordUpdate,
  getFieldSuggestions,
  formatEditValue,
} from '../lib/dbEditor.js';

const guruRecord = {
  Stambuk: 14001,
  'Nama Lengkap': 'Ahmad Fauzi',
  Status: 'Aktif',
  'Tanggal Lahir': new Date(2003, 7, 15, 12, 0, 0),
  'No HP': '08123456789',
  Bagian: 'Pusdat',
  Aktif: true,
};

const santriRecord = {
  Stambuk: 25001,
  'Nama Lengkap': 'Budi Santoso',
  Kelas: '5C',
  Rayon: 'Al-Azhar',
  'Kamar Rayon': 'A12',
  Status: 'Aktif',
  'Tanggal Lahir': new Date(2008, 0, 2, 12, 0, 0),
  'No BPJS': null,
  'Tinggi Badan': 168,
  Aktif: true,
};

const tests = [];
function addTest(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

addTest('01 parseDbTypeInput angka 1 -> santri', () => {
  assert(parseDbTypeInput('1') === 'santri');
});
addTest('02 parseDbTypeInput kata guru -> guru', () => {
  assert(parseDbTypeInput('Guru') === 'guru');
});
addTest('03 parseQuickEditInput valid', () => {
  const r = parseQuickEditInput('25001 | Nama Lengkap | Budi Baru');
  assert(r.ok && r.stambuk === '25001' && r.fieldInput === 'Nama Lengkap' && r.newValueRaw === 'Budi Baru');
});
addTest('04 parseQuickEditInput invalid kurang segmen', () => {
  assert(parseQuickEditInput('25001 | Nama Lengkap').ok === false);
});
addTest('05 resolveEditableField exact', () => {
  assert(resolveEditableField(santriRecord, 'Kelas') === 'Kelas');
});
addTest('06 resolveEditableField normalize nama lengkap', () => {
  assert(resolveEditableField(santriRecord, 'namalengkap') === 'Nama Lengkap');
});
addTest('07 resolveEditableField by index', () => {
  assert(resolveEditableField(santriRecord, '3') === 'Kelas');
});
addTest('08 inferAndNormalizeNewValue string biasa', () => {
  const r = inferAndNormalizeNewValue('Magelang', santriRecord.Rayon);
  assert(r.type === 'string' && r.value === 'Magelang');
});
addTest('09 inferAndNormalizeNewValue angka', () => {
  const r = inferAndNormalizeNewValue('170', santriRecord['Tinggi Badan']);
  assert(r.type === 'number' && r.value === 170);
});
addTest('10 inferAndNormalizeNewValue tanggal', () => {
  const r = inferAndNormalizeNewValue('15-08-2003', guruRecord['Tanggal Lahir']);
  assert(r.type === 'date' && r.display === '15-08-2003');
});
addTest('11 inferAndNormalizeNewValue boolean', () => {
  const r = inferAndNormalizeNewValue('tidak', guruRecord.Aktif);
  assert(r.type === 'boolean' && r.value === false);
});
addTest('12 simulateRecordUpdate ubah Nama Lengkap', () => {
  const r = simulateRecordUpdate(santriRecord, 'Nama Lengkap', 'Budi Baru');
  assert(r.resolvedField === 'Nama Lengkap' && r.nextRecord['Nama Lengkap'] === 'Budi Baru');
});
addTest('13 simulateRecordUpdate kosongkan No BPJS', () => {
  const r = simulateRecordUpdate(santriRecord, 'No BPJS', '[KOSONGKAN]');
  assert(r.nextRecord['No BPJS'] === null);
});
addTest('14 simulateRecordUpdate angka via field normalize', () => {
  const r = simulateRecordUpdate(santriRecord, 'tinggibadan', '171');
  assert(r.nextRecord['Tinggi Badan'] === 171);
});
addTest('15 getFieldSuggestions memberi saran', () => {
  const s = getFieldSuggestions(santriRecord, 'nam');
  assert(Array.isArray(s) && s.length > 0);
});
addTest('16 formatEditValue null -> (kosong)', () => {
  assert(formatEditValue(null) === '(kosong)');
});

let pass = 0, fail = 0;
const details = [];
for (const t of tests) {
  try { await t.fn(); pass++; details.push({ test: t.name, ok: true }); }
  catch (err) { fail++; details.push({ test: t.name, ok: false, err: err.message }); }
}
console.log('=== HASIL UJI EDITDATA LOGIC ===');
for (const r of details) {
  if (r.ok) console.log(`✅ ${r.test}`);
  else console.log(`❌ ${r.test} -> ${r.err}`);
}
console.log('---');
console.log(`TOTAL: ${tests.length}  PASS: ${pass}  FAIL: ${fail}`);
if (fail > 0) process.exit(1);
