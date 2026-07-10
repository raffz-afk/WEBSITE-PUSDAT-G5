/**
 * ============================================================
 *  plugins/PUSDAT/tutorial.js — Panduan Penggunaan SISFO PUSDAT (v12)
 * ============================================================
 *
 *  PLUGIN INI:
 *  - Menampilkan panduan lengkap & mudah dipahami
 *  - Dipecah otomatis menjadi 3-4 pesan agar tidak terpotong WA
 *  - Sub-bab: GURU/UMUM, STAF, PIKET HARIAN, BROADCAST, OWNER
 *  - Disertai contoh konkret & tip troubleshooting
 *
 *  COMMAND: .tutorialpusdat
 *           .tutorialpusdat 1   → Bagian GURU/UMUM
 *           .tutorialpusdat 2   → Bagian STAF
 *           .tutorialpusdat 3   → Bagian PIKET HARIAN & BROADCAST
 *           .tutorialpusdat 4   → Bagian OWNER (edit proker, dsb)
 *
 *  PENEMPATAN FILE:
 *  Salin ke folder: plugins/PUSDAT/tutorial.js
 *
 * ============================================================
 */

import { reply } from '../../lib/utils.js';

const PART_1_GURU = `📖 *ᴛᴜᴛᴏʀɪᴀʟ ꜱɪꜱꜰᴏ ᴘᴜꜱᴅᴀᴛ — ʙᴀɢɪᴀɴ 1/4*
*👤 UNTUK GURU & PENGGUNA UMUM*

━━━━━━━━━━━━━━━━━━━━━━
*1️⃣ Cek Data Pribadi Anda Sendiri*
Perintah: *.cek*
Alur:
   • Ketik *.cek*
   • Bot meminta Stambuk Anda
   • Lalu bot meminta Tanggal Lahir (DD/MM/YYYY)
   • Jika cocok → Bot menampilkan biodata Anda
Contoh balasan setelah .cek:
   \`\`\`123456\`\`\`
   \`\`\`15/08/1990\`\`\`

━━━━━━━━━━━━━━━━━━━━━━
*2️⃣ Lihat Daftar Kelas & Santri*
Perintah: *.listsantri*
   • Tanpa argumen → daftar semua kelas + jumlah santri
   • Dengan argumen → daftar nama di kelas itu
Contoh:
   \`\`\`.listsantri\`\`\`
   \`\`\`.listsantri 3 Int B\`\`\`
   \`\`\`.listsantri 4 KMI A\`\`\`

━━━━━━━━━━━━━━━━━━━━━━
*3️⃣ Cari Stambuk Berdasarkan Nama*
Perintah: *.carisantri [nama]*
Contoh:
   \`\`\`.carisantri Ahmad Fauzi\`\`\`
   \`\`\`.carisantri budi\`\`\`
Bot akan menampilkan kandidat dengan stambuk-nya.

━━━━━━━━━━━━━━━━━━━━━━
*4️⃣ Statistik Santri (Publik)*
Perintah: *.statsantri [Kolom] # [Nilai]*
Contoh:
   \`\`\`.statsantri Konsulat # Jawa Tengah\`\`\`
   \`\`\`.statsantri Kelas # 3 Int B\`\`\`
Output: jumlah santri & breakdown.

━━━━━━━━━━━━━━━━━━━━━━
*5️⃣ Ekspor Data ke Excel (Ringan)*
Perintah: *.ekspor [Kolom] # [Nilai]*
Contoh:
   \`\`\`.ekspor Kelas # 3 Int B\`\`\`
   \`\`\`.ekspor Konsulat # Jawa Barat\`\`\`
File Excel berisi 5 kolom: Nama, Stambuk, Kelas, Konsulat, No. HP.

➡️ Lanjut ke bagian 2 ketik:
   \`\`\`.tutorialpusdat 2\`\`\``;

