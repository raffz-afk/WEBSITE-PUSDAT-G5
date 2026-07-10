/**
 * ============================================================
 *  plugins/PUSDAT/uploadberkas.js — Upload Berkas Santri via WA
 * ============================================================
 *
 *  Command: .uploadberkas [stambuk] [kode_folder]
 *
 *  Cara pakai (3 mode):
 *  1. Kirim FOTO/PDF + caption: .uploadberkas 140123 B
 *  2. Reply media + ketik       : .uploadberkas 140123 B
 *  3. Kirim langsung lalu reply nanti
 *
 *  Kode folder:
 *    A → A. FOTO AKSES
 *    B → B. IJAZAH
 *    C → C. AKTA KELAHIRAN
 *    D → D. KARTU KELUARGA
 *    E → E. SURAT PERMOHONAN
 *    F → F. SURAT PERNYATAAN
 *    G → G. PAKTA INTEGRITAS
 *    H → H. BPJS
 *    I → I. LAIN-LAIN
 *
 *  Validasi:
 *  - MIME: image/jpeg, image/png, application/pdf
 *  - Max size: 10 MB (configurable)
 *  - Hanya staf piket/owner yg boleh upload
 *
 *  Disimpan ke:
 *    D:\PUSAT DATA 2026\01. MASTER DATA SANTRI\01. BERKAS SANTRI\[FOLDER]\[stambuk].[ext]
 *
 * ============================================================
 */

import path from 'path';
import fs from 'fs';
import { reply } from '../../lib/utils.js';
import { isOwner } from '../../lib/users.js';
import { getStafByWA } from '../../lib/prokerManager.js';
import { downloadMediaMessage } from 'baileys';

// ── KONSTANTA ──
const BERKAS_INDUK_DIR =
  'D:\\PUSAT DATA 2026\\01. MASTER DATA SANTRI\\01. BERKAS SANTRI';

const KODE_FOLDER_MAP = {
  A: 'A. FOTO AKSES',
  B: 'B. IJAZAH',
  C: 'C. AKTA KELAHIRAN',
  D: 'D. KARTU KELUARGA',
  E: 'E. SURAT PERMOHONAN',
  F: 'F. SURAT PERNYATAAN',
  G: 'G. PAKTA INTEGRITAS',
  H: 'H. BPJS',
  I: 'I. LAIN-LAIN',
};

