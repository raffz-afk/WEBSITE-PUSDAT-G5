/**
 * ============================================================
 *  lib/i18n.js — Internationalization (Multi-Bahasa)
 * ============================================================
 *
 *  Bahasa yg didukung:
 *  - id (Indonesia) — DEFAULT
 *  - ar (العربية)
 *  - en (English)
 *
 *  Preferensi user disimpan di database/users.json:
 *    db[userId].langPref = 'id' | 'ar' | 'en'
 *
 *  Cara pakai:
 *    import { t, getUserLang } from './lib/i18n.js';
 *    const lang = getUserLang(sender);
 *    const teks = t('menu.title', lang);
 *
 * ============================================================
 */

import fs from 'fs';
import path from 'path';

const USERS_PATH = path.resolve(process.cwd(), 'database', 'users.json');

// ═══════════════════════════════════════════════════════
//  KAMUS BAHASA
// ═══════════════════════════════════════════════════════
const DICT = {
  id: {
    'menu.title': '📋 *MENU UTAMA SISFO PUSDAT*',
    'menu.greeting': "Assalamu'alaikum",
    'menu.lang_now': 'Bahasa saat ini',
    'menu.lang_change_hint': 'Ubah bahasa: .lang [id/ar/en]',

    'lang.success': '✅ *Bahasa berhasil diubah!*',
    'lang.invalid': '❌ Bahasa tidak valid. Pilih: id, ar, atau en.',
    'lang.current': 'Bahasa Anda saat ini',
    'lang.help_title': '🌐 *PENGATURAN BAHASA*',
    'lang.help_options':
      'Pilihan:\n• id — Bahasa Indonesia\n• ar — العربية\n• en — English',
    'lang.help_example': 'Contoh: .lang en',

    'err.generic': '❌ Terjadi kesalahan sistem.',
    'err.access_denied': '🚫 Akses ditolak.',
    'err.invalid_format': '❌ Format salah!',
    'err.not_found': '❌ Data tidak ditemukan.',
    'err.session_expired': '⌛ Session telah kadaluarsa.',
    'err.rate_limit':
      '⏳ Mohon pelan-pelan, command ini hanya boleh dieksekusi 1x per menit.',

    'ok.success': '✅ Berhasil!',
    'ok.saved': '✅ Data tersimpan.',
    'ok.processing': '⏳ Sedang memproses, mohon tunggu...',

    'confirm.are_you_sure': '⚠️ Apakah Anda yakin?',
    'confirm.yes_no': 'Balas: ya / tidak',
  },

  ar: {
    'menu.title': '📋 *القائمة الرئيسية لمركز البيانات*',
    'menu.greeting': 'السلام عليكم',
    'menu.lang_now': 'اللغة الحالية',
    'menu.lang_change_hint': 'تغيير اللغة: .lang [id/ar/en]',

    'lang.success': '✅ *تم تغيير اللغة بنجاح!*',
    'lang.invalid': '❌ لغة غير صحيحة. اختر: id أو ar أو en.',
    'lang.current': 'لغتك الحالية',
    'lang.help_title': '🌐 *إعدادات اللغة*',
    'lang.help_options':
      'الخيارات:\n• id — الإندونيسية\n• ar — العربية\n• en — الإنجليزية',
    'lang.help_example': 'مثال: .lang ar',

    'err.generic': '❌ حدث خطأ في النظام.',
    'err.access_denied': '🚫 الوصول مرفوض.',
    'err.invalid_format': '❌ تنسيق خاطئ!',
    'err.not_found': '❌ البيانات غير موجودة.',
    'err.session_expired': '⌛ انتهت صلاحية الجلسة.',
    'err.rate_limit':
      '⏳ تمهل من فضلك، هذا الأمر مسموح به مرة واحدة فقط في الدقيقة.',

    'ok.success': '✅ نجح!',
    'ok.saved': '✅ تم حفظ البيانات.',
    'ok.processing': '⏳ جاري المعالجة، يرجى الانتظار...',

    'confirm.are_you_sure': '⚠️ هل أنت متأكد؟',
    'confirm.yes_no': 'الرد: نعم / لا',
  },

  en: {
    'menu.title': '📋 *PUSDAT MAIN MENU*',
    'menu.greeting': 'Assalamualaikum',
    'menu.lang_now': 'Current language',
    'menu.lang_change_hint': 'Change language: .lang [id/ar/en]',

    'lang.success': '✅ *Language changed successfully!*',
    'lang.invalid': '❌ Invalid language. Choose: id, ar, or en.',
    'lang.current': 'Your current language',
    'lang.help_title': '🌐 *LANGUAGE SETTINGS*',
    'lang.help_options':
      'Options:\n• id — Indonesian\n• ar — Arabic\n• en — English',
    'lang.help_example': 'Example: .lang en',

    'err.generic': '❌ A system error occurred.',
    'err.access_denied': '🚫 Access denied.',
    'err.invalid_format': '❌ Invalid format!',
    'err.not_found': '❌ Data not found.',
    'err.session_expired': '⌛ Session expired.',
    'err.rate_limit':
      '⏳ Please slow down, this command is limited to once per minute.',

    'ok.success': '✅ Success!',
    'ok.saved': '✅ Data saved.',
    'ok.processing': '⏳ Processing, please wait...',

    'confirm.are_you_sure': '⚠️ Are you sure?',
    'confirm.yes_no': 'Reply: yes / no',
  },
};

