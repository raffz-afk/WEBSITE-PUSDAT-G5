# 🏫 Panduan Instalasi — Fitur Pusdat Gontor 5
## Bot WhatsApp Pusat Data PMDG Kampus 5 Magelang

---

## 📦 Daftar File Baru & Modifikasi

### FILE BARU (tambahkan ke project):
| File | Lokasi | Keterangan |
|------|--------|------------|
| `pusdat-config.js` | `/root project/` | Konfigurasi Pusdat (ID Grup, dll) |
| `lib/dbAccess.js` | `/lib/` | Modul akses database Access |
| `handle/gateway.js` | `/handle/` | Handler gateway autentikasi |
| `plugins/PUSDAT/menu-pusdat.js` | `/plugins/PUSDAT/` | Menu utama Pusdat (.menu) |
| `plugins/PUSDAT/cek.js` | `/plugins/PUSDAT/` | Cek data pribadi (.cek) |
| `plugins/PUSDAT/revisi.js` | `/plugins/PUSDAT/` | Revisi data (.revisi) |
| `plugins/PUSDAT/absen.js` | `/plugins/PUSDAT/` | Direktori guru (.absen) |
| `plugins/PUSDAT/daftar.js` | `/plugins/PUSDAT/` | Registrasi user baru (.daftar) |
| `plugins/PUSDAT/terima.js` | `/plugins/PUSDAT/` | Approval staf (.terima) |
| `plugins/PUSDAT/lapor.js` | `/plugins/PUSDAT/` | Lapor masalah (.lapor) |
| `plugins/PUSDAT/idgrup.js` | `/plugins/PUSDAT/` | Cek ID grup (.idgrup) |

### FILE YANG DIMODIFIKASI (ganti file lama):
| File | Perubahan |
|------|-----------|
| `plugins/menu.js` | Command `menu` → `menu2`, `allmenu` tetap |
| `plugins/GROUP/absen.js` | Command `absen` → `absensi` |
| `lib/startup.js` | Tambah import & init database (lihat instruksi) |

---

## 🔧 Langkah Instalasi

### 1. Install Dependencies

**Untuk Windows (UTAMA — sesuai permintaan):**
```bash
npm install node-adodb
```

**Untuk Linux/Mac (ALTERNATIF):**
```bash
npm install mdb-reader
sudo apt-get install mdbtools  # untuk operasi INSERT di Linux
```

### 2. Letakkan File Database

Salin file `DB Guru PMDG 2025 v2.accdb` ke folder `database/`:
```
bot-project/
├── database/
│   ├── DB Guru PMDG 2025 v2.accdb   ← TARUH DI SINI
│   ├── audio/
│   └── ...
```

### 3. Salin Semua File Baru

```
bot-project/
├── pusdat-config.js                   ← BARU
├── lib/
│   ├── dbAccess.js                    ← BARU
│   └── ...
├── handle/
│   ├── gateway.js                     ← BARU
│   └── ...
├── plugins/
│   ├── menu.js                        ← GANTI (menu → menu2)
│   ├── GROUP/
│   │   ├── absen.js                   ← GANTI (absen → absensi)
│   │   └── ...
│   ├── PUSDAT/                        ← FOLDER BARU
│   │   ├── menu-pusdat.js
│   │   ├── cek.js
│   │   ├── revisi.js
│   │   ├── absen.js
│   │   ├── daftar.js
│   │   ├── terima.js
│   │   ├── lapor.js
│   │   └── idgrup.js
│   └── ...
```

### 4. Modifikasi startup.js

Buka file `lib/startup.js` dan tambahkan:

**Di bagian import (atas file):**
```javascript
import { initDB } from '../lib/dbAccess.js';
```

**Di dalam fungsi `start_app()`, SEBELUM `connectToWhatsApp()`:**
```javascript
// Inisialisasi database Pusdat
try {
  await initDB();
  console.log('[✔] Database Pusdat Gontor 5 siap.');
} catch (err) {
  console.error('[✖] Gagal inisialisasi database Pusdat:', err.message);
}
```

