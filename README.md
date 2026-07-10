<div align="center">

# 🗂️ WEBSITE PUSDAT G5 — Integrated Data Center Management System

**Sistem Terintegrasi Live Dashboard & WhatsApp Bot untuk Otomatisasi Operasional Pusat Data**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express.js-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)

[![Maintained](https://img.shields.io/badge/Maintained-Yes-brightgreen?style=flat-square)](https://github.com/raffz-afk/WEBSITE_PUSDAT_LAGI/commits/main)
[![License](https://img.shields.io/badge/License-Private-red?style=flat-square)]()
[![Status](https://img.shields.io/badge/Status-Production-blue?style=flat-square)
[![Platform](https://img.shields.io/badge/Platform-Web_%2B_WhatsApp-purple?style=flat-square)]

</div>

---

## 📖 Deskripsi Proyek

**WEBSITE PUSDAT G5** adalah sebuah *tailor-made integrated system* yang dirancang khusus untuk menjawab kebutuhan operasional harian **Pusat Data (PUSDAT)** dalam mengelola, memvalidasi, dan mengaudit data institusional secara terpusat.

Proyek ini lahir dari sebuah *pain point* operasional: proses **inspeksi data manual** yang memakan waktu, rentan terhadap *human error*, dan sulit dilakukan secara real-time. Alih-alih mengandalkan spreadsheet statis dan komunikasi manual, sistem ini menggabungkan dua *interface* yang saling melengkapi:

- 🖥️ **Web Dashboard** — sebagai *command center* visual untuk auditor dan admin melakukan verifikasi berkas, filtering data, dan monitoring status.
- 🤖 **WhatsApp Bot** — sebagai *ambient interface* yang aktif 24/7 untuk mengirimkan *reminder*, *alert downtime*, dan menerima query cepat langsung dari perangkat operator.

Filosofi utama proyek ini adalah **"Automate the Inspection, Not Just the Reporting"** — sistem tidak hanya menampilkan data, tetapi secara aktif mengevaluasi kelengkapan, konsistensi, dan status sinkronisasinya dengan sistem induk.

---

## ✨ Core Features — Pusat Data Edition

Berikut adalah modul-modul kustom yang dikembangkan khusus untuk kebutuhan PUSDAT. Modul-modul ini merupakan *value proposition* utama dari repositori ini.

### 🔍 1. Modul Validasi Pendataan Otomatis

Modul ini adalah jantung dari sistem inspeksi otomatis. Alih-alih hanya menyimpan data, sistem secara aktif melakukan *schema validation* dan *completeness check* terhadap setiap entitas santri.

**Cakupan validasi meliputi:**
- 📋 **Data Identitas Diri** — NIK, tempat/tanggal lahir, jenis kelamin, data biometrik dasar.
- 👨‍👩‍👧 **Data Orang Tua / Wali** — kelengkapan identitas ayah, ibu, dan wali termasuk kontak aktif.
- 🏠 **Data Alamat KK (Kartu Keluarga)** — verifikasi alamat sesuai dokumen kependudukan resmi.
- 📬 **Data Pengiriman Majalah** — tracking status distribusi periodikal ke alamat terdaftar.

**Integrasi dengan Bot WhatsApp:**
Ketika sistem mendeteksi *missing field* atau *inconsistent data*, engine akan secara otomatis men-*trigger* WhatsApp Bot untuk mengirimkan **reminder terstruktur** ke Personal In Charge (PIC) terkait. Reminder ini bersifat *actionable* — mencantumkan nama santri, field yang kurang, dan link direct ke halaman edit di dashboard.

> **Impact:** Mengurangi *turnaround time* pelengkapan data dari hitungan minggu menjadi hitungan jam.

---

### 📸 2. Verifikasi Pemberkasan & Pasfoto Berjenjang

Kualitas *digital archive* sangat bergantung pada konsistensi format file. Modul ini menerapkan **strict validation pipeline** pada layer web dashboard untuk menjamin integritas berkas sebelum disimpan.

**Constraint yang di-enforce oleh sistem:**

| Parameter | Rule | Rationale |
|-----------|------|-----------|
| **Ukuran Berkas** | Maksimal `500 KB` | Optimasi storage & bandwidth loading |
| **Format Penamaan** | Regex pattern enforcement | Konsistensi indexing & auto-mapping ke data santri |
| **Ekstensi File** | Whitelist (`.jpg`, `.jpeg`, `.png`, `.pdf`) | Mencegah upload file berbahaya |
| **Dimensi Pasfoto** | Rasio 3x4 tervalidasi | Standar dokumen resmi |

**Progress Tracking via WhatsApp:**
Bot WhatsApp menyediakan **command khusus** yang dapat dipanggil oleh operator untuk mendapatkan *snapshot* status pemberkasan sebelum inspeksi resmi berlangsung. Bot akan me-return ringkasan berupa:
- Total berkas yang sudah masuk
- Berkas yang **rejected** karena melanggar constraint
- Berkas yang masih **pending review**
- Persentase kelengkapan per angkatan / kelas

Fitur ini memungkinkan *pre-audit* dari sisi bawah sehingga inspeksi manual hanya berfokus pada anomali.

---

### 🔄 3. Integrasi Status EMIGO (Flagging & Sync Tracking)

Salah satu tantangan pusat data adalah memastikan **data lokal tersinkronisasi** dengan sistem induk institusi (**EMIGO**). Modul ini bertindak sebagai *bridge audit layer*.

**Mekanisme Flagging:**
- ✅ **Flag `SYNCED`** — data telah berhasil diunggah ke EMIGO.
- 📧 **Flag `EMAILED`** — dokumen pendukung telah dikirim ke pihak terkait via email.
- ⚠️ **Flag `PENDING`** — data lokal ada namun belum di-sync.
- ❌ **Flag `MISMATCH`** — terdeteksi inkonsistensi antara data lokal dan EMIGO.

Setiap perubahan status dicatat dalam *audit trail* dan dapat ditelusuri melalui dashboard, sehingga tidak ada data yang "hilang di tengah jalan" antara sistem lokal dan sistem induk.

---

### 📡 4. Network & Uptime Monitoring

Karena sistem beroperasi dalam lingkungan hybrid (server lokal + cloud), stabilitas jaringan adalah *mission critical*. Modul ini menjalankan **background worker** yang secara periodik melakukan health check.

**Metrik yang dipantau:**
- 🌐 **Latency & Packet Loss** — via ICMP ping ke gateway kritikal.
- 🖥️ **Server Local Uptime** — heartbeat check ke internal services.
- ☁️ **External Dependency** — status API pihak ketiga (EMIGO endpoint, SMTP, dll).
- 🔌 **Interface Availability** — status port service dashboard.

**Real-time Alerting:**
Jika sistem mendeteksi *downtime* atau *degraded performance* melampaui threshold, WhatsApp Bot akan segera mengirim **alert prioritas** ke grup teknis, lengkap dengan:
- Timestamp kejadian
- Service/host yang terdampak
- Durasi outage yang berlangsung
- Suggested action (jika ada di *runbook*)

> **Impact:** MTTR (Mean Time To Recovery) drastis berkurang karena tim teknis mengetahui insiden sebelum end-user melaporkannya.

---

## 🏗️ Tech Stack & Arsitektur Singkat

Sistem ini dibangun dengan arsitektur **modular monorepo** yang memisahkan concern antara web layer dan bot layer, namun berbagi *shared database* dan *business logic layer*.

```
┌─────────────────────────────────────────────────────────┐
│                    WEBSITE_PUSDAT                       │
├─────────────────────────┬───────────────────────────────┤
│   🖥️ WEB DASHBOARD      │   🤖 WHATSAPP BOT             │
│   (Express + EJS/HTML)  │   (Baileys Multi-Device)     │
├─────────────────────────┴───────────────────────────────┤
│              ⚙️ SHARED BUSINESS LOGIC                    │
│  ( Validation Engine • EMIGO Sync • Monitoring Worker ) │
├─────────────────────────────────────────────────────────┤
│                   💾 DATABASE LAYER                      │
│              ( JSON Store / DB Persistent )              │
└─────────────────────────────────────────────────────────┘
```

**Stack utama:**

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js (v18+) |
| **Web Framework** | Express.js |
| **WhatsApp API** | Baileys (Multi-Device WebSocket) |
| **Deployment** | internal Website + Self-hosted (Bot) |
| **Storage** | File-based JSON + Optional DB adapter |

---

## ⚙️ Instalasi & Penggunaan

### Prasyarat

- Node.js `>= 18.x`
- npm `>= 9.x` atau yarn
- Nomor WhatsApp aktif untuk pairing bot
- Akses ke endpoint EMIGO (opsional, untuk fitur sync)

### Langkah Instalasi

```bash
# 1. Clone repositori
git clone https://github.com/raffz-afk/WEBSITE_PUSDAT_LAGI.git
cd WEBSITE_PUSDAT_LAGI

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env
# Edit file .env sesuai konfigurasi lokal Anda
# (Port, EMIGO endpoint, SMTP credentials, dll.)

# 4. Jalankan sistem
npm start
```

### Setelah Aplikasi Berjalan

1. **Web Dashboard** — akses via `http://localhost:PORT`.
2. **WhatsApp Bot** — scan QR code yang muncul di terminal untuk pairing perangkat.
3. Untuk panduan konfigurasi lebih lanjut, silakan baca:
   - 📘 [`CARA_PASANG.md`](./CARA_PASANG.md) — panduan instalasi detail
   - 📗 [`PANDUAN_INSTALASI.md`](./PANDUAN_INSTALASI.md) — panduan lengkap
   - 📕 [`CARA_TIMPA_FILE.md`](./CARA_TIMPA_FILE.md) — panduan update file

---

## 📝 Changelog

Riwayat pembaruan versi dapat ditemukan di file `CHANGELOG_v*.md` di root repositori. Versi stabil terkini: lihat [`version.txt`](./version.txt).

---

## 🙏 Kredit & Atribusi

Sistem WhatsApp Bot pada repositori ini dikembangkan di atas *base engine* dari **Azhari Creative** ([autoresbot.com](https://autoresbot.com)). Seluruh fitur *general-purpose* bot merupakan bagian dari base engine tersebut dan tetap tersedia sebagaimana aslinya.

Modul-modul yang dijelaskan pada bagian **"Core Features — Pusat Data Edition"** di atas merupakan **pengembangan kustom** yang ditulis secara independen untuk kebutuhan spesifik operasional Pusat Data, dan tidak termasuk dalam scope base engine.

> ⚠️ **Peringatan:** Script ini bersifat internal dan **tidak untuk diperjualbelikan**. Penggunaan di luar konteks institusional harus mendapat izin tertulis.

---

<div align="center">

**Built with ❤️ for Pusat Data Operations**

*Maintained by [@raffz-afk](https://github.com/raffz-afk)*

</div>
