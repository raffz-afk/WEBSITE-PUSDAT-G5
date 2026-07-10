/**
 * ============================================================
 *  lib/linkPreview.js — WhatsApp Preview & Broadcast Helper
 *  ★ VERSI v15.0 — kirim screenshot poster HD + caption mewah
 *
 *  Strategi pengiriman broadcast:
 *   1) Ambil screenshot dashboard (PNG 1080×1350) dari /og-image
 *   2) Kirim sebagai pesan IMAGE dengan caption rapi (line-break,
 *      hierarki bullet, divider, dan URL dashboard).
 *   3) Jika gagal → fallback ke link preview manual / auto Baileys
 *      / fallback teks polos.
 * ============================================================
 */

import fetch from 'node-fetch';
import { getDashboardUrl } from './dashboard.js';

async function fetchDashboardImageBuffer(url, route = '/og-image') {
  try {
    const base = String(url || getDashboardUrl()).replace(/\/$/, '');
    const imageUrl = `${base}${route}?ts=${Date.now()}`;
    const res = await fetch(imageUrl, { timeout: 45000 });
    if (!res.ok) {
      console.warn(`[LINK-PREVIEW] og-image HTTP ${res.status}`);
      return null;
    }
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (!buf || buf.length < 1024) return null;
    return buf;
  } catch (err) {
    console.warn('[LINK-PREVIEW] Gagal ambil gambar dashboard:', err.message);
    return null;
  }
}

async function fetchThumbnail(url) {
  return fetchDashboardImageBuffer(url, '/og-image');
}

export async function sendWithLinkPreview(sock, jid, text, opts = {}) {
  const url = opts.url || getDashboardUrl();
  const title = opts.title || 'Data Center G5';
  const description =
    opts.description ||
    'Statistik santri, kelengkapan berkas, staf piket, dan proker tahunan.';

  const finalText = text.includes(url) ? text : `${text}\n\n🔗 Dashboard lengkap:\n${url}`;
  const thumbnail = await fetchThumbnail(url);

  if (thumbnail && thumbnail.length > 0) {
    try {
      await sock.sendMessage(jid, {
        text: finalText,
        contextInfo: {
          externalAdReply: {
            title,
            body: description,
            mediaType: 1,
            thumbnailUrl: url,
            thumbnail,
            sourceUrl: url,
            renderLargerThumbnail: true,
            showAdAttribution: false,
          },
        },
      });
      console.log(`[LINK-PREVIEW] ✅ Pesan dengan thumbnail terkirim → ${jid}`);
      return true;
    } catch (err) {
      console.warn('[LINK-PREVIEW] ⚠️ Manual thumbnail gagal, fallback ke auto:', err.message);
    }
  }

  try {
    await sock.sendMessage(jid, { text: finalText }, { generateHighQualityLinkPreview: true });
    console.log(`[LINK-PREVIEW] ✅ Pesan dengan auto-preview terkirim → ${jid}`);
    return true;
  } catch (err) {
    console.warn('[LINK-PREVIEW] ⚠️ Auto preview gagal, fallback teks polos:', err.message);
  }

  await sock.sendMessage(jid, { text: finalText });
  return false;
}

/**
 * Kirim broadcast dengan gambar poster HD + caption mewah.
 * Mode utama yang dipakai cron 07:00.
 */
export async function sendDashboardImageBroadcast(sock, jid, caption, opts = {}) {
  const url = opts.url || getDashboardUrl();
  const finalCaption = caption.includes(url)
    ? caption
    : `${caption}\n\n🔗 Buka dashboard penuh:\n${url}`;

  const imageBuffer = await fetchDashboardImageBuffer(url, '/og-image');
  if (imageBuffer && imageBuffer.length > 0) {
    try {
      await sock.sendMessage(jid, {
        image: imageBuffer,
        caption: finalCaption,
        mimetype: 'image/png',
        jpegThumbnail: imageBuffer.length < 90_000 ? imageBuffer : undefined,
      });
      console.log(
        `[LINK-PREVIEW] ✅ Broadcast gambar poster terkirim → ${jid} (${imageBuffer.length} bytes)`
      );
      return true;
    } catch (err) {
      console.warn(
        '[LINK-PREVIEW] ⚠️ Kirim gambar poster gagal, fallback ke link preview:',
        err.message
      );
    }
  }

  return sendWithLinkPreview(sock, jid, finalCaption, opts);
}

export { fetchDashboardImageBuffer, fetchThumbnail };

export default {
  sendWithLinkPreview,
  sendDashboardImageBroadcast,
  fetchDashboardImageBuffer,
  fetchThumbnail,
};
