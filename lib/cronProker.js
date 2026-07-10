/**
 * ============================================================
 *  lib/cronProker.js — 🆕 Cron Job Manajemen Proker Pusdat
 *  ★ VERSI v13.7 — DIAGNOSTIC + ROBUST CATCH-UP + STATE PERSISTEN
 * ============================================================
 *
 *  PERBAIKAN v13.7 (12 Mei 2026):
 *  ─────────────────────────────────────────────────────────
 *  Mengatasi kasus broadcast pagi yang seharusnya jam 07:00
 *  tetapi malah baru terkirim sekitar 08:03. Penyebab:
 *    1. Reconnect WA sesudah 07:00 → catchUp 5s tidak cukup
 *       karena state `lastBroadcastPagiDate` di-reset setiap
 *       restart process; status `proker_pagi.submitted` belum
 *       sempat ter-update sehingga catch-up cuma jalan satu kali
 *       lalu lebih banyak tertunda karena timing 5s/8s.
 *    2. Tidak ada cron tick ringan untuk re-cek hari yang
 *       broadcast paginya masih missing.
 *    3. Tidak ada log diagnostik per-tick agar mudah dilacak.
 *
 *  YANG SAYA TAMBAHKAN:
 *    • State `lastBroadcastPagiDate` kini di-persist ke
 *      `database/proker/last_broadcast.json`.
 *    • Cron tambahan tiap menit dari 07:01 → 09:00 untuk
 *      auto catch-up bila broadcast belum jalan.
 *    • Cron tambahan tiap 5 menit dari 09:00 → 11:00 untuk
 *      pengaman tambahan kalau bot baru hidup pasca 09:00.
 *    • catchUpBroadcastPagi() sekarang LOG penuh: jam,
 *      socket, lastDate, last-submitted, dll.
 *    • updateProkerSocket() men-trigger catch-up DUA kali:
 *      langsung (1s) dan retry (15s) — supaya bila pada saat
 *      reconnect socket belum siap (ack belum settle), masih
 *      ada kesempatan kedua.
 *    • Memperluas window catch-up sampai jam 11:00 (sebelumnya
 *      hanya 07:00–09:00) agar reconnect agak telat tetap dapat
 *      broadcast pagi.
 *
 *  Sisanya v13.6 dipertahankan (Jumat auto-libur, anti dup,
 *  dst).
 *
 * ============================================================
 */

import cron from 'node-cron';
import moment from 'moment-timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getStafPiketHariIni,
  getStafByWA,
  getRecordHariIni,
  getRecordKemarin,
  formatProkerTahunanText,
  formatProkerBulananText,
  buildMentionStafPiket,
  isAwalBulanHijriyah,
  setFlagPerluPerbaruiBulanan,
  getHijriyahHariIni,
  isHariIniLibur,
  isJumatHariIni,
  logSpamMulai,
  logSpamTambah,
  logSpamBerhenti,
} from './prokerManager.js';
import { readPusdatSettings } from './dbAccess.js';
import config from '../config.js';

// ══════════════════════════════════════════════════
//  STATE INTERNAL
// ══════════════════════════════════════════════════
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const STATE_DIR = path.resolve(ROOT_DIR, 'database', 'proker');
const STATE_FILE = path.join(STATE_DIR, 'last_broadcast.json');

let waSocket = null;
let spamIntervals = new Map();
let currentTasks = [];
let initCount = 0;
const TZ = 'Asia/Jakarta';

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) || {};
  } catch (err) {
    console.error('[PROKER CRON] ⚠️ Gagal baca state:', err.message);
    return {};
  }
}

function writeState(data) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[PROKER CRON] ⚠️ Gagal tulis state:', err.message);
  }
}

function getLastBroadcastDate() {
  return readState().lastBroadcastPagiDate || null;
}

function setLastBroadcastDate(dateStr) {
  const cur = readState();
  cur.lastBroadcastPagiDate = dateStr;
  cur.lastBroadcastPagiAt = moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss');
  writeState(cur);
}

export function updateProkerSocket(sock) {
  waSocket = sock;
  console.log('[PROKER CRON] 🔄 Socket WA diperbarui (tanpa init ulang).');
  // v13.7: dua kali catch-up — antisipasi reconnect race
  setTimeout(() => catchUpBroadcastPagi('socket-update-1s'), 1500);
  setTimeout(() => catchUpBroadcastPagi('socket-update-15s'), 15000);
}

