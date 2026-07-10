# 🛠️ HOTFIX BOT PUSDAT GONTOR 5 — v13.5

**Tanggal:** 4 Mei 2026
**Status:** Hotfix lanjutan setelah v13.4 — fix parser & mode libur
**Prasyarat:** v13.4 sudah terpasang (cron tidak duplikat lagi). Kalau belum, pasang v13.4 dulu.

---

## ✅ KONFIRMASI BUG SEBELUMNYA YANG SUDAH FIXED

Dari log Anda:
```
[BOOT] 🔄 Reconnect detected — updating socket reference only (no re-init).
[🔔 CRON BROADCAST] Socket WhatsApp diperbarui (tanpa init ulang).
[PROKER CRON] 🔄 Socket WA diperbarui (tanpa init ulang).
```
✅ **Anti-duplikasi cron jam 7 & 12 → BERHASIL.** Tidak akan ada lagi spam ganda.

---

## 🐛 BUG BARU YANG DIPERBAIKI DI v13.5

### Bug #1 — Parser `# selesai` & `# belum` patah
**Bukti dari log Anda:**
```
[.lapharian] Content : libur
# selesai
# belum
-belum selesia input data santri baru
[.lapharian] ℹ️ Tag tidak ada → auto-prepend #selesai   ← SALAH
[.lapharian] ✅ Tersimpan. selesai=4, belum=0           ← SEMUA masuk selesai
```

**Root cause:**
- User mengetik `# selesai` (ada **spasi** setelah `#`).
- `prokerManager.js` cari literal `'#selesai'` (tanpa spasi) via `indexOf` → tidak ketemu.
- `lapharian.js` cek `lower.includes('#selesai')` → `false` → fallback "auto-prepend selesai" → semua poin masuk ke selesai, dan tag `# belum` ikut tersimpan sebagai item.

**✅ Fix:** Parser baru pakai **regex case-insensitive**: `/#\s*selesai\s*:?/i` dan `/#\s*belum\s*:?/i`. Sekarang menerima:
| Input pengguna | Hasil parse |
|---|---|
| `#selesai` | ✅ |
| `# selesai` (spasi) | ✅ |
| `#Selesai` (huruf besar) | ✅ |
| `# SELESAI:` (titik dua) | ✅ |
| `#  selesai  :` (banyak spasi) | ✅ |
| `# Belum Selesai` (sinonim) | ✅ |

Saya juga sudah jalankan **9 unit test** di sandbox dengan input persis dari log Anda — semua lulus:

```
──── Kasus log user (# selesai dengan spasi) ────
INPUT: "libur\n# selesai\n# belum\n-belum selesia input data santri baru"
SELESAI: []                                                    ← BENAR (kosong)
BELUM  : [ 'belum selesia input data santri baru' ]            ← BENAR

──── Format normal (Skenario A user) ────
SELESAI: [ 'Membersihkan ruang server', 'Update database santri' ]
BELUM  : [ 'Rekap absensi ustadz' ]                            ← PERSIS sesuai ekspektasi Anda
```

### Bug #2 — Mode libur tidak menghentikan spam
**Masalah:** `.lapharian libur` & `.proker libur` belum auto-set `proker_pagi.submitted=true`, jadi cron 07:30 tetap mulai spam meskipun sudah lapor libur.

**✅ Fix:** Tambah fungsi baru `setLiburHariIni()` di `prokerManager.js` yang sekaligus:
1. Set `status: 'libur'` di record harian (field baru).
2. Set `proker_pagi.submitted = true` (auto matikan spam 07:30).
3. Set `laporan_bakdiyah.submitted = true` (skip reminder 12:00).
4. Plugin `.lapharian` & `.proker` panggil `hentikanSpam(staf.id)` → clear interval yang sedang berjalan.

Cron 07:30 dan 12:00 juga sekarang **double-check `isHariIniLibur()`** — bahkan kalau ada race condition, spam tidak akan menyala saat status libur.

### Bug #3 (BONUS) — Broadcast pagi MISSED saat reconnect
**Bukti dari log Anda (jam 06:55–07:30 di tanggal 4 Mei):**
```
[NODE-CRON] [WARN] missed execution at Mon May 04 2026 06:55:00
[NODE-CRON] [WARN] missed execution at Mon May 04 2026 07:00:00
[NODE-CRON] [WARN] missed execution at Mon May 04 2026 07:30:00
```

Bot **reconnect tepat saat jam 07:00** (lihat: `[07:27] Koneksi Terhubung`) → broadcast pagi tidak terkirim hari itu.

**✅ Fix:** Tambah **catch-up logic** di `cronProker.js`:
- Setiap kali socket re-connect, cek apakah broadcast pagi hari ini sudah dikirim.
- Kalau jam sekarang antara 07:00–09:00 dan belum dikirim → **kirim sekarang**.
- Window 07:00–09:00 dipilih agar tidak random kirim siang.

### Bug #4 (BONUS) — Format input user yang fleksibel
- `.lapharian` tanpa tag: otomatis dianggap selesai semua.
- `.lapharian` dengan numbering `1. xxx` / `1) xxx`: bullet/nomor di-strip otomatis.
- `# Belum` ditulis sebelum `# selesai`: parser tetap menangkap urutan benar.

---

## 📦 FILE YANG PERLU DITIMPA (4 file)

