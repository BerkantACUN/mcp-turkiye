# Changelog

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), sürümleme [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Streamable HTTP giriş noktası:** `dist/http.js` (`src/http.ts`) — mcp-proxy'ye gerek kalmadan aynı `sunucuOlustur()` ile `/mcp` üzerinde durumsuz Streamable HTTP ve `GET /health`. Argüman almaz; `PORT` (8080), `HOST` (0.0.0.0), `MCP_TURKIYE_API_KEY` (verilince `X-API-Key` zorunlu, yoksa 401; eski `MCP_PROXY_API_KEY` de geçerli), `MCP_TURKIYE_RATE_LIMIT` (IP başına dakikada 60, aşılınca 429 + `Retry-After`) ve `TRUST_PROXY=1` (istemci IP'si `X-Forwarded-For`'dan) ortamdan okunur. Tarayıcı kaynakları varsayılan olarak kapalı: `Origin` taşıyan istek `MCP_TURKIYE_ALLOWED_ORIGINS` listesinde değilse `403` (DNS rebinding'e karşı), CORS başlıkları yalnızca izinli kaynağa. Hız sınırı tablosu 10.000 adresle sınırlı, 1 MB üstü gövde `413`, `SIGTERM`'de süren istekler bitirilir. Zarf (`kaynak`/`alindi`/`veri`) değişmedi.
- **Docker imajı:** `ghcr.io/berkantacun/mcp-turkiye` — yerleşik HTTP giriş noktasını çalıştırır (`node dist/http.js`, port 8080); mcp-proxy imajdan kaldırıldı. İmaj root olmayan `node` kullanıcısıyla çalışır, her `v*` etiketinde GitHub Actions ile yayınlanır, PR'larda yalnızca derlenir. Azure Container Apps'te (Germany West Central) buluttan 17 araçla denendi: Konya açık veri portalı yurtdışı IP'leri reddettiği için hata döner, diğerleri çalışır.

### Changed

- **Sunucu yönergesi (`instructions`):** kaynak listesi elle yazılmıştı ve EVDS, BtcTurk, Kandilli, ÖSYM, iller, haber başlıkları ile İBB/İzmir'in yeni servislerini saymıyordu; artık kayıtlı kaynakların adlarından üretilir, eksik kalamaz.

## [0.8.0] — 2026-09-22

Beş yeni kaynak, on altı yeni araç: yirmi bir kaynak, kırk altı araç. Hepsi anahtarsız; İBB ve İzmir servisleri belediyelerin açık veri portallarında ilanlı API'lerdir.

### Added