// ══════════════════════════════════════════════════
//  STOP semua cron task lama
// ══════════════════════════════════════════════════
export function stopAllProkerCron() {
  if (!currentTasks.length) return 0;
  let stopped = 0;
  for (const t of currentTasks) {
    try {
      t.stop();
      stopped++;
    } catch (e) {
      console.error('[PROKER CRON] ❌ Gagal stop task:', e.message);
    }
  }
  currentTasks = [];
  console.log(`[PROKER CRON] ⏹️ ${stopped} cron task lama dihentikan.`);
  return stopped;
}

// ══════════════════════════════════════════════════
//  HELPER: kirim ke target grup pusdat
// ══════════════════════════════════════════════════
function getGrupTarget() {
  try {
    const s = readPusdatSettings();
    return s.targetGroups || [];
  } catch {
    return [];
  }
}

async function kirimGrup(text, mentions = []) {
  if (!waSocket) {
    console.warn('[PROKER CRON] ⚠️ Socket WA belum siap saat akan kirim grup.');
    return;
  }
  const grupTarget = getGrupTarget();
  if (!grupTarget.length) {
    console.warn('[PROKER CRON] ⚠️ Tidak ada targetGroups terdaftar.');
    return;
  }
  for (const jid of grupTarget) {
    try {
      await waSocket.sendMessage(jid, { text, mentions });
    } catch (err) {
      console.error(`[PROKER CRON] ❌ Gagal kirim ke ${jid}:`, err.message);
    }
  }
}

async function kirimPribadi(wa, text) {
  if (!waSocket) return;
  const jid = `${wa}@s.whatsapp.net`;
  try {
    await waSocket.sendMessage(jid, { text });
  } catch (err) {
    console.error(`[PROKER CRON] ❌ Gagal kirim japri ${wa}:`, err.message);
  }
}

// ══════════════════════════════════════════════════
//  PESAN TEMPLATE
// ══════════════════════════════════════════════════
function buildPesanBroadcastPagi() {
  const tgl = moment().tz(TZ).format('dddd, DD MMMM YYYY');
  const hijri = getHijriyahHariIni();
  const kemarin = getRecordKemarin();

  let evalText = '_Tidak ada laporan kemarin._';
  if (kemarin?.status === 'libur') {
    evalText = `┃ 🏖️ _Kemarin libur — tidak ada evaluasi._`;
  } else if (kemarin?.laporan_bakdiyah?.submitted) {
    const selesai = kemarin.laporan_bakdiyah.selesai || [];
    const belum = kemarin.laporan_bakdiyah.belum_selesai || [];
    evalText =
      `┃ ✅ Selesai: ${selesai.length} poin\n` +
      (selesai.length ? selesai.map((s, i) => `┃   ${i + 1}. ${s}`).join('\n') + '\n' : '') +
      `┃ ⏳ Belum Selesai (jadi evaluasi hari ini): ${belum.length} poin\n` +
      (belum.length ? belum.map((s, i) => `┃   ${i + 1}. ${s}`).join('\n') : '┃   _Nihil_');
  }

  const { teksMention, stafs } = buildMentionStafPiket();
  const stafLine = stafs.length
    ? stafs.map((s) => `• *${s.nama}* (${s.hari_label})`).join('\n')
    : '_Tidak ada staf piket terjadwal hari ini._';

  return (
    `🌅 *BROADCAST PAGI — PUSDAT GONTOR 5*\n` +
    `📅 ${tgl}\n` +
    `🕌 ${hijri.hari} ${hijri.bulan} ${hijri.tahun} H\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📊 *EVALUASI KEMARIN*\n${evalText}\n\n` +
    `${formatProkerTahunanText()}\n\n` +
    `${formatProkerBulananText()}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *STAF PIKET HARI INI:*\n${stafLine}\n\n` +
    `${teksMention}\n` +
    `Mohon segera setor *Proker Hari Ini* dengan command:\n` +
    `*.proker [list proker]*\n\n` +
    `*Contoh:*\n` +
    `\`\`\`\n.proker\n1. Backup database santri\n2. Audit berkas kelas 6\n3. Update absensi guru\n\`\`\`\n\n` +
    `🏖️ _Hari libur? Cukup ketik:_ *.proker libur*\n\n` +
    `⏰ Batas waktu: *07:30 WIB*\n` +
    `⚠️ _Lewat batas → sistem peringatan otomatis aktif._`
  );
}

