/**
 * ============================================================
 *  lib/cronBroadcast.js — Automasi Broadcast Harian Pusdat
 *  ★ VERSI v15.0 — Caption mewah & rapi + brand "Data Center G5"
 *
 *  Caption sekarang punya:
 *   - Header brand + tagline
 *   - Divider tipis
 *   - Section Statistik / Pengurangan / Milad / Dashboard
 *   - Bullet & line-break yang konsisten (tidak menyatu di WA)
 *   - Footer "Sistem Pusat Data" dengan tanda tangan tipis
 * ============================================================
 */

import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import {
  getDailyPusdatStats,
  getAllTanggalLahirGuru,
  getAllTanggalLahirSantri,
  normalizeDate,
} from './dbAccess.js';
import { sendDashboardImageBroadcast } from './linkPreview.js';
import { getDashboardUrl } from './dashboard.js';
import pusdatConfig from '../pusdat-config.js';

const SETTINGS_PATH = path.resolve(process.cwd(), 'database', 'pusdat_settings.json');

const BRAND_NAME = 'Data Center G5';
const BRAND_TAGLINE = 'Pusat Data PMDG Kampus 5 Magelang';
const DIVIDER = '━━━━━━━━━━━━━━━━━━━━';

let waSocket = null;
let currentCronTask = null;
let isInitialized = false;
let initCount = 0;

function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      const defaultSettings = { broadcastTime: '07:00', targetGroups: [] };
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(defaultSettings, null, 2), 'utf-8');
      console.log(`[🔔 CRON BROADCAST] ⚠️ File settings belum ada, dibuat default: ${SETTINGS_PATH}`);
      return defaultSettings;
    }
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    const settings = JSON.parse(raw);
    if (!settings.broadcastTime || typeof settings.broadcastTime !== 'string') {
      settings.broadcastTime = '07:00';
    }
    if (!Array.isArray(settings.targetGroups)) {
      settings.targetGroups = [];
    }
    return settings;
  } catch (err) {
    console.error(`[🔔 CRON BROADCAST] ❌ Gagal membaca settings:`, err.message);
    return { broadcastTime: '07:00', targetGroups: [] };
  }
}

function writeSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    console.log(`[🔔 CRON BROADCAST] ✅ Settings berhasil disimpan ke ${SETTINGS_PATH}`);
  } catch (err) {
    console.error(`[🔔 CRON BROADCAST] ❌ Gagal menyimpan settings:`, err.message);
  }
}

function getTanggalHariIni() {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const dd = String(wib.getUTCDate()).padStart(2, '0');
  const mm = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = wib.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function getTanggalPanjang() {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date());
}

function formatPenguranganList(penguranganSantri, maxItems = 5) {
  if (!penguranganSantri || penguranganSantri.length === 0) {
    return '   ✓ Nihil — kondisi stabil';
  }

  const visible = penguranganSantri.slice(0, maxItems).map((s, index) => {
    const alasan = s.alasan && s.alasan !== '-' ? ` _(${s.alasan})_` : '';
    return `   ${index + 1}. *${s.nama}*\n      └─ ${s.stambuk} • ${s.kelas} • ${s.keputusan}${alasan}`;
  });

  if (penguranganSantri.length > maxItems) {
    visible.push(`   _…dan ${penguranganSantri.length - maxItems} data lainnya_`);
  }

  return visible.join('\n');
}

async function getMiladHariIni() {
  console.log(`[🎂 MILAD RADAR] ═══════════════════════════════════`);
  const tanggalWIB = getTanggalHariIni();
  const hariIniDDMM = tanggalWIB.substring(0, 5);
  console.log(`[🎂 MILAD RADAR] Hari ini (WIB): ${tanggalWIB} → filter DD-MM: "${hariIniDDMM}"`);

  const miladList = [];
  try {
    const guruList = await getAllTanggalLahirGuru();
    for (const guru of guruList) {
      const normalizedTgl = normalizeDate(guru.tanggalLahir);
      if (normalizedTgl === '-') continue;
      const guruDDMM = normalizedTgl.substring(0, 5);
      if (guruDDMM === hariIniDDMM) {
        miladList.push({ nama: guru.nama, tipe: 'Ustadz' });
      }
    }

    const santriList = await getAllTanggalLahirSantri();
    for (const santri of santriList) {
      const normalizedTgl = normalizeDate(santri.tanggalLahir);
      if (normalizedTgl === '-') continue;
      const santriDDMM = normalizedTgl.substring(0, 5);
      if (santriDDMM === hariIniDDMM) {
        miladList.push({ nama: santri.nama, tipe: 'Santri', kelas: santri.kelas });
      }
    }

    console.log(`[🎂 MILAD RADAR] ✅ Total milad hari ini: ${miladList.length} orang`);
  } catch (err) {
    console.error(`[🎂 MILAD RADAR] ❌ Error:`, err.message);
  }

  return miladList;
}

