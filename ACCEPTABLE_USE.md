# Kabul edilebilir kullanım

mcp-turkiye, kamu kurumlarının zaten herkese açık yayımladığı veriyi yapay zekâ asistanlarının okuyabileceği biçime getirir. Bunu yaparken üç şeyi korur: kurumların sunucularını, verinin bağlamını ve insanların kişisel verisini.

## Yapabilirsiniz

- Kişisel, ticari, akademik ve gazetecilik amaçlı kullanmak — MIT lisansı kodu her amaç için serbest bırakır; verinin şartları [SOURCES.md](SOURCES.md)'de.
- Sunucuyu kendi ürününüze ya da iç aracınıza gömmek.
- Kaynak ekleyerek geliştirmek ([CONTRIBUTING.md](CONTRIBUTING.md)).

## Yapmamanız beklenir

- **Kurumların sunucularını yormak.** Sunucu zaman aşımı, sınırlı yeniden deneme ve önbellekle gelir; bunları devre dışı bırakıp toplu çekim aracı olarak kullanmayın. Toplu veri gerekiyorsa kurumun kendi indirme kanalını kullanın.
- **Kaynağı düşürmek.** Yanıtlar kurum, URL ve alınma zamanıyla gelir. Bir kuru ya da deprem büyüklüğünü kaynağı ve tarihi olmadan "gerçek" diye sunmak, verinin bağlamını yok eder.
- **Karar sistemlerinde tek dayanak yapmak.** TCMB kurları gösterge niteliğindedir, AFAD çözümleri güncellenebilir, tatil takvimi kanun değişikliğiyle değişebilir. Mali, hukuki ya da can güvenliğine dair kararlarda kurumun kendi kaynağını doğrulayın.
- **Doğrulama araçlarını kimlik tespiti sanmak.** `dogrula_*` araçları kontrol basamağı hesaplar; bir numaranın bir kişiye ait olduğunu ya da bir kişinin var olduğunu söylemez, söyleyemez. Bu araçları kişileri tanımlamak, eşleştirmek ya da izlemek için kullanmak politikaya aykırıdır.
- **Kişisel veri eklemek.** Kişisel veri işleyen bir kaynak için açılan katkı, KVKK gerekçesiyle kabul edilmez.

## Sorumluluk

Bu proje hiçbir kamu kurumunun resmî hizmeti değildir; veri kurumlara aittir ve olduğu gibi aktarılır. Bir kurumun kullanım şartıyla çelişen bir durum görürseniz issue açın; ilgili kaynak açıklığa kavuşana kadar kapatılır.
