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
- **Göstergeler:** `evds_gosterge` on bir adı sabit seri koduna çevirir (örn. `enflasyon_yillik` → `TP.TUKFIY2025.GENEL`, formül 3; `politika_faizi` → `TP.BISPOLFAIZ.TUR`; `dolar` → `TP.DK.USD.S.YTL`). Her kod eklendiği gün EVDS kataloğundan çözülüp veriyle doğrulandı; haftalık canlı sözleşme testi hepsinin hâlâ yanıt verdiğini kontrol eder. TÜİK endeks tabanı değişince (2025=100 gibi) kod da değişir — o zaman tablo güncellenir, eski kod sessizce boş dönmez.

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

## kandilli — Boğaziçi Üniversitesi Kandilli Rasathanesi ve Deprem Araştırma Enstitüsü (BDTİM)

- **Veri:** Son 500 deprem (Türkiye ve yakın çevresi): zaman, enlem/boylam, derinlik, MD/ML/Mw büyüklükleri, yer adı, çözümün ilksel mi revize mi olduğu. AFAD'dan bağımsız ikinci katalog; büyük bir depremden sonra AFAD servisi yoğunken de yanıt verir.
- **Uç nokta:** `http://www.koeri.boun.edu.tr/scripts/lst0.asp` — sabit genişlikli metin (`<pre>`), windows-1254. Sunucu 443'te yanıt vermediği için düz HTTP; sayfada kişisel ya da gizli hiçbir şey yoktur.
- **Şart:** Sayfanın kendi ifadesiyle: veri "Boğaziçi Üniversitesi Kandilli Rasathanesi ve Deprem Araştırma Enstitüsü Bölgesel Deprem-Tsunami İzleme ve Değerlendirme Merkezi kaynak gösterilerek kullanılabilir"; **ticari amaçlı kullanım Boğaziçi Üniversitesi Rektörlüğü'nün yazılı izni ve onayına tabidir.** Her yanıt kurumu adıyla taşır; ticari bir üründe kullanacaksanız izin sizin sorumluluğunuzdadır.
- **Davranış:** 2 dakika önbellek (sayfa birkaç dakikada bir yenilenir; yenileme zamanı yanıttadır). Zamanlar Türkiye saatidir; `sonSaat` filtresi buna göre hesaplanır. Manşet büyüklük ML, yoksa Mw, yoksa MD — sayfanın kendi tercihi; üç sütun da yanıttadır.

## mgm — Meteoroloji Genel Müdürlüğü

- **Veri:** Anlık gözlem (sıcaklık, hissedilen, nem, rüzgâr, basınç, görüş, yağış, hadise) ve 5 günlük tahmin; il/ilçe → istasyon eşlemesi. Yürürlükteki meteorolojik uyarılar (hadise, şiddet, riskler, geçerlilik, tam metin).
- **Uç nokta:** `https://servis.mgm.gov.tr/web/merkezler`, `/web/sondurumlar`, `/web/tahminler/gunluk`, `/web/alarmlar` ve `/web/alarmlar/detay?alarmno=` — MGM'nin kendi sitesinin kullandığı servis. Servis yalnızca `Origin: https://www.mgm.gov.tr` başlığıyla yanıt verir; sunucu bu başlığı, tarayıcının gönderdiği gibi gönderir.
- **Şart:** MGM verisi kamuya açıktır ve MGM'ye atıfla kullanılır; sitede "link vermek için" yönergesi bulunur. Resmî bir API sözleşmesi yoktur — biçim değişirse haftalık sözleşme testi yakalar.
- **Davranış:** İstasyon eşlemesi 24 saat, anlık gözlem 10 dakika, tahmin 30 dakika, uyarı listesi 5 dakika ve uyarı metinleri 30 dakika önbellekte. Uyarı yoksa boş liste döner (hata değil). `-9999` (ölçüm yok) değerleri null'a çevrilir; hadise kodları MGM'nin kendi site betiğindeki tabloyla Türkçe'ye açılır.

## opet — Opet akaryakıt pompa fiyatları

