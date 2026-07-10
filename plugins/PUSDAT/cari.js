/**
 * ============================================================
 *  plugins/PUSDAT/cari.js — Smart Search Lintas Database
 * ============================================================
 *
 *  Command: .cari [keyword]
 *
 *  Mencari keyword secara SEKUENSIAL di:
 *  1. 📚 Master Santri (Nama, Stambuk)
 *  2. 🎓 Master Guru (Nama)
 *  3. 🌍 Daerah (kolom Daerah Asal pada Santri)
 *  4. 🏛️ Konsulat (kolom Konsulat pada Santri)
 *  5. 📋 Proker (Tahunan + Bulanan + Pekanan)
 *
 *  Output: Satu pesan rapi, dikelompokkan per sumber.
 *
 * ============================================================
 *
 * 🛠️  PATCH v13.1 (FIX BUG #2 & #3):
 *
 *  Bug #2 — Konkurensi ADODB:
 *    ADODB (node-adodb) di Windows memakai cscript.exe.
 *    Spawn cscript.exe paralel via Promise.all/Promise.allSettled
 *    sering bertabrakan → muncul error spawn cscript.exe.
 *    PERBAIKAN: ubah ke SEKUENSIAL pakai for...of, lengkap dengan
 *    jeda kecil antar query (50ms) untuk meredam antrean COM.
 *
 *  Bug #3 — TypeError: (list || []).filter is not a function:
 *    Saat ADODB error, hasil DB bisa jadi non-Array (Object error,
 *    string, undefined). PERBAIKAN: pakai helper toSafeArray()
 *    sebelum .filter()/.map().
 *
 * 🛠️  PATCH v13.3 HOTFIX (ROOT-CAUSE FIX BUG #2):
 *
 *  Versi v13.1/v13.2 masih menggunakan dbAccessExtra.js yang
 *  membuka koneksi ADODB BARU sendiri via ADODB.open(...). Di
 *  Windows ini meng-spawn proses cscript.exe terpisah yang
 *  bentrok dengan koneksi `dbGuru`/`dbSantri` milik dbAccess.js
 *  (yang sudah dipakai sukses oleh .carisantri).
 *
 *  PERBAIKAN FINAL:
 *    ─ Hapus seluruh dependency pada dbAccessExtra.js.
 *    ─ cariGuru() dan cariSantriByKolomLike() sekarang ada di
 *      dbAccess.js dan memakai koneksi GLOBAL yang sama persis
 *      dengan cariSantri() (terbukti stabil).
 *    ─ Tidak ada lagi spawn cscript.exe ekstra → error
 *      “Spawn C:\Windows\System32\cscript.exe error” hilang.
 *
 * ============================================================
 */

import path from 'path';
import fs from 'fs';
import { reply } from '../../lib/utils.js';
// 🆕 v13.3 HOTFIX: import dari dbAccess.js (koneksi GLOBAL bot),
// BUKAN dari dbAccessExtra.js (yg spawn cscript.exe baru → konflik).
import {
  cariSantri,
  cariGuru,
  cariSantriByKolomLike,
} from '../../lib/dbAccess.js';
import {
  getProkerTahunan,
  getProkerBulanan,
} from '../../lib/prokerManager.js';

// Path proker pekanan (jika ada)
const PROKER_PEKANAN_PATH = path.resolve(
  process.cwd(),
  'database',
  'proker',
  'proker_pekanan.json'
);

// ─────────────────────────────────────────────────────────────
//  🛡️ HELPERS — defensive programming
// ─────────────────────────────────────────────────────────────

/**
 * Konversi nilai apa pun menjadi Array yang aman untuk .filter/.map.
 * Mencegah crash "X.filter is not a function" jika DB return non-Array.
 *
 * @param {any} v
 * @returns {Array}
 */
