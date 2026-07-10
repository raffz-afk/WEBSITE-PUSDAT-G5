# 📦 SISFO PUSDAT v12 — Update Patch (25-Apr-2026)

Patch ini berisi perbaikan, fitur baru, dan tutorial yang lebih lengkap untuk bot WhatsApp **Pusdat Gontor 5**.

---

## 🆕 Perubahan v12

| # | Komponen | Status |
|---|----------|--------|
| 1 | `plugins/PUSDAT/menu-pusdat.js` | ⚙️ Diupdate — semua command baru sudah masuk |
| 2 | `plugins/PUSDAT/tutorial.js` | ⚙️ Diupdate — tutorial dipecah 4 bagian, jauh lebih lengkap |
| 3 | `plugins/PUSDAT/auditberkas.js` | ⚙️ Diupdate — tambah mode `.auditberkas all` |
| 4 | `plugins/PUSDAT/editproker.js` | 🆕 Plugin baru — owner edit proker via WA |
| 5 | `plugins/PUSDAT/listproker.js` | ⚙️ Diupdate — support `pekanan` |
| 6 | `lib/prokerEditor.js` | 🆕 Library baru — CRUD proker + auto-backup |
| 7 | `handle/gateway.js` | ⚙️ Diupdate — handle audit berkas mode ALL + Excel |
| 8 | `database/proker/proker_pekanan.json` | 🆕 File baru — data proker pekanan |

---

## 🛠️ Cara Pasang

> ⚠️ **Backup folder bot lama dulu** sebelum menimpa file. Patch ini hanya mengganti file yang terdaftar di tabel di atas.

### 1. Stop bot dulu
```bash
pm2 stop autoresbot
# atau Ctrl+C kalau jalan manual
```

### 2. Salin file patch ke folder bot
Salin **isi folder pusdat-fix** ke root folder bot Anda (timpa file lama). Struktur:

```
[ROOT BOT]/
├── plugins/PUSDAT/
│   ├── menu-pusdat.js       ← TIMPA file lama
│   ├── tutorial.js          ← TIMPA file lama
│   ├── auditberkas.js       ← TIMPA file lama
│   ├── editproker.js        ← FILE BARU
│   └── listproker.js        ← TIMPA file lama
├── lib/
│   └── prokerEditor.js      ← FILE BARU
├── handle/
│   └── gateway.js           ← TIMPA file lama
└── database/proker/
    └── proker_pekanan.json  ← FILE BARU
```

### 3. (Opsional) Verifikasi
```bash
node --check handle/gateway.js
node --check plugins/PUSDAT/editproker.js
node --check lib/prokerEditor.js
# semua harus output kosong (tanpa error)
```

### 4. Start bot
```bash
pm2 restart autoresbot
# atau
node index.js
```

### 5. Test command
- Owner: `.editproker help` → muncul panduan
- Staf:  `.auditberkas all` → minta password → kirim Excel
- Umum:  `.tutorialpusdat 4` → tutorial bagian owner
- Umum:  `.listproker pekanan` → tampilkan proker pekanan

---

## 📚 Quick Reference Command Baru

### `.editproker` (Owner Only)
```text
.editproker help
.editproker bulanan add | Audit Berkas Q2 | Selesai 100% akhir bulan | Tim Pusdat
.editproker pekanan add | Backup Mingguan | Tiap Jumat | Staf Piket
.editproker tahunan add | Migrasi DB | 100% migrasi | Akhir Tahun | berjalan
.editproker bulanan edit 2 | Judul Baru | Target Baru | PIC Baru
.editproker pekanan del 1
.editproker reset bulanan
.editproker setbulan Syawal 1447 H | April 2026
.editproker setpekan Pekan ke-2 Syawal | 2026-05-01
.editproker show bulanan
```

### `.auditberkas all` (Staf)
```text
.auditberkas all       ← audit SELURUH santri aktif
.auditberkas semua     ← alias dari "all"
.auditberkas 3 Int B   ← (lama) audit per kelas
```
Bot akan minta password staf, kemudian:
- Kirim ringkasan per kelas di chat
- Kirim file **Excel** berisi detail santri yang berkasnya kurang
- File temp di `tmp/AuditBerkas-ALL-*.xlsx` (otomatis dihapus 30 detik setelah dikirim)

### `.listproker pekanan`
```text
.listproker            ← tahunan + bulanan + pekanan (gabungan)
.listproker tahunan
.listproker bulanan
.listproker pekanan    ← 🆕
```

### `.tutorialpusdat`
```text
.tutorialpusdat        ← intro + bagian 1
.tutorialpusdat 1      ← Untuk Guru/Umum
.tutorialpusdat 2      ← Khusus Staf Pusdat
.tutorialpusdat 3      ← Piket, Proker, Broadcast
.tutorialpusdat 4      ← Owner: edit proker via WA
```

---

## 🛡️ Keamanan Edit Proker

- Hanya nomor yang terdaftar di **`config.js > owner`** yang bisa pakai `.editproker`
- Setiap perubahan otomatis di-backup ke `database/proker/_backup/proker_[type]_YYYYMMDD_HHmmss.json`
- Bila salah edit, restore manual dari folder `_backup`
- Field validasi: `judul` wajib diisi; field lain optional dan akan diisi `-` jika kosong

---

## 💡 Tip Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `.editproker` jawab "Akses Ditolak" | Pastikan nomor pengirim ada di `config.js > owner` |
| `.auditberkas all` Excel-nya tidak terkirim | Cek `package.json` ada `xlsx`, dan folder `tmp/` punya write permission |
| Pekanan tidak muncul di `.listproker` | Pastikan file `database/proker/proker_pekanan.json` ada |
| Tutorial bagian 4 tidak muncul | Ketik `.tutorialpusdat 4` (angka 4 wajib) |
| Mode ALL audit lambat | Wajar — datanya banyak. Tunggu sampai bot kirim Excel. |

---

🏫 **Pusat Data PMDG Kampus 5 Magelang**
⚙️ SISFO Pusdat v12 (25-Apr-2026)
