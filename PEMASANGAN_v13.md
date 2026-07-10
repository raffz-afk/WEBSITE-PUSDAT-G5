# 🚀 PANDUAN PEMASANGAN UPDATE v13 — Pusdat Gontor 5

> **Untuk Pemula:** Tinggal copy-paste file sesuai tabel di bawah. Tidak perlu edit code apapun (kecuali `pusdat-config.js` di langkah terakhir).

---

## 📋 RINGKASAN FITUR BARU

| # | Fitur | File Utama |
|---|-------|------------|
| 1 | 🛡️ Rate Limit + Anti-Abuse | `lib/rateLimiter.js` + `handle/rateLimitGuard.js` |
| 2 | 📤 Upload Berkas via WA | `plugins/PUSDAT/uploadberkas.js` |
| 3 | 🌐 Dashboard Web (port 3000) | `lib/dashboard.js` + `lib/linkPreview.js` |
| 4 | 🔍 Smart Search Lintas DB | `plugins/PUSDAT/cari.js` + `lib/dbAccessExtra.js` |
| 5 | 🌍 Multi-bahasa (ID/AR/EN) | `lib/i18n.js` + `plugins/PUSDAT/lang.js` |
| 6 | 🎙️ Voice Note → Text (Whisper AI) | `lib/whisperTranscribe.js` + `handle/voiceLapor.js` |

---

## 🔧 LANGKAH 1: COPY SEMUA FILE

Salin file dari folder `output/` ke folder project Anda. Map sesuai struktur:

```
project-anda/
├── handle/
│   ├── rateLimitGuard.js       ← BARU
│   └── voiceLapor.js           ← BARU
├── lib/
│   ├── rateLimiter.js          ← BARU
│   ├── dashboard.js            ← BARU
│   ├── linkPreview.js          ← BARU
│   ├── dbAccessExtra.js        ← BARU
│   ├── i18n.js                 ← BARU
│   ├── whisperTranscribe.js    ← BARU
│   └── cronBroadcast.js        ← TIMPA (sudah include link preview)
├── plugins/
│   └── PUSDAT/
│       ├── uploadberkas.js     ← BARU
│       ├── cari.js             ← BARU
│       ├── lang.js             ← BARU
│       └── menu-pusdat.js      ← TIMPA (sudah include menu baru)
├── pusdat-config.js            ← TIMPA (tambah konfigurasi baru)
└── package.json                ← TIMPA (tambah dependencies)
```

✅ Tinggal **drag-and-drop** file ke folder yg sesuai. Tidak perlu edit apa-apa.

---

## 📦 LANGKAH 2: INSTALL DEPENDENCIES

Buka terminal di folder project, jalankan:

```bash
npm install express express-session puppeteer form-data
```

> ⚠️ **Catatan Puppeteer:** akan men-download Chromium ~170 MB. Wajib untuk thumbnail Link Preview WhatsApp. Kalau Anda **tidak butuh thumbnail dinamis**, bisa skip puppeteer (bot tetap jalan, hanya pakai auto-preview Baileys).

Kalau Anda mau install **tanpa Chromium otomatis**:

```bash
PUPPETEER_SKIP_DOWNLOAD=true npm install puppeteer
```

---

## ⚙️ LANGKAH 3: KONFIGURASI

Buka file `pusdat-config.js` dan **isi nilai berikut**:

```javascript
// 🌐 Dashboard Web
DASHBOARD_PASSWORD: 'GANTI_PASSWORD_KUAT_DI_SINI',  // ⚠️ WAJIB GANTI!
DASHBOARD_PUBLIC_URL: 'http://localhost:3000',      // atau domain server Anda

// 🎙️ OpenAI Whisper (untuk voice note)
OPENAI_API_KEY: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxx',     // dari platform.openai.com
```

**Tips:**
- Daftar OpenAI: https://platform.openai.com/signup
- Dashboard URL: kalau bot di VPS, ganti ke `https://dashboard-anda.com`

---

## 🔌 LANGKAH 4: HUBUNGKAN DASHBOARD KE BOT

Edit file `lib/connection.js`:

**Cari baris ini** (sekitar baris 6-7):
```javascript
import { initCronBroadcast, updateBroadcastSocket } from '../lib/cronBroadcast.js';
import { initCronProker, updateProkerSocket } from '../lib/cronProker.js';
```

**Tambahkan satu baris di bawahnya**:
```javascript
import { startDashboard } from '../lib/dashboard.js';
import { bindAppConfig } from '../lib/rateLimiter.js';
```

**Lalu cari blok ini** (sekitar baris 296-299):
```javascript
    if (connection === 'open') {

          initCronBroadcast(sock);
          initCronProker(sock);
```

