# Veri kaynakları

Her kaynağın yayımlayan kurumu, kullanılan uç noktası, kullanım şartı ve bu sunucunun ona nasıl davrandığı. MIT lisansı yalnızca bu reponun kodunu kapsar; aşağıdaki veriler kurumlarına aittir.

Kural: bir kaynak buraya girmeden sunucuya girmez.

## tcmb — Türkiye Cumhuriyet Merkez Bankası

- **Veri:** Günlük gösterge döviz kurları (döviz alış/satış, efektif alış/satış).
- **Uç nokta:** `https://www.tcmb.gov.tr/kurlar/today.xml` ve arşiv `https://www.tcmb.gov.tr/kurlar/YYYYAA/GGAAYYYY.xml`.
- **Şart:** TCMB, gösterge kurlarını kamuya açık olarak yayımlar; kaynak belirtilmesi beklenir. Kurlar "gösterge" niteliğindedir, işlem kuru değildir — yanıtlar bunu kurumun kendi ifadesiyle taşır.
- **Davranış:** Bugünkü bülten 5 dakika, geçmiş bültenler 24 saat önbellekte. Hafta sonu ve tatilde bülten olmadığı için 404 gelen tarihler "bülten yok" olarak açıklanır, hata olarak değil.

## evds — TCMB Elektronik Veri Dağıtım Sistemi

- **Veri:** Merkez Bankası'nın istatistik servisi: 154 konu kategorisi, 678 veri grubu, 40 binden fazla seri (TÜFE, faiz, kurlar, konut, ödemeler dengesi, anketler…). Kategori/grup/seri katalogları ve seri gözlemleri; formül (yüzde değişim, yıllık değişim, hareketli ortalama…), frekans ve toplama seçenekleri.
- **Uç nokta:** `https://evds3.tcmb.gov.tr/igmevdsms-dis/` (EVDS 3 web servisi; `categories`, `datagroups`, `serieList`, `series=…`). Anahtar `key` HTTP başlığıyla gönderilir.
- **Şart:** Ücretsiz kişisel API anahtarı gerekir (evds3.tcmb.gov.tr → Profilim → API Key Kopyala). Kullanım TCMB'nin EVDS kullanım koşullarına tabidir; kaynak belirtilerek kullanılır. Bir istekte en fazla 150 gözlem döner (bitişten geriye).
- **Davranış:** Anahtar `EVDS_API_KEY` ortam değişkeninden her çağrıda okunur, saklanmaz, hiçbir yanıtta/URL'de yer almaz; anahtar yoksa araçlar nereden alınacağını söyleyen hata döner, 403'te "anahtar reddedildi" der. Kataloglar 24 saat, gözlemler 10 dakika önbellekte.

## bist — Borsa İstanbul günlük fiyatlar (İş Yatırım verisi)

- **Veri:** Bir hissenin gün sonu fiyatları (kapanış, ağırlıklı ortalama, gün içi en düşük/en yüksek, TL hacim, piyasa değeri) ile aynı günün BIST 100 kapanışı ve USD/TRY kuru.
- **Uç nokta:** `https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/HisseTekil` — İş Yatırım'ın kendi hisse sayfalarının kullandığı açık uç nokta.
- **Şart:** Tek bir aracı kurumun kamuya sunduğu gün sonu verisidir; Borsa İstanbul'un lisanslı veri yayını değildir, anlık fiyat içermez ve yatırım tavsiyesi değildir — yanıtlar bunu söyler. Resmî API sözleşmesi yoktur; İş Yatırım talep ederse kaynak kaldırılır.
- **Davranış:** 15 dakika önbellek. Tarihler ISO'ya çevrilir ve eskiden yeniye sıralanır.

## afad — AFAD Deprem Dairesi Başkanlığı

- **Veri:** Deprem kataloğu (zaman, büyüklük, tür, derinlik, konum, il/ilçe).
- **Uç nokta:** `https://deprem.afad.gov.tr/apiv2/event/filter` (tarih aralığı, en küçük büyüklük).
- **Şart:** Katalog kamuya açıktır; kaynak belirtilerek kullanılır. Değerler AFAD'ın ilk çözümleridir ve sonradan güncellenebilir — `alindi` zamanı bu yüzden yanıttadır.
- **Davranış:** Sorgular 60 saniye önbellekte. Sonuç istemci tarafında `limit` ile kırpılır; varsayılan 50.

## mgm — Meteoroloji Genel Müdürlüğü

