# 📚 PANDUAN INTEGRASI MODUL PROKER PUSDAT GONTOR 5

Modul ini menambahkan **Manajemen Program Kerja (Proker) Harian, Bulanan & Tahunan** ke bot WhatsApp `pusdat-gontor5-bot-modifikasi` Anda.

> Modul dibuat selaras dengan arsitektur project Anda yang sudah ada (plugin-based, `node-cron`, `dbAccess.js`, `pusdat_settings.json`). **Tidak ada library baru** yang perlu diinstal — semua dependensi (`node-cron`, `moment-timezone`, `xlsx`) sudah ada di `package.json` Anda.

---

## 1️⃣ Struktur File yang Ditambahkan

Salin semua file ini ke root project Anda dengan struktur folder yang sama:

```
pusdat-gontor5-bot-modifikasi/
├── database/
│   └── proker/                       ← BARU
│       ├── staf_piket.json           ← jadwal piket 3 ustadz
│       ├── proker_tahunan.json       ← bisa diedit manual
│       ├── proker_bulanan.json       ← bisa diedit manual
│       ├── laporan_harian.json       ← otomatis diisi bot
│       └── rekap/                    ← otomatis (file Excel bulanan)
├── lib/
│   ├── prokerManager.js              ← BARU (engine database)
│   └── cronProker.js                 ← BARU (scheduler)
└── plugins/PUSDAT/
    ├── proker.js                     ← command .proker
    ├── lapharian.js                  ← command .lapharian
    ├── piket.js                      ← command .piket
    └── listproker.js                 ← command .listproker
```

---

## 2️⃣ Aktifkan Cron Proker (1 Baris Edit)

Buka **`lib/connection.js`** dan cari baris ini (sekitar baris 6 & 297):

```js
import { initCronBroadcast, updateBroadcastSocket } from '../lib/cronBroadcast.js';
// ...
if (connection === 'open') {
   initCronBroadcast(sock);
}
```

Tambahkan **2 baris** seperti ini:

```js
import { initCronBroadcast, updateBroadcastSocket } from '../lib/cronBroadcast.js';
import { initCronProker, updateProkerSocket } from '../lib/cronProker.js';   // 🆕

// ...
if (connection === 'open') {
   initCronBroadcast(sock);
   initCronProker(sock);                                                       // 🆕
}
```

> Tidak perlu mengubah `handler.js` — plugin auto-loaded berkat sistem plugin-based Anda.

---

## 3️⃣ Spesifikasi Logika Lengkap

### 🕘 Jadwal Otomatis Harian (timezone WIB)

| Waktu  | Cron Job | Aksi |
|--------|----------|------|
| 06:55  | Cek Hijriyah | Jika tanggal 1 Hijriyah → set `perlu_diperbarui=true` di `proker_bulanan.json` + reminder ke owner |
| 07:00  | Broadcast Pagi | Kirim ke `targetGroups`: evaluasi kemarin + Proker Tahunan + Proker Bulanan + tag staf piket |
| 07:30  | Cek + Spam | Jika `proker_pagi.submitted == false` → spam 2x/menit ke japri staf + grup |
| 12:00  | Reminder Bakdiyah | Tag staf piket → minta `.lapharian` |

### 👤 Jadwal Piket (otomatis dari `staf_piket.json`)

| Hari    | Staf yang Bertugas           |
|---------|------------------------------|
| Ahad    | Al-Ustadz Ichsan (`628137273366`) |
| Senin   | Al-Ustadz Raffal (`6281943567230`) |
| Selasa  | Al-Ustadz Hafiy (`6288215165490`) |
| Rabu    | Al-Ustadz Raffal             |
| Kamis   | Al-Ustadz Ichsan             |
| Jumat   | _(kosong — bisa Anda isi)_   |
| Sabtu   | Al-Ustadz Hafiy              |

Bot mendeteksi otomatis via `Date.getDay()` di timezone Asia/Jakarta.

### 🔁 Logika Spam (Punishment)

1. Cron `07:30` mengecek `laporan_harian.json[hari ini].proker_pagi.submitted`.
2. Jika `false` → `mulaiSpam(staf)` dijalankan.
3. `setInterval` 30 detik → kirim peringatan ke **japri staf** + **grup pusdat** (= 2x/menit).
4. Setiap interval, bot recheck status submit.
5. Begitu staf ketik `.proker [list]` → plugin memanggil `hentikanSpam(stafId)` → `clearInterval()`.

### 📥 Pencatatan Otomatis

