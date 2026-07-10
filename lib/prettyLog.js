/**
 * ============================================================
 *  lib/prettyLog.js — Logger Pretty untuk Git Bash / Terminal
 * ============================================================
 *
 *  Tujuan:
 *  - Membuat output terminal lebih rapi & enak dibaca
 *  - Memformat ulang level: INFO / OK / WARN / ERR
 *  - Menyembunyikan dump `SessionEntry {…}` & `Closing session:`
 *    yang dilempar Baileys (noise besar di Git Bash)
 *  - Memformat ulang baris [TRAFIK] menjadi 1 baris ringkas
 *  - Memformat ulang blok GATEWAY-EDITDATA DEBUG jadi 1 baris
 *
 *  Cara pakai:
 *      import './lib/prettyLog.js';   ← cukup di-import di index.js
 *
 *  Setelah di-import, semua `console.log/info/warn/error` akan
 *  dilewatkan ke filter ini.
 *
 * ============================================================
 */

import chalk from 'chalk';
import util from 'util';

const C = {
  time: chalk.gray,
  info: chalk.cyan.bold,
  ok: chalk.green.bold,
  warn: chalk.yellow.bold,
  err: chalk.red.bold,
  tag: chalk.magenta.bold,
  dim: chalk.gray,
  hl: chalk.white.bold,
};

const _origLog = console.log;
const _origInfo = console.info;
const _origWarn = console.warn;
const _origErr = console.error;

let _suppressBlockUntil = null; // jika non-null, suppress sampai ketemu pola ini
let _suppressBraceDepth = 0;

function nowTime() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function classify(line) {
  if (/^❌|\b(ERROR|FAIL|GAGAL|gagal)\b/.test(line)) return 'err';
  if (/^⚠️|\bWARN(ING)?\b|\bperhatian\b/i.test(line)) return 'warn';
  if (/^\[✔]|^✅|\b(berhasil|sukses|OK)\b/i.test(line)) return 'ok';
  return 'info';
}

function levelLabel(kind) {
  switch (kind) {
    case 'err':
      return C.err('ERR ');
    case 'warn':
      return C.warn('WARN');
    case 'ok':
      return C.ok('OK  ');
    default:
      return C.info('INFO');
  }
}

function reformatLine(rawLine) {
  let line = String(rawLine);

  // [TRAFIK] → satu baris kompak berwarna
  // contoh: [TRAFIK] Jam: 12:17 | Pengirim: . (628...) | Lokasi Chat ID: 628..@..  | 👤 PRIVAT | Pesan: .editdata
  const trafikMatch = line.match(/^\[TRAFIK\]\s*Jam:\s*(\S+)\s*\|\s*Pengirim:\s*(.+?)\s*\|\s*Lokasi Chat ID:\s*(\S+)\s*\|\s*(👤 PRIVAT|👥 GRUP)\s*\|\s*Pesan:\s*(.*)$/);
  if (trafikMatch) {
    const [, jam, pengirim, jid, tipe, pesan] = trafikMatch;
    const tag = tipe.includes('PRIVAT') ? chalk.blueBright('PRIVAT') : chalk.magentaBright('GRUP  ');
    return `${C.time(jam)}  ${tag}  ${chalk.white(pengirim)}  ${C.dim('»')}  ${C.hl(pesan)}`;
  }

  // Baris debug "Handler Gateway Pusdat menghentikan pemrosesan" dibikin samar
  if (/Handler Gateway Pusdat menghentikan pemrosesan/.test(line)) {
    return C.dim(`     gateway: pesan ditangani oleh sesi aktif`);
  }

  // Blok header [🟣 GATEWAY-EDITDATA DEBUG] dst → ringkas jadi 1 baris
  // Format aslinya 6 baris bertubi-tubi, kita gabungkan saat memproses
  if (/^\[(🟣|🟢|🟡|🔵|🔴) GATEWAY-[A-Z]+ DEBUG\]/.test(line)) {
    // Tandai modus suppress 4 baris berikutnya, ditangkap lewat _suppressBraceDepth=4
    _suppressBraceDepth = 4;
    return null; // skip baris ini, biarkan ringkasan dicetak oleh patch lain
  }
  if (_suppressBraceDepth > 0) {
    _suppressBraceDepth--;
    // baris dalam blok debug box (│ ...) atau pemisah └────
    if (/^\│|^\[──/.test(line.trim())) return null;
  }

  // Sanitize stambuk noise → kompres
  const sanitizeMatch = line.match(/^\[SANITIZE-STAMBUK\] Input: "([^"]+)" \(len=\d+\) → Clean: "([^"]+)"/);
  if (sanitizeMatch) {
    return C.dim(`     sanitize stambuk: ${sanitizeMatch[2]}`);
  }

  // Beberapa tag custom dengan icon → warnai
  if (/^\[✔]/.test(line)) return chalk.green(line);
  if (/^\[ℹ]|^\[INFO\]/.test(line)) return chalk.cyan(line);
  if (/^\[!]/.test(line)) return chalk.yellow(line);
  if (/^\[✖]|^\[ERROR\]/.test(line)) return chalk.red(line);

  // [XX:YY] System : ...
  const sysMatch = line.match(/^\[(\d{2}:\d{2})\]\s*System\s*:\s*(.*)$/);
  if (sysMatch) {
    return `${C.time(sysMatch[1])}  ${C.info('SYS ')}  ${sysMatch[2]}`;
  }
  // [XX:YY] CHAT : ...
  const chatMatch = line.match(/^\[(\d{2}:\d{2})\]\s*CHAT\s*:\s*(.*)$/);
  if (chatMatch) {
    return `${C.time(chatMatch[1])}  ${chalk.cyan('CHAT')}  ${chatMatch[2]}`;
  }
  // [YYYY-... WIB] Plugins - ... dijalankan ...
  const plugMatch = line.match(/^\[(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})\s*WIB\s*\]\s*Plugins\s*-\s*(.+?)\s+dijalankan oleh\s+(\S+)/);
  if (plugMatch) {
    const [, , jam, plug, who] = plugMatch;
    return `${C.time(jam)}  ${chalk.green('PLUG')}  ${C.hl(plug)}  ${C.dim('by')}  ${who}`;
  }

  return line;
}

