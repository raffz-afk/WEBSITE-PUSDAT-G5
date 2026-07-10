/**
 * ============================================================
 *  autorun-startup.js — Script Autorun saat Windows Startup
 *  ★ v19.0 — Data Center G5
 *
 *  Cara install autorun:
 *  1. Jalankan: node autorun-startup.js install
 *  2. Akan membuat shortcut di Windows Startup folder
 *     yang otomatis membuka Git Bash dan mengetik npm restart
 *     di direktori D:\PUSAT DATA 2026\99. TITIP\01. raffz\BOT\pusdat-gontor5-bot-modifikasi
 *
 *  Cara uninstall:
 *  node autorun-startup.js uninstall
 * ============================================================
 */

import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_DIR = 'D:\\PUSAT DATA 2026\\99. TITIP\\01. raffz\\BOT\\pusdat-gontor5-bot-modifikasi';
const GIT_BASH_PATH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const GIT_BASH_PATH_ALT = 'C:\\Program Files (x86)\\Git\\bin\\bash.exe';
const SHORTCUT_NAME = 'PusdatG5-AutoStart.bat';
const VBS_NAME = 'PusdatG5-AutoStart.vbs';

// Windows Startup folder
const STARTUP_DIR = path.join(
  os.homedir(),
  'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
);

const BAT_CONTENT = `@echo off
REM ============================================================
REM  PusdatG5 AutoStart — Data Center G5
REM  Otomatis menjalankan bot saat Windows startup
REM ============================================================
title PusdatG5 AutoStart
echo [PusdatG5] Memulai bot otomatis...
cd /d "D:\\PUSAT DATA 2026\\99. TITIP\\01. raffz\\BOT\\pusdat-gontor5-bot-modifikasi"
timeout /t 5 /nobreak
npm restart
echo [PusdatG5] Bot berhasil dimulai!
`;

// VBS untuk run tanpa popup cmd (silent mode)
const VBS_CONTENT = `' ============================================================
' PusdatG5 AutoStart (Silent) — Data Center G5
' Menjalankan bot tanpa popup console
' ============================================================
Dim ws
Set ws = CreateObject("WScript.Shell")
ws.Run "cmd /c cd /d """ & Chr(34) & "D:\\PUSAT DATA 2026\\99. TITIP\\01. raffz\\BOT\\pusdat-gontor5-bot-modifikasi" & Chr(34) & """ && npm restart", 0, False
`;

// Mode 2: Via Git Bash (jika lebih disukai)
const VBS_GITBASH_CONTENT = `' ============================================================
' PusdatG5 AutoStart via Git Bash (Silent) — Data Center G5
' ============================================================
Dim ws, gitBash
Set ws = CreateObject("WScript.Shell")
gitBash = "C:\\Program Files\\Git\\bin\\bash.exe"
If Not CreateObject("Scripting.FileSystemObject").FileExists(gitBash) Then
  gitBash = "C:\\Program Files (x86)\\Git\\bin\\bash.exe"
End If
ws.Run """" & gitBash & """ --login -i -c ""cd '/d/PUSAT DATA 2026/99. TITIP/01. raffz/BOT/pusdat-gontor5-bot-modifikasi' && npm restart""", 1, False
`;

const args = process.argv.slice(2);
const action = args[0] || 'help';

if (action === 'install') {
  console.log('[AutoStart] 🚀 Menginstall autorun startup...');

  // Buat file .bat
  const batPath = path.join(STARTUP_DIR, SHORTCUT_NAME);
  const vbsPath = path.join(STARTUP_DIR, VBS_NAME);

  try {
    if (!fs.existsSync(STARTUP_DIR)) {
      console.error(`[AutoStart] ❌ Startup folder tidak ditemukan: ${STARTUP_DIR}`);
      process.exit(1);
    }

    // Tulis .bat
    fs.writeFileSync(batPath, BAT_CONTENT, 'utf8');
    console.log(`[AutoStart] ✅ File .bat dibuat: ${batPath}`);

    // Tulis .vbs (silent, tidak ada popup)
    fs.writeFileSync(vbsPath, VBS_CONTENT, 'utf8');
    console.log(`[AutoStart] ✅ File .vbs (silent) dibuat: ${vbsPath}`);

    console.log('');
    console.log('[AutoStart] ✅ BERHASIL! Autorun sudah terpasang.');
    console.log('');
    console.log('📋 File yang dibuat di Startup folder:');
    console.log(`   📄 ${batPath}  (dengan popup console)`);
    console.log(`   📄 ${vbsPath}  (silent, tanpa popup)`);
    console.log('');
    console.log('💡 Tips:');
    console.log('   - File .vbs akan berjalan diam-diam tanpa popup saat startup');
    console.log('   - Jika ingin melihat log, gunakan file .bat');
    console.log('   - Untuk menghapus autorun: node autorun-startup.js uninstall');

  } catch (err) {
    console.error('[AutoStart] ❌ Gagal install:', err.message);
    console.error('');
    console.error('📋 Manual install:');
    console.error(`   1. Buka: %APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup`);
    console.error(`   2. Buat file baru: ${SHORTCUT_NAME}`);
    console.error(`   3. Isi dengan:`);
    console.error(BAT_CONTENT);
  }

} else if (action === 'uninstall') {
  console.log('[AutoStart] 🗑️ Menghapus autorun startup...');

  const batPath = path.join(STARTUP_DIR, SHORTCUT_NAME);
  const vbsPath = path.join(STARTUP_DIR, VBS_NAME);
  let removed = 0;

  [batPath, vbsPath].forEach(fp => {
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      console.log(`[AutoStart] ✅ Dihapus: ${fp}`);
      removed++;
    }
  });

  if (removed === 0) {
    console.log('[AutoStart] ℹ️ Tidak ada file autorun yang ditemukan.');
  } else {
    console.log(`[AutoStart] ✅ Berhasil menghapus ${removed} file autorun.`);
  }

} else if (action === 'status') {
  const batPath = path.join(STARTUP_DIR, SHORTCUT_NAME);
  const vbsPath = path.join(STARTUP_DIR, VBS_NAME);

  console.log('[AutoStart] 📋 Status autorun:');
  console.log(`   Startup folder: ${STARTUP_DIR}`);
  console.log(`   .bat file: ${fs.existsSync(batPath) ? '✅ Ada' : '❌ Tidak ada'}`);
  console.log(`   .vbs file: ${fs.existsSync(vbsPath) ? '✅ Ada' : '❌ Tidak ada'}`);

  const gitBashExists = fs.existsSync(GIT_BASH_PATH) || fs.existsSync(GIT_BASH_PATH_ALT);
  console.log(`   Git Bash: ${gitBashExists ? '✅ Terinstall' : '⚠️ Tidak ditemukan'}`);

} else {
  console.log(`
╔══════════════════════════════════════════════╗
║   PusdatG5 AutoStart Installer — v19.0      ║
║   Data Center G5                             ║
╚══════════════════════════════════════════════╝

Penggunaan:
  node autorun-startup.js install    → Install autorun
  node autorun-startup.js uninstall  → Hapus autorun
  node autorun-startup.js status     → Cek status

Yang akan dilakukan saat Windows startup:
  → Otomatis menjalankan: npm restart
  → Di folder: ${BOT_DIR}
`);
}