function buildPesanBroadcastJumat() {
  const tgl = moment().tz(TZ).format('dddd, DD MMMM YYYY');
  const hijri = getHijriyahHariIni();
  const { teksMention, stafs } = buildMentionStafPiket();
  const stafLine = stafs.length
    ? stafs.map((s) => `• *${s.nama}* (${s.hari_label})`).join('\n')
    : '_(tidak ada jadwal Jumat)_';

  return (
    `🕌 *JUMAT MUBARAK — PUSDAT GONTOR 5*\n` +
    `📅 ${tgl}\n` +
    `🕌 ${hijri.hari} ${hijri.bulan} ${hijri.tahun} H\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🏖️ *Hari ini Jumat — LIBUR otomatis.*\n\n` +
    `Tidak ada setoran proker maupun laporan bakdiyah.\n` +
    `Selamat beribadah & beristirahat untuk seluruh asatidz dan staf.\n\n` +
    `👤 *Jadwal Piket:*\n${stafLine}\n\n` +
    `${teksMention}\n` +
    `_Reminder & spam otomatis 07:30 dan 12:00 di-nonaktifkan hari ini._`
  );
}

function buildPesanSpam(staf) {
  return (
    `🚨 *PERINGATAN KERAS — PROKER BELUM DISETOR* 🚨\n\n` +
    `${staf.nama}, Anda piket hari ini namun belum mengirimkan *Proker Hari Ini*.\n\n` +
    `Kirim segera, contoh:\n` +
    `\`\`\`\n.proker\n1. Backup database santri\n2. Audit berkas kelas 6\n3. Update absensi guru\n\`\`\`\n\n` +
    `🏖️ _Atau jika hari ini libur:_ *.proker libur*\n\n` +
    `_Pesan ini akan terus terkirim 2x/menit hingga laporan masuk._`
  );
}

function buildPesanReminderBakdiyah(staf) {
  return (
    `🕛 *REMINDER LAPORAN BAKDIYAH*\n\n` +
    `${staf.nama}, mohon kirim laporan hasil kerja hari ini.\n\n` +
    `*Format:*\n` +
    `\`\`\`\n.lapharian\n#selesai\n- Backup database santri\n- Update absensi guru\n#belum\n- Audit berkas kelas 6\n- Input angket kelas 6\n\`\`\`\n\n` +
    `_💡 Tag bisa pakai spasi atau huruf besar/kecil (mis. '# Selesai')._\n` +
    `🏖️ _Hari libur? Cukup ketik:_ *.lapharian libur*`
  );
}

// ══════════════════════════════════════════════════
//  SPAM ENGINE — 2x per menit, stop saat submit
// ══════════════════════════════════════════════════
export function mulaiSpam(staf) {
  if (spamIntervals.has(staf.id)) return;

  if (isJumatHariIni()) {
    console.log(`[PROKER CRON] 🕌 Jumat — spam untuk ${staf.nama} TIDAK dimulai.`);
    return;
  }
  if (isHariIniLibur()) {
    console.log(`[PROKER CRON] 🏖️ Hari libur — spam untuk ${staf.nama} TIDAK dimulai.`);
    return;
  }

  console.log(`[PROKER CRON] 🚨 Mulai spam untuk ${staf.nama} (${staf.wa})`);
  logSpamMulai();

  kirimPribadi(staf.wa, buildPesanSpam(staf));
  kirimGrup(buildPesanSpam(staf), [`${staf.wa}@s.whatsapp.net`]);
  logSpamTambah();

  const id = setInterval(async () => {
    if (isJumatHariIni() || isHariIniLibur()) {
      hentikanSpam(staf.id);
      return;
    }

    const rec = getRecordHariIni();
    if (rec?.proker_pagi?.submitted) {
      hentikanSpam(staf.id);
      return;
    }
    await kirimPribadi(staf.wa, buildPesanSpam(staf));
    await kirimGrup(buildPesanSpam(staf), [`${staf.wa}@s.whatsapp.net`]);
    logSpamTambah();
  }, 30 * 1000);

  spamIntervals.set(staf.id, id);
}

