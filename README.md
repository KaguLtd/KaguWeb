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