Setiap `.proker` dan `.lapharian` masuk:
- Disimpan ke `database/proker/laporan_harian.json` (key = `YYYY-MM-DD`)
- Di-export ulang ke `database/proker/rekap/Rekap-YYYY-MM.xlsx`

Format kolom Excel:
```
Tanggal | Hari | Staf Piket | WA Staf | Proker Pagi (Submit) | Jam Submit Pagi |
Isi Proker Pagi | Laporan Bakdiyah (Submit) | Jam Submit Bakdiyah |
Selesai | Belum Selesai | Spam Total
```

---

## 4️⃣ Daftar Command Baru

| Command | Akses | Deskripsi |
|---------|-------|-----------|
| `.proker [isi]` | Staf piket hari ini | Setor proker pagi (otomatis stop spam) |
| `.lapharian #selesai ... #belum ...` | Staf piket | Laporan bakdiyah |
| `.piket` | Publik | Lihat staf piket hari ini |
| `.piket all` | Publik | Lihat semua jadwal piket |
| `.listproker` | Publik | Lihat semua proker tahunan + bulanan |
| `.listproker tahunan` | Publik | Hanya proker tahunan |
| `.listproker bulanan` | Publik | Hanya proker bulanan |

---

## 5️⃣ Cara Edit Database (Customisasi)

### Edit Proker Tahunan
Buka file `database/proker/proker_tahunan.json`:

```json
{
  "tahun_hijriyah": "1447 H",
  "tahun_masehi": "2026",
  "list": [
    { "no": 1, "judul": "...", "target": "...", "deadline": "...", "status": "berjalan" }
  ]
}
```

Tambah/edit/hapus item di array `list`. Perubahan langsung terbaca di broadcast pagi berikutnya — tidak perlu restart bot.

### Edit Proker Bulanan
File `database/proker/proker_bulanan.json` — strukturnya sama. Cron 06:55 awal bulan Hijriyah akan otomatis menambah peringatan `⚠️` di pesan broadcast hingga Anda men-set `"perlu_diperbarui": false`.

### Edit Jadwal Piket
File `database/proker/staf_piket.json`. Field `hari` adalah array index hari:
- `0` = Ahad, `1` = Senin, `2` = Selasa, `3` = Rabu, `4` = Kamis, `5` = Jumat, `6` = Sabtu

---

## 6️⃣ (OPSIONAL) Integrasi Google Sheets

Modul default mengekspor ke **Excel lokal** (cukup untuk arsip). Jika Anda ingin **Google Sheets live**, tambahkan ini di `lib/prokerManager.js`:

```bash
npm install googleapis
```

Lalu ganti fungsi `appendRekapExcel()` dengan helper Google Sheets (saya siapkan template di komentar fungsi tersebut). Anda butuh:

1. Buat **Service Account** di Google Cloud Console
2. Download `service-account.json`
3. Share Spreadsheet ke email service account
4. Set `GOOGLE_SHEET_ID` di `pusdat-config.js`

> **Rekomendasi**: Mulai dengan Excel lokal dulu — sudah memenuhi kebutuhan "tabel rekapan harian yang rapi". Migrasi ke Google Sheets bisa dilakukan kapan saja tanpa mengubah logic plugin.

---

## 7️⃣ Testing Manual

```bash
# 1. Pastikan path file benar
ls database/proker/

# 2. Jalankan bot
npm start

# 3. Test command (di grup pusdat)
.piket            → harus tampil staf piket hari ini
.listproker       → tampil tahunan + bulanan
.proker
1. Test item
2. Test item 2
                  → tersimpan + react ✅
.lapharian
#selesai
- ok
#belum
- pending
                  → tersimpan + react ✅
```

Untuk test spam tanpa menunggu jam 07:30, di Node REPL:
```js
import { mulaiSpam } from './lib/cronProker.js';
import { getStafPiketHariIni } from './lib/prokerManager.js';
mulaiSpam(getStafPiketHariIni()[0]);
```

---

## 8️⃣ Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Spam tidak berhenti setelah `.proker` | Pastikan `hentikanSpam(staf.id)` dipanggil di `proker.js` (sudah default) |
| Cron tidak jalan | Cek `process.env.TZ === 'Asia/Jakarta'` di `index.js` |
| Mention tidak nge-tag | Pastikan `mentions: [<wa>@s.whatsapp.net]` ikut dikirim |
| Hijriyah salah 1 hari | Beberapa kalender beda 1 hari — sesuaikan offset di `getHijriyahHariIni()` |

---

✅ **Siap pakai**. Module ini compatible dengan Node 20.x dan Baileys 7.0+ (sesuai `package.json` Anda).
