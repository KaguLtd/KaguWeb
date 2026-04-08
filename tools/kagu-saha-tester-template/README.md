# Kagu Saha Tester

Bu workspace, Kagu Saha Takip uygulamasini izole ortamda 1 aylik servis operasyonu gibi test etmek icin olusturuldu.

## Komutlar

```powershell
npm.cmd install
npm.cmd run setup
npm.cmd run simulate
npm.cmd run ui
npm.cmd run report
```

Tek komutta tum akisi calistirmak icin:

```powershell
npm.cmd run all
```

## Ciktilar

- `report.md`
- `report.html`
- `report.pdf`
- `report-data.json`
- `charts/*.svg`
- `raw/*.json`
- `screenshots/*.png`

## Notlar

- Varsayilan konfigrasyon `tester.config.json` icindedir.
- Tester, Kagu repo klasorundeki mevcut API ve web uygulamasini env override ile izole port ve veritabani ayarlariyla calistirir.
- Push ve geolocation testleri icin HTTP/secure-context limitleri raporda ayrica siniflandirilir.
