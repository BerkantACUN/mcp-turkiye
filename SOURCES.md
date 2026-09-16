# Veri kaynakları

Her kaynağın yayımlayan kurumu, kullanılan uç noktası, kullanım şartı ve bu sunucunun ona nasıl davrandığı. MIT lisansı yalnızca bu reponun kodunu kapsar; aşağıdaki veriler kurumlarına aittir.

Kural: bir kaynak buraya girmeden sunucuya girmez.

## tcmb — Türkiye Cumhuriyet Merkez Bankası

- **Veri:** Günlük gösterge döviz kurları (döviz alış/satış, efektif alış/satış).
- **Uç nokta:** `https://www.tcmb.gov.tr/kurlar/today.xml` ve arşiv `https://www.tcmb.gov.tr/kurlar/YYYYAA/GGAAYYYY.xml`.
- **Şart:** TCMB, gösterge kurlarını kamuya açık olarak yayımlar; kaynak belirtilmesi beklenir. Kurlar "gösterge" niteliğindedir, işlem kuru değildir — yanıtlar bunu kurumun kendi ifadesiyle taşır.
- **Davranış:** Bugünkü bülten 5 dakika, geçmiş bültenler 24 saat önbellekte. Hafta sonu ve tatilde bülten olmadığı için 404 gelen tarihler "bülten yok" olarak açıklanır, hata olarak değil.

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