const PART_2_STAF = `📖 *ᴛᴜᴛᴏʀɪᴀʟ — ʙᴀɢɪᴀɴ 2/4*
*🔐 KHUSUS STAF PUSDAT (Butuh Password)*

> 💡 Password staf tunggal: *nosystemissafe*
> (Bisa diubah lewat config — hubungi owner)

━━━━━━━━━━━━━━━━━━━━━━
*1️⃣ Lihat Biodata Lengkap + Foto*
Perintah: *.ceksantri*
Alur:
   • Ketik *.ceksantri*
   • Masukkan Password Staf
   • Masukkan Stambuk
   • Bot kirim biodata + foto profil santri

━━━━━━━━━━━━━━━━━━━━━━
*2️⃣ Audit Berkas Santri*
Mengecek apakah santri sudah upload 9 jenis berkas:
   A. Foto Akses     B. Ijazah
   C. Akta Kelahiran D. Kartu Keluarga
   E. Surat Permohonan F. Surat Pernyataan
   G. Pakta Integritas H. BPJS
   I. Lain-lain

📂 *Per kelas:*
   \`\`\`.auditberkas 3 Int B\`\`\`
   \`\`\`.auditberkas 4 KMI A\`\`\`

🌐 *🆕 SELURUH SANTRI sekaligus:*
   \`\`\`.auditberkas all\`\`\`
   \`\`\`.auditberkas semua\`\`\`
   • Bot akan kirim file Excel rekap berkas yang kurang
     untuk SEMUA kelas. Cocok untuk audit besar.

━━━━━━━━━━━━━━━━━━━━━━
*3️⃣ Lihat File Berkas Santri*
Perintah: *.lihatberkas*
Alur:
   • Ketik *.lihatberkas*
   • Masukkan Password Staf
   • Format: \`Stambuk # KodeFolder\`
     Contoh: \`123456 # B\` (untuk lihat Ijazah)
Kode folder: A-I (lihat di .auditberkas)

━━━━━━━━━━━━━━━━━━━━━━
*4️⃣ Rekap Statistik Berkas*
Perintah: *.rekapberkas [Kelas/Semua]*
   \`\`\`.rekapberkas 3 Int B\`\`\`
   \`\`\`.rekapberkas Semua\`\`\`
Output:
   ✅ Lengkap Primer & Sekunder
   ⚠️ Hanya Primer Lengkap
   ❌ Primer Tidak Lengkap

━━━━━━━━━━━━━━━━━━━━━━
*5️⃣ Cek/Reset Password Ustaz*
   \`\`\`.admin\`\`\` → Cek password ustaz (lupa pwd)
   \`\`\`.setpass\`\`\` → Set password baru utk ustaz

━━━━━━━━━━━━━━━━━━━━━━
*6️⃣ Ekspor SEMUA Data (Full)*
Perintah: *.eksporfull [Kolom] # [Nilai]*
   \`\`\`.eksporfull Kelas # 3 Int B\`\`\`
   \`\`\`.eksporfull Semua\`\`\` ← seluruh database
File berisi SEMUA kolom database santri.

➡️ Lanjut ke bagian 3 ketik:
   \`\`\`.tutorialpusdat 3\`\`\``;