**Ubah jadi**:
```javascript
    if (connection === 'open') {

          initCronBroadcast(sock);
          initCronProker(sock);
          startDashboard();                               // 🆕 v13
          bindAppConfig({ owner: config.owner });         // 🆕 v13 — untuk notif abuse
```

---

## ✅ LANGKAH 5: JALANKAN BOT

```bash
npm start
```

Anda akan melihat output:
```
[✔] Cron Broadcast Harian aktif → Setiap jam 07:00 WIB
[✔] 🌐 Dashboard Pusdat aktif → http://localhost:3000
    └─ Password default: "gontor5" (UBAH di pusdat-config.js!)
```

🎉 **SELESAI!**

---

## 🧪 CARA UJI COBA

### 1. Rate Limit Test
Kirim `.auditberkas all` 2x dalam 1 menit → muncul pesan tunggu.

### 2. Anti-Abuse Test
Kirim `.admin` 6x cepat → akun terblokir 2 menit + Owner dapat notif WA.

### 3. Upload Berkas
Kirim foto KK + caption: `.uploadberkas 140123 D`

### 4. Dashboard
Buka http://localhost:3000 → login dengan password yg di-set.

### 5. Smart Search
Ketik di WA: `.cari Magelang` → muncul hasil dari semua tabel.

### 6. Multi-bahasa
- `.lang en` → ganti ke English
- `.lang ar` → ganti ke Arab
- `.menu` → menu muncul dlm bahasa yg dipilih

### 7. Voice Note Lapor
Sebagai staf piket, kirim VN ke chat private bot → otomatis transkrip.

---

## ❓ TROUBLESHOOTING

### Q: Dashboard tidak bisa dibuka
- Cek terminal apakah ada pesan `port already in use`
- Ubah port di `pusdat-config.js`: `DASHBOARD_PORT: 3001`

### Q: Voice note tidak ditranskrip
- Pastikan `OPENAI_API_KEY` sudah diisi di `pusdat-config.js`
- Cek saldo OpenAI Anda di https://platform.openai.com/usage
- Atau set keyword: kirim VN dengan caption `.laporvoice`

### Q: Smart search tidak menemukan guru
- Pastikan tabel di Access bernama `T Master Guru`
- Kalau beda, edit `lib/dbAccessExtra.js` baris `const TABEL_GURU = ...`

### Q: Link preview WA tidak muncul thumbnail
- Pastikan Puppeteer ter-install
- Kalau VPS spesifikasi rendah, tambahkan: `apt install chromium-browser`
- Bisa juga skip thumbnail, gunakan auto-preview Baileys saja (sudah otomatis)

### Q: Rate limit terlalu ketat untuk Owner
- Owner sudah otomatis BYPASS rate limit
- Pastikan nomor Anda terdaftar di `config.js` → `DATA_OWNER`

---

## 🔐 KEAMANAN

- ⚠️ **GANTI** `DASHBOARD_PASSWORD` di `pusdat-config.js` SEBELUM deploy publik
- ⚠️ **GANTI** `DASHBOARD_SESSION_SECRET` ke string random yg panjang
- ⚠️ Jangan commit `pusdat-config.js` berisi API key ke Git public
- 💡 Untuk deploy public, pakai HTTPS via reverse proxy (Nginx/Cloudflare)

---

## 📚 STRUKTUR FOLDER FINAL

```
pusdat-gontor5/
├── handle/
│   ├── gateway.js (utuh, tidak diubah)
│   ├── rateLimitGuard.js ← BARU
│   ├── voiceLapor.js     ← BARU
│   └── ...lain-lain
├── lib/
│   ├── dbAccess.js (utuh, tidak diubah)
│   ├── dbAccessExtra.js  ← BARU
│   ├── dashboard.js      ← BARU
│   ├── rateLimiter.js    ← BARU
│   ├── linkPreview.js    ← BARU
│   ├── i18n.js           ← BARU
│   ├── whisperTranscribe.js ← BARU
│   ├── cronBroadcast.js  ← UPDATED
│   └── connection.js (edit 2 baris)
├── plugins/PUSDAT/
│   ├── uploadberkas.js   ← BARU
│   ├── cari.js           ← BARU
│   ├── lang.js           ← BARU
│   └── menu-pusdat.js    ← UPDATED
├── pusdat-config.js      ← UPDATED
└── package.json          ← UPDATED
```

---

## 📞 SUPPORT

Kalau ada error, cek log terminal — biasanya pesan error sangat jelas.
Sebagian besar masalah berasal dari:
1. ❌ `OPENAI_API_KEY` belum diisi
2. ❌ Drive `D:\PUSAT DATA 2026\...` tidak ada
3. ❌ Database `.accdb` tidak ditemukan

Selamat memakai SISFO Pusdat v13! 🎉