function formatMiladSegment(miladList, maxItems = 8) {
  const lines = ['🎂 *MILAD HARI INI*'];

  if (!miladList || miladList.length === 0) {
    lines.push('   _Tidak ada milad hari ini._');
    return lines.join('\n');
  }

  const visible = miladList.slice(0, maxItems);
  visible.forEach((item, index) => {
    const tipe = item.tipe === 'Santri' && item.kelas ? `Santri ${item.kelas}` : item.tipe;
    lines.push(`   ${index + 1}. *${item.nama}* — ${tipe}`);
  });

  if (miladList.length > maxItems) {
    lines.push(`   _…dan ${miladList.length - maxItems} lainnya_`);
  }

  lines.push('   🤲 _Semoga diberkahi Allah SWT_');
  return lines.join('\n');
}

function buildBroadcastCaption(stats, waktuBroadcast, miladList) {
  const tanggal = getTanggalHariIni();
  const tanggalPanjang = getTanggalPanjang();
  const listPengurangan = formatPenguranganList(stats.penguranganSantri);
  const jumlahPengurangan = stats.penguranganSantri.length;
  const miladSegment = formatMiladSegment(miladList);
  const dashboardUrl = getDashboardUrl();

  const headBlock = [
    `🏫 *${BRAND_NAME.toUpperCase()}*`,
    `_${BRAND_TAGLINE}_`,
    DIVIDER,
  ];

  const dateBlock = [
    `📅 *Tanggal*  : ${tanggal}`,
    `🗓️ *Hari*     : ${tanggalPanjang}`,
    `🕒 *Waktu*    : ${waktuBroadcast} WIB`,
  ];

  const statsBlock = [
    DIVIDER,
    `📊 *STATISTIK AKTIF*`,
    `   • Total Asatidz : *${stats.totalGuruAktif}* orang`,
    `   • Total Santri  : *${stats.totalSantriAktif}* anak`,
  ];

  const reductionBlock = [
    DIVIDER,
    `📉 *PENGURANGAN SANTRI* _(24 jam terakhir)_`,
    `   • Total : *${jumlahPengurangan}* orang`,
    listPengurangan,
  ];

  const miladBlock = [
    DIVIDER,
    miladSegment,
  ];

  const dashboardBlock = pusdatConfig.DASHBOARD_ENABLED
    ? [
        DIVIDER,
        `🔗 *DASHBOARD LENGKAP*`,
        `   ${dashboardUrl}`,
      ]
    : [];

  const footerBlock = [
    DIVIDER,
    `_Pesan otomatis Sistem ${BRAND_NAME}_`,
    `_${BRAND_TAGLINE}_`,
  ];

  return [
    ...headBlock,
    ...dateBlock,
    ...statsBlock,
    ...reductionBlock,
    ...miladBlock,
    ...dashboardBlock,
    ...footerBlock,
  ].join('\n');
}