function isSessionDumpLine(line) {
  // Pola yang sering muncul akibat Baileys mencetak `Closing session: <SessionEntry...>`
  if (/^Closing session:\s*SessionEntry\s*\{/.test(line)) return true;
  if (/^Closing session:\s*Session\s*\{/.test(line)) return true;
  return false;
}

function shouldSuppressInBlock(line) {
  if (!_suppressBlockUntil) return false;
  // Suppress sampai ketemu '}' di kolom 0 (penutup objek)
  if (line === '}' || line.startsWith('}')) {
    _suppressBlockUntil = null;
    return true;
  }
  return true;
}

function processLines(rawText, defaultKind = 'info') {
  const lines = String(rawText).split('\n');
  const out = [];

  for (const raw of lines) {
    if (_suppressBlockUntil) {
      if (shouldSuppressInBlock(raw)) continue;
    }
    if (isSessionDumpLine(raw)) {
      // mulai blok suppress sampai ketemu '}'
      _suppressBlockUntil = 'session_dump';
      // tetap cetak ringkasan singkat
      out.push(`${C.time(nowTime())}  ${C.dim('NET ')}  ${C.dim('session terenkripsi: rotasi key (disembunyikan)')}`);
      continue;
    }

    const cleaned = reformatLine(raw);
    if (cleaned == null) continue; // baris dibuang
    if (cleaned === '') {
      out.push('');
      continue;
    }
    // tambahkan kategori warna dasar bila baris belum berwarna apa-apa
    if (cleaned === raw && !/\u001b\[/.test(cleaned)) {
      const kind = classify(cleaned);
      out.push(`${C.time(nowTime())}  ${levelLabel(kind)}  ${cleaned}`);
    } else {
      out.push(cleaned);
    }
  }
  return out.join('\n');
}

function patchedWrite(origFn, defaultKind, args) {
  // util.format meniru perilaku console.log asli (%s, %d, dll)
  const text = util.format(...args);
  const processed = processLines(text, defaultKind);
  // Jika seluruh teks dibuang, jangan cetak baris kosong
  if (processed === '' || processed === '\n') return;
  origFn.call(console, processed);
}

console.log = (...args) => patchedWrite(_origLog, 'info', args);
console.info = (...args) => patchedWrite(_origInfo, 'info', args);
console.warn = (...args) => patchedWrite(_origWarn, 'warn', args);
console.error = (...args) => patchedWrite(_origErr, 'err', args);

// Helper bertema untuk pemakaian eksplisit di modul Pusdat
export function plog(tag, message, level = 'info') {
  const fn =
    level === 'err'
      ? _origErr
      : level === 'warn'
        ? _origWarn
        : _origLog;
  const label = levelLabel(level === 'ok' ? 'ok' : level);
  fn.call(console, `${C.time(nowTime())}  ${label}  ${C.tag(`[${tag}]`)} ${message}`);
}

export function pdivider(title = '') {
  _origLog.call(
    console,
    chalk.gray('─'.repeat(70)) +
      (title ? ` ${chalk.white.bold(title)} ` + chalk.gray('─'.repeat(8)) : ''),
  );
}

export default { plog, pdivider };