| # | File | Ukuran | Perubahan utama |
|---|---|---|---|
| 1 | `lib/prokerManager.js` | 17.5 KB | Parser regex baru + `setLiburHariIni()` + `isLiburKeyword()` |
| 2 | `lib/cronProker.js` | 13.3 KB | Libur-aware (skip spam) + catch-up broadcast |
| 3 | `plugins/PUSDAT/lapharian.js` | 9.3 KB | Pakai parser baru + mode libur bypass |
| 4 | `plugins/PUSDAT/proker.js` | 8.0 KB | Mode `.proker libur` + bypass spam |

> File dari v13.4 yang TIDAK berubah lagi: `lib/cronBroadcast.js`, `lib/connection.js`, `handle/voiceLapor.js`. **Tidak perlu ditimpa ulang.**

---

## 🚀 CARA PASANG

1. **Backup dulu:** copy 4 file di atas dari project Anda ke folder backup.
2. Ekstrak `pusdat-fix-v13.5.zip`.
3. Drag `lib/` & `plugins/` ke root folder bot → **Replace All**.
4. Restart bot:
   ```bash
   pm2 restart all
   # atau
   node index.js
   ```

---

## ✅ VERIFIKASI

### Test 1 — Format normal (Skenario A)
Kirim ke bot:
```
.lapharian
# selesai
- Membersihkan ruang server
- Update database santri
# belum
- Rekap absensi ustadz
```

**Ekspektasi balasan bot:**
```
✅ LAPORAN BAKDIYAH TERSIMPAN
✅ Selesai: 2 poin
   1. Membersihkan ruang server
   2. Update database santri
⏳ Belum Selesai: 1 poin
   1. Rekap absensi ustadz
```

Cek juga di `database/proker/laporan_harian.json`:
```json
"laporan_bakdiyah": {
  "submitted": true,
  "selesai": ["Membersihkan ruang server", "Update database santri"],
  "belum_selesai": ["Rekap absensi ustadz"]
}
```

### Test 2 — Mode libur
Kirim:
```
.lapharian libur
```
atau
```
.proker libur
```

**Ekspektasi balasan bot:** `✅ Laporan diterima. Selamat beristirahat, Al-Ustadz Xxx! 🏖️`

Cek di `database/proker/laporan_harian.json`:
```json
{
  "tanggal": "2026-05-XX",
  "status": "libur",                  ← field baru
  "proker_pagi": { "submitted": true, "isi": "(LIBUR — tidak ada agenda hari ini)" },
  "laporan_bakdiyah": { "submitted": true, "selesai": [], "belum_selesai": [] },
  "libur_via": "lapharian"
}
```

### Test 3 — Spam tidak menyala saat libur
1. Kirim `.proker libur` jam 07:00.
2. Tunggu sampai jam 07:30.
3. **Tidak boleh ada spam peringatan**. Console log:
   ```
   [PROKER CRON] 🏖️ Hari libur — spam 07:30 di-SKIP.
   ```

### Test 4 — Catch-up broadcast pagi
1. Matikan bot jam 06:50.
2. Hidupkan kembali jam 07:30.
3. Console log:
   ```
   [PROKER CRON] 🔁 Catch-up: jam 07:30 WIB, broadcast pagi belum terkirim hari ini.
   [PROKER CRON] 📢 Broadcast pagi terkirim (catch-up).
   ```

### Test 5 — Variasi format diterima
Coba berbagai gaya tag, semua harus tersimpan benar:
- `# selesai` / `#selesai` / `#Selesai` / `# SELESAI:` ✅
- `# belum` / `#belum` / `#Belum` / `# BELUM:` ✅
- Numbering `1. xxx` atau `1) xxx` ✅
- Bullet `- ` / `• ` / `* ` ✅

---

## 🔍 LOGGING YANG MEMBANTU

Setiap kali `.lapharian` dipanggil, console akan menampilkan:
```
[.lapharian] ═══════════════════════════════════
[.lapharian] Sender raw  : 628137273366@s.whatsapp.net
[.lapharian] Content     : # selesai\n- Membersihkan...
[.lapharian] Sender num  : 628137273366 (via direct)
[.lapharian] ✅ Staf match: Al-Ustadz Ichsan (via exact)
[.lapharian] 📋 Preview parse → selesai=2, belum=1
[.lapharian]    SELESAI : [ 'Membersihkan ruang server', 'Update database santri' ]
[.lapharian]    BELUM   : [ 'Rekap absensi ustadz' ]
[.lapharian] ✅ Tersimpan. selesai=2, belum=1
[.lapharian] ═══════════════════════════════════
```

Kalau ada bug lagi, cukup kirim potongan log seperti ini ke saya — sangat mudah dilacak.

---

## 📋 RINGKASAN

| Bug Lama | Status v13.5 |
|---|---|
| Cron 07:00 & 12:00 berlipat ganda | ✅ Sudah fixed di v13.4, tetap stabil |
| `# selesai` dengan spasi → semua masuk selesai | ✅ Fixed dengan regex robust |
| Tag tertulis sebagai item laporan | ✅ Fixed (parser strip tag) |
| `.lapharian libur` tidak matikan spam | ✅ Fixed via `setLiburHariIni()` |
| `.proker libur` belum ada | ✅ Mode baru ditambahkan |
| Broadcast pagi missed saat reconnect | ✅ Fixed dengan catch-up logic |

— Hotfix v13.5 (cumulative dengan v13.4)
