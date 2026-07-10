/**
 * ============================================================
 *  lib/dbAccessExtra.js — STUB v13.3 (HOTFIX)
 * ============================================================
 *
 *  ⚠️  FILE INI DI-DEPRECATED PADA v13.3.
 *
 *  ROOT CAUSE BUG #2 (final):
 *  Versi sebelumnya membuka koneksi ADODB BARU sendiri via
 *  `ADODB.open(connStr, IS_64_BIT)` di file ini. Akibatnya
 *  Node mem-spawn proses cscript.exe TERPISAH dari koneksi
 *  `dbGuru`/`dbSantri` di dbAccess.js, lalu Windows memblokir
 *  akses paralel ke .accdb yang sama (Concurrency / file lock
 *  ACE OLEDB) sehingga muncul:
 *      [CARI-GURU] ❌ Error ADODB (try-1):
 *      Spawn C:\Windows\System32\cscript.exe error
 *
 *  PERBAIKAN:
 *  Semua fungsi pencarian (cariGuru, cariSantriByKolomLike,
 *  dst.) DIPINDAH ke dbAccess.js dan reuse koneksi GLOBAL
 *  yang sudah dibuka di initDB(). File ini sekarang hanya
 *  meneruskan (re-export) dari dbAccess.js untuk backward
 *  compatibility — TIDAK lagi membuka koneksi sendiri,
 *  TIDAK lagi spawn cscript.exe ekstra.
 *
 *  Plugin baru sebaiknya import langsung dari './dbAccess.js'.
 *
 * ============================================================
 */

// Pure passthrough — tidak ada koneksi/state lokal di sini lagi.
export * from './dbAccess.js';
export { default } from './dbAccess.js';