function toSafeArray(v) {
  if (Array.isArray(v)) return v;
  // Beberapa driver return { recordset: [...] } atau { rows: [...] }
  if (v && typeof v === 'object') {
    if (Array.isArray(v.recordset)) return v.recordset;
    if (Array.isArray(v.rows)) return v.rows;
    if (Array.isArray(v.data)) return v.data;
  }
  return [];
}

/**
 * Menjalankan promise factory dengan timeout & try-catch yg aman.
 * Selalu return Array — apapun hasilnya, tidak pernah throw.
 *
 * @param {string} label
 * @param {Function} fn  – async function tanpa argumen
 * @param {number}   timeoutMs
 * @returns {Promise<Array>}
 */
async function safeQuery(label, fn, timeoutMs = 25000) {
  if (typeof fn !== 'function') return [];
  let timer = null;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => fn()),
      new Promise((_, rej) => {
        timer = setTimeout(
          () => rej(new Error(`Timeout ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
    if (timer) clearTimeout(timer);
    return toSafeArray(result);
  } catch (err) {
    if (timer) clearTimeout(timer);
    console.error(`[CARI] ❌ ${label}:`, err && err.message ? err.message : err);
    return [];
  }
}

/**
 * Jeda kecil — meredam antrean COM/cscript.exe di Windows.
 */
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Baca JSON aman.
 */
function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
//  HANDLER UTAMA
// ─────────────────────────────────────────────────────────────

async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, message } = messageInfo;

  const keyword = (content || '').trim();
  if (!keyword || keyword.length < 2) {
    return await reply(
      m,
      `🔍 *SMART SEARCH LINTAS DATABASE*\n\n` +
        `Format: *.cari [keyword]*\n\n` +
        `📌 *Contoh:*\n` +
        `_.cari Ahmad_\n` +
        `_.cari Magelang_\n` +
        `_.cari Banten_\n\n` +
        `_Min. 2 karakter._\n` +
        `_Bot mencari di: Santri, Guru, Daerah, Konsulat, Proker._`
    );
  }

  await sock.sendMessage(remoteJid, {
    react: { text: '🔎', key: message.key },
  });

  // Limit hasil per kategori (anti-spam)
  const MAX_PER_CATEGORY = 8;

  // ════════════════════════════════════════════════════════════
  // 🛠️  FIX BUG #2: SEKUENSIAL — bukan Promise.all/allSettled
  // ────────────────────────────────────────────────────────────
  //  Setiap query menunggu yang sebelumnya selesai sepenuhnya
  //  agar cscript.exe (node-adodb) tidak bertabrakan di Windows.
  //  Tambahan jeda 50ms antar query untuk meredam antrean COM.
  // ════════════════════════════════════════════════════════════

  console.log(`[CARI] 🔎 Memulai pencarian sekuensial untuk: "${keyword}"`);
  const t0 = Date.now();

  // 1) SANTRI
  const santriResults = toSafeArray(
    await safeQuery('CARI-SANTRI', () => cariSantri(keyword))
  );
  await sleep(50);

  // 2) GURU
  const guruResults = toSafeArray(
    await safeQuery('CARI-GURU', () => cariGuru(keyword))
  );
  await sleep(50);

  // 3) DAERAH (kolom Daerah pada santri)
  const daerahResults = toSafeArray(
    await safeQuery('CARI-DAERAH', () =>
      cariSantriByKolomLike('Daerah', keyword)
    )
  );
  await sleep(50);

  // 4) KONSULAT (kolom Konsulat pada santri)
  const konsulatResults = toSafeArray(
    await safeQuery('CARI-KONSULAT', () =>
      cariSantriByKolomLike('Konsulat', keyword)
    )
  );

  // 5) Proker (sinkron — tidak menyentuh ADODB)
  let prokerTahunanArr = [];
  let prokerBulananArr = [];
  try {
    prokerTahunanArr = toSafeArray(
      typeof getProkerTahunan === 'function' ? getProkerTahunan() : []
    );
  } catch (e) {
    console.error('[CARI] ❌ getProkerTahunan:', e.message);
  }
  try {
    prokerBulananArr = toSafeArray(
      typeof getProkerBulanan === 'function' ? getProkerBulanan() : []
    );
  } catch (e) {
    console.error('[CARI] ❌ getProkerBulanan:', e.message);
  }

  // Proker pekanan (file JSON)
  const prokerPekananData = safeReadJson(PROKER_PEKANAN_PATH);
  let prokerPekananArr = [];
  if (Array.isArray(prokerPekananData)) {
    prokerPekananArr = prokerPekananData;
  } else if (prokerPekananData && Array.isArray(prokerPekananData.list)) {
    prokerPekananArr = prokerPekananData.list;
  }

  // ════════════════════════════════════════════════════════════
  // 🛠️  FIX BUG #3: pastikan Array sebelum .filter()
  // ════════════════════════════════════════════════════════════
  const kw = keyword.toLowerCase();
  const filterProker = (list) => {
    const arr = toSafeArray(list);
    return arr.filter((p) => {
      try {
        const text = JSON.stringify(p).toLowerCase();
        return text.includes(kw);
      } catch (_) {
        return false;
      }
    });
  };

  const matchedTahunan = filterProker(prokerTahunanArr);
  const matchedBulanan = filterProker(prokerBulananArr);
  const matchedPekanan = filterProker(prokerPekananArr);

  console.log(
    `[CARI] ✅ Selesai dalam ${Date.now() - t0}ms · ` +
      `Santri:${santriResults.length} ` +
      `Guru:${guruResults.length} ` +
      `Daerah:${daerahResults.length} ` +
      `Konsulat:${konsulatResults.length} ` +
      `Proker(T/B/P):${matchedTahunan.length}/${matchedBulanan.length}/${matchedPekanan.length}`
  );

  // ─── Build output ───
  const blocks = [];

  // BLOK 1: SANTRI
  if (santriResults.length) {
    const lines = santriResults.slice(0, MAX_PER_CATEGORY).map((s, i) => {
      const nama = s['Nama Lengkap'] || s.nama || '-';
      const stambuk = s.Stambuk || '-';
      const kelas = s.Kelas || '-';
      return `┣⌬ ${i + 1}. *${nama}*\n┃     ↳ ${stambuk} | ${kelas}`;
    });
    const more =
      santriResults.length > MAX_PER_CATEGORY
        ? `\n┃     _...dan ${santriResults.length - MAX_PER_CATEGORY} lainnya_`
        : '';
    blocks.push(
      `┏━━━『 📚 *SANTRI* (${santriResults.length}) 』━━━\n${lines.join(
        '\n'
      )}${more}\n┗━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  // BLOK 2: GURU
  if (guruResults.length) {
    const lines = guruResults.slice(0, MAX_PER_CATEGORY).map((g, i) => {
      const nama = g['Nama Lengkap'] || g.nama || '-';
      const stambuk = g.Stambuk || '-';
      const jabatan = g.Jabatan || g.Bagian || '';
      return `┣⌬ ${i + 1}. *${nama}*\n┃     ↳ ${stambuk}${jabatan ? ` | ${jabatan}` : ''}`;
    });
    const more =
      guruResults.length > MAX_PER_CATEGORY
        ? `\n┃     _...dan ${guruResults.length - MAX_PER_CATEGORY} lainnya_`
        : '';
    blocks.push(
      `┏━━━『 🎓 *GURU/STAF* (${guruResults.length}) 』━━━\n${lines.join(
        '\n'
      )}${more}\n┗━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  // BLOK 3: DAERAH
  if (daerahResults.length) {
    const lines = daerahResults.slice(0, MAX_PER_CATEGORY).map((s, i) => {
      const nama = s['Nama Lengkap'] || '-';
      const stambuk = s.Stambuk || '-';
      const daerahCol = s.Daerah || '-';
      return `┣⌬ ${i + 1}. ${nama} (${stambuk})\n┃     ↳ Daerah: ${daerahCol}`;
    });
    const more =
      daerahResults.length > MAX_PER_CATEGORY
        ? `\n┃     _...dan ${daerahResults.length - MAX_PER_CATEGORY} lainnya_`
        : '';
    blocks.push(
      `┏━━━『 🌍 *DAERAH* (${daerahResults.length}) 』━━━\n${lines.join(
        '\n'
      )}${more}\n┗━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  // BLOK 4: KONSULAT
  if (konsulatResults.length) {
    const lines = konsulatResults.slice(0, MAX_PER_CATEGORY).map((s, i) => {
      const nama = s['Nama Lengkap'] || '-';
      const stambuk = s.Stambuk || '-';
      const konsulatCol = s.Konsulat || '-';
      return `┣⌬ ${i + 1}. ${nama} (${stambuk})\n┃     ↳ Konsulat: ${konsulatCol}`;
    });
    const more =
      konsulatResults.length > MAX_PER_CATEGORY
        ? `\n┃     _...dan ${konsulatResults.length - MAX_PER_CATEGORY} lainnya_`
        : '';
    blocks.push(
      `┏━━━『 🏛️ *KONSULAT* (${konsulatResults.length}) 』━━━\n${lines.join(
        '\n'
      )}${more}\n┗━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  // BLOK 5: PROKER
  const totalProker =
    matchedTahunan.length + matchedBulanan.length + matchedPekanan.length;
  if (totalProker > 0) {
    let prokerText = `┏━━━『 📋 *PROKER* (${totalProker}) 』━━━\n`;
    const renderProker = (arr, label) => {
      const safeArr = toSafeArray(arr);
      if (!safeArr.length) return '';
      const lines = safeArr
        .slice(0, MAX_PER_CATEGORY)
        .map((p, i) => {
          const nama =
            p?.nama ||
            p?.judul ||
            p?.kegiatan ||
            p?.Kegiatan ||
            p?.title ||
            '(?)';
          return `┃   ${i + 1}. ${nama}`;
        })
        .join('\n');
      return `┣⌬ *${label}* (${safeArr.length}):\n${lines}\n`;
    };
    prokerText += renderProker(matchedTahunan, 'Tahunan');
    prokerText += renderProker(matchedBulanan, 'Bulanan');
    prokerText += renderProker(matchedPekanan, 'Pekanan');
    prokerText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━`;
    blocks.push(prokerText);
  }

  // ─── Build final message ───
  await sock.sendMessage(remoteJid, {
    react: { text: blocks.length ? '✅' : '❌', key: message.key },
  });

  if (blocks.length === 0) {
    return await reply(
      m,
      `🔍 *Hasil Pencarian: "${keyword}"*\n\n` +
        `❌ _Tidak ditemukan di database mana pun._\n\n` +
        `_Coba kata kunci yang lebih umum atau periksa ejaan._`
    );
  }

  const totalAll =
    santriResults.length +
    guruResults.length +
    daerahResults.length +
    konsulatResults.length +
    totalProker;

  const header =
    `🔍 *HASIL SMART SEARCH*\n` +
    `Keyword: *"${keyword}"*\n` +
    `Total: *${totalAll}* hasil\n` +
    `─────────────────────────\n`;

  const footer =
    `\n─────────────────────────\n` +
    `🏫 _Pusat Data PMDG Kampus 5 Magelang_`;

  const finalText = header + blocks.join('\n\n') + footer;

  // Chunking jika terlalu panjang
  if (finalText.length <= 3800) {
    return await reply(m, finalText);
  }

  // Pecah per blok
  await reply(m, header.trim());
  for (const block of blocks) {
    await sock.sendMessage(remoteJid, { text: block });
  }
  await sock.sendMessage(remoteJid, { text: footer.trim() });
  return false;
}

export default {
  Commands: ['cari'],
  handle,
  OnlyOwner: false,
  OnlyPremium: false,
  OnlyAdmin: false,
  OnlyGroup: false,
  OnlyPrivate: false,
  limitDeduction: 0,
};
