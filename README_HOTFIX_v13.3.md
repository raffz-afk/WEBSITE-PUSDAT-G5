# 🔧 HOTFIX v13.3 — Perbaikan FINAL `.cari` (Spawn cscript.exe error)

## 🎯 Masalah yang Diperbaiki

```
[CARI-GURU] ❌ Error ADODB (try-1): Spawn C:\Windows\System32\cscript.exe error
```

`.carisantri` jalan, `.cari` gagal di blok GURU/DAERAH/KONSULAT.

## 🔬 Root Cause (ANALISIS)

Bot punya **dua koneksi ADODB GLOBAL** yang dibuka sekali saat startup:
- `dbGuru`   → `D:\PUSAT DATA 2026\02. MASTER DATA GURU\00. DB\DB Guru 2026-2027.accdb`
- `dbSantri` → `D:\PUSAT DATA 2026\01. MASTER DATA SANTRI\00. DB\DB Santri 2026-2027.accdb`

Keduanya didefinisikan di `lib/dbAccess.js` dan dipakai oleh `cariSantri()` (yang **berhasil**).

Sebaliknya, `lib/dbAccessExtra.js` (versi v13.1/v13.2) **MEMBUKA KONEKSI ADODB BARU SENDIRI** lewat `ADODB.open(connStr, IS_64_BIT)`. Akibatnya Node mem-spawn proses `cscript.exe` **terpisah** dari koneksi global. Microsoft ACE OLEDB Provider mengunci file `.accdb` yang sedang dipakai → spawn baru ini ditolak Windows ⇒ error `Spawn cscript.exe error`.

**Kesimpulan: bug 100% di KODE, bukan di file MS Access.** File `DB Guru 2026-2027.accdb` tidak perlu disentuh.

## ✅ Perbaikan v13.3

| File | Perubahan |
|------|-----------|
| `lib/dbAccess.js` | **DITAMBAH** dua fungsi baru: `cariGuru()` & `cariSantriByKolomLike()` yang reuse koneksi GLOBAL `dbGuru` / `dbSantri` (pola SAMA dengan `cariSantri` yang sudah terbukti). Diekspor di `export {}` & `export default`. |
| `plugins/PUSDAT/cari.js` | Import diubah dari `dbAccessExtra.js` → `dbAccess.js`. Logika sekuensial & validasi `Array.isArray` tetap dipertahankan. |
| `lib/dbAccessExtra.js` | Diubah jadi **stub passthrough** (`export * from './dbAccess.js'`). Tidak lagi membuka koneksi ADODB sendiri, tidak spawn cscript. Aman untuk backward-compat. |

### Detail Teknis

1. **Tabel Guru** = `T Master Guru` (bukan `Tabel Master Guru`).
2. Kolom `[Jabatan]` **TIDAK ADA** di `T Master Guru`. Versi sebelumnya `SELECT [Jabatan]` akan ikut error walau spawn-nya sukses. v13.3 memakai `[Guru Tahun ke]` lalu di-map jadi field `Jabatan` agar tampilan `cari.js` tetap kompatibel.
3. Pencarian Guru tidak memfilter `Status='Aktif'` (cari.js akan menampilkan semua, mengikuti perilaku awal). Bila ingin hanya guru aktif, tambah `AND [Status] = 'Aktif'` di SQL.
4. Pencarian by-kolom Santri tetap memfilter `[Status] = 'Aktif'`.
5. Whitelist regex kolom `[^A-Za-z0-9 _]` dipertahankan (anti SQL-injection nama kolom).

### Apa yang TIDAK Berubah

- File MS Access (`.accdb`) → **tidak diutak-atik sama sekali**.
- Logika sekuensial `for...await` di `cari.js` (anti-Promise.all) → tetap.
- Validasi `Array.isArray` & helper `toSafeArray()` → tetap.
- Plugin lain (`carisantri`, `auditberkas`, dll) → tidak terpengaruh.

## 📦 Cara Pasang (TIMPA)

Salin 3 file ini ke struktur project bot Anda, **TIMPA** file yang lama:

```
lib/dbAccess.js                ← TIMPA
lib/dbAccessExtra.js           ← TIMPA (jadi stub)
plugins/PUSDAT/cari.js         ← TIMPA
```

Lalu **restart bot** (`pm2 restart …` atau `node index.js`).

## 🧪 Verifikasi

Setelah restart, jalankan:

```
.cari Ahmad
.cari Magelang
.cari Banten
```

Yang harus muncul di console:

```
[CARI] 🔎 Memulai pencarian sekuensial untuk: "Ahmad"
[CARI-SANTRI] ✅ Ditemukan N santri.
[CARI-GURU]   ✅ Ditemukan N guru.
[CARI-Daerah]   ✅ Ditemukan N santri.
[CARI-Konsulat] ✅ Ditemukan N santri.
[CARI] ✅ Selesai dalam Xms · Santri:N Guru:N Daerah:N Konsulat:N ...
```

**Tidak boleh** muncul lagi: `Spawn C:\Windows\System32\cscript.exe error`.

Bila muncul `[CARI-GURU] ⚠️ Tidak ada engine DB tersedia (dbGuru null & MDBReader null)` → artinya `initDB()` belum dipanggil di startup, atau koneksi `dbGuru` tidak terbentuk (cek log startup).

---

🛏️ Selamat tidur nyenyak 😴 — `.cari` sekarang seharusnya tenang.