const PART_3_PIKET = `📖 *ᴛᴜᴛᴏʀɪᴀʟ — ʙᴀɢɪᴀɴ 3/4*
*📋 PIKET HARIAN, PROKER & BROADCAST*

━━━━━━━━━━━━━━━━━━━━━━
*1️⃣ Cek Jadwal Piket Anda*
Perintah: *.piket*
Bot menampilkan:
   • Siapa staf piket hari ini
   • Jadwal piket pekan ini

━━━━━━━━━━━━━━━━━━━━━━
*2️⃣ Setor Proker Pagi (Pukul 07:00–07:30)*
Hanya untuk staf piket *hari ini*.
Format: ketik di WA chat dengan bot
\`\`\`
.proker
1. Backup database santri
2. Audit berkas kelas 6
3. Update absensi guru
\`\`\`
   • Bot otomatis menghentikan reminder/spam
   • Forward ke grup Pusdat sebagai catatan
   • Reminder bakdiyah dikirim pukul 12.00

━━━━━━━━━━━━━━━━━━━━━━
*3️⃣ Lapor Bakdiyah (Setelah Asar)*
Perintah: *.lapor*
Format input setelah .lapor:
\`\`\`
#selesai
- Backup selesai
- Audit kelas 6 100%
#belum
- Update absensi (ditunda besok)
\`\`\`
Bot menyimpan ke laporan harian + rekap Excel bulanan otomatis.

━━━━━━━━━━━━━━━━━━━━━━
*4️⃣ Lihat Laporan Harian*
   \`\`\`.lapharian\`\`\` → Lihat laporan hari ini
   \`\`\`.lapharian kemarin\`\`\` → Lihat laporan kemarin
   \`\`\`.lapbakdiyah\`\`\` → Hanya bagian bakdiyah

━━━━━━━━━━━━━━━━━━━━━━
*5️⃣ Lihat Daftar Proker*
   \`\`\`.listproker\`\`\` → Tahunan + bulanan
   \`\`\`.listproker tahunan\`\`\`
   \`\`\`.listproker bulanan\`\`\`
   \`\`\`.listproker pekanan\`\`\` ← 🆕

━━━━━━━━━━━━━━━━━━━━━━
*6️⃣ Atur Broadcast Otomatis*
Perintah staf:
   \`\`\`.setwaktu 06:30\`\`\` → Set jam broadcast pagi
   \`\`\`.addtujuan\`\`\` → Tambah grup tujuan (kirim di grup-nya)
   \`\`\`.deltujuan\`\`\` → Hapus grup tujuan
   \`\`\`.listtujuan\`\`\` → Lihat semua grup tujuan
   \`\`\`.idgrup\`\`\` → Tampilkan ID grup ini

━━━━━━━━━━━━━━━━━━━━━━
*7️⃣ Kirim Broadcast Manual (Owner)*
   \`\`\`.bcpusdat [pesan]\`\`\` ← kirim ke semua grup tujuan

➡️ Lanjut ke bagian 4 ketik:
   \`\`\`.tutorialpusdat 4\`\`\``;