// MIME yg diizinkan
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ═══════════════════════════════════════════════════════
//  HANDLER
// ═══════════════════════════════════════════════════════
async function handle(sock, messageInfo) {
  const { m, remoteJid, sender, content, message, command, prefix } = messageInfo;

  // ── Authorization: Owner ATAU Staf terdaftar ──
  const senderNumber = (sender || '').replace(/[@].*/, '').replace(/[^0-9]/g, '');
  const isOwnerUser = isOwner(sender);
  const staf = getStafByWA(senderNumber);

  if (!isOwnerUser && !staf) {
    return await reply(
      m,
      `🚫 *Akses Ditolak*\n\n_Hanya staf Pusdat / Owner yang boleh upload berkas._`
    );
  }

  // ── Parse argumen: stambuk + kode ──
  const args = (content || '').trim().split(/\s+/).filter(Boolean);
  if (args.length < 2) {
    const folderList = Object.entries(KODE_FOLDER_MAP)
      .map(([k, v]) => `┃   ${k} → ${v}`)
      .join('\n');
    return await reply(
      m,
      `📤 *UPLOAD BERKAS SANTRI*\n\n` +
        `Format:\n*${prefix}uploadberkas [stambuk] [kode]*\n\n` +
        `📌 *Contoh:*\n` +
        `_${prefix}uploadberkas 140123 B_\n\n` +
        `📂 *Daftar Kode Folder:*\n${folderList}\n\n` +
        `📎 *Cara Mengirim:*\n` +
        `1. Kirim foto/PDF + caption command\n` +
        `2. Atau reply ke media + ketik command\n\n` +
        `_Format diizinkan: JPG, PNG, PDF_\n` +
        `_Max ukuran: 10 MB_`
    );
  }

  const stambuk = String(args[0]).replace(/[^0-9]/g, '');
  const kode = String(args[1]).toUpperCase();

  if (!stambuk) {
    return await reply(m, `❌ _Stambuk tidak valid. Harus berupa angka._`);
  }
  if (!KODE_FOLDER_MAP[kode]) {
    return await reply(
      m,
      `❌ _Kode folder "${kode}" tidak valid._\n_Gunakan A sampai I._`
    );
  }

  // ── Cari pesan media: di pesan ini, atau di reply ──
  const msg = message.message || {};
  const ctx =
    msg.imageMessage ||
    msg.documentMessage ||
    msg.documentWithCaptionMessage?.message?.documentMessage ||
    null;

  const quoted =
    msg.extendedTextMessage?.contextInfo?.quotedMessage ||
    msg.imageMessage?.contextInfo?.quotedMessage ||
    null;

  const quotedCtx = quoted
    ? quoted.imageMessage ||
      quoted.documentMessage ||
      quoted.documentWithCaptionMessage?.message?.documentMessage ||
      null
    : null;

  const targetMedia = ctx || quotedCtx;
  const targetMessage = ctx ? message : null;

  if (!targetMedia) {
    return await reply(
      m,
      `❌ *Tidak ada media!*\n\n` +
        `Kirim foto/PDF beserta caption command, ATAU reply ke media yg ingin di-upload.\n\n` +
        `_Contoh: kirim foto KK + caption_\n` +
        `_${prefix}uploadberkas 140123 D_`
    );
  }

  // ── Validasi MIME ──
  const mime = targetMedia.mimetype || '';
  if (!ALLOWED_MIME.has(mime)) {
    return await reply(
      m,
      `❌ *Format File Tidak Diizinkan*\n\n` +
        `MIME terdeteksi: \`${mime || '(unknown)'}\`\n\n` +
        `_Hanya JPG, PNG, dan PDF yang diizinkan._`
    );
  }

  // ── Validasi Ukuran ──
  const fileSize = Number(targetMedia.fileLength || 0);
  if (fileSize > MAX_FILE_SIZE) {
    return await reply(
      m,
      `❌ *File Terlalu Besar*\n\n` +
        `Ukuran: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n` +
        `Max   : ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB\n\n` +
        `_Mohon kompres dulu atau split._`
    );
  }

  // Loading
  await sock.sendMessage(remoteJid, {
    react: { text: '⏳', key: message.key },
  });

  try {
    // ── Download buffer ──
    let buffer;
    if (targetMessage) {
      // media di pesan ini
      buffer = await downloadMediaMessage(message, 'buffer', {});
    } else {
      // media di pesan yg di-quote → bungkus ke pseudo-message
      const pseudo = {
        key: message.key,
        message: quoted,
      };
      buffer = await downloadMediaMessage(pseudo, 'buffer', {});
    }

    if (!buffer || !buffer.length) {
      throw new Error('Buffer media kosong');
    }

    // ── Cek folder tujuan ──
    const namaFolder = KODE_FOLDER_MAP[kode];
    const targetDir = path.join(BERKAS_INDUK_DIR, namaFolder);

    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(`[UPLOAD-BERKAS] 📁 Folder dibuat: ${targetDir}`);
      } catch (mkErr) {
        return await reply(
          m,
          `❌ *Folder tujuan tidak bisa diakses!*\n\n` +
            `Path: \`${targetDir}\`\n` +
            `Error: ${mkErr.message}\n\n` +
            `_Pastikan drive D: tersedia & bot punya hak tulis._`
        );
      }
    }

    // ── Tentukan ekstensi & path final ──
    const ext = MIME_TO_EXT[mime] || '.bin';
    const finalPath = path.join(targetDir, `${stambuk}${ext}`);

    // ── Cek apakah sudah ada (peringatan, tetap timpa) ──
    let isOverwrite = false;
    for (const checkExt of ['.jpg', '.jpeg', '.png', '.pdf']) {
      const existing = path.join(targetDir, `${stambuk}${checkExt}`);
      if (fs.existsSync(existing) && existing !== finalPath) {
        // ada file lain dgn ekstensi berbeda → hapus dulu (replace)
        try {
          fs.unlinkSync(existing);
          isOverwrite = true;
          console.log(`[UPLOAD-BERKAS] 🗑️ Hapus file lama: ${existing}`);
        } catch (_) {}
      }
    }
    if (fs.existsSync(finalPath)) isOverwrite = true;

    // ── Tulis file ──
    fs.writeFileSync(finalPath, buffer);
    console.log(
      `[UPLOAD-BERKAS] ✅ Tersimpan: ${finalPath} (${(buffer.length / 1024).toFixed(1)} KB)`
    );

    await sock.sendMessage(remoteJid, {
      react: { text: '✅', key: message.key },
    });

    const namaUploader = staf?.nama || 'Owner';
    await reply(
      m,
      `✅ *Berkas Berhasil Diupload!*\n\n` +
        `┣⌬ 👤 Stambuk : *${stambuk}*\n` +
        `┣⌬ 📂 Folder  : ${namaFolder}\n` +
        `┣⌬ 📎 Format  : ${ext.toUpperCase().slice(1)}\n` +
        `┣⌬ 📊 Ukuran  : ${(buffer.length / 1024).toFixed(1)} KB\n` +
        `┣⌬ 👨‍💼 Upload  : ${namaUploader}\n` +
        `┣⌬ 🔄 Mode    : ${isOverwrite ? '*Replace*' : '*Baru*'}\n` +
        `┗⌬ 💾 Path    : \`${stambuk}${ext}\`\n\n` +
        `🏫 _Pusat Data PMDG Kampus 5 Magelang_`
    );
  } catch (err) {
    console.error('[UPLOAD-BERKAS] ❌ Error:', err);
    await sock.sendMessage(remoteJid, {
      react: { text: '❌', key: message.key },
    });
    await reply(
      m,
      `❌ *Gagal upload!*\n\n_Error: ${err.message}_\n\n_Cek log server untuk detail._`
    );
  }

  return false;
}

export default {
  Commands: ['uploadberkas'],
  handle,
  OnlyOwner: false,
  OnlyPremium: false,
  OnlyAdmin: false,
  OnlyGroup: false,
  OnlyPrivate: false,
  limitDeduction: 0,
};
