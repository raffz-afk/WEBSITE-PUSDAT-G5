# CHANGELOG v19.0 — Data Center G5
**Tanggal**: 9 Juli 2026  
**Versi**: v19.0  
**Dikerjakan oleh**: Update otomatis AI

---

## 🆕 FITUR BARU

### 1. 🔍 Inspeksi Pendataan (`/inspeksi`)
Fitur lengkap berdasarkan dokumen resmi **"Poin Inspeksi Pendataan Pondok Modern Darussalam Gontor"** dari Pusat Data Pimpinan (ditandatangani Drs. K.H. M. Akrim Mariyat, Dipl.A.Ed.).

**Poin yang dicek:**

| Seksi | Kode | Label | Tipe |
|-------|------|-------|------|
| A.1 | A.1.1 | Kesesuaian data status, kampus, kelas, rayon, konsulat | Auto ✅ |
| A.1 | A.1.2 | Kelengkapan data identitas diri santri | Auto ✅ |
| A.1 | A.1.3 | Kelengkapan data orang tua dan wali santri | Auto ✅ |
| A.1 | A.1.4 | Kelengkapan dan keakuratan data alamat sesuai KK | Auto ✅ |
| A.1 | A.1.5 | Kelengkapan data keluarga santri | Auto ✅ |
| A.2 | A.2.1–4 | Data Majalah Gontor (alamat, nama, telp, kodepos) | **Manual via EMIGO** 🌐 |
| B | B.1–3 | Komputerisasi (perangkat, jaringan, EMIGO) | **Manual** 📋 |
| C | C.1 | Kelengkapan berkas hardfile | **Manual** 📋 |
| C | C.2 | Kelengkapan berkas softfile (server lokal) | Auto ✅ |
| C | C.3 | Kesesuaian urutan/penamaan berkas | Auto ✅ |
| C | C.4 | Ketersediaan rekapitulasi berkas | Auto ✅ |
| C | C.5 | Upload berkas ke EMIGO | **Manual via EMIGO** 🌐 |
| D | D.1 | Kelengkapan pasfoto santri | Auto ✅ |
| D | D.2 | Kesesuaian ukuran file (maks 500KB) | Auto ✅ |
| D | D.3 | Kesesuaian format penamaan file pasfoto | Auto ✅ |
| D | D.4 | Pengiriman pasfoto ke email Pusat Data | **Manual** 📋 |
| D | D.5 | Upload pasfoto ke EMIGO | **Manual via EMIGO** 🌐 |

**Fitur route inspeksi:**
- `GET /inspeksi` → Daftar & history semua inspeksi
- `GET /inspeksi/cek` → Jalankan auto-cek + tampilkan semua poin
- `POST /inspeksi/cek` → Simpan catatan manual
- `GET /inspeksi/hasil/:id` → Detail hasil inspeksi
- `POST /inspeksi/hapus/:id` → Hapus catatan
- `GET /api/inspeksi/auto` → JSON API hasil auto-cek

**Database:** `database/inspeksi_history.json` (otomatis dibuat)

---

### 2. 🖥️ Topnav Satu Baris (Sidebar Dihapus)
- **Sidebar kiri DIHAPUS** secara total dari semua halaman
- Navigasi diganti dengan **topnav horizontal satu baris** di bagian atas
- Tab Overview/Rekap/Berkas/Proker/Kelas tetap berfungsi sebagai tab di topnav
- Menu EMIGO, Inspeksi, Audit dll tersusun rapi satu baris
- Topnav **scrollable** horizontal jika layar sempit (tanpa scrollbar visible)
- Warna aktif menggunakan garis bawah orange (`#e57f1f`)
- **Menu Inspeksi** ditampilkan dengan warna kuning (`#fbbf24`) agar mudah dikenali

---

### 3. 🚀 Autorun Startup Windows (`autorun-startup.js`)
Skrip untuk menginstall autorun Windows yang otomatis menjalankan `npm restart` saat komputer dinyalakan.

**Penggunaan:**
```bash
# Install autorun
node autorun-startup.js install

# Cek status
node autorun-startup.js status

# Hapus autorun
node autorun-startup.js uninstall
```

**Yang dibuat di Startup folder Windows:**
- `PusdatG5-AutoStart.bat` — dengan popup console
- `PusdatG5-AutoStart.vbs` — silent tanpa popup (direkomendasikan)

**Target direktori bot:**
```
D:\PUSAT DATA 2026\99. TITIP\01. raffz\BOT\pusdat-gontor5-bot-modifikasi
```

---

## ✏️ PERUBAHAN EXISTING

### `lib/dashboard.js`
- Header diupdate ke v19.0
- Import `registerInspeksiRoutes` dari `dashboardInspeksi.js`
- CSS sidebar dihapus (disembunyikan dengan `display:none !important`)
- CSS layout diubah dari `grid-template-columns: 240px 1fr` → `display: block`
- Topnav baru dengan class `.topnav`, `.topnav-brand`, `.topnav-tabs`, `.topnav-search`
- `.top-toolbar` disembunyikan (legacy)
- Pagination JS diupdate: selector dari `#sidebarMenu a[data-page]` → `.tab-btn[data-page]`
- Route registrasi inspeksi ditambahkan di `startDashboard()`

### `lib/dashboardEditor.js`
- Nav links ditambah: Inspeksi, emoji icons
- CSS `.topbar` diupdate ke single-row horizontal scrollable
- `.topbar nav a` diberi style `border-bottom` untuk active indicator

---

## 📁 FILE BARU

| File | Deskripsi |
|------|-----------|
| `lib/dashboardInspeksi.js` | Modul utama fitur Inspeksi Pendataan |
| `database/inspeksi_history.json` | Database history inspeksi (auto-created) |
| `autorun-startup.js` | Installer autorun Windows startup |
| `CHANGELOG_v19.md` | Dokumen ini |
| `docs/RINGKASAN_UPDATE.md` | Ringkasan semua update dari v1–v19 |

---

## 🔧 INSTALASI

1. Extract zip ini ke folder yang sama (timpa file lama)
2. Untuk autorun startup: `node autorun-startup.js install`
3. Restart bot: `npm restart`
4. Akses `/inspeksi` di dashboard untuk fitur inspeksi

---

## 📌 CATATAN PENTING

- **EMIGO** (emigo.gontor.ac.id) = EMIS Gontor, website internal Pondok Modern Darussalam Gontor. Poin yang berkaitan dengan EMIGO **tidak bisa dicek otomatis** dan harus dicek manual oleh staf.
- **Majalah Gontor** juga dikelola melalui EMIGO sehingga masuk kategori cek manual.
- Auto-cek berjalan berdasarkan database lokal di server. Pastikan path `D:\PUSAT DATA 2026\...` sesuai dengan konfigurasi di `pusdat-config.js`.
