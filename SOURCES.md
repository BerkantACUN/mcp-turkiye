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
