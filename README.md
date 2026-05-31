# Dashboard Multi-Akun Shopee (Open API v2 / OAuth)

Dashboard **resmi** untuk mengelola beberapa toko/akun Shopee **milik Anda sendiri**
melalui [Shopee Open Platform](https://open.shopee.com) menggunakan Open API v2 dan
alur otorisasi **OAuth 2.0**. Anda bisa menghubungkan banyak toko sekaligus lalu
melihat pesanan dari seluruh toko dalam satu tampilan.

> Aplikasi ini **tidak** melakukan scraping, **tidak** menyimpan kata sandi Shopee,
> dan **tidak** mengotomatiskan akun pihak lain. Yang dipakai hanyalah API resmi
> Shopee dengan izin (consent) dari pemilik toko.

---

## Fitur

- 🔐 **OAuth 2.0** resmi — pengguna login & memberi izin lewat halaman Shopee.
- 🏬 **Multi-akun** — hubungkan banyak toko, token tiap toko disimpan terpisah.
- 🔄 **Auto-refresh token** — access token (berlaku ~4 jam) diperbarui otomatis
  memakai refresh token sebelum kedaluwarsa.
- 📦 **Lihat pesanan** — daftar + detail pesanan (`get_order_list` +
  `get_order_detail`) dengan filter rentang waktu (maks 15 hari) dan status.
- 🔎 **Detail pesanan** — modal berisi produk, penerima, metode bayar, dll.
- 🚚 **Status pengiriman / resi** — nomor resi & timeline tracking
  (`get_tracking_number` + `get_tracking_info`).
- 📥 **Ekspor CSV** — unduh pesanan (per toko atau semua toko) sebagai CSV.
- 📊 **Agregasi lintas toko** — gabungkan pesanan semua toko, diurutkan terbaru.
- 🗄️ **Penyimpanan fleksibel** — token disimpan ke file JSON (default) atau
  database **SQLite** (`node:sqlite`), dipilih lewat satu env, tanpa dependency.
- 🧱 **Aman by default** — token tidak pernah dikirim ke browser; folder `data/`
  di-_gitignore_.

---

## Arsitektur

```
src/
├── config.ts              # baca konfigurasi dari .env
├── server.ts              # aplikasi Express + routing
├── index.ts               # entrypoint (server.listen)
├── shopee/
│   ├── client.ts          # tanda tangan (HMAC-SHA256) + HTTP client
│   ├── auth.ts            # buildAuthUrl, tukar code -> token, refresh
│   ├── shop.ts            # get_shop_info (nama toko)
│   ├── logistics.ts       # get_tracking_number + get_tracking_info (resi)
│   └── orders.ts          # get_order_list + get_order_detail + agregasi + CSV
├── store/
│   ├── types.ts           # tipe ShopAccount + interface StoreBackend
│   ├── tokenStore.ts      # facade: pilih backend (file/sqlite) via env
│   ├── fileStore.ts       # backend JSON file (default, tanpa dependency)
│   └── sqliteStore.ts     # backend SQLite via modul bawaan node:sqlite
├── util/
│   └── csv.ts             # pembuat dokumen CSV (RFC 4180 + BOM)
└── routes/
    ├── auth.ts            # /auth/login, /auth/callback
    ├── shops.ts           # /api/shops ...
    └── orders.ts          # /api/orders ...
public/                    # dashboard (HTML/CSS/JS statis)
```

### Cara penandatanganan (signing)

Semua panggilan v2 memakai HMAC-SHA256 dengan `partner_key` sebagai kunci:

| Jenis API | Base string yang ditandatangani |
| --------- | ------------------------------- |
| Public (token get/refresh, auth) | `partner_id + path + timestamp` |
| Shop (order, shop info, dll.)     | `partner_id + path + timestamp + access_token + shop_id` |

---

## Prasyarat

- **Node.js 18+** (memakai `fetch` & `crypto` bawaan) untuk penyimpanan **file** (default).
- **Node.js 22.5+** bila memakai penyimpanan **SQLite** (`STORE_DRIVER=sqlite`),
  karena memakai modul bawaan `node:sqlite` (tanpa dependency tambahan).
- Akun **Shopee Open Platform** dengan sebuah **App** (Partner ID & Partner Key).

---

## 1. Daftarkan App di Shopee Open Platform

1. Masuk ke <https://open.shopee.com> → **Open Platform Console**.
2. Buat **App** baru, pilih region yang sesuai (mis. Indonesia).
3. Catat **Partner ID** dan **Partner Key** (Key bersifat rahasia).
4. Pada pengaturan app, set **Redirect URL** persis sama dengan yang akan dipakai
   aplikasi ini, contoh: `http://localhost:3000/auth/callback`.
5. Pastikan modul **Order** (dan **Shop**) diaktifkan untuk app Anda.

> Untuk uji coba, Shopee menyediakan lingkungan **Sandbox**
> (`https://partner.test-stable.shopeemobile.com`). Set `SHOPEE_HOST` ke sana saat testing.

---

## 2. Konfigurasi environment

```bash
cp .env.example .env
```

Isi `.env`:

```env
SHOPEE_PARTNER_ID=2000xxx
SHOPEE_PARTNER_KEY=shpk_xxxxxxxxxxxxxxxxxxxxxxxx
SHOPEE_HOST=https://partner.shopeemobile.com
SHOPEE_REDIRECT_URL=http://localhost:3000/auth/callback
SHOPEE_REGION=id
PORT=3000

# Penyimpanan token: "file" (default) atau "sqlite" (butuh Node 22.5+)
STORE_DRIVER=file
# DB_PATH=data/accounts.db   # dipakai saat STORE_DRIVER=sqlite
```

### Penyimpanan token (storage)

Token tiap toko disimpan oleh sebuah *backend* yang bisa dipilih lewat
`STORE_DRIVER`:

| Driver | Lokasi default | Kebutuhan | Catatan |
| ------ | -------------- | --------- | ------- |
| `file` (default) | `data/accounts.json` | Node 18+ | Tanpa dependency, cocok untuk pemakaian pribadi |
| `sqlite` | `data/accounts.db` | Node 22.5+ | Database SQLite via modul bawaan `node:sqlite` (tanpa dependency) |

Ganti backend cukup dengan mengubah `STORE_DRIVER` di `.env` lalu restart server —
tidak ada perubahan kode. Keduanya menyimpan field yang sama dan tetap
men-_refresh_ token otomatis.

> Beralih backend **tidak** memindahkan data lama secara otomatis; hubungkan
> ulang toko (atau migrasikan datanya) setelah berganti driver.

---

## 3. Install & jalankan

```bash
npm install

# mode pengembangan (auto-reload)
npm run dev

# atau build + jalankan
npm run build
npm start
```

Buka <http://localhost:3000>.

---

## 4. Menghubungkan toko

1. Klik **“+ Hubungkan Toko”** di dashboard.
2. Anda diarahkan ke halaman Shopee untuk login & memberi izin pada toko milik Anda.
3. Shopee mengembalikan Anda ke `/auth/callback` dengan `code` + `shop_id`.
4. Aplikasi menukar `code` menjadi access/refresh token lalu menyimpannya.
5. Ulangi untuk toko lain — semua akan muncul di kartu **Toko Terhubung**.

---

## 5. Deploy

> **PENTING — Redirect URL.** Saat di-deploy, `SHOPEE_REDIRECT_URL` harus berupa
> URL **publik** aplikasi (mis. `https://shopee.domainanda.com/auth/callback`) dan
> **didaftarkan sama persis** di Shopee Open Platform. Shopee mewajibkan **HTTPS**
> untuk redirect di produksi — taruh aplikasi di belakang reverse proxy (Nginx,
> Caddy, Traefik) atau platform yang sudah menyediakan TLS.

### Opsi A — Docker Compose (paling mudah)

```bash
cp .env.example .env       # isi kredensial + SHOPEE_REDIRECT_URL publik
docker compose up -d --build
docker compose logs -f     # lihat log
```

- Token disimpan di named volume `shopee-data` (`/app/data`) sehingga tetap ada
  walau container di-_recreate_.
- Hentikan: `docker compose down` (data tetap aman di volume).
- Backup data: `docker run --rm -v shopee-data:/data -v "$PWD":/backup busybox \
  tar czf /backup/shopee-data.tar.gz -C /data .`

### Opsi B — Docker manual

```bash
docker build -t multi-akun-shopee .
docker run -d --name shopee \
  --env-file .env -e PORT=3000 \
  -p 3000:3000 \
  -v shopee-data:/app/data \
  multi-akun-shopee
```

### Opsi C — Tanpa Docker (VPS / bare metal)

```bash
npm install
npm run build
NODE_ENV=production npm start
```

Untuk menjaga proses tetap hidup, gunakan process manager seperti **pm2**:

```bash
npm install -g pm2
pm2 start dist/index.js --name shopee
pm2 save && pm2 startup    # auto-start saat boot
```

Lalu pasang reverse proxy + TLS. Contoh blok **Nginx**:

```nginx
server {
  server_name shopee.domainanda.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  # TLS dikelola Certbot/Let's Encrypt
}
```

> Catatan: image Docker memakai `node:22-slim` agar `STORE_DRIVER=sqlite`
> (modul bawaan `node:sqlite`) berjalan andal. Untuk mode `file`, Node 18+ cukup.

---

## Endpoint API (internal)

| Method | Path | Keterangan |
| ------ | ---- | ---------- |
| GET | `/api/status` | Status konfigurasi app |
| GET | `/auth/login` | Mulai OAuth (redirect ke Shopee) |
| GET | `/auth/callback` | Callback OAuth (tukar token) |
| GET | `/api/shops` | Daftar toko terhubung (tanpa token) |
| POST | `/api/shops/:shopId/refresh` | Refresh token manual |
| DELETE | `/api/shops/:shopId` | Putuskan toko (hapus token lokal) |
| GET | `/api/shops/:shopId/orders` | Pesanan satu toko |
| GET | `/api/shops/:shopId/orders/export.csv` | Unduh pesanan satu toko (CSV) |
| GET | `/api/shops/:shopId/orders/:orderSn` | Detail satu pesanan + tracking/resi |
| GET | `/api/orders` | Pesanan gabungan semua toko |
| GET | `/api/orders/export.csv` | Unduh pesanan semua toko (CSV) |

Query untuk endpoint pesanan: `days` (≤15), `status`
(`UNPAID`, `READY_TO_SHIP`, `PROCESSED`, `SHIPPED`, `COMPLETED`, `IN_CANCEL`,
`CANCELLED`, `INVOICE_PENDING`), `time_range_field` (`create_time`|`update_time`), `max`.

---

## Catatan keamanan & produksi

- **Jangan commit** `.env`, folder `data/`, maupun file database (`*.db`) — semua
  sudah di-_gitignore_.
- File `data/accounts.json` (driver `file`) atau `data/accounts.db` (driver `sqlite`)
  berisi access & refresh token. Untuk produksi, gunakan database/secret store
  terenkripsi dan tambahkan autentikasi pada dashboard.
- Access token Shopee berlaku ~4 jam; refresh token berlaku lebih lama (cek dokumentasi
  Shopee terbaru). Aplikasi me-refresh otomatis dengan margin 5 menit.
- Patuhi **rate limit** dan **Kebijakan** Shopee Open Platform. Pakai hanya untuk
  toko yang Anda miliki/kelola secara sah.

---

## Lisensi

MIT.
