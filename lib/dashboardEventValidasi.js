/**
 * ============================================================
 *  lib/dashboardEventValidasi.js — Routes Web Event Validasi Data Guru
 *  ★ v18.0
 * ============================================================
 *
 *  Routes admin:
 *    GET  /event-validasi              — list semua event
 *    GET  /event-validasi/new          — form buat event
 *    POST /event-validasi/new          — simpan event baru
 *    GET  /event-validasi/:id          — detail + progres + tombol perpanjang
 *    POST /event-validasi/:id/perpanjang — tambah extension deadline
 *    POST /event-validasi/:id/toggle   — active/closed
 *    POST /event-validasi/:id/hapus    — hapus event
 *    POST /event-validasi/:id/reset/:stambuk — hapus submission seseorang
 *    GET  /event-validasi/:id/ekspor   — download xlsx rekap
 *
 *  Routes ustadz:
 *    GET  /me/validasi                 — redirect ke event aktif
 *    GET  /me/validasi/:id             — form konfirmasi data
 *    POST /me/validasi/:id             — submit konfirmasi
 *
 * ============================================================
 */

import * as ev from './validasiEvent.js';
import * as dbAccess from './dbAccess.js';
import { requireAuthRoles } from './dashboardAuth.js';
import { getEditableRecordByStambuk, formatEditValue } from './dbEditor.js';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setFlash(req, kind, text) {
  if (!req.session) return;
  req.session.flash = { kind, text };
}
function takeFlash(req) {
  if (!req.session) return '';
  const f = req.session.flash;
  if (!f) return '';
  req.session.flash = null;
  const cls = f.kind === 'err' ? 'err' : 'ok';
  return `<div class="flash ${cls}">${escapeHtml(f.text)}</div>`;
}