- **Veri:** İlçe bazında güncel pompa fiyatları (benzin, motorin, gazyağı, kalorifer yakıtı, fuel oil).
- **Uç nokta:** `https://api.opet.com.tr/api/fuelprices/prices?ProvinceCode=<kod>&IncludeAllProducts=true` — Opet'in kendi fiyat sayfasının kullandığı açık uç nokta. İstanbul Anadolu 34, İstanbul Avrupa 934 koduyla ayrı bölgelerdir.
- **Şart:** Fiyatlar Opet'in kamuya duyurduğu kendi pompa fiyatlarıdır; tek dağıtıcıyı temsil eder, sektör ortalaması değildir — yanıtlar bunu söyler. Resmî API sözleşmesi yoktur; haftalık sözleşme testi biçimi izler. Opet talep ederse kaynak kaldırılır.
- **Davranış:** 30 dakika önbellek. İlçe filtresi büyük/küçük harf ve Türkçe karakterden bağımsız.

## ibb — İstanbul Büyükşehir Belediyesi (İBB)

Beş servis, iki ayrı dayanak:

**İBB Açık Veri Portalı'nda ilanlı web servisleri** (`data.ibb.gov.tr`, "Istanbul Metropolitan Municipality Open Data License"):

- **İSPARK** — `https://api.ibb.gov.tr/ispark/Park` (tüm otoparklar: kapasite, boş yer, açık/kapalı, çalışma saati, ücretsiz süre, konum) ve `…/ParkDetay?id=` (adres, tarife, aylık abonelik). Portal kaydı: "Ispark Parking List Web Service", "İSPARK Otopark Detay Bilgileri Web Servisi". Liste 2 dakika önbellekte; uzaklık, verilen koordinata büyük daire (haversine) mesafesidir; `areaPolygon` alanı yanıta konmaz.
- **Hava kalitesi** — `https://api.ibb.gov.tr/havakalitesi/OpenDataPortalHandler/GetAQIStations` (28 istasyon) ve `GetAQIByStationId?StationId=&StartDate=&EndDate=` (saatlik PM10/SO2/O3/NO2/CO derişimi ve alt endeksleri, AQI, İBB'nin durum metni ve rengi). Portal kaydı: "Hava Kalitesi İstasyon Bilgileri/Ölçüm Sonuçları Web Servisi". Servis saat başına hizalı kova döndürür; sunucu pencereyi saat başına yuvarlar (son 25 saat), istasyon listesi 24 saat, ölçümler 10 dakika önbellekte. Ölçümü olmayan saatler null'dur, tahmin edilmez.
- **Metro İstanbul** — `https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/GetLines`, `V2/GetStations`, `V3/GetAnnouncementsWithoutHtml/tr`. Portal kaydı: "Metro Istanbul Line Information List", "Metro İstanbul İstasyon Bilgi Listesi", "Metro Istanbul Timetable Web Service". Hat/istasyon 6 saat, duyurular 5 dakika önbellekte; ilk/son sefer saatleri operatörün yayımladığı değerlerdir, değişebilir.

**İBB'nin kendi harita sitelerinin açık uç noktaları** (portalda ayrı ilan yok; kaynak belirtilerek, kurum talep ederse kaldırılır):

- **Trafik indeksi** — `https://tkmservices.ibb.gov.tr/web/api/TrafficData/v1/TrafficIndex` (uym.ibb.gov.tr'nin kullandığı uç nokta, `{"Result": 76}`). 60 saniye önbellek; 0–100 dışı yanıt biçim hatasıdır.
- **Nöbetçi eczane** — `https://cbsproxy.ibb.gov.tr/?eczanews&ilceID=all` (İBB Şehir Haritası'nın nöbetçi eczane katmanı: ad, adres, telefon, ilçe, konum). 30 dakika önbellek. Eczane bilgileri il sağlık müdürlüğü/eczacı odası kaynaklıdır; gitmeden önce telefonla teyit önerilir, yanıt alınma zamanını taşır.

## izmir — İzmir Büyükşehir Belediyesi açık veri API (openapi.izmir.bel.tr)

- **Veri:** Nöbetçi eczaneler (`/api/ibb/nobetcieczaneler`: ad, bölge, nöbet açıklaması, adres, telefon, konum); toptancı hal günlük fiyat bülteni (`/api/ibb/halfiyatlari/sebzemeyve/YYYY-AA-GG` ve `/balik/…`: ürün, tip, birim, asgari/azami/ortalama); ESHOT canlı otobüs (`/api/iztek/duragayaklasanotobusler/{durakId}`, `/api/iztek/hattinyaklasanotobusleri/{hatNo}/{durakId}`: kalan durak, konum, engelli erişimi, bisiklet aparatı).
- **Şart:** Servisler İzmir Açık Veri Portalı'nda (`acikveri.bizizmir.com`) API biçimli veri seti olarak ilanlıdır; İzmir Büyükşehir Belediyesi Açık Veri Lisansı, kaynak belirtilerek kullanılır. Durak ve hat listeleri aynı portalın CKAN setlerindedir (`acikveri_ara` ile bulunur).
- **Davranış:** Eczane 30 dakika, hal bülteni 1 saat, otobüs 30 saniye önbellekte. Bülten olmayan günde servis 204 döner; sunucu bunu boş liste ve `bultenTarihi=null` olarak verir, hata olarak değil. Koordinatlar servisten virgüllü gelir, noktaya çevrilir.

## btcturk — BtcTurk kripto varlık piyasası

- **Veri:** Anlık ticker: 180'den fazla TRY ve USDT çifti için son işlem, alış/satış, günlük açılış, en düşük/en yüksek, ortalama, 24 saatlik hacim ve değişim.
- **Uç nokta:** `https://api.btcturk.com/api/v2/ticker` — BtcTurk'ün herkese açık (public) piyasa verisi ucu; anahtar istemez, hız sınırına tabidir.
- **Şart:** Tek bir borsanın fiyatıdır; piyasa geneli ya da yatırım tavsiyesi değildir — yanıtlar bunu söyler. BtcTurk API kullanım şartlarına tabidir; kurum talep ederse kaynak kaldırılır.
- **Davranış:** 30 saniye önbellek. `varlik` verilmezse TL cinsinden hacme (hacim × ortalama) göre ilk 30 çift.

## haber — Haber başlıkları (Anadolu Ajansı, TRT Haber RSS)

- **Veri:** Son haberlerin başlığı, kısa özeti, bağlantısı ve yayın zamanı; AA'da 11, TRT'de 12 kategori.
- **Uç nokta:** `https://www.aa.com.tr/tr/rss/default?cat=<kategori>` ve `https://www.trthaber.com/<kategori>_articles.rss`.
- **Şart:** Kurumların kamuya sunduğu RSS beslemeleri; yalnız başlık/özet/bağlantı/tarih aktarılır, haber metni indirilmez, içerik hakları yayıncıya aittir. Başlıklar yayıncının ifadesidir; sunucu yorum eklemez.
- **Davranış:** 5 dakika önbellek. Ayrıştırma bağımlılıksızdır (RSS 2.0 `item` blokları, CDATA ve HTML varlıkları çözülür); besleme biçimi bozulursa biçim hatası döner.

## iller — İl ve ilçe bilgileri (gömülü)

- **Veri:** 81 il (nüfus, yüzölçümü, rakım, telefon alan kodları, kıyı/büyükşehir, coğrafi bölge, koordinat, ilçe/mahalle/köy sayıları) ve 973 ilçe (nüfus, yüzölçümü).
- **Kaynak:** [ubeydeozdmr/turkiye-api](https://github.com/ubeydeozdmr/turkiye-api) veri setleri (MIT lisansı; nüfus TÜİK Adrese Dayalı Nüfus Kayıt Sistemi'nden). `scripts/iller-veri.mjs` veriyi indirip `src/sources/iller/veri.ts` olarak gömer; alınma tarihi her yanıtta `veriTarihi` alanındadır.
- **Davranış:** Ağ erişimi yok. Yıllık TÜİK açıklamasından sonra betik yeniden çalıştırılır.

## acikveri — Belediye açık veri portalları (CKAN)

- **Veri:** İBB Açık Veri Portalı (`data.ibb.gov.tr`, 557 veri seti), İzmir (`acikveri.bizizmir.com`, 250), Konya (`acikveri.konya.bel.tr`, 232) ve Gaziantep (`acikveri.gaziantep.bel.tr`, 252) Büyükşehir açık veri portalları: veri seti arama, ayrıntı, dosyalar ve tablo servisi (DataStore) satırları.
- **Uç nokta:** CKAN Action API v3 — `package_search`, `package_show`, `datastore_search`.
- **Şart:** İBB'nin tüm veri setleri "Istanbul Metropolitan Municipality Open Data License" altındadır; İzmir'de çoğu "Izmir Metropolitan Municipality License", bazıları CC-BY, birkaçı belirtilmemiş; Konya'da tamamı CC-BY / CC-BY 4.0 (portal Türkiye dışındaki IP'lere 403 döndürür; araç bunu açıkça söyler); Gaziantep'te çoğu "Gaziantep Açık Veri Lisansı", biri CC-BY 4.0. Gaziantep sunucusu ara sertifikasını göndermez; Sectigo'nun kamuya açık ara sertifikası (`src/core/sertifikalar.ts`) Node'un kök deposuna eklenir, doğrulama atlanmaz. Veri seti yanıtı lisansı **adıyla** taşır; kullanmadan önce okunmalıdır.
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

## osym — Ölçme, Seçme ve Yerleştirme Merkezi (sınav takvimi)

- **Veri:** Yılın sınav takvimi: her sınav oturumu için ön başvuru, başvuru, geç başvuru, sınav, sonuç ve tercih tarihleri ile ÖSYM'nin açıklama notu (YKS, KPSS, ALES, YDS, DGS, TUS, MSÜ, e-YDS…; 2026'da 86 satır).
- **Uç nokta:** `https://www.osym.gov.tr/Sayfa/SinavTakvimi` — tek HTML tablo (`#stTakvimListTable`); tarih hücreleri tek tarih ya da `<br>` ile ayrılmış başlangıç/bitiş.
- **Şart:** Kurumun kamuya açık resmî duyurusu; kaynak belirtilerek kullanılır. Takvim değişebilir — ÖSYM sayfayı günceller, yanıt `alindi` zamanını taşır; kesin tarih için ÖSYM duyurusu esastır.
- **Davranış:** 6 saat önbellek. Site çoğu zaman 0,2 saniyede yanıt verir, ara sıra ~90 KB'dan sonra takılıp hiç bitirmez; bu yüzden 8 saniyelik zaman aşımı ve üç deneme. Varsayılan yalnızca en az bir tarihi bugünden ileride olan satırlar; `yalnizGelecek=false` tüm yılı verir. Saatler Türkiye saatidir; tarih verilmeyen adımlar null'dur, tahmin edilmez.

## parametreler — Resmî parametreler (gömülü, kaynaklı)

- **Veri:** Yıl bazında resmî sayılar: asgari ücret (günlük brüt, aylık brüt, aylık net) ve SGK prime esas kazanç alt/üst sınırı. Şu an 2026.
- **Kaynak:** Karara bağlanan sayı Resmî Gazete'den (2026: Asgari Ücret Tespit Komisyonu Kararı, RG 26.12.2025 sayı 33119); türetilen her sayı dayandığı kanun maddesiyle (5510 s. K. m. 81–82, 4447 s. K. m. 49, 193 s. GVK m. 23/18, 488 s. DVK) ve hesabıyla verilir. Kanun maddeleri bu sunucunun kendi `mevzuat_madde` aracıyla doğrulandı.
- **Kural:** Birincil metne bağlanamayan sayı eklenmez — kıdem tazminatı tavanı (memur maaş katsayısına bağlı) ve gelir vergisi dilimleri bu yüzden bu sürümde yoktur. Yıl için tablo yoksa `mevcut=false` döner, tahmin edilmez.
- **Davranış:** Ağ erişimi yok; her yıl için tablo yeni karar yayımlanınca güncellenir.

## dogrulama — Çevrimdışı biçim doğrulama

- **Veri:** T.C. Kimlik Numarası, Vergi Kimlik Numarası ve TR IBAN kontrol basamağı algoritmaları; plaka kodu tablosu.
- **Şart:** Algoritmalar kamuya açıktır (NVI, GİB ve ISO 13616). Hiçbir kuruma sorgu yapılmaz.
- **Davranış:** Girdi makineden çıkmaz. Yanıt her zaman "biçimsel doğrulama" uyarısı taşır: geçerli bir numara, gerçek bir kişi ya da kuruma ait olduğu anlamına gelmez. Kimlik doğrulama (NVI KPS) bilinçli olarak kapsam dışıdır — kişisel veri işleyen hiçbir araç bu sunucuda yer almaz.

## Bilinçli olarak kapsam dışı

- **NVI kimlik doğrulama, e-Nabız, e-Devlet, MERSİS, UYAP:** giriş ya da kişisel veri gerektirir; KVKK kapsamındadır.
- **Kullanım şartı belirsiz ya da kazımayı yasaklayan siteler:** bir kaynağın şartı okunup buraya yazılamıyorsa eklenmez.