- **ibb:** `ibb_nobetci_eczane` (İstanbul'da bugün nöbetçi eczaneler, ilçe süzgeci), `ibb_otopark` (İSPARK anlık boş yer/doluluk; koordinat verilince en yakından, haversine km ile), `ibb_otopark_detay` (tarife, adres, aylık abonelik), `ibb_hava_kalitesi` (28 istasyon: AQI, baskın kirletici, PM10/SO2/O3/NO2/CO; tek istasyon için son 24 saatin saatlik serisi — pencere saat başına hizalanır, aksi hâlde servis boş kova döndürüyor), `ibb_metro` (hatlar, ilk/son sefer, bir hattın sıralı istasyonları ve donanımı), `ibb_metro_duyurular`. Kaynak adı "İstanbul Büyükşehir Belediyesi (İBB)" oldu; trafik indeksi aynı kaynakta.
- **izmir:** `izmir_nobetci_eczane`, `izmir_hal_fiyatlari` (toptancı hali günlük sebze-meyve/balık bülteni; bülten olmayan günde boş liste, hata değil), `izmir_otobus` (ESHOT durağına yaklaşan otobüsler, canlı).
- **btcturk:** `btcturk_kripto` — 180'den fazla kripto varlığın TRY/USDT fiyatı, sembol listesi ya da hacme göre ilk 30.
- **haber:** `haber_basliklari` — Anadolu Ajansı (11 kategori) ve TRT Haber (12 kategori) RSS: başlık, özet, bağlantı, zaman; bağımlılıksız RSS ayrıştırıcı.
- **iller:** `il_bilgisi`, `ilce_ara`, `iller_listesi` — 81 il ve 973 ilçe (nüfus, yüzölçümü, rakım, plaka ve alan kodu, bölge, koordinat), turkiye-api'nin MIT veri setinden `scripts/iller-veri.mjs` ile gömülü; çevrimdışı.
- Çekirdek: `sadelestir` (Türkçe harf ve boşluk katlayan karşılaştırma) `src/core/metin.ts` içinde ortak.
- Canlı sözleşme testleri: İBB dört servisi, İzmir üçü, BtcTurk, AA ve TRT.

### Research

Aday kaynakların taranıp elendiği araştırma notu ve ikinci dalga (İETT SOAP, ASKİ baraj, TFF, EPDK tarife, GİB vergi takvimi) README yol haritasında; Diyanet namaz vakitleri resmî API anahtarı gerektirdiğinden beklemede.

## [0.7.0] — 2026-09-17

İki yeni kurum, bir yeni MGM aracı: on beş kaynak, otuz araç.

### Added

- **kandilli:** `kandilli_depremler` — Kandilli Rasathanesi'nin (BDTİM) son 500 depremi; AFAD'dan bağımsız ikinci katalog. MD/ML/Mw ayrı ayrı, manşet büyüklük ML → Mw → MD; ilksel/revize bilgisi ve sayfanın yenileme zamanı. Veri kaynak gösterilerek kullanılabilir, ticari kullanım Boğaziçi Üniversitesi'nin iznine tabidir (SOURCES.md).
- **mgm:** `mgm_uyarilar` — yürürlükteki meteorolojik uyarılar: hadise, şiddet, riskler, geçerlilik ve uyarının tam metni; `il` ile süzme. `gunun_ozeti` prompt'u artık uyarıları da sorar.
- **osym:** `osym_sinav_takvimi` — ÖSYM'nin yıllık sınav takvimi (YKS, KPSS, ALES, YDS, DGS, TUS…): başvuru, geç başvuru, sınav, sonuç ve tercih tarihleri; varsayılan yalnızca gelecekteki adımlar, `ara` ile sınav filtresi.
- Çekirdek: `src/core/metin.ts` — tek HTML varlık çözücü; Resmî Gazete ve mevzuat ayrıştırıcıları da artık onu kullanır. HTTP katmanına `deneme` (toplam deneme sayısı) seçeneği; varsayılan değişmedi (2).

### Changed

- User-agent artık `mcp-turkiye/<sürüm> (github.com/BerkantACUN/mcp-turkiye)` — şemasız. ÖSYM'nin önündeki WAF, `+https://github.com/…` taşıyan user-agent'ı akıtarak yanıtlıyordu; şemasız hâli geçiyor.

## [0.6.0] — 2026-09-17

Kod bilmeden ekonomi: yirmi yedi araç.

### Added

- **evds:** `evds_gosterge` — başlıca göstergeler adıyla, seri kodu bilmeden: `enflasyon_yillik`, `enflasyon_aylik`, `tufe_endeks`, `ufe_yillik`, `politika_faizi`, `dolar`, `euro`, `sterlin`, `konut_fiyat_endeksi`, `konut_fiyat_yillik`, `reel_efektif_kur`. Yanıtta son değer ve tarihi, kullanılan seri kodu ve formül; varsayılan aralık son 400 gün. Canlı sözleşme testi on bir göstergenin hepsini her hafta yoklar.

## [0.5.0] — 2026-09-17

İki kaynak, iki portal, iki prompt; on üç kaynak, yirmi altı araç.

### Added

- **Prompt'lar:** `gunun_ozeti` (günlük özet: kur, deprem, hava, trafik, Resmî Gazete) ve `mevzuat_sorusu` (soruyu ilgili maddeyi alıntılayarak yanıtla).

- **mevzuat:** `mevzuat_ara`, `mevzuat_metin`, `mevzuat_madde` — mevzuat.gov.tr'de arama (10 mevzuat türü, başlık/içerik), resmî güncel tam metin (parçalı, madde listesiyle) ve tek madde çıkarma (`6`, `6/A`, `ek 1`, `geçici 3`). Word kaynaklı sayfalardaki satır kırılmaları birleştirilir; Resmî Gazete metinlerinde de aynı düzeltme.
- HTTP katmanı: POST desteği (`govde`), önbellek anahtarında gövde.
- **acikveri:** Konya (CC-BY) ve Gaziantep portalları eklendi; dört belediye, ~1.300 veri seti.
- **parametreler:** `resmi_parametreler` — 2026 asgari ücret (günlük/aylık brüt, net) ve SGK taban/tavan, her biri Resmî Gazete sayısı ya da kanun maddesiyle; türetme hesabı yanıtta.

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
