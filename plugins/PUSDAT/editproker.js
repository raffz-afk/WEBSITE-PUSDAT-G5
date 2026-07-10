/**
 * ============================================================
 *  plugins/PUSDAT/editproker.js — 🆕 v12: Editor Proker via WA (Owner Only)
 * ============================================================
 *
 *  Sebelumnya, proker hanya bisa diedit dengan ngedit file
 *  database/proker/proker_*.json langsung. Plugin ini membuat
 *  proses jadi fleksibel: owner bisa add/edit/delete/reset
 *  proker bulanan, pekanan, dan tahunan langsung dari WA.
 *
 *  Command:
 *    .editproker [bulanan|pekanan|tahunan] add | Judul | Target | PIC
 *    .editproker [bulanan|pekanan|tahunan] add
 *      ↳ jika tanpa argumen lain, bot kirim template & user reply
 *    .editproker [bulanan|pekanan|tahunan] edit [no] | Judul | Target | PIC
 *    .editproker [bulanan|pekanan|tahunan] del [no]
 *    .editproker reset [bulanan|pekanan|tahunan]
 *    .editproker setbulan [hijriyah] | [masehi]
 *    .editproker setpekan [label] | [tanggal_mulai]
 *    .editproker settahun [hijriyah] | [masehi]
 *    .editproker show [bulanan|pekanan|tahunan]
 *    .editproker help
 *
 *  Contoh cepat:
 *    .editproker bulanan add | Audit Berkas Q2 | Selesai 100% akhir bulan | Tim Pusdat
 *    .editproker pekanan edit 1 | Backup mingguan | Setiap Jumat | Staf Piket
 *    .editproker bulanan del 2
 *    .editproker reset pekanan
 *    .editproker setbulan Syawal 1447 H | April 2026
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';
import { isOwner } from '../../lib/users.js';
import {
  addProker,
  editProker,
  delProker,
  resetProker,
  setHeaderProker,
  getProkerByType,
  parseProkerInput,
} from '../../lib/prokerEditor.js';

const VALID_TYPES = ['bulanan', 'pekanan', 'tahunan'];

function helpText() {
  return (
    `📝 *EDITOR PROKER — PANDUAN*\n\n` +
    `*1. Tambah:*\n` +
    `\`\`\`.editproker bulanan add | Judul | Target | PIC\`\`\`\n` +
    `\`\`\`.editproker pekanan add | Judul | Target | PIC\`\`\`\n` +
    `\`\`\`.editproker tahunan add | Judul | Target | Deadline | Status\`\`\`\n\n` +
    `*2. Ubah:*\n` +
    `\`\`\`.editproker bulanan edit 2 | Judul Baru | Target Baru | PIC Baru\`\`\`\n\n` +
    `*3. Hapus:*\n` +
    `\`\`\`.editproker bulanan del 3\`\`\`\n\n` +
    `*4. Reset (kosongkan semua):*\n` +
    `\`\`\`.editproker reset bulanan\`\`\`\n` +
    `\`\`\`.editproker reset pekanan\`\`\`\n\n` +
    `*5. Ubah Header:*\n` +
    `\`\`\`.editproker setbulan Syawal 1447 H | April 2026\`\`\`\n` +
    `\`\`\`.editproker setpekan Pekan ke-2 Syawal | 2026-05-01\`\`\`\n` +
    `\`\`\`.editproker settahun 1447 H | 2026\`\`\`\n\n` +
    `*6. Lihat hasil:*\n` +
    `\`\`\`.editproker show bulanan\`\`\`\n` +
    `\`\`\`.listproker bulanan\`\`\`\n\n` +
    `_💾 Setiap perubahan otomatis di-backup ke folder_\n` +
    `_database/proker/_backup/_`
  );
}

function formatItem(it, type) {
  if (type === 'tahunan') {
    return (
      `• No: ${it.no}\n` +
      `• Judul: ${it.judul}\n` +
      `• Target: ${it.target}\n` +
      `• Deadline: ${it.deadline || '-'}\n` +
      `• Status: ${it.status || '-'}`
    );
  }
  return (
    `• No: ${it.no}\n` +
    `• Judul: ${it.judul}\n` +
    `• Target: ${it.target}\n` +
    `• PIC: ${it.pic || '-'}`
  );
}

async function handle(sock, messageInfo) {
  const { m, sender } = messageInfo;
  const content = (messageInfo.content || messageInfo.fullText || '').trim();

  // ── GUARD: Owner only ──
  if (!isOwner(sender)) {
    return await reply(
      m,
      `🚫 *Akses Ditolak!*\n\n` +
      `Fitur *.editproker* hanya bisa digunakan oleh *Owner Bot*.\n` +
      `Hubungi developer jika Anda perlu akses.`,
    );
  }

  // ── Argumen kosong → tampilkan help ──
  if (!content) {
    return await reply(m, helpText());
  }

  const lower = content.toLowerCase();

  // ── HELP ──
  if (lower === 'help' || lower === '?' || lower === 'bantuan') {
    return await reply(m, helpText());
  }

  // ── Parse: command structure ──
  // Pertama tentukan: tipe (bulanan/pekanan/tahunan) atau action global
  const tokens = content.split(/\s+/);
  const firstToken = tokens[0].toLowerCase();

  // ── ACTION: reset [type] ──
  if (firstToken === 'reset') {
    const type = (tokens[1] || '').toLowerCase();
    if (!VALID_TYPES.includes(type)) {
      return await reply(
        m,
        `❌ Format: \`.editproker reset [bulanan|pekanan|tahunan]\``,
      );
    }
    const r = resetProker(type);
    if (!r.ok) {
      return await reply(m, `❌ Gagal reset: ${r.reason || 'Unknown error'}`);
    }
    return await reply(
      m,
      `🗑️ *RESET BERHASIL*\n\n` +
      `Daftar proker *${type.toUpperCase()}* dikosongkan.\n` +
      `Total item terhapus: *${r.totalSebelum}*\n\n` +
      `_File otomatis di-backup ke database/proker/_backup/_`,
    );
  }

  // ── ACTION: setbulan / setpekan / settahun ──
  if (firstToken === 'setbulan' || firstToken === 'setpekan' || firstToken === 'settahun') {
    const type =
      firstToken === 'setbulan' ? 'bulanan' :
      firstToken === 'setpekan' ? 'pekanan' : 'tahunan';
    const rest = content.substring(firstToken.length).trim();
    const parts = rest.split('|').map((x) => x.trim()).filter(Boolean);
    if (parts.length === 0) {
      return await reply(
        m,
        `❌ Format: \`.editproker ${firstToken} [nilai1] | [nilai2]\`\n\n` +
        `Contoh:\n` +
        (type === 'bulanan'
          ? `\`\`\`.editproker setbulan Syawal 1447 H | April 2026\`\`\``
          : type === 'pekanan'
          ? `\`\`\`.editproker setpekan Pekan ke-2 Syawal | 2026-05-01\`\`\``
          : `\`\`\`.editproker settahun 1447 H | 2026\`\`\``),
      );
    }
    const r = setHeaderProker(type, parts[0], parts[1]);
    if (!r.ok) return await reply(m, `❌ Gagal: ${r.reason || 'Unknown error'}`);
    return await reply(
      m,
      `✏️ *HEADER ${type.toUpperCase()} DIPERBARUI*\n\n` +
      (type === 'bulanan'
        ? `📅 Bulan Hijriyah: ${r.data.bulan_hijriyah}\n📅 Bulan Masehi: ${r.data.bulan_masehi}`
        : type === 'pekanan'
        ? `📅 Label Pekan: ${r.data.pekan_label}\n📅 Mulai: ${r.data.tanggal_mulai}`
        : `📅 Tahun Hijriyah: ${r.data.tahun_hijriyah}\n📅 Tahun Masehi: ${r.data.tahun_masehi}`),
    );
  }

  // ── ACTION: show [type] ──
  if (firstToken === 'show' || firstToken === 'lihat') {
    const type = (tokens[1] || 'bulanan').toLowerCase();
    if (!VALID_TYPES.includes(type)) {
      return await reply(m, `❌ Tipe harus: bulanan / pekanan / tahunan`);
    }
    const data = getProkerByType(type);
    if (!data || !data.list || data.list.length === 0) {
      return await reply(m, `_Belum ada proker ${type} terdaftar._`);
    }
    const head = `📋 *PROKER ${type.toUpperCase()} (${data.list.length} item)*\n\n`;
    const body = data.list
      .map((it) => formatItem(it, type))
      .join('\n────────────\n');
    return await reply(m, head + body);
  }

  // ── ACTION dengan TYPE prefix: bulanan/pekanan/tahunan add/edit/del ──
  if (!VALID_TYPES.includes(firstToken)) {
    return await reply(
      m,
      `❌ *Perintah tidak dikenal:* \`${firstToken}\`\n\n` +
      `Ketik \`.editproker help\` untuk panduan lengkap.`,
    );
  }

  const type = firstToken;
  const action = (tokens[1] || '').toLowerCase();
  const rest = content
    .substring(firstToken.length)
    .replace(new RegExp(`^\\s*${action}\\s*`, 'i'), '')
    .trim();

  // ── ACTION: add ──
  if (action === 'add' || action === 'tambah' || action === '+') {
    if (!rest) {
      return await reply(
        m,
        `📝 *Tambah Proker ${type.toUpperCase()}*\n\n` +
        `Format pipe (1 baris):\n` +
        (type === 'tahunan'
          ? `\`\`\`.editproker tahunan add | Judul | Target | Deadline | Status\`\`\``
          : `\`\`\`.editproker ${type} add | Judul | Target | PIC\`\`\``) + '\n\n' +
        `Atau format multi-baris (kirim ulang dengan):\n` +
        `\`\`\`\n.editproker ${type} add\njudul: ...\ntarget: ...\n${type === 'tahunan' ? 'deadline: ...\nstatus: berjalan' : 'pic: ...'}\n\`\`\``,
      );
    }
    const fields = parseProkerInput(rest, type);
    if (!fields.judul) {
      return await reply(m, `❌ Field *judul* wajib diisi.`);
    }
    const r = addProker(type, fields);
    if (!r.ok) return await reply(m, `❌ Gagal tambah: ${r.reason || 'Unknown'}`);
    return await reply(
      m,
      `✅ *PROKER ${type.toUpperCase()} DITAMBAHKAN*\n\n` +
      formatItem(r.item, type) +
      `\n\n_Total proker ${type} sekarang: ${getProkerByType(type).list.length} item_`,
    );
  }

  // ── ACTION: edit [no] ──
  if (action === 'edit' || action === 'ubah' || action === 'update') {
    const no = parseInt(tokens[2], 10);
    if (!no) {
      return await reply(
        m,
        `❌ Sebutkan nomor proker yang akan diubah.\n\n` +
        `Contoh: \`.editproker ${type} edit 2 | Judul Baru | Target Baru | ${type === 'tahunan' ? 'Deadline | berjalan' : 'PIC Baru'}\``,
      );
    }
    const restAfterNo = rest.replace(new RegExp(`^${no}\\s*`), '').trim();
    if (!restAfterNo) {
      return await reply(
        m,
        `❌ Sertakan field yang diubah setelah nomor.\n\n` +
        `Contoh:\n\`\`\`.editproker ${type} edit ${no} | Judul Baru | Target Baru | ${type === 'tahunan' ? 'Deadline | berjalan' : 'PIC Baru'}\`\`\``,
      );
    }
    const fields = parseProkerInput(restAfterNo, type);
    const r = editProker(type, no, fields);
    if (!r.ok) {
      const msg = r.reason === 'NOMOR_TIDAK_DITEMUKAN'
        ? `❌ Proker no.${no} tidak ditemukan.`
        : `❌ Gagal edit: ${r.reason || 'Unknown'}`;
      return await reply(m, msg);
    }
    return await reply(
      m,
      `✏️ *PROKER ${type.toUpperCase()} #${no} DIPERBARUI*\n\n` +
      formatItem(r.item, type),
    );
  }

  // ── ACTION: del [no] ──
  if (action === 'del' || action === 'delete' || action === 'hapus' || action === '-') {
    const no = parseInt(tokens[2], 10);
    if (!no) {
      return await reply(
        m,
        `❌ Sebutkan nomor proker yang akan dihapus.\n` +
        `Contoh: \`.editproker ${type} del 3\``,
      );
    }
    const r = delProker(type, no);
    if (!r.ok) {
      const msg = r.reason === 'NOMOR_TIDAK_DITEMUKAN'
        ? `❌ Proker no.${no} tidak ditemukan.`
        : `❌ Gagal hapus: ${r.reason || 'Unknown'}`;
      return await reply(m, msg);
    }
    return await reply(
      m,
      `🗑️ *PROKER ${type.toUpperCase()} #${no} DIHAPUS*\n\n` +
      `Item terhapus:\n${formatItem(r.removed, type)}\n\n` +
      `_Sisa proker ${type}: ${getProkerByType(type).list.length} item_\n` +
      `_File otomatis di-backup._`,
    );
  }

  // ── Default: action tidak dikenal ──
  return await reply(
    m,
    `❌ Aksi tidak dikenal: *${action}*\n\n` +
    `Aksi yang valid: add, edit, del, show\n\n` +
    `Ketik \`.editproker help\` untuk panduan.`,
  );
}

export default {
  handle,
  Commands: ['editproker', 'editprokr', 'edpro'],
  OnlyOwner: true,
  OnlyPremium: false,
  description: 'Editor Proker (Owner): tambah/ubah/hapus proker bulanan/pekanan/tahunan via WA',
  category: 'PUSDAT',
};
