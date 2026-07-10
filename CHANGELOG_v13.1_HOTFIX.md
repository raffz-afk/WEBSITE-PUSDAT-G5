# 🛠️ Patch v13.1 — HOTFIX 3 BUG KRITIS

**Tanggal**: 2026-04-25
**Status**: ✅ Tested syntax, helper unit-tested

---

## 🐞 Bug yang Diperbaiki

### Bug #1 — `process.cwd is not a function`
**Lokasi error**: `[GATEWAY-AUDIT-ALL] Gagal generate Excel: process.cwd is not a function`
**File**: `handle/gateway.js`
**Akar masalah**: Pemakaian `await import('path')` & `await import('fs')` di handler Excel-export menyebabkan ESM module-namespace yang tidak konsisten antar versi Node, dan dalam beberapa kondisi (worker_threads / monkey-patching) `process.cwd` ter-shadow.

**Solusi v13.1**:
1. Hapus `dynamic import('path')`/`dynamic import('fs')` di blok Excel — gunakan modul top-level (`path`, `fs`) yang sudah di-import.
2. Tambah **helper `safeCwd()`** dengan 3 lapis fallback (`process.cwd()` → `process.env.PWD` / `INIT_CWD` → derive dari `import.meta.url`).
3. `tmpDir = path.join(safeCwd(), 'tmp')` → tahan banting walau `process.cwd` rusak.

---

### Bug #2 — `Spawn cscript.exe error` (Konkurensi ADODB)
**Lokasi error**: `[CARI-GURU] ❌ Error ADODB: Spawn C:\Windows\SysWOW64\cscript.exe error` (beruntun untuk Guru/Konsulat/Daerah)
**File**: `plugins/PUSDAT/cari.js`, `lib/dbAccessExtra.js`, `lib/dashboard.js`
**Akar masalah**: `Promise.allSettled` menjalankan 4 query ADODB **paralel**. `node-adodb` memakai Windows Script Host (`cscript.exe`) yang tidak aman untuk multi-spawn berdekatan.

**Solusi v13.1**:
1. **`cari.js`**: Promise.allSettled → **`for` sekuensial** (`safeQuery` per tabel) + jeda 50ms antar query untuk meredam antrean COM.
2. **`dbAccessExtra.js`**:
   - **Singleton koneksi ADODB** per database (`_adodbConn.guru` / `_adodbConn.santri`) — tidak open koneksi baru tiap call.
   - **Mutex/queue internal** (`withAdodbLock`) — meskipun caller iseng paralel, query di-serialize di tingkat library.
   - **Auto-retry 1×** dengan jeda 300ms saat error spawn cscript.
3. **`dashboard.js`**: `Promise.all` di endpoint `/` & `/api/stats` → ADODB-call (`getSantriStats`, `getBerkasStats`) **sekuensial**, hanya sisanya yang non-DB tetap paralel.

---

### Bug #3 — `TypeError: (list || []).filter is not a function`
**Lokasi error**: Crash saat ADODB error → hasil bukan Array (Object error / String / undefined).
**Akar masalah**: Saat query gagal, beberapa code-path return non-Array sehingga `.filter()/.map()/.reduce()` crash.

**Solusi v13.1** — *Defense in depth* di **3 lapis**:
1. **Lapis 1 — Library** (`dbAccessExtra.js`):
   - Helper `asArray(v)` deteksi `Array | {recordset} | {rows} | {data}` → Array.
   - `cariGuru()` & `cariSantriByKolomLike()` **DIJAMIN selalu return Array** lewat outer `try/catch` + safety net.
2. **Lapis 2 — Plugin pemanggil** (`cari.js`):
   - Helper lokal `toSafeArray()` + `safeQuery()` (timeout + error-resilient).
   - `filterProker()` selalu pakai `toSafeArray(list).filter(...)`.
3. **Lapis 3 — Plugin lain yang punya pola serupa**:
   - `absen.js`, `carisantri.js`, `lacak.js`, `listsantri.js`, `statsantri.js`, `ekspor.js`, `dashboard.js` — semua diberi guard `Array.isArray(x)` sebelum `.filter/.map/.reduce/.forEach`.

---

## 📂 File yang Diubah

| File | Lines | Perubahan |
|---|---|---|
| `handle/gateway.js` | 1727 | + helper `safeCwd()`, fix Excel export |
| `plugins/PUSDAT/cari.js` | 417 | Rewrite total: sekuensial + safeQuery + toSafeArray |
| `plugins/PUSDAT/absen.js` | 164 | Guard `Array.isArray` |
| `plugins/PUSDAT/carisantri.js` | 120 | Guard `Array.isArray` |
| `plugins/PUSDAT/lacak.js` | 126 | Guard `Array.isArray` |
| `plugins/PUSDAT/listsantri.js` | 196 | Guard `Array.isArray` (tier-1 & tier-2) |
| `plugins/PUSDAT/statsantri.js` | 259 | Guard `Array.isArray` di Mode A |
| `plugins/PUSDAT/ekspor.js` | 207 | Guard `Array.isArray` sebelum `.map` |
| `lib/dbAccessExtra.js` | 321 | Singleton ADODB + mutex + retry + asArray |
| `lib/dashboard.js` | 524 | Promise.all → sekuensial untuk ADODB call |

---

## ✅ Hasil Verifikasi

- **Syntax check**: 10 file → semua `node --check` PASS.
- **Unit test `toSafeArray`** (8 input edge-case): SEMUA OK
  (Array / null / undefined / Error obj / String / plain Object / `{recordset}` / `{rows}`).
- **Filter aman** untuk hasil DB error: tidak crash → return Array kosong.
- **Sekuensial ADODB**: query Santri → 50ms → Guru → 50ms → Daerah → 50ms → Konsulat.
- **Mutex internal** memproteksi walau ada caller lain (dashboard / fitur lain) yang ikut hit ADODB bersamaan.

---

## 🚀 Cara Pasang

1. Backup folder bot lama (jaga-jaga).
2. Replace 10 file di tabel di atas dengan versi baru dari ZIP `pusdat-gontor5-bot-v13.1-hotfix.zip`.
3. Restart bot: `pm2 restart all` atau `node index.js`.
4. Test:
   - `.auditberkas all` + password → harus generate Excel tanpa error `process.cwd`.
   - `.cari ahmad` → harus jalan sekuensial, tidak ada error spawn cscript, tidak ada TypeError filter.

---

🏫 _Pusat Data PMDG Kampus 5 Magelang_
