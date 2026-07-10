# Cara Pasang Update v15.0 — Data Center G5

Ekstrak ZIP ini, lalu **timpa langsung** ke folder bot Anda
(struktur foldernya sudah sama persis dengan struktur project).

## File yang ditimpa
- `lib/dashboard.js`        ← redesign + brand + endpoint poster HD
- `lib/linkPreview.js`      ← kirim image PNG HD + caption
- `lib/cronBroadcast.js`    ← caption broadcast mewah & rapi

## File baru (logo khat adaptif)
- `dashboard/public/img/logo-dark.png`        (1024×1024, untuk tema terang)
- `dashboard/public/img/logo-light.png`       (1024×1024, untuk tema gelap)
- `dashboard/public/img/logo-dark-512.png`
- `dashboard/public/img/logo-light-512.png`
- `dashboard/public/img/favicon.png`          (256×256)

## Langkah
1. **Stop bot** (Ctrl+C di terminal yang menjalankan `node index.js`)
2. Backup folder lama (opsional tapi disarankan):
   - copy `lib/dashboard.js` → `lib/dashboard.js.bak`
   - copy `lib/linkPreview.js` → `lib/linkPreview.js.bak`
   - copy `lib/cronBroadcast.js` → `lib/cronBroadcast.js.bak`
3. **Ekstrak ZIP ini** ke folder bot Anda, pilih "Replace all".
4. Pastikan folder `dashboard/public/img/` sudah berisi 5 PNG di atas.
5. Jalankan ulang: `node index.js`
6. Buka:
   - `http://192.178.1.13:3000/`            (dashboard utama)
   - `http://192.178.1.13:3000/preview-card` (poster broadcast)
   - `http://192.178.1.13:3000/og-image`    (PNG HD 2160×2700)

## Catatan
- Brand kini: **Data Center G5**, tidak ada lagi "PD5".
- Logo khat **adaptif**: terang→khat gelap, gelap→khat terang.
- Distribusi kelas → **Rekap Jumlah Santri per Kelas** (semua kelas).
- Berkas dashboard: hanya **Foto / Ijazah / Akta / KK** (primer).
- Panel "Catatan Broadcast WhatsApp" sudah dihapus dari halaman utama.
- Broadcast cron 07:00 → kirim **image PNG HD** + caption rapi.

Tidak ada perubahan pada `pusdat-config.js`, `index.js`, `database/`, dsb.
Anda tidak perlu menyentuhnya.