const PART_4_OWNER = `📖 *ᴛᴜᴛᴏʀɪᴀʟ — ʙᴀɢɪᴀɴ 4/4*
*👑 KHUSUS OWNER — KELOLA PROKER*

> 🆕 Sebelumnya, edit proker bulanan/pekanan harus
> langsung ngedit file JSON. Sekarang sudah bisa via WA!

━━━━━━━━━━━━━━━━━━━━━━
*1️⃣ Tambah Proker Baru*
Format umum:
\`\`\`.editproker [bulanan|pekanan|tahunan] add\`\`\`
Lalu bot meminta isi dengan format:
\`\`\`
judul: Audit berkas semester 2
target: Selesai 100% akhir bulan
pic: Tim Pusdat
\`\`\`
(untuk tahunan, ganti 'pic' dengan 'deadline' & 'status')

Contoh cepat satu baris:
\`\`\`.editproker bulanan add | Audit Berkas | Selesai 100% | Tim Pusdat\`\`\`

━━━━━━━━━━━━━━━━━━━━━━
*2️⃣ Ubah Proker Tertentu*
\`\`\`.editproker bulanan edit 2\`\`\`
   ↳ ubah proker no.2 di list bulanan
Lalu kirim format isi seperti add (judul/target/pic).

Contoh cepat:
\`\`\`.editproker pekanan edit 1 | Backup mingguan | Setiap Jumat | Staf Piket\`\`\`

━━━━━━━━━━━━━━━━━━━━━━
*3️⃣ Hapus Proker*
\`\`\`.editproker bulanan del 3\`\`\`
   ↳ hapus proker no.3 di list bulanan
\`\`\`.editproker pekanan del 1\`\`\`

━━━━━━━━━━━━━━━━━━━━━━
*4️⃣ Reset / Kosongkan Daftar*
\`\`\`.editproker reset bulanan\`\`\`
\`\`\`.editproker reset pekanan\`\`\`
   ↳ Bot meminta konfirmasi *YA* sebelum hapus semua.
   ↳ Berguna saat awal bulan/pekan baru.

━━━━━━━━━━━━━━━━━━━━━━
*5️⃣ Ubah Header Bulan/Pekan*
\`\`\`.editproker setbulan Syawal 1447 H | April 2026\`\`\`
\`\`\`.editproker setpekan Pekan ke-2 Syawal\`\`\`

━━━━━━━━━━━━━━━━━━━━━━
*6️⃣ Lihat Hasil Edit*
Setelah edit, cek hasilnya:
   \`\`\`.listproker bulanan\`\`\`
   \`\`\`.listproker pekanan\`\`\`

━━━━━━━━━━━━━━━━━━━━━━
*🛡️ TIPS KEAMANAN*
   • Hanya nomor di config.js bagian \`owner\` yang
     boleh memakai .editproker.
   • Setiap perubahan otomatis di-backup ke
     database/proker/_backup/proker_*.json
   • Kalau salah edit, restore manual dari folder _backup.

━━━━━━━━━━━━━━━━━━━━━━
*🆘 Troubleshooting Cepat*
   • _Bot tidak respon command_ → cek koneksi, restart bot
   • _Password salah_ terus → tunggu 3 menit (session expired)
   • _Audit berkas all_ kelamaan → wajar, datanya banyak
     (bot kirim file Excel jika hasil > 4000 karakter)
   • _Edit proker error_ → pastikan format pakai pipe \`|\`
     dan jumlah field sesuai (3 untuk bulanan/pekanan,
     4 untuk tahunan).

🏫 _Pusat Data PMDG Kampus 5 Magelang • SISFO v12_`;

async function handle(sock, messageInfo) {
  const { m, remoteJid, message } = messageInfo;
  const content = (messageInfo.content || messageInfo.fullText || '').trim();

  // React loading
  await sock.sendMessage(remoteJid, {
    react: { text: '📖', key: message.key },
  });

  // Tentukan bagian mana yang ditampilkan
  const arg = content.toLowerCase();

  if (arg === '1' || arg === 'guru' || arg === 'umum') {
    return await reply(m, PART_1_GURU);
  }
  if (arg === '2' || arg === 'staf' || arg === 'staff') {
    return await reply(m, PART_2_STAF);
  }
  if (arg === '3' || arg === 'piket' || arg === 'broadcast') {
    return await reply(m, PART_3_PIKET);
  }
  if (arg === '4' || arg === 'owner' || arg === 'editproker') {
    return await reply(m, PART_4_OWNER);
  }

  // Default: tampilkan bagian 1 + petunjuk navigasi
  const intro =
    `📖 *ᴛᴜᴛᴏʀɪᴀʟ ʟᴇɴɢᴋᴀᴘ ꜱɪꜱꜰᴏ ᴘᴜꜱᴅᴀᴛ ᴠ12*\n\n` +
    `Tutorial dipecah jadi 4 bagian agar mudah dibaca:\n\n` +
    `📘 *.tutorialpusdat 1* — Untuk Guru / Umum\n` +
    `🔐 *.tutorialpusdat 2* — Khusus Staf Pusdat\n` +
    `📋 *.tutorialpusdat 3* — Piket, Proker & Broadcast\n` +
    `👑 *.tutorialpusdat 4* — Owner: Edit Proker via WA\n\n` +
    `_Mengirimkan Bagian 1/4 sekarang..._`;

  await reply(m, intro);
  await new Promise((r) => setTimeout(r, 800));
  return await reply(m, PART_1_GURU);
}

export default {
  Commands: ['tutorialpusdat'],
  handle,
  OnlyOwner: false,
  OnlyPremium: false,
  OnlyAdmin: false,
  OnlyGroup: false,
  OnlyPrivate: false,
  limitDeduction: 0,
};