async function executeBroadcast() {
  console.log(`\n[🔔 CRON BROADCAST] ═══════════════════════════════`);
  console.log(`[🔔 CRON BROADCAST] Memulai broadcast harian...`);
  console.log(
    `[🔔 CRON BROADCAST] Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
  );

  if (!waSocket) {
    console.error(`[🔔 CRON BROADCAST] ❌ Socket WhatsApp belum tersedia!`);
    return;
  }

  try {
    const settings = readSettings();
    const targetGroups = settings.targetGroups;
    const waktuBroadcast = settings.broadcastTime;

    if (!targetGroups || targetGroups.length === 0) {
      console.warn(`[🔔 CRON BROADCAST] ⚠️ Tidak ada grup target di pusdat_settings.json!`);
      return;
    }

    const stats = await getDailyPusdatStats();
    const miladList = await getMiladHariIni();
    const caption = buildBroadcastCaption(stats, waktuBroadcast, miladList);

    let berhasilCount = 0;
    let gagalCount = 0;

    for (const grupId of targetGroups) {
      if (!grupId || typeof grupId !== 'string' || !grupId.endsWith('@g.us')) {
        console.warn(`[🔔 CRON BROADCAST] ⚠️ ID grup tidak valid, dilewati: ${grupId}`);
        gagalCount++;
        continue;
      }

      try {
        if (pusdatConfig.DASHBOARD_ENABLED) {
          await sendDashboardImageBroadcast(waSocket, grupId, caption, {
            url: getDashboardUrl(),
            title: BRAND_NAME,
            description: `Laporan Harian ${getTanggalHariIni()} — statistik santri, berkas, piket, dan proker`,
          });
        } else {
          await waSocket.sendMessage(grupId, { text: caption });
        }

        console.log(`[🔔 CRON BROADCAST] ✅ Terkirim ke: ${grupId}`);
        berhasilCount++;
      } catch (err) {
        console.error(`[🔔 CRON BROADCAST] ❌ Gagal kirim ke ${grupId}: ${err.message}`);
        gagalCount++;
      }
    }

    console.log(
      `[🔔 CRON BROADCAST] 📊 Ringkasan: ${berhasilCount} berhasil, ${gagalCount} gagal, dari ${targetGroups.length} total grup.`
    );
    console.log(`[🔔 CRON BROADCAST] ═══════════════════════════════\n`);
  } catch (err) {
    console.error(`[🔔 CRON BROADCAST] ❌ Error fatal:`, err.message);
    console.error(err.stack);
  }
}

export function stopBroadcastCron() {
  if (currentCronTask) {
    try {
      currentCronTask.stop();
    } catch (e) {
      console.error('[🔔 CRON BROADCAST] ❌ Gagal stop:', e.message);
    }
    currentCronTask = null;
    console.log('[🔔 CRON BROADCAST] ⏹️ Cron broadcast dihentikan.');
    return true;
  }
  return false;
}

function reloadCron() {
  stopBroadcastCron();

  const settings = readSettings();
  const broadcastTime = settings.broadcastTime;
  const timeParts = broadcastTime.split(':');
  const jam = parseInt(timeParts[0], 10);
  const menit = parseInt(timeParts[1], 10);

  if (Number.isNaN(jam) || Number.isNaN(menit) || jam < 0 || jam > 23 || menit < 0 || menit > 59) {
    console.error(
      `[🔔 CRON BROADCAST] ❌ Format waktu tidak valid: "${broadcastTime}". Menggunakan default 07:00.`
    );
    const cronExpression = '0 7 * * *';
    currentCronTask = cron.schedule(
      cronExpression,
      async () => { await executeBroadcast(); },
      { scheduled: true, timezone: 'Asia/Jakarta' }
    );
    console.log(`[✔] Cron Broadcast Harian aktif → Setiap jam 07:00 WIB (fallback default)`);
    return '07:00';
  }

  const cronExpression = `${menit} ${jam} * * *`;
  currentCronTask = cron.schedule(
    cronExpression,
    async () => {
      console.log(`[🔔 CRON] ⏰ Cron trigger: Jam ${broadcastTime} WIB terdeteksi!`);
      await executeBroadcast();
    },
    { scheduled: true, timezone: 'Asia/Jakarta' }
  );

  const targetGroups = settings.targetGroups;
  console.log(`[✔] Cron Broadcast Harian aktif → Setiap jam ${broadcastTime} WIB`);
  console.log(`    ├─ Cron Expression : ${cronExpression}`);
  console.log(`    └─ Target Grup     : ${targetGroups.length} grup terdaftar`);
  if (targetGroups.length > 0) {
    targetGroups.forEach((g, i) => {
      const prefix = i === targetGroups.length - 1 ? '└─' : '├─';
      console.log(`       ${prefix} [${i + 1}] ${g}`);
    });
  }
  return broadcastTime;
}

function initCronBroadcast(sock) {
  waSocket = sock;
  initCount++;

  const tz = process.env.TZ || 'TIDAK DISET';
  console.log(`[🔔 CRON BROADCAST] Init ke-${initCount} | Timezone terdeteksi: ${tz}`);
  if (tz !== 'Asia/Jakarta') {
    console.warn(`[🔔 CRON BROADCAST] ⚠️ Timezone bukan Asia/Jakarta!`);
  }

  reloadCron();
  isInitialized = true;
}

function updateBroadcastSocket(sock) {
  waSocket = sock;
  console.log(`[🔔 CRON BROADCAST] Socket WhatsApp diperbarui (tanpa init ulang).`);
}

export {
  initCronBroadcast,
  updateBroadcastSocket,
  executeBroadcast,
  reloadCron,
  readSettings,
  writeSettings,
  SETTINGS_PATH,
  getMiladHariIni,
};

export default {
  initCronBroadcast,
  updateBroadcastSocket,
  executeBroadcast,
  reloadCron,
  readSettings,
  writeSettings,
  SETTINGS_PATH,
  getMiladHariIni,
};
