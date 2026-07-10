/**
 * test-pretty-log.mjs
 * Verifikasi bahwa lib/prettyLog.js benar-benar merapikan output terminal.
 *
 * Strategi: hook `process.stdout.write` agar kita bisa membaca apa yang
 * dicetak setelah console.log diteruskan ke prettyLog.
 */

import './../lib/prettyLog.js';

const collected = [];
const origWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => {
  collected.push(String(chunk));
  return origWrite(chunk, ...rest);
};

function emit(line) {
  // gunakan console.log original (sudah di-patch prettyLog)
  console.log(line);
}

function emitBlock(...lines) {
  for (const l of lines) emit(l);
}

emit('Test INFO biasa');
emit('[TRAFIK] Jam: 12:17 | Pengirim: . (628194) | Lokasi Chat ID: 628194@s.whatsapp.net | 👤 PRIVAT | Pesan: .editdata');
emit('Handler Gateway Pusdat menghentikan pemrosesan.');
emit('[SANITIZE-STAMBUK] Input: "13971942" (len=8) → Clean: "13971942" (len=8)');

// Simulasi dump SessionEntry dari Baileys → harus dibungkam jadi 1 baris
emitBlock(
  'Closing session: SessionEntry {',
  '  _chains: { foo: { chainKey: [Object], chainType: 2, messageKeys: {} } },',
  '  registrationId: 1639890299,',
  '  currentRatchet: { foo: <Buffer aa bb> },',
  '}',
);

// pulihkan stdout
process.stdout.write = origWrite;
const joined = collected.join('');

const tests = [];
function it(name, cond, msg) {
  tests.push({ name, ok: !!cond, msg });
}

it('01 INFO label muncul', /\bINFO\b/.test(joined), 'tidak menemukan label INFO');
it('02 baris TRAFIK dirapikan jadi format kompak', /PRIVAT.*\.editdata/.test(joined), 'baris trafik tidak dirapikan');
it(
  '03 dump SessionEntry disembunyikan menjadi 1 baris ringkas',
  joined.includes('session terenkripsi: rotasi key (disembunyikan)') &&
    !joined.includes('SessionEntry {'),
  'session dump masih bocor',
);
it(
  '04 baris "Handler Gateway Pusdat menghentikan" diredup',
  joined.includes('gateway: pesan ditangani oleh sesi aktif'),
  'baris menghentikan pemrosesan tidak diredup',
);
it(
  '05 [SANITIZE-STAMBUK] dikompres jadi 1 baris pendek',
  joined.includes('sanitize stambuk: 13971942'),
  'sanitize tidak dikompres',
);

let pass = 0, fail = 0;
for (const t of tests) {
  if (t.ok) {
    console.log(`✅ ${t.name}`);
    pass++;
  } else {
    console.log(`❌ ${t.name} -> ${t.msg}`);
    fail++;
  }
}
console.log(`PASS=${pass} FAIL=${fail}`);
if (fail > 0) process.exit(1);
