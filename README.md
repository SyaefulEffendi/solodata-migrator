# SoloData Copy-Paste Tabel Helper (Chrome Extension Lokal)

Ekstensi Chrome lokal (Manifest V3) untuk membantu menyalin isi tabel dari **SoloData Lama** (`egov.phicos.co.id/surakarta/solodata-lama/...`) dan mengisikannya ke **SoloData Baru** (`solodata.surakarta.go.id/...`) dalam 1 klik, tanpa menyentuh akun/login dan **tanpa auto-simpan**.

## Keamanan & Transparansi Kode

Anda dapat memeriksa langsung seluruh kode sumber di folder ini sebelum memasangnya:
- `manifest.json` — hanya meminta izin `"storage"` (penyimpanan lokal browser) dan **hanya aktif** di dua domain: `egov.phicos.co.id/surakarta/solodata-lama/*` dan `solodata.surakarta.go.id/*`.
- `shared/table-engine.js` — pembaca dan pencocok tabel HTML (mendukung `rowspan`/`colspan` 1–3 kolom seperti Kecamatan, Bulan, Keadaan Jalan, konversi format desimal `.` ke `,`, serta fungsi `Undo`).
- `content/panel.js` — menampilkan panel mengambang di pojok kanan bawah menggunakan Shadow DOM. Tidak ada `eval()`, tidak ada pengiriman data ke server luar, dan **tidak pernah** mengklik tombol `Simpan`, `Hapus`, atau `Verifikasi`.
- `popup/` — tampilan popup kecil saat ikon ekstensi diklik (untuk melihat ringkasan data tersalin atau memunculkan kembali panel jika sempat ditutup).

## Cara Memasang di Google Chrome

1. Clone repo ini (jika belum punya foldernya):
   ```bash
   git clone https://github.com/SyaefulEffendi/solodata-migrator.git
   ```
2. Buka Chrome dan ketik **`chrome://extensions`** pada address bar, lalu tekan Enter.
3. Aktifkan sakelar **Developer mode** (*Mode pengembang*) di pojok kanan atas.
4. Klik tombol **Load unpacked** (*Muat yang belum dibuka paketnya*).
5. Pilih folder **`solodata-migrator`** hasil clone.
6. Selesai — ekstensi langsung aktif di tab SoloData Lama dan SoloData Baru (jika tab sudah terbuka sebelumnya, lakukan *Refresh / F5* sekali).

## Cara Menggunakan

1. **Login sendiri** seperti biasa di SoloData Lama dan SoloData Baru (termasuk verifikasi `"I'm not a robot"`).
2. Buka tab data pada OPD & **Tahun `2023`** di **SoloData Lama**. Panel **SoloData Helper** akan muncul di pojok kanan bawah (bisa digeser atau di-minimize dengan tombol `−`).
3. Klik **`📋 Copy Data Tabel Ini`**. Seluruh baris dari atas sampai bawah akan terbaca dan tersimpan di `chrome.storage.local`.
4. Pindah ke tab **SoloData Baru** pada halaman OPD & tab yang sama, pastikan dropdown **Tahun = `2023`**.
5. Klik **`📥 Paste ke Tabel Ini`**.
   - Baris yang cocok persis diberi garis **hijau**.
   - Baris yang cocok mirip karena perbedaan ejaan tipis (mis. `Bulldozer` → `Bulldoze`) diberi garis **biru cyan** dan dicantumkan di ringkasan panel untuk Anda cek sekilas.
   - Baris yang tidak ketemu pasangannya akan diberi garis **kuning** dan dicantumkan di ringkasan panel.
   - Jika salah pilih tab sebelum menyimpan, klik **`↩️ Undo Paste`** untuk mengembalikan semua isian ke kondisi semula.
6. Periksa hasil pengisian (dan warna hijau/kuning), lalu klik tombol **`Simpan`** secara manual seperti biasa.
