# Kagu Saha Takip PWA

Monorepo yapisi:

- `apps/api`: NestJS REST API
- `apps/web`: Next.js PWA arayuzu
- `packages/contracts`: ortak tipler

## Yerel calistirma

### 1. PostgreSQL 16 kurulumu

- Windows uzerinde PostgreSQL 16 kurun.
- Servis kaydi zorunlu degildir. Bu repo, kurulu PostgreSQL 16 binary'lerini kullanip veriyi `%LOCALAPPDATA%\\KaguWeb\\postgres-16` altinda otomatik initialize edebilir.
- Varsayilan gelistirme ayarlari:
  - host: `localhost`
  - port: `5432`
  - database: `kagu`
  - kullanici: `postgres`
  - sifre: `postgres`

### 2. Ortam dosyasi

- Kok dizinde `.env.example` dosyasini `.env` olarak kopyalayin.
- PostgreSQL sifreniz farkliysa sadece `DATABASE_URL` degerini guncelleyin.

### 3. Bagimliliklar

```powershell
npm.cmd install --cache .npm-cache
```

### 4. Yerel PostgreSQL bootstrap

```powershell
npm.cmd run db:ensure-local
```

Bu komut:

- `C:\Program Files\PostgreSQL\16\bin` altindaki kurulu binary'leri kullanir
- `%LOCALAPPDATA%\\KaguWeb\\postgres-16` altinda cluster olusturur
- `localhost:5432` uzerinde PostgreSQL'i baslatir
- `kagu` veritabanini yoksa olusturur

### 5. Prisma client ve migration

```powershell
npm.cmd run prisma:generate
npm.cmd run db:init
```

`db:init`, repo altindaki tum Prisma migration'larini sirasiyla uygular. Bu komut temiz kurulumda da, yeni migration geldikten sonra da ayni sekilde kullanilir.

### 6. Ilk yonetici bootstrap

Temiz kurulumda HTTP setup ekrani yoktur. Ilk yonetici hesap tek seferlik CLI komutuyla olusturulur:

```powershell
npm.cmd run db:bootstrap-admin -- --username yonetici --displayName "Ana Yonetici" --password "Kagu123!"
```

Bu komut yalnizca hic yonetici yoksa calisir. Ikinci kez calistirilirsa guvenli sekilde reddedilir.

### 7. Opsiyonel demo veri

Demo veri isterseniz manuel bootstrap sonrasinda opsiyonel olarak calistirabilirsiniz:

```powershell
npm.cmd run db:seed-demo
```

Bu komut varsayilan akisin parcasi degildir. Temiz kurulum icin zorunlu degildir.

### 8. Uygulamayi baslatma

En kolay yol:

```powershell
npm.cmd run dev:up
```

Bu komut yerel PostgreSQL'i hazirlar, Prisma generate ve migration adimlarini calistirir, ardindan API ile web'i arka planda baslatir.

Isterseniz manuel olarak yine iki ayri terminalle de calistirabilirsiniz:

Iki ayri terminal acin:

```powershell
npm.cmd run dev:api
```

```powershell
npm.cmd run dev:web
```

Sonra tarayicidan `http://localhost:3000/login` adresine gidin.

Yonetici girisi sonrasi ana sayfa `http://localhost:3000/dashboard` olur. Bu yuzey read-only operasyon ozetidir; tarih secimi `?date=YYYY-MM-DD` query parametresi ile korunur ve paylasilabilir.

## Ilk manuel test akisi

Temiz kurulumda:

1. Bootstrap ile olusturdugunuz yonetici hesabi ile giris yapin.
2. Panelden en az bir saha kullanicisi ekleyin.
3. Yeni bir proje olusturun.
4. Bugunun gunluk programina projeyi ekleyin.
5. Projeye bir veya daha fazla saha personeli atayin.
6. Isterseniz `main` klasorune ana dosya yukleyin.
7. Saha kullanicisi ile giris yapip `is basi` ve `gun sonu` akisini test edin.

Opsiyonel demo seed calistirildiysa varsayilan hesaplar:

- kullanici adi: `yonetici`
- sifre: `Kagu123!`
- ornek saha: `saha.1`
- sifre: `Saha123!`

## Production mimarisi

Deploy hedefi tek domain ve tek sunucudur:

- domain: `https://saha.kagultd.com`
- web: Next.js, internal `127.0.0.1:3000`
- api: NestJS, internal `127.0.0.1:4000`
- reverse proxy ve TLS: Caddy
- veritabani: PostgreSQL 16, ayni sunucuda

Bu repo production'da dosyalari object storage'a degil yerel diske yazar. Gercek binary dosyalar `STORAGE_ROOT` altinda tutulur, metadata ve iliskiler PostgreSQL'dedir.

Onemli runtime varsayimlari:

- `STORAGE_DRIVER=local`
- `UPLOAD_TEMP_ROOT` zorunludur; upload once bu temp dizine iner, sonra kalici storage'a kopyalanir
- auth cookie-only calisir; access token browser storage'a yazilmaz
- rate limit in-memory'dir; tek API instance icin uygundur, yatay olceklenirse Redis benzeri paylasimli store gerekir

Varsayilan production dizinleri:

- repo: `/srv/kagu/app`
- storage: `/srv/kagu/storage`
- temp upload: `/srv/kagu/tmp/uploads`
- runtime log: `/srv/kagu/runtime`

## Production ortam degiskenleri

Ornek `.env.example` production degerleriyle gelir. Minimum kritik alanlar:

- `WEB_ORIGIN=https://saha.kagultd.com`
- `STORAGE_ROOT=/srv/kagu/storage`
- `UPLOAD_TEMP_ROOT=/srv/kagu/tmp/uploads`
- `NEXT_PUBLIC_API_URL=/api`
- `NEXT_SERVER_API_PROXY_URL=http://127.0.0.1:4000/api`
- guclu ve benzersiz `JWT_SECRET`

## Deploy adimlari

Sunucuda:

```bash
sudo mkdir -p /srv/kagu/app /srv/kagu/storage /srv/kagu/tmp/uploads /srv/kagu/runtime
sudo chown -R kagu:kagu /srv/kagu
```

Repo icinde:

```bash
npm ci
npm run prisma:generate
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npm run build
```

Ilk kurulumda yonetici bootstrap:

```bash
npm run db:bootstrap-admin -- --username yonetici --displayName "Ana Yonetici" --password "GucluBirSifre!"
```

Sonrasinda systemd servislerini yeniden yukleyin ve baslatin:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kagu-api.service
sudo systemctl enable --now kagu-web.service
sudo systemctl reload caddy
```

Ornek production dosyalari `deploy/` klasorundedir:

- `deploy/kagu-api.service`
- `deploy/kagu-web.service`
- `deploy/Caddyfile`
- `deploy/bootstrap.sh`
