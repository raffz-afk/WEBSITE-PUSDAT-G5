# CHANGELOG v18.0 — Validasi Event + Lupa Stambuk

## 🆕 Fitur Baru

### 1. 📅 Event Validasi Data Guru (admin)
Fitur baru untuk mengadakan periode validasi data guru secara terjadwal.
Admin dapat membuat banyak event dengan rentang waktu yang fleksibel.

**Cara kerja:**
- Admin buat event di menu **Event Validasi** (login dashboard sebagai admin)
- Tentukan judul event, deskripsi, jadwal mulai, dan deadline
- Pilih kolom-kolom data apa saja yang wajib dikonfirmasi guru
- Sistem otomatis tahu siapa yang sudah/belum validasi
- Admin bisa **memperpanjang deadline** kapan saja dengan catatan
- Admin bisa **ekspor rekap** (siapa sudah/belum) ke Excel multi-sheet
- Admin bisa menutup / membuka kembali / menghapus event
- Admin bisa "Reset" submission satu guru jika perlu pengisian ulang

### 2. 📱 Validasi via WhatsApp Bot (guru/ustadz)
Para guru bisa melakukan validasi data lewat **dua channel**:

**A. Via WhatsApp Bot:**
- Command baru: `.validasidata` (atau `.validasi`, `.vd`)
- Bot akan menampilkan info event aktif, deadline, & catatan perpanjangan
- Bot meminta Stambuk + Tanggal Lahir (sama seperti `.cek`)
- Setelah login berhasil → otomatis tercatat sudah validasi (channel `WA`)
- Bot menampilkan biodata sebagai bukti & untuk diperiksa

**B. Via Dashboard Web:**
- Ustadz login → muncul banner besar di halaman Akun Saya
- Klik tombol **"Validasi Data Saya Sekarang"**
- Sistem menampilkan data terkini & checklist kolom-kolom penting
- Ustadz centang semua → klik **"Kirim Konfirmasi Validasi"**
- Tercatat sudah validasi (channel `WEB`)

### 3. 🔎 Fitur "Lupa Stambuk?" di Halaman Login
Halaman login sekarang punya panel **"Lupa Nomor Stambuk?"** di bawah
tombol login (hanya muncul saat memilih role Ustadz/Santri).

**Cara kerja:**
- Ustadz yang tidak tahu stambuknya (karena masih pakai ranking guru)
  cukup klik tombol "🔎 Lupa Nomor Stambuk?"
- Ketik nama lengkap → klik Cari
- Sistem menampilkan daftar nama yang cocok + stambuk-nya
- Klik nomor stambuk → otomatis terisi di kolom login

**Keamanan:**
- Endpoint `/api/lookup-stambuk` hanya mengembalikan pasangan
  (nama, stambuk, info status/kelas) — tidak ada data sensitif
- Hanya bisa cari by NAMA (bukan by angka) → mencegah enumerasi stambuk
- Hasil dibatasi maksimal 20 entri per query

### 4. 🔒 Password Admin Tidak Lagi Bocor di Login
Sebelumnya pesan info di halaman login Admin menampilkan
`Password default: bismillah` — ini risiko keamanan karena siapa pun
yang membuka halaman login bisa tahu password admin.

Sekarang pesan tersebut diubah menjadi:
> "Password hanya diketahui oleh pengelola Pusdat — silakan hubungi
> admin Pusdat jika Anda lupa."

Startup log di console juga tidak lagi mencetak password default.

---

## 📋 Rute Baru Dashboard

### Admin
| Rute | Method | Fungsi |
|---|---|---|
| `/event-validasi` | GET | List semua event |
| `/event-validasi/new` | GET/POST | Form & simpan event baru |
| `/event-validasi/:id` | GET | Detail + progres + perpanjangan |
| `/event-validasi/:id/perpanjang` | POST | Tambah extension deadline |
| `/event-validasi/:id/toggle` | POST | Active ↔ Closed |
| `/event-validasi/:id/hapus` | POST | Hapus event |
| `/event-validasi/:id/reset/:stambuk` | POST | Reset 1 submission |
| `/event-validasi/:id/ekspor` | GET | Download xlsx rekap |