- **Veri:** Anlık gözlem (sıcaklık, hissedilen, nem, rüzgâr, basınç, görüş, yağış, hadise) ve 5 günlük tahmin; il/ilçe → istasyon eşlemesi.
- **Uç nokta:** `https://servis.mgm.gov.tr/web/merkezler`, `/web/sondurumlar`, `/web/tahminler/gunluk` — MGM'nin kendi sitesinin kullandığı servis. Servis yalnızca `Origin: https://www.mgm.gov.tr` başlığıyla yanıt verir; sunucu bu başlığı, tarayıcının gönderdiği gibi gönderir.
- **Şart:** MGM verisi kamuya açıktır ve MGM'ye atıfla kullanılır; sitede "link vermek için" yönergesi bulunur. Resmî bir API sözleşmesi yoktur — biçim değişirse haftalık sözleşme testi yakalar.
- **Davranış:** İstasyon eşlemesi 24 saat, anlık gözlem 10 dakika, tahmin 30 dakika önbellekte. `-9999` (ölçüm yok) değerleri null'a çevrilir; hadise kodları MGM'nin kendi site betiğindeki tabloyla Türkçe'ye açılır.

## opet — Opet akaryakıt pompa fiyatları

- **Veri:** İlçe bazında güncel pompa fiyatları (benzin, motorin, gazyağı, kalorifer yakıtı, fuel oil).
- **Uç nokta:** `https://api.opet.com.tr/api/fuelprices/prices?ProvinceCode=<kod>&IncludeAllProducts=true` — Opet'in kendi fiyat sayfasının kullandığı açık uç nokta. İstanbul Anadolu 34, İstanbul Avrupa 934 koduyla ayrı bölgelerdir.
- **Şart:** Fiyatlar Opet'in kamuya duyurduğu kendi pompa fiyatlarıdır; tek dağıtıcıyı temsil eder, sektör ortalaması değildir — yanıtlar bunu söyler. Resmî API sözleşmesi yoktur; haftalık sözleşme testi biçimi izler. Opet talep ederse kaynak kaldırılır.
- **Davranış:** 30 dakika önbellek. İlçe filtresi büyük/küçük harf ve Türkçe karakterden bağımsız.

## ibb — İBB Ulaşım Yönetim Merkezi (trafik indeksi)

- **Veri:** İstanbul geneli anlık trafik yoğunluk indeksi (0–100).
- **Uç nokta:** `https://tkmservices.ibb.gov.tr/web/api/TrafficData/v1/TrafficIndex` — İBB trafik haritasının (uym.ibb.gov.tr) kullandığı açık uç nokta; `{"Result": 76}` biçiminde tek sayı.
- **Şart:** İBB'nin kamuya sunduğu anlık gösterge; kaynak belirtilerek kullanılır. Resmî API sözleşmesi yoktur.
- **Davranış:** 60 saniye önbellek (anlık veridir; sınır yalnızca kurumu korumak içindir). 0–100 dışı ya da sayı olmayan yanıt biçim hatası olarak bildirilir.

## acikveri — Belediye açık veri portalları (CKAN)

- **Veri:** İBB Açık Veri Portalı (`data.ibb.gov.tr`, 557 veri seti), İzmir (`acikveri.bizizmir.com`, 250), Konya (`acikveri.konya.bel.tr`, 232) ve Gaziantep (`acikveri.gaziantep.bel.tr`, 252) Büyükşehir açık veri portalları: veri seti arama, ayrıntı, dosyalar ve tablo servisi (DataStore) satırları.
- **Uç nokta:** CKAN Action API v3 — `package_search`, `package_show`, `datastore_search`.
- **Şart:** İBB'nin tüm veri setleri "Istanbul Metropolitan Municipality Open Data License" altındadır; İzmir'de çoğu "Izmir Metropolitan Municipality License", bazıları CC-BY, birkaçı belirtilmemiş; Konya'da tamamı CC-BY / CC-BY 4.0; Gaziantep'te çoğu "Gaziantep Açık Veri Lisansı", biri CC-BY 4.0. Gaziantep sunucusu ara sertifikasını göndermez; Sectigo'nun kamuya açık ara sertifikası (`src/core/sertifikalar.ts`) Node'un kök deposuna eklenir, doğrulama atlanmaz. Veri seti yanıtı lisansı **adıyla** taşır; kullanmadan önce okunmalıdır.
- **Davranış:** Arama ve ayrıntı 10 dakika, satırlar 5 dakika önbellekte. Satır okuma en fazla 200 kayıt/çağrı; büyük tablolar `offset` ile sayfalanır. Tablo servisi kapalı kaynaklar için indirme bağlantısı verilir, dosya sunucu tarafından indirilmez.

## resmigazete — T.C. Resmî Gazete

