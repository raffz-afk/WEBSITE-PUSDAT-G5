/**
 * ============================================================
 *  handle/silentLog.js — Silent Group Logging (Keamanan & Pemantauan)
 * ============================================================
 *
 *  FUNGSI:
 *  Mencatat SEMUA interaksi masuk ke terminal secara "diam-diam"
 *  tanpa mengirim balasan apapun ke pengguna.
 *
 *  TUJUAN UTAMA:
 *  - Mengetahui Chat ID (remoteJid) grup dari terminal
 *    TANPA harus mengirim .idgrup ke grup (lebih etis)
 *  - Memantau trafik pesan masuk secara real-time
 *  - Mendeteksi aktivitas mencurigakan
 *
 *  FORMAT LOG:
 *  [TRAFIK] Jam: HH:MM | Pengirim: NomorAtauNama | Lokasi Chat ID: xxxxx@g.us
 *
 *  PRIORITY: -99 (PALING AWAL, sebelum semua handler lain)
 *  Ini memastikan SETIAP pesan tercatat, bahkan yang di-block oleh
 *  handler berikutnya.
 *
 *  CATATAN:
 *  - Handler ini SELALU return true (lanjut ke handler berikutnya)
 *  - Tidak mengirim pesan apapun ke chat
 *  - Hanya menulis ke console.log (terminal)
 *
 * ============================================================
 */

/**
 * Helper: Ambil waktu WIB dalam format HH:MM
 */
function getJamWIB() {
  const now = new Date();
  // process.env.TZ sudah 'Asia/Jakarta', jadi getHours() = WIB
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function process(sock, messageInfo) {
  try {
    const { remoteJid, sender, pushName, isGroup, fullText } = messageInfo;

    // ── Format nama pengirim ──
    // Tampilkan pushName (nama WA) jika ada, jika tidak tampilkan nomor
    const nomorBersih = sender ? sender.split('@')[0] : 'unknown';
    const namaPengirim = pushName
      ? `${pushName} (${nomorBersih})`
      : nomorBersih;

    // ── Tipe lokasi ──
    const tipeChat = isGroup ? '👥 GRUP' : '👤 PRIVAT';

    // ── Cuplikan pesan (maks 30 karakter, untuk konteks) ──
    const cuplikan = fullText
      ? fullText.length > 30
        ? fullText.substring(0, 30) + '...'
        : fullText
      : '(media/empty)';

    // ══════════════════════════════════════════════════
    //  OUTPUT KE TERMINAL
    // ══════════════════════════════════════════════════
    console.log(
      `[TRAFIK] Jam: ${getJamWIB()} | ` +
      `Pengirim: ${namaPengirim} | ` +
      `Lokasi Chat ID: ${remoteJid} | ` +
      `${tipeChat} | ` +
      `Pesan: ${cuplikan}`
    );

  } catch (err) {
    // Silent fail — jangan sampai error logging mengganggu bot
    // Cukup log error-nya sendiri
    console.error(`[TRAFIK-ERROR] ${err.message}`);
  }

  // ═══ SELALU RETURN TRUE ═══
  // Jangan pernah menghentikan pemrosesan pesan
  return true;
}

export default {
  name: 'Silent Group Logging',
  priority: -99, // ★ Paling awal! Sebelum Gateway (0) dan semua handler lain
  process,
};