### 5. Konfigurasi ID Grup Staf

1. Jalankan bot
2. Masuk ke Grup WA Staf Pusdat
3. Ketik `.idgrup`
4. Salin ID yang muncul (format: `120363xxx@g.us`)
5. Buka file `pusdat-config.js`
6. Ganti `GRUP_STAF_PUSDAT_ID` dengan ID tersebut

### 6. Jalankan Bot

```bash
node index.js
```

---

## 📋 Daftar Command Baru

| Command | Akses | Keterangan |
|---------|-------|------------|
| `.menu` | Publik | Menu utama Pusdat |
| `.menu2` | Publik | Menu bot lama |
| `.cek` | Gateway | Cek data pribadi |
| `.revisi [detail]` | Gateway | Ajukan revisi data |
| `.absen` | Publik | Direktori guru aktif |
| `.absen [keyword]` | Publik | Cari guru by nama/stambuk |
| `.daftar [S] # [N] # [TL]` | Publik | Registrasi guru baru |
| `.terima [stambuk]` | Grup Staf | Approve pendaftaran |
| `.lapor [N] # [K]` | Publik | Lapor masalah tanpa login |
| `.idgrup` | Grup | Cek ID grup |
| `.absensi` | Grup | Absen grup (fitur lama) |
| `.allmenu` | Publik | Menu lengkap bot lama |

---

## 🔐 Alur Gateway Autentikasi

```
User: .cek
Bot:  "Masukkan Nomor Stambuk Anda:"
User: 120
Bot:  "Masukkan Tanggal Lahir (DD/MM/YYYY):"
User: 15/08/2003
Bot:  ✅ / ❌ (verifikasi ke database)
```

---

## 🗃️ SQL Query yang Digunakan

### Verifikasi Gateway (.cek / .revisi)
```sql
SELECT * FROM [T Master Guru] WHERE [Stambuk] = 120
-- Lalu cocokkan [Tanggal Lahir] dengan input user
```

### Direktori Guru (.absen)
```sql
SELECT [Stambuk], [Nama Lengkap], [Guru Tahun ke], [Status], [Ranking]
FROM [T Master Guru]
WHERE [Status] = 'Aktif'
ORDER BY [Ranking] ASC
-- ⚠️ DILARANG SELECT [Tanggal Lahir]!
```

### Insert Guru Baru (.terima setelah .daftar)
```sql
INSERT INTO [T Master Guru]
  ([Stambuk], [Nama Lengkap], [Tanggal Lahir], [Status])
VALUES
  (999, 'Ahmad Fauzi', #08/15/2003#, 'Aktif')
```

### Cek Stambuk Duplikat (.daftar)
```sql
SELECT [Stambuk] FROM [T Master Guru] WHERE [Stambuk] = 999
```

---

## ⚠️ Catatan Penting

1. **node-adodb** hanya berjalan di **Windows**. Jika bot di-host di Linux, gunakan **mdb-reader** (auto-detect di dbAccess.js).

2. **mdb-reader** adalah **read-only**. Untuk INSERT di Linux, diperlukan `mdbtools` CLI (`sudo apt install mdbtools`).

3. **Tanggal Lahir** di database berformat DateTime. Bot menerima input **DD/MM/YYYY** dan mengkonversi otomatis.

4. Beberapa record di database **tidak memiliki** Tanggal Lahir. User tersebut tidak akan bisa login via gateway.

5. **Fitur .revisi** TIDAK mengubah database secara otomatis. Hanya mengirim notifikasi ke grup staf.

6. **Session gateway** berlaku 5 menit. Jika timeout, user harus mengulang.

7. **Pending registration** (.daftar) tersimpan di memory. Jika bot restart, data pending akan hilang.
