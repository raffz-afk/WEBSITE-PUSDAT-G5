# Pusdat Gontor 5 — CHANGELOG v17

Tanggal rilis: 12 Mei 2026

## Ringkasan
Patch v17 mengatasi 9 permintaan modifikasi yang Anda ajukan + suite uji baru
(10 skenario × 10 putaran = 100 run, 100% PASS).

## Daftar Perubahan

### 1. Top toolbar di main dashboard
- File: `lib/dashboard.js`
- Toolbar global sticky di atas konten utama dengan:
  - Search bar (form GET → `/cari`)
  - Tombol Ekspor (`/ekspor`), Rekap Berkas (`/rekap-berkas`),
    Validasi Santri (`/validasi/santri`), Validasi Guru (`/validasi/guru`),
    Audit Log (`/audit`), Logout (`/logout`)
- Toolbar muncul juga di semua halaman editor (`lib/dashboardEditor.js`)
  khusus untuk role **admin**, di bawah header utama.

### 2. Sidebar di-paginasi per page
- File: `lib/dashboard.js`
- Sidebar lama (anchor link) diubah menjadi page-switcher JS:
  - Overview, Rekap, Berkas, Proker, **Semua Kelas**
  - Plus shortcut langsung ke Cari, Ekspor, Rekap Berkas, Validasi, Audit, Preview
- Tiap menu meng-aktifkan `.page-section` yang sesuai (lainnya disembunyikan).
- Mendukung deep-link via `#hash` (mis. `/#proker` langsung membuka page Proker).

### 3. Tanggal lahir Guru kini terbaca
- File: `lib/dbAccess.js`
- Helper baru `enrichGuruRecord()` menjalankan `normalizeDate()` pada SETIAP
  kolom yang mengandung "Tanggal" / "Tgl".
- `getFullBiodata()` dan `getDirektoriGuru()` membungkus hasilnya melalui
  `enrichGuruRecord()` sehingga tanggal lahir guru tampil `DD-MM-YYYY`
  bukan ISO mentah lagi.
- Verifikasi: input `new Date('1990-05-15T00:00:00Z')` → `15-05-1990` ✓

### 4. Deteksi nomor HP berfungsi
- File: `lib/dbAccess.js`
- `normalizePhoneValue()` di-upgrade: membersihkan spasi, kurung, titik, dash;
  awalan `0` & `62` di-konversi ke `+62`.
- Helper baru `extractPhoneFromRecord()` mendeteksi puluhan varian kolom:
  `No HP`, `No. HP`, `NoHp`, `No_HP`, `No Telp`, `Telp`, `Handphone`, `HP`,
  `WA`, `No WhatsApp`, dan otomatis fallback ke kolom apapun yang nama
  lower-case-nya mengandung `hp`/`telp`/`phone`.
- `enrichGuruRecord()` memastikan `No HP` final terisi.

### 5. Validasi semua kolom non-opsional
- File: `lib/dashboardEditor.js`
- `VALIDASI_FIELDS_SANTRI` (15 kolom): Nama Lengkap, Tempat Lahir,
  Tanggal Lahir, Jenis Kelamin, Kelas, Rayon, Kamar Rayon, No KK, No KTP,
  NISN, **EMIS**, **Eprimer Pondok**, Ayah_Nama, Ibu_Nama, Alamat.
- `VALIDASI_FIELDS_GURU` (11 kolom): Nama Lengkap, Tempat Lahir,
  Tanggal Lahir, Jenis Kelamin, Status, Bagian, No HP, No KTP, NUPTK,
  **EMIS**, **Eprimer Pondok**.
- `buildValidasiData()` sekarang menggunakan **alias-aware check** —
  kalau salah satu varian kolom terisi (mis. `No. HP` saat `No HP` kosong),
  baris itu dianggap lengkap untuk kolom tersebut.