- **Veri:** Günlük fihrist (sayı, bölüm, tür, madde başlıkları ve bağlantıları) ve .htm maddelerin düz metni.
- **Uç nokta:** `https://www.resmigazete.gov.tr/eskiler/YYYY/AA/YYYYAAGG.htm` (fihrist) ve fihristteki madde bağlantıları. Sayfalar windows-1254 kodlamasındadır; sunucu bu kodlamayla çözer.
- **Şart:** Resmî Gazete metinleri kamuya açıktır. Yalnızca `www.resmigazete.gov.tr` adresleri okunur; PDF maddeler için bağlantı verilir, dosya indirilmez. Mükerrer sayılar fihristte yer almaz.
- **TLS notu:** Sunucu sertifika zincirini eksik (ara sertifikasız) gönderir; tarayıcılar eksiği kendileri tamamlar, Node tamamlamaz. Bu yüzden kamuya açık GeoTrust ara sertifikası (`src/core/sertifikalar.ts`, 2027-11-02'ye kadar geçerli) Node'un kök deposuna **eklenir** — doğrulama atlanmaz, sertifika kontrolü kapatılmaz. Ara sertifika değişirse haftalık sözleşme testi kırılır.
- **Davranış:** Bugünün fihristi 10 dakika (gün içinde eklenebilir), geçmiş fihristler ve madde metinleri 24 saat önbellekte. Metin 20.000 karakterlik parçalarla verilir (`baslangic` ile devam).

## mevzuat — Mevzuat Bilgi Sistemi (mevzuat.gov.tr)

- **Veri:** Cumhurbaşkanlığı'nın güncel (konsolide) mevzuat metinleri: kanunlar, tüzükler, yönetmelikler, tebliğler, Cumhurbaşkanı kararları/kararnameleri/genelgeleri. Arama; tam metin; tek madde.
- **Uç nokta:** `https://www.mevzuat.gov.tr/anasayfa/MevzuatDatatable` (sitenin kendi arama çağrısı, POST) ve `.../anasayfa/MevzuatFihristDetayIframe?MevzuatTur=…&MevzuatNo=…&MevzuatTertip=…` (sitenin görüntüleyicisinin yüklediği metin, HTML).
- **Şart:** Mevzuat metinleri kamuya açıktır ve resmî güncel metin bu sitedir; yanıt her zaman mevzuat.gov.tr sayfasına bağlantı taşır. Resmî bir API sözleşmesi yoktur; haftalık sözleşme testi biçimi izler. Bu araçlar hukuki danışmanlık değildir; metin, kaynağıyla birlikte olduğu gibi aktarılır.
- **TLS notu:** Resmî Gazete ile aynı Cumhurbaşkanlığı sertifikası; aynı ara sertifika Node'un kök deposuna eklenir (bkz. resmigazete).
- **Davranış:** Arama 10 dakika, metinler 24 saat önbellekte (konsolide metin yalnızca bir değişiklik yayımlanınca değişir). Madde çıkarma "MADDE 6-" / "Madde 6 -" / "EK MADDE" / "GEÇİCİ MADDE" başlangıçlarını tanır; bulunamazsa mevcut madde listesi döner.

## tatil — Resmî tatiller

- **Veri:** Ulusal bayramlar (2429 sayılı Ulusal Bayram ve Genel Tatiller Hakkında Kanun) ve dinî bayramlar (Diyanet İşleri Başkanlığı "Dini Günler" takvimi, `vakithesaplama.diyanet.gov.tr`).
- **Şart:** Kanun metni ve Diyanet takvimi kamuya açıktır.
- **Davranış:** Tarihler pakete gömülüdür, ağ erişimi yoktur. Dinî bayram tablosu yalnızca doğrulanmış yıllar için vardır (şu an 2026, 2027); tablo olmayan yıl için dinî bayramlar **tahmin edilmez**, yanıtta `diniBayramlarDahil=false` döner. Yeni yıl tablosu Diyanet yayımladığında eklenir.

## dogrulama — Çevrimdışı biçim doğrulama

- **Veri:** T.C. Kimlik Numarası, Vergi Kimlik Numarası ve TR IBAN kontrol basamağı algoritmaları; plaka kodu tablosu.
- **Şart:** Algoritmalar kamuya açıktır (NVI, GİB ve ISO 13616). Hiçbir kuruma sorgu yapılmaz.
- **Davranış:** Girdi makineden çıkmaz. Yanıt her zaman "biçimsel doğrulama" uyarısı taşır: geçerli bir numara, gerçek bir kişi ya da kuruma ait olduğu anlamına gelmez. Kimlik doğrulama (NVI KPS) bilinçli olarak kapsam dışıdır — kişisel veri işleyen hiçbir araç bu sunucuda yer almaz.

## Bilinçli olarak kapsam dışı

- **NVI kimlik doğrulama, e-Nabız, e-Devlet, MERSİS, UYAP:** giriş ya da kişisel veri gerektirir; KVKK kapsamındadır.
- **Kullanım şartı belirsiz ya da kazımayı yasaklayan siteler:** bir kaynağın şartı okunup buraya yazılamıyorsa eklenmez.
