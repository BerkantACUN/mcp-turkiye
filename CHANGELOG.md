# Changelog

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), sürümleme [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **mgm:** `mgm_hava_durumu` — il/ilçe için MGM anlık gözlemi ve 5 günlük tahmin; hadise kodları MGM'nin kendi tablosuyla Türkçe'ye açılır, `-9999` değerleri null.

## [0.1.0] — 2026-09-16

İlk sürüm: iskelet ve dört kaynak, dokuz araç.

### Added

- **Çekirdek:** kaynak sözleşmesi (`Kaynak`), her yanıt için zarf (`kaynak`, `alindi`, `veri`), tek HTTP katmanı (zaman aşımı, 5xx'te bir yeniden deneme, 4xx'te yok, URL başına TTL önbellek), kurumun adını taşıyan hata biçimi.
- **tcmb:** `tcmb_kurlar`, `tcmb_kur` — günlük ve arşiv bültenleri; bülten olmayan günler açıklanır.
- **afad:** `afad_depremler` — tarih aralığı, en küçük büyüklük, limit.
- **tatil:** `resmi_tatiller`, `tatil_mi` — ulusal bayramlar hesaplanır, dinî bayramlar Diyanet tablosundan (2026, 2027), tablo yoksa tahmin edilmez.
- **dogrulama:** `dogrula_tckn`, `dogrula_vkn`, `dogrula_iban`, `plaka_il` — çevrimdışı, veri makineden çıkmaz.
- Sözleşme testleri (`npm run test:live`) ve haftalık CI koşusu; örnek istemci yapılandırması her CI'da guardmcp ile taranır.