let _basePageFn = null;
async function getBasePage() {
  if (_basePageFn) return _basePageFn;
  const mod = await import('./dashboardEditor.js');
  if (mod.default && mod.default._basePage) {
    _basePageFn = mod.default._basePage;
  } else {
    _basePageFn = (title, body, _extra = '', user = null) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:Segoe UI,Arial;background:#eef2f8;padding:20px">${body}
<p><a href="/">Beranda</a> | <a href="/logout">Logout</a></p></body></html>`;
  }
  return _basePageFn;
}

function statusBadge(rt) {
  const map = {
    draft: { color: '#64748b', bg: '#f1f5f9', label: 'Draft' },
    upcoming: { color: '#854d0e', bg: '#fef9c3', label: 'Akan Datang' },
    active: { color: '#166534', bg: '#dcfce7', label: 'Aktif' },
    expired: { color: '#991b1b', bg: '#fee2e2', label: 'Lewat Deadline' },
    closed: { color: '#475569', bg: '#e2e8f0', label: 'Ditutup' },
  };
  const m = map[rt] || map.draft;
  return `<span class="pill" style="background:${m.bg};color:${m.color};font-weight:700;font-size:12px">${m.label}</span>`;
}

function progressBar(pct) {
  const safePct = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="stat-bar" title="${safePct}%"><div class="fill" style="width:${safePct}%"></div></div>`;
}

async function getGuruAktif() {
  try {
    const raw = await dbAccess.getDirektoriGuru();
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

async function renderListPage(req) {
  const basePage = await getBasePage();
  const events = ev.listEvents();
  const guruAktif = await getGuruAktif();

  const rows = events.map((e) => {
    const rt = ev.getRuntimeStatus(e);
    const prog = ev.buildProgress(e, guruAktif);
    const dead = ev.getEffectiveDeadline(e);
    const extCount = Array.isArray(e.extensions) ? e.extensions.length : 0;
    return `<tr>
      <td><b>${escapeHtml(e.title)}</b>${extCount > 0 ? `<br><span class="small">↳ Diperpanjang ${extCount}×</span>` : ''}</td>
      <td>${statusBadge(rt)}</td>
      <td>${escapeHtml(ev.formatTanggalRingkasWIB(e.startAt))}</td>
      <td>${escapeHtml(ev.formatTanggalRingkasWIB(dead))}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;min-width:90px">${progressBar(prog.percentage)}</div>
          <span class="small" style="white-space:nowrap"><b>${prog.sudah.length}</b>/${prog.total} (${prog.percentage}%)</span>
        </div>
      </td>
      <td><a class="btn btn-sm" href="/event-validasi/${encodeURIComponent(e.id)}">Detail</a></td>
    </tr>`;
  }).join('');

  const body = `
    <div class="breadcrumb"><a href="/">Beranda</a> » Event Validasi Data Guru</div>
    ${takeFlash(req)}
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <h2 style="border:0;margin:0">📅 Event Validasi Data Guru</h2>
        <a class="btn" href="/event-validasi/new">➕ Buat Event Baru</a>
      </div>
      <p class="small">Fitur ini digunakan untuk mengadakan periode validasi data guru secara terjadwal.
      Setiap event memiliki <b>jadwal mulai</b>, <b>deadline</b>, dan dapat <b>diperpanjang</b> beberapa kali.
      Para guru dapat memvalidasi data via WhatsApp bot (<code>.validasidata</code>) maupun via dashboard ini.</p>
    </div>
    <div class="card">
      <h2>📋 Daftar Event</h2>
      ${events.length === 0
        ? '<div class="empty">Belum ada event. Klik "Buat Event Baru" untuk membuat event validasi pertama.</div>'
        : `<table>
            <thead><tr><th>Judul</th><th>Status</th><th>Mulai</th><th>Deadline</th><th>Progres</th><th>Aksi</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`}
    </div>`;
  return basePage('Event Validasi Data Guru', body, '', req.session.user);
}

async function renderNewPage(req, formData = {}, error = '') {
  const basePage = await getBasePage();
  const fields = ev.DEFAULT_REQUIRED_FIELDS;
  const body = `
    <div class="breadcrumb"><a href="/event-validasi">Event Validasi</a> » Buat Baru</div>
    ${error ? `<div class="flash err">${escapeHtml(error)}</div>` : ''}
    <div class="card">
      <h2>➕ Buat Event Validasi Baru</h2>
      <form method="POST" action="/event-validasi/new">
        <div class="field-grid">
          <div class="full">
            <label>Judul Event</label>
            <input type="text" name="title" required maxlength="120" value="${escapeHtml(formData.title || 'Validasi Data Guru ' + new Date().getFullYear())}" placeholder="Contoh: Validasi Data Guru Semester Ganjil 2026">
          </div>
          <div class="full">
            <label>Deskripsi (opsional)</label>
            <textarea name="description" rows="3" style="width:100%;padding:11px 13px;border:1.4px solid #d6deea;border-radius:10px;font-size:14px">${escapeHtml(formData.description || 'Mohon para ustadz untuk memvalidasi (memeriksa & memperbarui jika perlu) data pribadi masing-masing.')}</textarea>
          </div>
          <div>
            <label>Mulai Berlaku</label>
            <input type="datetime-local" name="startAt" required value="${escapeHtml(formData.startAt || ev.isoToDatetimeLocal(new Date().toISOString()))}">
            <p class="small">Waktu Indonesia Barat (WIB).</p>
          </div>
          <div>
            <label>Deadline / Batas Akhir</label>
            <input type="datetime-local" name="deadline" required value="${escapeHtml(formData.deadline || '')}">
            <p class="small">Deadline dapat diperpanjang setelah event dibuat.</p>
          </div>
          <div class="full">
            <label>Kolom Data yang Wajib Dikonfirmasi</label>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">
              ${fields.map((f) => `<label style="display:flex;align-items:center;gap:6px;text-transform:none;letter-spacing:0;font-weight:500;font-size:12.5px;color:#334155;margin:0">
                <input type="checkbox" name="requiredFields" value="${escapeHtml(f)}" checked style="width:auto;margin:0"> ${escapeHtml(f)}
              </label>`).join('')}
            </div>
            <p class="small">Centang kolom yang harus dipastikan kebenarannya oleh setiap guru.</p>
          </div>
        </div>
        <div class="row" style="margin-top:18px">
          <button class="btn" type="submit">💾 Buat Event</button>
          <a class="btn btn-ghost" href="/event-validasi">Batal</a>
        </div>
      </form>
    </div>`;
  return basePage('Buat Event Validasi', body, '', req.session.user);
}

async function renderDetailPage(req, event) {
  const basePage = await getBasePage();
  const guruAktif = await getGuruAktif();
  const prog = ev.buildProgress(event, guruAktif);
  const rt = ev.getRuntimeStatus(event);
  const effDeadline = ev.getEffectiveDeadline(event);
  const exts = Array.isArray(event.extensions) ? event.extensions : [];

  const sudahRows = prog.sudah.length
    ? prog.sudah.map((it, i) => `<tr>
        <td>${i + 1}</td>
        <td><code class="kbd">${escapeHtml(String(it.Stambuk))}</code></td>
        <td>${escapeHtml(it['Nama Lengkap'])}</td>
        <td>${escapeHtml(it.Status || '-')}</td>
        <td>${escapeHtml(ev.formatTanggalRingkasWIB(it.validatedAt))}</td>
        <td><span class="pill ${it.channel === 'wa' ? 'warn' : 'ok'}">${escapeHtml(String(it.channel).toUpperCase())}</span></td>
        <td>
          <form method="POST" action="/event-validasi/${encodeURIComponent(event.id)}/reset/${encodeURIComponent(it.Stambuk)}" onsubmit="return confirm('Reset validasi guru ini? Mereka akan harus validasi ulang.')" style="display:inline">
            <button class="btn btn-sm btn-ghost" type="submit">Reset</button>
          </form>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="empty">Belum ada guru yang validasi.</td></tr>';

  const belumRows = prog.belum.length
    ? prog.belum.slice(0, 500).map((it, i) => `<tr>
        <td>${i + 1}</td>
        <td><code class="kbd">${escapeHtml(String(it.Stambuk))}</code></td>
        <td>${escapeHtml(it['Nama Lengkap'])}</td>
        <td>${escapeHtml(it.Status || '-')}</td>
        <td>${escapeHtml(it.Bagian || '-')}</td>
        <td>${escapeHtml(it['No HP'] || '-')}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="empty">✅ Semua guru telah validasi!</td></tr>';

  const extHtml = exts.length
    ? `<div class="card">
        <h2>⏰ Riwayat Perpanjangan</h2>
        <table>
          <thead><tr><th>#</th><th>Deadline Baru</th><th>Catatan</th><th>Ditambahkan</th></tr></thead>
          <tbody>${exts.map((x, i) => `<tr>
            <td>${i + 1}</td>
            <td><b>${escapeHtml(ev.formatTanggalWIB(x.newDeadline))}</b></td>
            <td>${escapeHtml(x.note || '-')}</td>
            <td>${escapeHtml(ev.formatTanggalRingkasWIB(x.extendedAt))}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`
    : '';

  const body = `
    <div class="breadcrumb"><a href="/event-validasi">Event Validasi</a> » ${escapeHtml(event.title)}</div>
    ${takeFlash(req)}

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="border:0;margin:0 0 6px">📅 ${escapeHtml(event.title)}</h2>
          <p class="small">${escapeHtml(event.description || '(tanpa deskripsi)')}</p>
        </div>
        <div>${statusBadge(rt)}</div>
      </div>
      <div class="grid-3" style="margin-top:14px">
        <div><label>Mulai</label><div><b>${escapeHtml(ev.formatTanggalWIB(event.startAt))}</b></div></div>
        <div>
          <label>Deadline Efektif</label>
          <div><b style="color:${rt==='expired'?'#b42318':'#16376c'}">${escapeHtml(ev.formatTanggalWIB(effDeadline))}</b></div>
          ${exts.length ? `<p class="small">Asli: ${escapeHtml(ev.formatTanggalRingkasWIB(event.deadline))} (diperpanjang ${exts.length}×)</p>` : ''}
        </div>
        <div><label>Dibuat</label><div>${escapeHtml(ev.formatTanggalRingkasWIB(event.createdAt))}</div></div>
      </div>
    </div>

    <div class="card">
      <h2>📊 Progres Validasi</h2>
      <div class="grid-3">
        <div><label>Total Guru Aktif</label><div style="font-size:30px;font-weight:800;color:#16376c">${prog.total}</div></div>
        <div><label>Sudah Validasi</label><div style="font-size:30px;font-weight:800;color:#15803d">${prog.sudah.length}</div></div>
        <div><label>Belum Validasi</label><div style="font-size:30px;font-weight:800;color:#b42318">${prog.belum.length}</div></div>
      </div>
      <div style="margin-top:12px">${progressBar(prog.percentage)} <p class="small" style="text-align:right"><b>${prog.percentage}%</b> selesai</p></div>
      <div class="row" style="margin-top:12px">
        <a class="btn" href="/event-validasi/${encodeURIComponent(event.id)}/ekspor">⬇️ Ekspor Rekap (Excel)</a>
        <a class="btn btn-ghost" href="/event-validasi/${encodeURIComponent(event.id)}/ekspor?mode=belum">⬇️ Hanya yang Belum</a>
        <a class="btn btn-ghost" href="/event-validasi/${encodeURIComponent(event.id)}/ekspor?mode=sudah">⬇️ Hanya yang Sudah</a>
      </div>
    </div>

    <div class="card">
      <h2>⏰ Perpanjang Deadline</h2>
      <p class="small">Gunakan ini jika masih banyak guru yang belum validasi padahal deadline sudah/akan habis. Sistem akan mencatat catatan perpanjangan agar para guru tahu bahwa ini batas waktu tambahan.</p>
      <form method="POST" action="/event-validasi/${encodeURIComponent(event.id)}/perpanjang">
        <div class="grid-2">
          <div>
            <label>Deadline Baru</label>
            <input type="datetime-local" name="newDeadline" required value="${escapeHtml(ev.isoToDatetimeLocal(effDeadline))}">
          </div>
          <div>
            <label>Catatan (akan ditampilkan ke guru)</label>
            <input type="text" name="note" maxlength="200" placeholder="Contoh: Mohon segera selesaikan sebelum batas waktu tambahan.">
          </div>
        </div>
        <button class="btn" type="submit" style="margin-top:12px">📌 Perpanjang Deadline</button>
      </form>
    </div>

    ${extHtml}

    <div class="card">
      <h2>✅ Guru yang Sudah Validasi (${prog.sudah.length})</h2>
      <table>
        <thead><tr><th>#</th><th>Stambuk</th><th>Nama</th><th>Status</th><th>Waktu Validasi</th><th>Via</th><th>Aksi</th></tr></thead>
        <tbody>${sudahRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>⚠️ Guru yang Belum Validasi (${prog.belum.length})</h2>
      ${prog.belum.length > 500 ? `<p class="small">Menampilkan 500 dari ${prog.belum.length} entri.</p>` : ''}
      <table>
        <thead><tr><th>#</th><th>Stambuk</th><th>Nama</th><th>Status</th><th>Bagian</th><th>No HP</th></tr></thead>
        <tbody>${belumRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>⚙️ Manajemen Event</h2>
      <div class="row">
        <form method="POST" action="/event-validasi/${encodeURIComponent(event.id)}/toggle" style="display:inline">
          <button class="btn ${event.status === 'active' ? 'btn-danger' : 'btn-success'}" type="submit">
            ${event.status === 'active' ? '🛑 Tutup Event' : '▶️ Aktifkan Event'}
          </button>
        </form>
        <form method="POST" action="/event-validasi/${encodeURIComponent(event.id)}/hapus" style="display:inline"
              onsubmit="return confirm('Yakin ingin MENGHAPUS event ini? Semua data submission akan hilang!')">
          <button class="btn btn-danger" type="submit">🗑️ Hapus Event</button>
        </form>
        <a class="btn btn-ghost" href="/event-validasi">← Kembali ke Daftar</a>
      </div>
    </div>`;
  return basePage(event.title, body, '', req.session.user);
}

async function renderUstadzValidasiPage(req, event, record, error = '') {
  const basePage = await getBasePage();
  const rt = ev.getRuntimeStatus(event);
  const effDeadline = ev.getEffectiveDeadline(event);
  const fields = Array.isArray(event.requiredFields) && event.requiredFields.length
    ? event.requiredFields
    : ev.DEFAULT_REQUIRED_FIELDS;
  const exts = Array.isArray(event.extensions) ? event.extensions : [];
  const stambuk = req.session.user?.stambuk;
  const sudah = !!event.submissions?.[String(stambuk)];
  const lastSub = event.submissions?.[String(stambuk)] || null;

  const rowsHtml = fields.map((f) => {
    const val = record ? formatEditValue(record[f]) : '-';
    const isEmpty = !val || val === '-' || val === '(kosong)';
    return `<tr>
      <th style="width:35%">${escapeHtml(f)}</th>
      <td>${isEmpty ? '<span class="pill bad">KOSONG</span>' : escapeHtml(val)}</td>
    </tr>`;
  }).join('');

  const extNotice = exts.length
    ? `<div class="flash" style="background:#fef9c3;color:#854d0e;border:1px solid #fde68a">
        ⏰ <b>Deadline telah diperpanjang ${exts.length}×.</b><br>
        ${exts.slice(-1).map((x) => `Batas waktu sekarang: <b>${escapeHtml(ev.formatTanggalWIB(x.newDeadline))}</b>${x.note ? `<br>Catatan dari admin: <i>"${escapeHtml(x.note)}"</i>` : ''}`).join('')}
      </div>`
    : '';

  let body;
  if (rt === 'closed') {
    body = `<div class="card flash err">🛑 Event "${escapeHtml(event.title)}" sudah ditutup oleh admin.</div>
            <p><a class="btn btn-ghost" href="/me">← Kembali ke Akun Saya</a></p>`;
  } else if (rt === 'upcoming') {
    body = `<div class="card flash" style="background:#fef9c3;color:#854d0e;border:1px solid #fde68a">
              ⏳ Event "${escapeHtml(event.title)}" akan mulai pada <b>${escapeHtml(ev.formatTanggalWIB(event.startAt))}</b>.
            </div>
            <p><a class="btn btn-ghost" href="/me">← Kembali ke Akun Saya</a></p>`;
  } else if (rt === 'expired') {
    body = `<div class="card flash err">⛔ Event "${escapeHtml(event.title)}" sudah melewati deadline (${escapeHtml(ev.formatTanggalWIB(effDeadline))}).
            <br>Silakan hubungi admin Pusdat jika Anda perlu validasi.</div>
            <p><a class="btn btn-ghost" href="/me">← Kembali ke Akun Saya</a></p>`;
  } else {
    body = `
      <div class="breadcrumb"><a href="/me">Akun Saya</a> » Validasi Data</div>
      ${error ? `<div class="flash err">${escapeHtml(error)}</div>` : ''}
      ${extNotice}
      ${sudah ? `<div class="flash ok">✅ Anda sudah validasi pada <b>${escapeHtml(ev.formatTanggalRingkasWIB(lastSub.validatedAt))}</b> via <b>${escapeHtml(String(lastSub.channel).toUpperCase())}</b>.<br>Anda boleh mengirim ulang konfirmasi jika ada perubahan data.</div>` : ''}

      <div class="card">
        <h2>📅 ${escapeHtml(event.title)}</h2>
        <p>${escapeHtml(event.description || '')}</p>
        <div class="grid-3">
          <div><label>Mulai</label><div>${escapeHtml(ev.formatTanggalRingkasWIB(event.startAt))}</div></div>
          <div><label>Deadline</label><div><b>${escapeHtml(ev.formatTanggalRingkasWIB(effDeadline))}</b></div></div>
          <div><label>Status Anda</label><div>${sudah ? '<span class="pill ok">SUDAH VALIDASI</span>' : '<span class="pill bad">BELUM VALIDASI</span>'}</div></div>
        </div>
      </div>

      <div class="card">
        <h2>🔍 Data Anda Saat Ini</h2>
        <p class="small">Periksa kebenaran data berikut. Jika ada yang salah/kosong, silakan perbaiki dulu lewat tombol <b>"Edit Data Saya"</b>, baru kemudian klik tombol <b>"Saya Konfirmasi Data Sudah Benar"</b>.</p>
        <table>${rowsHtml}</table>
        <div class="row" style="margin-top:12px">
          <a class="btn btn-ghost" href="/edit/guru/${encodeURIComponent(stambuk)}">✏️ Edit Data Saya</a>
          <a class="btn btn-ghost" href="/me">← Akun Saya</a>
        </div>
      </div>

      <div class="card">
        <h2>✅ Konfirmasi Validasi</h2>
        <form method="POST" action="/me/validasi/${encodeURIComponent(event.id)}">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px">
            ${fields.map((f) => `<label style="display:flex;align-items:flex-start;gap:8px;text-transform:none;letter-spacing:0;font-weight:500;font-size:13px;color:#334155;margin-bottom:8px">
              <input type="checkbox" name="confirm_${escapeHtml(f)}" required style="width:auto;margin-top:3px"> Saya menyatakan kolom <b style="margin-left:3px">${escapeHtml(f)}</b> sudah benar.
            </label>`).join('')}
          </div>
          <div>
            <label>Catatan (opsional)</label>
            <input type="text" name="note" maxlength="200" placeholder="Contoh: NUPTK baru saja diperbarui.">
          </div>
          <button class="btn btn-success" type="submit" style="margin-top:14px">📤 Kirim Konfirmasi Validasi</button>
        </form>
      </div>`;
  }
  return basePage('Validasi Data — ' + event.title, body, '', req.session.user);
}

// Ekspor menggunakan modul xlsx (SheetJS) — konsisten dengan project
async function generateEventRekapExcel(event, mode = 'all') {
  const { loadXLSX } = await import('./dashboardExport.js');
  const XLSX = await loadXLSX();

  const guruAktif = await getGuruAktif();
  const prog = ev.buildProgress(event, guruAktif);

  const wb = XLSX.utils.book_new();

  const infoRows = [
    { Kolom: 'Judul Event', Nilai: event.title },
    { Kolom: 'Deskripsi', Nilai: event.description || '-' },
    { Kolom: 'Mulai', Nilai: ev.formatTanggalWIB(event.startAt) },
    { Kolom: 'Deadline Asli', Nilai: ev.formatTanggalWIB(event.deadline) },
    { Kolom: 'Deadline Efektif', Nilai: ev.formatTanggalWIB(ev.getEffectiveDeadline(event)) },
    { Kolom: 'Status', Nilai: ev.getRuntimeStatus(event).toUpperCase() },
    { Kolom: 'Jumlah Perpanjangan', Nilai: Array.isArray(event.extensions) ? event.extensions.length : 0 },
    { Kolom: 'Total Guru Aktif', Nilai: prog.total },
    { Kolom: 'Sudah Validasi', Nilai: prog.sudah.length },
    { Kolom: 'Belum Validasi', Nilai: prog.belum.length },
    { Kolom: 'Persentase', Nilai: `${prog.percentage}%` },
    { Kolom: 'Dicetak', Nilai: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB' },
  ];
  const wsInfo = XLSX.utils.json_to_sheet(infoRows, { header: ['Kolom', 'Nilai'] });
  wsInfo['!cols'] = [{ wch: 28 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Ringkasan');

  if (mode === 'all' || mode === 'sudah') {
    const rows = prog.sudah.map((it, i) => ({
      No: i + 1,
      Stambuk: it.Stambuk,
      'Nama Lengkap': it['Nama Lengkap'],
      Status: it.Status,
      Bagian: it.Bagian,
      'No HP': it['No HP'],
      'Waktu Validasi': ev.formatTanggalRingkasWIB(it.validatedAt),
      Via: String(it.channel || '').toUpperCase(),
      Catatan: it.note || '',
    }));
    const safeRows = rows.length ? rows : [{ No: '', Stambuk: '', 'Nama Lengkap': '(belum ada)', Status: '', Bagian: '', 'No HP': '', 'Waktu Validasi': '', Via: '', Catatan: '' }];
    const ws1 = XLSX.utils.json_to_sheet(safeRows, {
      header: ['No', 'Stambuk', 'Nama Lengkap', 'Status', 'Bagian', 'No HP', 'Waktu Validasi', 'Via', 'Catatan'],
    });
    ws1['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 32 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 8 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Sudah Validasi');
  }

  if (mode === 'all' || mode === 'belum') {
    const rows = prog.belum.map((it, i) => ({
      No: i + 1,
      Stambuk: it.Stambuk,
      'Nama Lengkap': it['Nama Lengkap'],
      Status: it.Status,
      Bagian: it.Bagian,
      'No HP': it['No HP'],
    }));
    const safeRows = rows.length ? rows : [{ No: '', Stambuk: '', 'Nama Lengkap': '(semua sudah validasi)', Status: '', Bagian: '', 'No HP': '' }];
    const ws2 = XLSX.utils.json_to_sheet(safeRows, { header: ['No', 'Stambuk', 'Nama Lengkap', 'Status', 'Bagian', 'No HP'] });
    ws2['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 32 }, { wch: 12 }, { wch: 18 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Belum Validasi');
  }

  const exts = Array.isArray(event.extensions) ? event.extensions : [];
  if (exts.length) {
    const rows = exts.map((x, i) => ({
      No: i + 1,
      'Deadline Baru': ev.formatTanggalWIB(x.newDeadline),
      Catatan: x.note || '',
      'Ditambahkan Pada': ev.formatTanggalRingkasWIB(x.extendedAt),
    }));
    const ws3 = XLSX.utils.json_to_sheet(rows, { header: ['No', 'Deadline Baru', 'Catatan', 'Ditambahkan Pada'] });
    ws3['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 50 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Riwayat Perpanjangan');
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export function registerEventValidasiRoutes(app, requireAuth) {
  app.get('/event-validasi', requireAuthRoles(['admin']), async (req, res) => {
    try { res.send(await renderListPage(req)); }
    catch (err) { res.status(500).send(`<pre>${escapeHtml(err.stack || err.message)}</pre>`); }
  });

  app.get('/event-validasi/new', requireAuthRoles(['admin']), async (req, res) => {
    res.send(await renderNewPage(req));
  });

  app.post('/event-validasi/new', requireAuthRoles(['admin']), async (req, res) => {
    const body = req.body || {};
    try {
      let reqFields = body.requiredFields;
      if (!Array.isArray(reqFields)) reqFields = reqFields ? [reqFields] : [];
      const created = ev.createEvent({
        title: body.title,
        description: body.description,
        startAt: body.startAt,
        deadline: body.deadline,
        requiredFields: reqFields,
        createdBy: req.session.user?.label || 'admin',
        status: 'active',
      });
      setFlash(req, 'ok', `✅ Event "${created.title}" berhasil dibuat.`);
      res.redirect(`/event-validasi/${encodeURIComponent(created.id)}`);
    } catch (err) {
      res.send(await renderNewPage(req, body, err.message));
    }
  });

  app.get('/event-validasi/:id', requireAuthRoles(['admin']), async (req, res) => {
    const event = ev.getEvent(req.params.id);
    if (!event) {
      setFlash(req, 'err', 'Event tidak ditemukan.');
      return res.redirect('/event-validasi');
    }
    try { res.send(await renderDetailPage(req, event)); }
    catch (err) { res.status(500).send(`<pre>${escapeHtml(err.stack || err.message)}</pre>`); }
  });

  app.post('/event-validasi/:id/perpanjang', requireAuthRoles(['admin']), async (req, res) => {
    try {
      ev.extendDeadline(req.params.id, {
        newDeadline: req.body.newDeadline,
        note: req.body.note,
        by: req.session.user?.label || 'admin',
      });
      setFlash(req, 'ok', '⏰ Deadline berhasil diperpanjang.');
    } catch (err) {
      setFlash(req, 'err', `Gagal perpanjang: ${err.message}`);
    }
    res.redirect(`/event-validasi/${encodeURIComponent(req.params.id)}`);
  });

  app.post('/event-validasi/:id/toggle', requireAuthRoles(['admin']), async (req, res) => {
    try {
      const updated = ev.toggleEventStatus(req.params.id);
      setFlash(req, 'ok', updated.status === 'active' ? '▶️ Event diaktifkan.' : '🛑 Event ditutup.');
    } catch (err) { setFlash(req, 'err', err.message); }
    res.redirect(`/event-validasi/${encodeURIComponent(req.params.id)}`);
  });

  app.post('/event-validasi/:id/hapus', requireAuthRoles(['admin']), async (req, res) => {
    try {
      ev.deleteEvent(req.params.id);
      setFlash(req, 'ok', 'Event dihapus.');
      res.redirect('/event-validasi');
    } catch (err) {
      setFlash(req, 'err', err.message);
      res.redirect(`/event-validasi/${encodeURIComponent(req.params.id)}`);
    }
  });

  app.post('/event-validasi/:id/reset/:stambuk', requireAuthRoles(['admin']), async (req, res) => {
    try {
      ev.removeSubmission(req.params.id, req.params.stambuk);
      setFlash(req, 'ok', `Submission stambuk ${req.params.stambuk} direset.`);
    } catch (err) { setFlash(req, 'err', err.message); }
    res.redirect(`/event-validasi/${encodeURIComponent(req.params.id)}`);
  });

  app.get('/event-validasi/:id/ekspor', requireAuthRoles(['admin']), async (req, res) => {
    const event = ev.getEvent(req.params.id);
    if (!event) {
      setFlash(req, 'err', 'Event tidak ditemukan.');
      return res.redirect('/event-validasi');
    }
    try {
      const mode = ['sudah', 'belum'].includes(String(req.query.mode)) ? String(req.query.mode) : 'all';
      const buffer = await generateEventRekapExcel(event, mode);
      const fname = `Rekap_${event.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${mode}.xlsx`;
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${fname}"`);
      res.send(buffer);
    } catch (err) {
      setFlash(req, 'err', `Ekspor gagal: ${err.message}`);
      res.redirect(`/event-validasi/${encodeURIComponent(req.params.id)}`);
    }
  });

  // ════════ USTADZ routes ════════
  app.get('/me/validasi', requireAuth, async (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');
    if (user.role !== 'ustadz') {
      setFlash(req, 'err', 'Fitur validasi data hanya untuk ustadz.');
      return res.redirect(user.role === 'admin' ? '/' : '/me');
    }
    const open = ev.getOpenEvent();
    if (!open) {
      const basePage = await getBasePage();
      return res.send(basePage('Validasi Data', `
        <div class="breadcrumb"><a href="/me">Akun Saya</a> » Validasi Data</div>
        <div class="card flash" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1">
          ℹ️ Saat ini tidak ada event validasi data yang aktif.
        </div>
        <p><a class="btn btn-ghost" href="/me">← Kembali</a></p>
      `, '', user));
    }
    res.redirect(`/me/validasi/${encodeURIComponent(open.id)}`);
  });

  app.get('/me/validasi/:id', requireAuth, async (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');
    if (user.role !== 'ustadz') {
      setFlash(req, 'err', 'Fitur validasi data hanya untuk ustadz.');
      return res.redirect(user.role === 'admin' ? '/' : '/me');
    }
    const event = ev.getEvent(req.params.id);
    if (!event) {
      setFlash(req, 'err', 'Event tidak ditemukan.');
      return res.redirect('/me');
    }
    try {
      const record = await getEditableRecordByStambuk('guru', user.stambuk);
      res.send(await renderUstadzValidasiPage(req, event, record));
    } catch (err) {
      res.status(500).send(`<pre>${escapeHtml(err.stack || err.message)}</pre>`);
    }
  });

  app.post('/me/validasi/:id', requireAuth, async (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');
    if (user.role !== 'ustadz') {
      setFlash(req, 'err', 'Hanya ustadz.');
      return res.redirect('/me');
    }
    const event = ev.getEvent(req.params.id);
    if (!event) {
      setFlash(req, 'err', 'Event tidak ditemukan.');
      return res.redirect('/me');
    }
    const fields = Array.isArray(event.requiredFields) && event.requiredFields.length
      ? event.requiredFields
      : ev.DEFAULT_REQUIRED_FIELDS;
    const fieldsConfirmed = {};
    let missing = [];
    for (const f of fields) {
      if (req.body[`confirm_${f}`]) fieldsConfirmed[f] = true;
      else missing.push(f);
    }
    if (missing.length > 0) {
      try {
        const record = await getEditableRecordByStambuk('guru', user.stambuk);
        return res.send(await renderUstadzValidasiPage(req, event, record,
          `Anda belum mencentang konfirmasi untuk: ${missing.join(', ')}.`));
      } catch (err) {
        setFlash(req, 'err', err.message);
        return res.redirect(`/me/validasi/${encodeURIComponent(event.id)}`);
      }
    }
    try {
      ev.submitValidation(event.id, user.stambuk, {
        channel: 'web',
        note: String(req.body.note || ''),
        fieldsConfirmed,
        nama: user.nama,
      });
      setFlash(req, 'ok', '✅ Konfirmasi validasi data Anda telah diterima. Terima kasih!');
      res.redirect(`/me/validasi/${encodeURIComponent(event.id)}`);
    } catch (err) {
      setFlash(req, 'err', err.message);
      res.redirect(`/me/validasi/${encodeURIComponent(event.id)}`);
    }
  });
}

export default {
  registerEventValidasiRoutes,
  _generateEventRekapExcel: generateEventRekapExcel,
};