### 6. Foto akses tidak broken lagi
- File: `lib/dashboardEditor.js`
- `BERKAS_INDUK_DIR` dipilih dari 4 kandidat berlapis:
  1. `pusdatConfig.UPLOAD_BERKAS_ROOT`
  2. Path Windows asli `D:\PUSAT DATA 2026\…`
  3. `./database/berkas` (relatif root project)
  4. `./tmp/berkas`
- Jika tidak ada yang ditemukan, folder `./database/berkas` dibuat otomatis
  agar foto akses fitur tetap berjalan di Linux/dev.
- `/berkas/file` menambahkan header `Content-Type` & `Cache-Control` yang benar.

### 7. Upload/download berkas tidak nyasar ke `/cari`
- File: `lib/dashboardEditor.js`
- `res.redirect('back')` (yang bergantung pada Referer, sering jatuh ke
  halaman search) diganti dengan helper `backToBerkas(stambuk)` yang
  selalu mengarah ke `/berkas/{stambuk}` (atau `/` untuk admin tanpa stambuk).
- Route baru `GET /berkas/download?stambuk=…&kode=…` memaksa
  `Content-Disposition: attachment` agar tombol Download benar-benar
  mengunduh file (bukan membuka tab baru lalu redirect).
- Tombol **⬇️ Download** ditambahkan di setiap kartu berkas pada
  `renderBerkasPage`.

### 8. Daftar semua kelas (tidak dipotong)
- File: `lib/dashboard.js`
- Main dashboard punya page-section baru `🏫 Semua Kelas` yang menampilkan
  SELURUH kelas + jumlah santri tiap kelas (grid responsive).
- Broadcast preview: `kelasRekap.slice(0, 24)` dihapus, kini menampilkan
  100% kelas.

### 9. Test 10× per fitur
- File: `tests/test-feature-v17.mjs` (BARU)
- 10 skenario × 10 putaran = 100 run, total **100% PASS**.
- Diintegrasikan ke `tests/run-all.mjs`.

## Cara Pasang

1. Backup folder `lib/` dan `tests/` lama Anda.
2. Timpa file berikut dari paket `pusdat-gontor5-v17.zip`:
   - `lib/dbAccess.js`
   - `lib/dashboard.js`
   - `lib/dashboardEditor.js`
   - `tests/test-dashboard-web.mjs`
   - `tests/test-feature-v17.mjs` (baru)
   - `tests/run-all.mjs`
   - `CHANGELOG_v17.md`
3. Jalankan `npm install` (tidak ada dependensi baru, hanya memastikan
   `multer`, `xlsx`, `express-session` sudah terpasang).
4. Verifikasi: `node tests/run-all.mjs` — semua suite harus exit 0.
5. Jalankan bot: `npm start`. Dashboard tersedia di
   `http://localhost:3000` (atau port pada `pusdat-config.js`).

## Kompatibilitas Lama

- Semua fungsi `dbAccess.js` lama TIDAK diubah signature-nya.
- Render-function lama (`renderDetailPage`, `renderEditPage`, dst.) tetap
  bisa dipanggil tanpa parameter `user` — hanya saja toolbar dan beberapa
  tombol admin tidak muncul untuk user non-admin (sesuai desain role).
- Test lama `test-editdata.mjs`, `test-dashboard-web.mjs`, `test-pretty-log.mjs`,
  `test-live-export.mjs` tetap dapat dijalankan; `test-dashboard-web.mjs`
  diperbarui agar fake-session memakai user objek `{ role: 'admin' }`.

## Ringkasan Hasil Uji (run terakhir, 12 Mei 2026)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RINGKASAN UJI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅  test-editdata.mjs            pass=16  fail=0  exit=0
  ✅  test-dashboard-web.mjs       pass=18  fail=0  exit=0
  ✅  test-pretty-log.mjs          pass=5   fail=0  exit=0
  ✅  test-feature-v17.mjs         pass=10  fail=0  exit=0  (10×10 = 100 run)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL  PASS = 49  (149 dengan repeats)
TOTAL  FAIL = 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
