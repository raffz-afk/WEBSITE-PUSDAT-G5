/**
 * ============================================================
 *  handle/voiceLapor.js — Voice Note → Laporan Bakdiyah
 *  ★ VERSI v13.4 — LID-AWARE
 * ============================================================
 *
 *  Priority: 1 (setelah gateway & rateLimit, sebelum plugin)
 *
 *  Trigger:
 *  - User adalah staf piket hari ini
 *  - Pesan adalah Voice Note (audioMessage / pttMessage)
 *  - DAN salah satu dari:
 *      (a) Caption mengandung keyword '.laporvoice' / '.lvoice' / '.voicelapor'
 *      (b) Auto: chat private + staf piket
 *
 *  PERBAIKAN v13.4:
 *  - Resolusi LID (Linked-ID) → nomor WA asli, sehingga
 *    voice note dari staf yang nomornya muncul sebagai @lid
 *    tetap bisa dideteksi sebagai staf yang valid.
 *  - Logging diagnostik untuk debugging.
 *
 * ============================================================
 */

import { downloadMediaMessage } from 'baileys';
import { transcribeBuffer } from '../lib/whisperTranscribe.js';
import { isOwner } from '../lib/users.js';
import { convertToJid } from '../lib/utils.js';
import {
  getStafByWA,
  getStafPiketHariIni,
  simpanLaporanBakdiyah,
} from '../lib/prokerManager.js';

const TRIGGER_KEYWORDS = ['.laporvoice', '.lvoice', '.voicelapor'];

// ────────────────────────────────────────────────
//  HELPER: Resolusi nomor WA asli dari sender JID
// ────────────────────────────────────────────────
async function resolveSenderNumber(sock, messageInfo) {
  const { sender, message } = messageInfo;
  const raw = String(sender || '');

  if (!raw.endsWith('@lid')) {
    const num = raw.replace(/[@].*/, '').replace(/[^0-9]/g, '');
    if (num) return num;
  }

  try {
    const key = message?.key || {};
    const alt = key.participantAlt || key.senderAlt || '';
    if (alt && !alt.endsWith('@lid')) {
      const num = alt.replace(/[@].*/, '').replace(/[^0-9]/g, '');
      if (num) return num;
    }
  } catch (_) {}

  try {
    if (sock && sock.signalRepository?.lidMapping?.getPNForLID) {
      const realJid = await convertToJid(sock, raw);
      if (realJid) {
        const num = realJid.replace(/[@].*/, '').replace(/[^0-9]/g, '');
        if (num) return num;
      }
    }
  } catch (_) {}

  return raw.replace(/[@].*/, '').replace(/[^0-9]/g, '');
}

function findStafFlexible(senderNumber) {
  let staf = getStafByWA(senderNumber);
  if (staf) return staf;
  if (senderNumber.startsWith('62')) {
    staf = getStafByWA('0' + senderNumber.slice(2));
    if (staf) return staf;
  } else if (senderNumber.startsWith('0')) {
    staf = getStafByWA('62' + senderNumber.slice(1));
    if (staf) return staf;
  }
  return null;
}

async function process(sock, messageInfo) {
  const { remoteJid, sender, message, isGroup } = messageInfo;

  // Hanya proses pesan voice
  const msg = message?.message || {};
  const audio =
    msg.audioMessage ||
    msg.pttMessage ||
    msg.viewOnceMessageV2?.message?.audioMessage ||
    null;

  if (!audio) return true; // bukan voice → skip

  // ── Resolusi nomor & cek staf (LID-aware) ──
  const senderNumber = await resolveSenderNumber(sock, messageInfo);
  const isOwnerUser = isOwner(sender);
  const staf = findStafFlexible(senderNumber);

  if (!isOwnerUser && !staf) return true; // bukan staf → ignore

  // ── Cek apakah staf piket hari ini ──
  const stafPiket = (getStafPiketHariIni() || []).map((s) =>
    String(s.nomor || s.wa || s.whatsapp || '').replace(/[^0-9]/g, ''),
  );
  const isPiket = stafPiket.includes(senderNumber);

  // ── Cek trigger ──
  const caption = (audio.caption || '').toLowerCase();
  const captionTriggered = TRIGGER_KEYWORDS.some((k) => caption.includes(k));

  const ext = msg.extendedTextMessage;
  const quotedTriggered =
    ext &&
    typeof ext.text === 'string' &&
    TRIGGER_KEYWORDS.some((k) => ext.text.toLowerCase().includes(k));

  const autoPrivate = !isGroup && isPiket;

  if (!captionTriggered && !quotedTriggered && !autoPrivate) {
    return true; // tidak ada trigger → skip
  }

  console.log(
    `[VOICE-LAPOR] 🎤 Voice note dari ${staf?.nama || senderNumber}, mulai transkripsi...`,
  );

  try {
    await sock.sendMessage(remoteJid, { react: { text: '🎙️', key: message.key } });
  } catch (_) {}

  await sock.sendMessage(
    remoteJid,
    {
      text:
        `🎙️ *Voice Note Terdeteksi*\n\n` +
        `Sedang mentranskripsi audio menggunakan AI Whisper...\n` +
        `_Mohon tunggu sekitar 5-15 detik._`,
    },
    { quoted: message },
  );

  try {
    const buffer = await downloadMediaMessage(message, 'buffer', {});
    if (!buffer || !buffer.length) {
      throw new Error('Buffer voice note kosong');
    }

    const result = await transcribeBuffer(buffer, audio.mimetype || 'audio/ogg', 'id');

    if (!result.ok) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      await sock.sendMessage(
        remoteJid,
        {
          text:
            `❌ *Transkripsi Gagal*\n\n_Error: ${result.error}_\n\n` +
            `_Silakan coba ketik manual via .lapharian._`,
        },
        { quoted: message },
      );
      return false;
    }

    const teks = result.text;
    console.log(`[VOICE-LAPOR] ✅ Transkripsi sukses: "${teks.slice(0, 80)}..."`);

    const formatted = `#selesai\n- ${teks}`;

    const r = simpanLaporanBakdiyah(senderNumber, formatted);
    if (!r || !r.ok) {
      throw new Error(`Gagal menyimpan ke proker harian: ${r?.reason || 'unknown'}`);
    }

    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });

    const namaStaf = staf?.nama || 'Staf';
    await sock.sendMessage(
      remoteJid,
      {
        text:
          `✅ *LAPORAN VOICE TERSIMPAN*\n\n` +
          `👤 *Staf*  : ${namaStaf}\n` +
          `🎙️ *Mode* : Voice → Text (Whisper AI)\n\n` +
          `📝 *Hasil Transkripsi:*\n` +
          `\`\`\`\n${teks}\n\`\`\`\n\n` +
          `_Tersimpan ke laporan bakdiyah hari ini sebagai #selesai._\n` +
          `_Kalau butuh revisi, kirim ulang via .lapharian dgn format manual._`,
      },
      { quoted: message },
    );

    return false;
  } catch (err) {
    console.error('[VOICE-LAPOR] ❌ Error:', err);
    try {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
    } catch (_) {}
    await sock.sendMessage(
      remoteJid,
      { text: `❌ _Gagal proses voice note: ${err.message}_` },
      { quoted: message },
    );
    return false;
  }
}

export default {
  name: 'Voice Lapor (Whisper)',
  priority: 1,
  process,
};
