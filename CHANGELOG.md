# Changelog

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), sürümleme [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **mevzuat:** `mevzuat_ara`, `mevzuat_metin`, `mevzuat_madde` — mevzuat.gov.tr'de arama (10 mevzuat türü, başlık/içerik), resmî güncel tam metin (parçalı, madde listesiyle) ve tek madde çıkarma (`6`, `6/A`, `ek 1`, `geçici 3`). Word kaynaklı sayfalardaki satır kırılmaları birleştirilir; Resmî Gazete metinlerinde de aynı düzeltme.
- HTTP katmanı: POST desteği (`govde`), önbellek anahtarında gövde.

## [0.4.0] — 2026-09-16

### Added

- **evds:** `evds_kategoriler`, `evds_veri_gruplari`, `evds_seriler`, `evds_seri` — TCMB EVDS 3 web servisi: konu ağacı, veri grupları, seri listesi ve gözlemler (formül/frekans/toplama). Ücretsiz `EVDS_API_KEY` ister; anahtar yoksa nereden alınacağını söyler, diğer araçlar etkilenmez. Anahtar yalnızca `key` başlığında gider.

## [0.3.0] — 2026-09-16

Üç yeni kaynak, on sekiz araç.

### Added

- **resmigazete:** `resmi_gazete_fihrist`, `resmi_gazete_metin` — günlük fihrist (bölüm/tür/madde) ve madde metinleri; windows-1254 çözümü, yalnızca resmigazete.gov.tr adresleri, PDF'ler bağlantı olarak. Sunucunun eksik gönderdiği ara sertifika Node'un kök deposuna eklenerek (doğrulama atlanmadan) çözüldü.
- **bist:** `bist_hisse` — İş Yatırım verisiyle gün sonu fiyat geçmişi, BIST 100 ve USD/TRY yanında.
- **ibb:** `ibb_trafik_indeksi` — İstanbul geneli anlık trafik yoğunluğu.
- HTTP katmanı: `charset` (UTF-8 olmayan kaynaklar) ve `ekSertifikalar` (eksik zincir tamamlama, node:https üzerinden) seçenekleri.

## [0.2.1] — 2026-09-16

### Fixed

- npm paketine `mcpName` eklendi; 0.2.0 bu alan olmadan yayımlandığı için resmi MCP Registry sahiplik doğrulamasından geçemiyordu. Kod değişikliği yok.

## [0.2.0] — 2026-09-16

Üç yeni kaynak, on dört araç.

### Added

- **mgm:** `mgm_hava_durumu` — il/ilçe için MGM anlık gözlemi ve 5 günlük tahmin; hadise kodları MGM'nin kendi tablosuyla Türkçe'ye açılır, `-9999` değerleri null.
- **opet:** `opet_akaryakit` — ilçe bazında Opet pompa fiyatları; il adı ya da plaka kodu, İstanbul'da iki yaka.
- **acikveri:** `acikveri_ara`, `acikveri_veriseti`, `acikveri_kayitlar` — İBB ve İzmir CKAN portalları: arama, veri seti ayrıntısı (lisans adıyla), DataStore satırları.

## [0.1.0] — 2026-09-16

İlk sürüm: iskelet ve dört kaynak, dokuz araç.

### Added

- **Çekirdek:** kaynak sözleşmesi (`Kaynak`), her yanıt için zarf (`kaynak`, `alindi`, `veri`), tek HTTP katmanı (zaman aşımı, 5xx'te bir yeniden deneme, 4xx'te yok, URL başına TTL önbellek), kurumun adını taşıyan hata biçimi.
- **tcmb:** `tcmb_kurlar`, `tcmb_kur` — günlük ve arşiv bültenleri; bülten olmayan günler açıklanır.
- **afad:** `afad_depremler` — tarih aralığı, en küçük büyüklük, limit.
- **tatil:** `resmi_tatiller`, `tatil_mi` — ulusal bayramlar hesaplanır, dinî bayramlar Diyanet tablosundan (2026, 2027), tablo yoksa tahmin edilmez.
- **dogrulama:** `dogrula_tckn`, `dogrula_vkn`, `dogrula_iban`, `plaka_il` — çevrimdışı, veri makineden çıkmaz.
- Sözleşme testleri (`npm run test:live`) ve haftalık CI koşusu; örnek istemci yapılandırması her CI'da guardmcp ile taranır.