export function hentikanSpam(stafId) {
  const id = spamIntervals.get(stafId);
  if (id) {
    clearInterval(id);
    spamIntervals.delete(stafId);
    logSpamBerhenti();
    console.log(`[PROKER CRON] ✅ Spam berhenti untuk staf ${stafId}`);
  }
}

export function hentikanSemuaSpam() {
  for (const [id, intv] of spamIntervals.entries()) {
    clearInterval(intv);
    spamIntervals.delete(id);
  }
  logSpamBerhenti();
}

// ══════════════════════════════════════════════════
//  BROADCAST PAGI — extracted, reusable + Jumat-aware
// ══════════════════════════════════════════════════
async function jalankanBroadcastPagi(reason = 'cron') {
  try {
    const stafs = getStafPiketHariIni();
    const { mentions } = buildMentionStafPiket();
    const now = moment().tz(TZ);
    const tgl = now.format('YYYY-MM-DD');

    if (isJumatHariIni()) {
      const pesan = buildPesanBroadcastJumat();
      await kirimGrup(pesan, mentions);
      setLastBroadcastDate(tgl);
      console.log(`[PROKER CRON] 🕌 Broadcast Jumat (libur) terkirim (${reason}).`);
      return;
    }

    const pesan = buildPesanBroadcastPagi();
    await kirimGrup(pesan, mentions);
    setLastBroadcastDate(tgl);
    console.log(
      `[PROKER CRON] 📢 Broadcast pagi terkirim (${reason}). Staf piket: ${
        stafs.map((s) => s.nama).join(', ') || '(none)'
      }`,
    );
  } catch (err) {
    console.error('[PROKER CRON] ❌ Broadcast pagi gagal:', err.message);
  }
}

// ══════════════════════════════════════════════════
//  CATCH-UP — kalau missed cron 07:00, kirim broadcast pagi
//  ★ v13.7: window 07:00–11:00, log diagnostik penuh
// ══════════════════════════════════════════════════
async function catchUpBroadcastPagi(reason = 'manual') {
  const now = moment().tz(TZ);
  const hari = now.format('YYYY-MM-DD');
  const jam = now.hour();
  const menit = now.minute();
  const totalMenit = jam * 60 + menit;
  const lastDate = getLastBroadcastDate();

  const ctx = `hari=${hari} jam=${now.format('HH:mm')} reason=${reason} lastDate=${lastDate || '-'}`;

  if (!waSocket) {
    console.log(`[PROKER CRON] ⏭️ Catch-up SKIP (socket null). ${ctx}`);
    return;
  }

  // Window catch-up diperluas: 07:00 → 11:00
  if (totalMenit < 7 * 60 || totalMenit > 11 * 60) {
    return;
  }

  if (lastDate === hari) {
    return;
  }

  console.log(
    `[PROKER CRON] 🔁 Catch-up: broadcast pagi belum terkirim hari ini → menjalankan sekarang. ${ctx}`,
  );
  await jalankanBroadcastPagi(`catch-up:${reason}`);
}

