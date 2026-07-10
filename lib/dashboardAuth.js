/**
 * ============================================================
 *  lib/dashboardAuth.js — Auth Multi-Role Dashboard Pusdat
 * ============================================================
 *
 *  Tiga role login:
 *  - admin   : password fixed "bismillah" (dari pusdat-config)
 *              bisa akses semua data + semua fitur
 *  - ustadz  : login via Stambuk + Tanggal Lahir (DD-MM-YYYY)
 *              cocok lewat DB Guru (sama dgn .cek di bot WA)
 *              hanya boleh edit AKUN sendiri
 *  - santri  : login via Stambuk + Tanggal Lahir
 *              cocok lewat DB Santri
 *              hanya boleh edit AKUN sendiri
 *
 *  Setelah login, info user disimpan di req.session.user:
 *    {
 *      role: 'admin' | 'ustadz' | 'santri',
 *      stambuk: number | null,
 *      nama: string,
 *      label: string,
 *      loginAt: ISO string
 *    }
 *
 * ============================================================
 */

import {
  verifyGateway,
  getFullBiodataSantri,
  matchDate,
  sanitizeStambuk,
  sanitizeTanggal,
  deepSanitize,
} from './dbAccess.js';
import pusdatConfig from '../pusdat-config.js';

const ADMIN_PASSWORD =
  pusdatConfig.DASHBOARD_ADMIN_PASSWORD ||
  pusdatConfig.DASHBOARD_PASSWORD ||
  'bismillah';

/**
 * Coba autentikasi admin dengan password tunggal.
 */
export function authenticateAdmin(password) {
  const clean = deepSanitize(String(password || ''));
  if (clean === '' || clean !== ADMIN_PASSWORD) return null;
  return {
    role: 'admin',
    stambuk: null,
    nama: 'Administrator',
    label: 'Admin Pusdat',
    loginAt: new Date().toISOString(),
  };
}

/**
 * Coba autentikasi ustadz dengan stambuk + tanggal lahir.
 * Menggunakan verifyGateway() (yang sudah dipakai oleh .cek di bot).
 */
export async function authenticateUstadz(stambukInput, tanggalInput) {
  const cleanStambuk = sanitizeStambuk(String(stambukInput || ''));
  const cleanTanggal = sanitizeTanggal(String(tanggalInput || ''));
  if (!cleanStambuk || !cleanTanggal) return null;

  const guru = await verifyGateway(cleanStambuk, cleanTanggal);
  if (!guru) return null;

  return {
    role: 'ustadz',
    stambuk: Number(guru.Stambuk),
    nama: guru['Nama Lengkap'] || '-',
    label: `Ustadz ${guru['Nama Lengkap'] || '-'} (${guru.Stambuk})`,
    loginAt: new Date().toISOString(),
  };
}

/**
 * Coba autentikasi santri dengan stambuk + tanggal lahir.
 * Cocokkan dengan field 'Tanggal Lahir' di DB Santri.
 */
export async function authenticateSantri(stambukInput, tanggalInput) {
  const cleanStambuk = sanitizeStambuk(String(stambukInput || ''));
  const cleanTanggal = sanitizeTanggal(String(tanggalInput || ''));
  if (!cleanStambuk || !cleanTanggal) return null;

  const santri = await getFullBiodataSantri(cleanStambuk);
  if (!santri) return null;

  const dbTanggal = santri['Tanggal Lahir'];
  if (!dbTanggal) return null;

  if (!matchDate(dbTanggal, cleanTanggal)) return null;

  return {
    role: 'santri',
    stambuk: Number(santri.Stambuk),
    nama: santri['Nama Lengkap'] || '-',
    label: `Santri ${santri['Nama Lengkap'] || '-'} (${santri.Stambuk})`,
    loginAt: new Date().toISOString(),
  };
}

/**
 * Auth dengan role yang dipilih.
 *
 * @param {string} role - 'admin' | 'ustadz' | 'santri'
 * @param {Object} payload - { password, stambuk, tanggal }
 * @returns {Promise<Object|null>}
 */
export async function authenticate(role, payload = {}) {
  const r = String(role || '').toLowerCase();
  if (r === 'admin') {
    return authenticateAdmin(payload.password);
  }
  if (r === 'ustadz' || r === 'guru' || r === 'asatidz') {
    return await authenticateUstadz(payload.stambuk, payload.tanggal);
  }
  if (r === 'santri' || r === 'siswa') {
    return await authenticateSantri(payload.stambuk, payload.tanggal);
  }
  return null;
}

/**
 * Apakah user diizinkan mengakses data DB+Stambuk tertentu?
 */
export function canAccessRecord(user, dbType, stambuk) {
  if (!user) return false;
  if (user.role === 'admin') return true;

  const db = String(dbType || '').toLowerCase();
  const ownStambuk = Number(user.stambuk);
  const target = Number(stambuk);

  if (user.role === 'ustadz' && db === 'guru' && ownStambuk === target) return true;
  if (user.role === 'santri' && db === 'santri' && ownStambuk === target) return true;

  return false;
}

/**
 * Apakah user boleh EDIT data?
 * Admin: bebas; Ustadz/santri: hanya boleh edit dirinya sendiri.
 */
export function canEditRecord(user, dbType, stambuk) {
  return canAccessRecord(user, dbType, stambuk);
}

/**
 * Apakah user boleh melihat fitur global (semua data, ekspor massal, dll)?
 */
export function isGlobalAccess(user) {
  return user?.role === 'admin';
}

/**
 * Express middleware: requireAuth (dengan opsional restriksi role).
 *
 * Pakai:
 *   app.get('/admin-only', requireAuthRoles(['admin']), handler)
 */
export function requireAuthSession(req, res, next) {
  if (req.session && req.session.loggedIn && req.session.user) return next();
  return res.redirect('/login');
}

export function requireAuthRoles(allowedRoles = []) {
  const allowed = (allowedRoles || []).map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    if (!req.session || !req.session.loggedIn || !req.session.user) {
      return res.redirect('/login');
    }
    const role = String(req.session.user.role || '').toLowerCase();
    if (allowed.length > 0 && !allowed.includes(role)) {
      return res
        .status(403)
        .send(
          `<div style="font-family:Segoe UI;padding:60px;text-align:center;color:#b42318">
            <h2>🚫 Akses Ditolak</h2>
            <p>Role <b>${role}</b> tidak diizinkan mengakses halaman ini.</p>
            <p><a href="/">← Kembali ke beranda</a></p>
          </div>`
        );
    }
    next();
  };
}

export const _config = {
  ADMIN_PASSWORD,
};

export default {
  authenticate,
  authenticateAdmin,
  authenticateUstadz,
  authenticateSantri,
  canAccessRecord,
  canEditRecord,
  isGlobalAccess,
  requireAuthSession,
  requireAuthRoles,
};