### Ustadz
| Rute | Method | Fungsi |
|---|---|---|
| `/me/validasi` | GET | Redirect ke event aktif |
| `/me/validasi/:id` | GET | Form konfirmasi data |
| `/me/validasi/:id` | POST | Submit konfirmasi |

### Publik (login page)
| Rute | Method | Fungsi |
|---|---|---|
| `/api/lookup-stambuk` | GET | Lookup stambuk by nama |

---

## 📦 File yang Berubah / Ditambah

### File Baru (3)
- `lib/validasiEvent.js` — Modul inti event/storage/submissions
- `lib/dashboardEventValidasi.js` — Routes dashboard (admin + ustadz)
- `plugins/PUSDAT/validasidata.js` — Plugin WA bot

### File yang Dimodifikasi (4)
- `lib/dashboard.js`
  - Hapus hint password `bismillah` di info admin
  - Tambah panel "Lupa Stambuk?" + script lookup
  - Tambah endpoint `/api/lookup-stambuk`
  - Register routes event validasi
  - Hilangkan log password di startup
- `lib/dashboardEditor.js`
  - Tambah link "Event Validasi" di nav admin
  - Tambah link "Validasi Data" di nav ustadz
  - Tampilkan banner event aktif di halaman `/me` ustadz
- `handle/gateway.js`
  - Tambah branch `session.command === 'validasidata'` setelah verifikasi
  - Otomatis catat submission saat ustadz validasi via WA
- `plugins/PUSDAT/menu-pusdat.js`
  - Tambah baris `.validasidata` di menu utama

---

## 🗃️ Penyimpanan Data
- Event & submissions disimpan di `database/validasi_events.json`
- Format JSON, atomic write (file `.tmp` → rename)
- Otomatis dibuat saat event pertama dibuat
- Struktur:
```json
{
  "events": [
    {
      "id": "evt_xxx",
      "title": "Validasi Data Guru 2026",
      "description": "...",
      "createdBy": "Admin Pusdat",
      "createdAt": "ISO date",
      "startAt": "ISO date",
      "deadline": "ISO date",
      "extensions": [
        { "newDeadline": "...", "note": "...", "extendedAt": "...", "by": "..." }
      ],
      "status": "active|closed|draft",
      "requiredFields": ["Nama Lengkap", "No HP", ...],
      "submissions": {
        "12345": {
          "stambuk": 12345,
          "nama": "Ust. Fulan",
          "validatedAt": "ISO date",
          "channel": "web|wa",
          "note": "...",
          "fieldsConfirmed": { "Nama Lengkap": true, ... },
          "submitCount": 1
        }
      }
    }
  ]
}
```

---

## 🔄 Cara Pasang
1. **Backup** folder bot Anda yang lama dulu.
2. **Timpa** semua file di archive ini ke folder bot.
3. **Restart** bot (`npm start` atau `node index.js`).
4. Buka dashboard sebagai admin → cek menu "**Event Validasi**".
5. Test command WA: kirim `.validasidata` ke bot.

Tidak perlu install package tambahan. Modul yang digunakan
(`xlsx`, `express`, `express-session`) sudah ada di `package.json`.

---

## ✅ Test Skenario
- ✅ Admin buat event → progres 0/total
- ✅ Ustadz validasi via web → tercatat channel WEB
- ✅ Ustadz validasi via `.validasidata` di WA → tercatat channel WA
- ✅ Admin perpanjang deadline → notifikasi muncul di halaman ustadz
- ✅ Event expired otomatis cegah submission baru
- ✅ Admin tutup event → ustadz tidak bisa validasi
- ✅ Reset submission ustadz → ustadz harus validasi ulang
- ✅ Ekspor rekap (all/sudah/belum) → file `.xlsx` multi-sheet
- ✅ Lupa stambuk → cari "ahmad" → tampil daftar nama yang cocok
- ✅ Login admin tidak lagi membocorkan password "bismillah"
