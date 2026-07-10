/**
 * run-all.mjs — Test orchestrator.
 * Menjalankan semua suite test dan menggabungkan hasilnya.
 */
import { spawnSync } from 'child_process';
import path from 'path';

const tests = [
  'tests/test-editdata.mjs',       // 16 skenario
  'tests/test-dashboard-web.mjs',  // 18 skenario
  'tests/test-pretty-log.mjs',     // 5 skenario
  'tests/test-feature-v17.mjs',    // 10 skenario × 10 putaran = 100 run
];

let totalPass = 0;
let totalFail = 0;
const summary = [];

for (const file of tests) {
  console.log(`\n━━━━━━━━━ RUN ${file} ━━━━━━━━━`);
  const res = spawnSync('node', [file], { encoding: 'utf-8', stdio: 'pipe' });
  process.stdout.write(res.stdout || '');
  if (res.stderr) process.stderr.write(res.stderr);
  const out = (res.stdout || '') + (res.stderr || '');
  const passCount = (out.match(/✅ /g) || []).length;
  const failCount = (out.match(/❌ /g) || []).length;
  totalPass += passCount;
  totalFail += failCount;
  summary.push({ file, pass: passCount, fail: failCount, code: res.status });
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RINGKASAN UJI');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
for (const s of summary) {
  console.log(
    `  ${s.fail === 0 ? '✅' : '❌'}  ${path.basename(s.file).padEnd(28)} pass=${s.pass}  fail=${s.fail}  exit=${s.code}`,
  );
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`TOTAL  PASS = ${totalPass}`);
console.log(`TOTAL  FAIL = ${totalFail}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

process.exit(totalFail > 0 ? 1 : 0);
