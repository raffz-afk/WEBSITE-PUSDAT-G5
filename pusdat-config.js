/**
 * ============================================================
 *  pusdat-config.js — Konfigurasi Khusus Fitur Pusdat Gontor 5
 *  ★ VERSI v13 — Mega Update: Rate Limit, Dashboard, AI, i18n
 * ============================================================
 *
 *  INSTRUKSI:
 *  1. Letakkan file ini di root project (sejajar dengan config.js)
 *  2. Isi GRUP_STAF_PUSDAT_ID dengan ID Grup WA staf Pusdat
 *  3. Isi GRUP_ASATIDZ_ID dengan ID Grup WA Asatidz
 *  4. ★ BARU: Isi OPENAI_API_KEY untuk fitur Voice→Text Whisper
 *  5. ★ BARU: Ubah DASHBOARD_PASSWORD demi keamanan!
 *
 * ============================================================
 */

const pusdatConfig = {
  // ─── ID Grup WhatsApp Staf Pusdat ────────────────────
  GRUP_STAF_PUSDAT_ID: '120363278022742263@g.us',

  // ─── ID Grup WhatsApp Asatidz / Guru ─────────────────
  GRUP_ASATIDZ_ID: '120363348434863768@g.us',

  // ─── Nama Database ───────────────────────────────────
  DB_FILENAME: 'DB Guru 2026-2027.accdb',
  DB_SANTRI_FILENAME: 'DB Santri 2026-2027.accdb',

  // ─── Pesan Bot ───────────────────────────────────────
  BOT_NAME: 'Pusdat Gontor 5',
  BOT_WATERMARK: '🏫 _Pusat Data PMDG Kampus 5 Magelang_',

  // ─── Session Timeout (milidetik) ─────────────────────
  SESSION_TIMEOUT: 5 * 60 * 1000,

  // ─── Fitur yang membutuhkan gateway ──────────────────
  GATEWAY_COMMANDS: ['cek', 'revisi'],

  // ─── Fitur publik (tanpa gateway) ────────────────────
  PUBLIC_COMMANDS: ['absen', 'daftar', 'lapor'],

  // ══════════════════════════════════════════════════
  //  🆕 v13: KONFIGURASI FITUR BARU
  // ══════════════════════════════════════════════════

  // ─── 🌐 Dashboard Web Mini ──────────────────────────
  DASHBOARD_ENABLED: true,                  // true/false
  DASHBOARD_PORT: 3000,                     // port server Express
  DASHBOARD_PASSWORD: 'bismillah',            // ⚠️ UBAH SEGERA!
  DASHBOARD_SESSION_SECRET: 'nosystemissafe',
  DASHBOARD_PUBLIC_URL: 'http://10.1.1.21:3000',
  // ↑ Kalau bot di-deploy ke server publik, ganti ke domain asli
  //   Contoh: 'https://dashboard.pusdat-gontor5.com'
  //   URL ini yg muncul di link preview WhatsApp.

  // ─── 🎙️ OpenAI Whisper (Voice → Text) ───────────────
  // Daftar di https://platform.openai.com → API Keys
  // Format: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  OPENAI_API_KEY: 'ISI_API_KEY_ANDA_DISINI',                       // ISI DI SINI ATAU PAKAI ENV VAR

  // ─── 📤 Upload Berkas ───────────────────────────────
  UPLOAD_BERKAS_ROOT: 'D:\\PUSAT DATA 2026\\01. MASTER DATA SANTRI\\01. BERKAS SANTRI',
  UPLOAD_MAX_SIZE_MB: 10,                   // max ukuran file

  // ─── ⏱️ Rate Limiting ───────────────────────────────
  RATE_LIMIT_HEAVY_PER_MINUTE: 1,           // 1x per menit per user
  RATE_LIMIT_ABUSE_THRESHOLD: 5,            // >5x dlm 1 menit = curiga
  RATE_LIMIT_BLOCK_DURATION_MIN: 2,         // blokir 2 menit
};

export default pusdatConfig;