// ══════════════════════════════════════════════════
//  CRON JOBS — v13.7: Jumat-aware + auto catch-up
// ══════════════════════════════════════════════════
export function initCronProker(sock) {
  waSocket = sock;
  initCount++;

  if (currentTasks.length > 0) {
    console.log(
      `[PROKER CRON] ⚠️ Init ke-${initCount}, ${currentTasks.length} task lama akan dihentikan dulu.`,
    );
    stopAllProkerCron();
  } else {
    console.log(`[PROKER CRON] ✔ Init ke-${initCount} (fresh start).`);
  }

  // ── 06:55 — Cek awal bulan Hijriyah ──
  const taskHijri = cron.schedule(
    '55 6 * * *',
    async () => {
      if (isAwalBulanHijriyah()) {
        const h = getHijriyahHariIni();
        setFlagPerluPerbaruiBulanan(true);
        const owners = config.owner_number || [];
        const teks =
          `🌙 *AWAL BULAN HIJRIYAH BARU*\n\n` +
          `Hari ini *1 ${h.bulan} ${h.tahun} H*.\n\n` +
          `Mohon segera perbarui daftar Proker Bulanan di file:\n` +
          `\`database/proker/proker_bulanan.json\`\n\n` +
          `_Flag perlu_diperbarui sudah diaktifkan otomatis._`;
        for (const o of owners) await kirimPribadi(o, teks);
        await kirimGrup(teks);
      }
    },
    { scheduled: true, timezone: TZ },
  );
  currentTasks.push(taskHijri);

  // ── 07:00 — Broadcast Pagi ──
  const taskPagi = cron.schedule(
    '0 7 * * *',
    async () => {
      console.log('[PROKER CRON] ⏰ Tick 07:00 — jalankan broadcast pagi.');
      await jalankanBroadcastPagi('cron-07:00');
    },
    { scheduled: true, timezone: TZ },
  );
  currentTasks.push(taskPagi);

  // ── ★ v13.7: AUTO CATCH-UP TIAP MENIT (07:01 → 08:59) ──
  const taskCatchUpDense = cron.schedule(
    '1-59 7-8 * * *',
    async () => {
      await catchUpBroadcastPagi('auto-1min');
    },
    { scheduled: true, timezone: TZ },
  );
  currentTasks.push(taskCatchUpDense);

  // ── ★ v13.7: AUTO CATCH-UP TIAP 5 MENIT (09:00 → 11:00) ──
  const taskCatchUpSparse = cron.schedule(
    '*/5 9-10 * * *',
    async () => {
      await catchUpBroadcastPagi('auto-5min');
    },
    { scheduled: true, timezone: TZ },
  );
  currentTasks.push(taskCatchUpSparse);

  // ── 07:30 — Cek submit, mulai spam jika belum & tidak libur ──
  const taskSpam = cron.schedule(
    '30 7 * * *',
    async () => {
      if (isJumatHariIni()) {
        console.log('[PROKER CRON] 🕌 Hari Jumat — spam 07:30 di-SKIP.');
        return;
      }
      if (isHariIniLibur()) {
        console.log('[PROKER CRON] 🏖️ Hari libur — spam 07:30 di-SKIP.');
        return;
      }

      const rec = getRecordHariIni();
      if (rec?.proker_pagi?.submitted) {
        console.log('[PROKER CRON] ✅ Proker pagi sudah submit, tidak spam.');
        return;
      }
      const stafs = getStafPiketHariIni();
      if (stafs.length === 0) {
        console.log('[PROKER CRON] ℹ️ Tidak ada staf piket hari ini.');
        return;
      }
      for (const s of stafs) mulaiSpam(s);
    },
    { scheduled: true, timezone: TZ },
  );
  currentTasks.push(taskSpam);

  // ── 12:00 — Reminder Bakdiyah ──
  const taskBakdiyah = cron.schedule(
    '0 12 * * *',
    async () => {
      if (isJumatHariIni()) {
        console.log('[PROKER CRON] 🕌 Hari Jumat — reminder bakdiyah 12:00 di-SKIP.');
        return;
      }
      if (isHariIniLibur()) {
        console.log('[PROKER CRON] 🏖️ Hari libur — reminder bakdiyah 12:00 di-SKIP.');
        return;
      }

      const stafs = getStafPiketHariIni();
      for (const s of stafs) {
        await kirimPribadi(s.wa, buildPesanReminderBakdiyah(s));
      }
      const teksGrup =
        `🕛 *REMINDER LAPORAN BAKDIYAH*\n\n` +
        `${stafs.map((s) => `@${s.wa}`).join(' ')}\n` +
        `Mohon kirim laporan hasil kerja hari ini via *.lapharian*.\n` +
        `🏖️ _Hari libur? Cukup ketik:_ *.lapharian libur*`;
      const mentions = stafs.map((s) => `${s.wa}@s.whatsapp.net`);
      await kirimGrup(teksGrup, mentions);
    },
    { scheduled: true, timezone: TZ },
  );
  currentTasks.push(taskBakdiyah);

  console.log(
    `[PROKER CRON] ✅ ${currentTasks.length} cron task aktif (06:55, 07:00, catch-up dense 7-8, sparse 9-10, 07:30, 12:00 WIB).`,
  );

  setTimeout(() => catchUpBroadcastPagi('init-8s'), 8000);
  setTimeout(() => catchUpBroadcastPagi('init-30s'), 30000);
}

// expose helper untuk testing
export const _internal = {
  readState,
  writeState,
  getLastBroadcastDate,
  setLastBroadcastDate,
  catchUpBroadcastPagi,
  jalankanBroadcastPagi,
};
