# 🛠️ HOTFIX v13.2 — Perbaikan ADODB & AuditBerkas ALL

Perbaikan untuk dua bug yang muncul pada log:

```
[CARI-GURU] ❌ Error ADODB (try-1): Spawn C:\Windows\SysWOW64\cscript.exe error
[CARI-Daerah] ❌ Error ADODB (try-1): Spawn C:\Windows\SysWOW64\cscript.exe error
[CARI-Konsulat] ❌ Error ADODB (try-1): Spawn C:\Windows\SysWOW64\cscript.exe error
...
[GATEWAY-AUDIT-ALL] Gagal generate Excel:
  ENOENT: no such file or directory,
  mkdir 'D:\D:\PUSAT%20DATA%202026\99.%20TITIP\01.%20raffz\BOT\pusdat-gontor5-bot-modifikasi\tmp'
```

## 📋 File yang ditimpa

| File asal | Lokasi di project | Status |
|-----------|-------------------|--------|
| `gateway.js`        | `handle/gateway.js`     | TIMPA |
| `dbAccessExtra.js`  | `lib/dbAccessExtra.js`  | TIMPA |

> Cukup 2 file di atas — tidak perlu mengubah file lain, tidak perlu `npm install` ulang.

---

## 🐛 Bug #1 — `D:\D:\PUSAT%20DATA%202026\…\tmp` (mkdir error)

**Akar masalah**:
Ketika `process.cwd()` gagal (mis. ter-shadow oleh modul lain),
`safeCwd()` di `gateway.js` jatuh ke fallback `new URL(import.meta.url).pathname`.
Di Windows, hasilnya berupa string rusak:

```
/D:/PUSAT%20DATA%202026/99.%20TITIP/01.%20raffz/BOT/...
```

`%20` tidak di-decode jadi spasi, dan karena ada *leading slash*,
`path.resolve` menempelkan drive letter dua kali → `D:\D:\…`.

**Perbaikan**:
1. Pakai `fileURLToPath()` dari module `url` (bawaan Node) untuk
   konversi URL → path Windows yang BENAR.
2. Tambah validator `_isPathSane()` yang menolak path yang
   mengandung `%20`, `D:\D:\`, atau pola URL-style `/D:/`.
3. Tambah helper baru `safeTmpDir()` yang melakukan tes
   write-access dan jatuh ke `os.tmpdir()` kalau cwd bermasalah.
4. Lokasi `path.join(safeCwd(), 'tmp')` diganti `safeTmpDir()`
   pada bagian *Mode ALL* AuditBerkas.

---

## 🐛 Bug #2 — `Spawn C:\Windows\SysWOW64\cscript.exe error`

**Akar masalah** (DUA penyebab):

1. **Path database SALAH** di `lib/dbAccessExtra.js`. Versi lama membangun
   connection string dari:
   ```js
   path.resolve(process.cwd(), 'database', cfg.DB_FILENAME)
   ```
   Padahal database ada di drive eksternal:
   ```
   D:\PUSAT DATA 2026\02. MASTER DATA GURU\00. DB\DB Guru 2026-2027.accdb
   D:\PUSAT DATA 2026\01. MASTER DATA SANTRI\00. DB\DB Santri 2026-2027.accdb
   ```
   Karena file tidak ada di tempat yang dicari, ADODB gagal connect →
   error spawn cscript. Itulah sebabnya `CARI-SANTRI` sukses (lewat
   `dbAccess.js` asli yang pakai absolute path), tapi `CARI-GURU`,
   `CARI-Daerah`, `CARI-Konsulat` semuanya gagal (lewat `dbAccessExtra.js`).

2. **Bitness ADODB tidak eksplisit**. `ADODB.open(connStr)` dipanggil
   tanpa argumen kedua, sehingga driver kadang nyangkut di
   `SysWOW64\cscript.exe` (32-bit) padahal Node-nya 64-bit.

**Perbaikan**:
1. Pakai **absolute path yang sama persis** dengan `dbAccess.js`:
   `D:\PUSAT DATA 2026\…\DB Guru 2026-2027.accdb` & `…\DB Santri…`.
2. Validasi `fs.existsSync(dbPath)` sebelum `ADODB.open` — kalau
   file tidak ada, log pesan jelas sebelum cscript dipanggil.
3. Pakai `ADODB.open(connStr, IS_64_BIT)` — bitness eksplisit
   sesuai `process.arch`. Driver memilih `System32\cscript.exe`
   (64-bit) atau `SysWOW64\cscript.exe` (32-bit) dengan benar.
4. Tetap pertahankan singleton + mutex + retry 1× dari versi sebelumnya.
5. Tambah pola retry untuk error code OLE-DB `0x80004005`.

---

## ✅ Hasil yang diharapkan setelah patch

```
[CARI-SANTRI] ✅ Ditemukan N santri.
[CARI-GURU]   ✅ Ditemukan N guru.
[CARI-DAERAH] ✅ Ditemukan N santri di daerah ...
[CARI-KONSULAT] ✅ Ditemukan N santri di konsulat ...

[GATEWAY-AUDIT-ALL] 📁 Excel akan ditulis ke:
    D:\PUSAT DATA 2026\...\tmp\AuditBerkas-ALL-1234567890.xlsx
```

Tidak ada lagi:
- `D:\D:\…` ganda
- `%20` di path
- `Spawn cscript.exe error` (jika DB & driver Access terpasang dengan benar)

---

## 🔧 Catatan tambahan

Jika setelah patch ini masih muncul `cscript.exe error`, kemungkinan:

1. **Microsoft Access Database Engine** (driver ACE OLEDB) belum
   terpasang atau bitness-nya tidak cocok. Pasang versi 64-bit dari:
   <https://www.microsoft.com/download/details.aspx?id=54920>

2. **node-adodb** belum ter-install:
   ```bash
   npm install node-adodb@^5.0.3
   ```

3. **Antivirus / Defender** mem-blokir cscript.exe — coba whitelist
   folder bot.

4. **Drive D: tidak ter-mount**. Pastikan `D:\PUSAT DATA 2026\…`
   benar-benar ada saat bot start.
