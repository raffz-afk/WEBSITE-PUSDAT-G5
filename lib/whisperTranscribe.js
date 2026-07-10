/**
 * ============================================================
 *  lib/whisperTranscribe.js — Voice Note → Text via OpenAI Whisper
 * ============================================================
 *
 *  Dipakai oleh handle/voiceLapor.js untuk auto-transkrip
 *  Voice Note staf piket menjadi laporan bakdiyah harian.
 *
 *  ⚙️ KONFIGURASI:
 *  Set OPENAI_API_KEY di pusdat-config.js:
 *    OPENAI_API_KEY: 'sk-xxxxxxx'
 *
 *  ATAU di environment variable:
 *    OPENAI_API_KEY=sk-xxx
 *
 *  Endpoint: https://api.openai.com/v1/audio/transcriptions
 *  Model   : whisper-1
 *  Bahasa  : id (auto-detect juga bisa)
 *
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import FormData from 'form-data';
import fetch from 'node-fetch';
import pusdatConfig from '../pusdat-config.js';

const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB (limit OpenAI)

function getApiKey() {
  return (
    pusdatConfig.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ''
  );
}

/**
 * Transkripsi audio buffer menjadi teks.
 *
 * @param {Buffer} audioBuffer
 * @param {string} mimetype - misal 'audio/ogg; codecs=opus'
 * @param {string} lang - default 'id'
 * @returns {Promise<{ ok: boolean, text?: string, error?: string }>}
 */
export async function transcribeBuffer(audioBuffer, mimetype = 'audio/ogg', lang = 'id') {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error:
        'OPENAI_API_KEY belum di-set. Tambahkan di pusdat-config.js atau env variable.',
    };
  }

  if (!audioBuffer || !audioBuffer.length) {
    return { ok: false, error: 'Audio buffer kosong' };
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      error: `File terlalu besar (${(audioBuffer.length / 1024 / 1024).toFixed(1)} MB). Max 25 MB.`,
    };
  }

  // Tulis ke file temp (Whisper API butuh file upload)
  const ext = mimetype.includes('mp3')
    ? '.mp3'
    : mimetype.includes('wav')
    ? '.wav'
    : mimetype.includes('m4a')
    ? '.m4a'
    : '.ogg';
  const tmpPath = path.join(
    os.tmpdir(),
    `whisper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
  );

  try {
    fs.writeFileSync(tmpPath, audioBuffer);

    const form = new FormData();
    form.append('file', fs.createReadStream(tmpPath), {
      filename: path.basename(tmpPath),
      contentType: mimetype || 'application/octet-stream',
    });
    form.append('model', 'whisper-1');
    form.append('language', lang);
    form.append('response_format', 'json');

    const res = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg =
        data?.error?.message ||
        `HTTP ${res.status} ${res.statusText}`;
      return { ok: false, error: errMsg };
    }

    const text = (data.text || '').trim();
    if (!text) {
      return { ok: false, error: 'Whisper tidak menghasilkan teks (audio terlalu pendek/tidak jelas?)' };
    }

    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    // Bersihkan file temp
    try {
      fs.unlinkSync(tmpPath);
    } catch (_) {}
  }
}

export default { transcribeBuffer };