const SUPPORTED_LANGS = ['id', 'ar', 'en'];
const DEFAULT_LANG = 'id';

// ═══════════════════════════════════════════════════════
//  PERSISTENCE — Baca / Tulis users.json
// ═══════════════════════════════════════════════════════

function readUsers() {
  try {
    if (!fs.existsSync(USERS_PATH)) return {};
    return JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
  } catch (err) {
    console.error('[i18n] ❌ Gagal baca users.json:', err.message);
    return {};
  }
}

function writeUsers(data) {
  try {
    fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[i18n] ❌ Gagal tulis users.json:', err.message);
  }
}

// ═══════════════════════════════════════════════════════
//  CACHE in-memory (untuk performa)
// ═══════════════════════════════════════════════════════
const langCache = new Map();
let cacheLoadedAt = 0;
const CACHE_TTL = 60 * 1000; // 1 menit

function loadCacheIfNeeded() {
  const now = Date.now();
  if (now - cacheLoadedAt < CACHE_TTL && langCache.size > 0) return;
  langCache.clear();
  const users = readUsers();
  for (const [uid, u] of Object.entries(users)) {
    if (u && u.langPref && SUPPORTED_LANGS.includes(u.langPref) && u.username) {
      // username format: 'user_628xxx@s.whatsapp.net' atau JID
      const jid = u.username.replace(/^user_/, '');
      langCache.set(jid, u.langPref);
    }
  }
  cacheLoadedAt = now;
}

// ═══════════════════════════════════════════════════════
//  API PUBLIK
// ═══════════════════════════════════════════════════════

/**
 * Ambil bahasa user. Kalau belum diset → default 'id'.
 *
 * @param {string} senderJid - JID pengirim (628xxx@s.whatsapp.net)
 * @returns {string} kode bahasa: 'id' | 'ar' | 'en'
 */
export function getUserLang(senderJid) {
  if (!senderJid) return DEFAULT_LANG;
  loadCacheIfNeeded();
  return langCache.get(senderJid) || DEFAULT_LANG;
}

/**
 * Set bahasa preferensi user. Disimpan permanen ke users.json.
 *
 * @param {string} senderJid
 * @param {string} lang - 'id' | 'ar' | 'en'
 * @returns {boolean} sukses?
 */
export function setUserLang(senderJid, lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return false;

  const users = readUsers();
  // Cari user record
  let userKey = null;
  for (const [k, v] of Object.entries(users)) {
    if (
      v &&
      v.username &&
      (v.username === senderJid ||
        v.username === `user_${senderJid}` ||
        v.username.endsWith(senderJid))
    ) {
      userKey = k;
      break;
    }
  }

  if (!userKey) {
    // User belum ada → buat record minimal
    userKey = Math.random().toString(36).slice(2, 12);
    users[userKey] = {
      username: `user_${senderJid}`,
      langPref: lang,
      createdAt: new Date().toISOString(),
    };
  } else {
    users[userKey].langPref = lang;
    users[userKey].updatedAt = new Date().toISOString();
  }

  writeUsers(users);

  // Update cache
  langCache.set(senderJid, lang);
  cacheLoadedAt = Date.now();

  return true;
}

/**
 * Translate. Kalau key tidak ada di bahasa target → fallback ke 'id'.
 * Kalau tetap tidak ada → return key apa adanya.
 *
 * @param {string} key
 * @param {string} lang - 'id' | 'ar' | 'en'
 * @returns {string}
 */
export function t(key, lang = DEFAULT_LANG) {
  const targetLang = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
  const dict = DICT[targetLang] || {};
  if (dict[key]) return dict[key];
  // Fallback ID
  if (DICT[DEFAULT_LANG][key]) return DICT[DEFAULT_LANG][key];
  return key;
}

/**
 * Helper langsung: t untuk sender (otomatis ambil bahasa user-nya).
 */
export function tFor(senderJid, key) {
  return t(key, getUserLang(senderJid));
}

export const SUPPORTED = SUPPORTED_LANGS;
export const DEFAULT = DEFAULT_LANG;

export default {
  t,
  tFor,
  getUserLang,
  setUserLang,
  SUPPORTED,
  DEFAULT,
};
