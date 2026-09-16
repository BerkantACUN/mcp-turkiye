# mcp-turkiye

**Türkiye'nin kamu verisi, tek MCP sunucusunda.** Claude, Cursor, VS Code, Codex ve MCP konuşan her asistan için: TCMB döviz kurları, TCMB EVDS istatistikleri (enflasyon, faiz, 40 binden fazla seri), BIST günlük fiyatlar, AFAD deprem kataloğu, MGM hava durumu, akaryakıt fiyatları, İstanbul anlık trafik indeksi, İBB/İzmir açık veri portalları, Resmî Gazete fihristi ve metinleri, mevzuat.gov.tr'de kanun/yönetmelik arama ve madde madde güncel metin, resmî tatiller ve TCKN / VKN / IBAN biçim doğrulama — her yanıt kaynağı ve alınma zamanıyla birlikte.

*Turkey's public data as one MCP server: central-bank FX rates, the central bank's EVDS statistics service (inflation, rates, 40,000+ series), Borsa İstanbul daily prices, the national earthquake catalogue, state weather service observations and forecasts, district-level fuel prices, Istanbul's live traffic index, Istanbul's and İzmir's open-data portals (search, datasets, DataStore rows), the Official Gazette's daily index and article texts, consolidated legislation search and article-level text from mevzuat.gov.tr, public holidays and offline ID/tax/IBAN checksum validation. Every answer carries its source and fetch time.*

[![CI](https://github.com/BerkantACUN/mcp-turkiye/actions/workflows/ci.yml/badge.svg)](https://github.com/BerkantACUN/mcp-turkiye/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-turkiye)](https://www.npmjs.com/package/mcp-turkiye)
[![license: MIT](https://img.shields.io/badge/code-MIT-yellow.svg)](LICENSE)
[![sources](https://img.shields.io/badge/data-SOURCES.md-blue)](SOURCES.md)

> **Bağımsız projedir.** mcp-turkiye hiçbir kamu kurumunun resmî hizmeti değildir. MIT lisansı yalnızca **kodu** kapsar; her veri kaynağının kendi kullanım şartı vardır ([SOURCES.md](SOURCES.md)) ve sunucunun kullanımı [Kabul Edilebilir Kullanım](ACCEPTABLE_USE.md) politikasına tabidir.

## Kurulum

Node.js 20+ yeterli; kurulacak başka bir şey yok. Anahtar yalnızca TCMB EVDS araçları için gerekir (ücretsiz, aşağıda); diğer her şey anahtarsız çalışır.

**Claude Code**

```sh
claude mcp add turkiye -- npx -y mcp-turkiye
```

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "turkiye": { "command": "npx", "args": ["-y", "mcp-turkiye"] }
  }
}
```

**Cursor / VS Code** — `.cursor/mcp.json` ya da `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "turkiye": { "command": "npx", "args": ["-y", "mcp-turkiye"] }
  }
}
```

Sonra asistanınıza Türkçe sorun:

> "Bugünkü TCMB dolar satış kuru ne, hangi bültenden?"
> "Son üç günde 4'ten büyük deprem oldu mu?"
> "Kadıköy'de hava nasıl, hafta sonu yağmur var mı?"
> "Bornova'da motorin kaç lira?"
> "İBB açık veride otopark verisi var mı, tablosunu göster."
> "Bugün Resmî Gazete'de hangi yönetmelikler çıktı, ilkini özetle."
> "KVKK'nın 6. maddesi ne diyor, özel nitelikli veri ne?"
> "İş Kanunu'nda ihbar süreleri hangi maddede, kaç hafta?"
> "THYAO son bir ayda ne yaptı, BIST 100'e göre?"
> "Yıllık enflasyon son 8 ayda nasıl seyretti?" *(EVDS anahtarıyla)*
> "İstanbul'da şu an trafik nasıl?"
> "29 Ekim 2026 hangi güne geliyor, iş günü mü?"
> "TR33 0006 1005 1978 6457 8413 26 geçerli bir IBAN mı, hangi banka?"

## Araçlar

| Araç | Ne yapar | Ağ |
|---|---|---|
| `tcmb_kurlar` | Günün (ya da verilen tarihin) TCMB gösterge kur bülteni, tüm para birimleri | TCMB |
| `tcmb_kur` | Tek para biriminin kuru — `birim` alanına dikkat, JPY 100 birim için verilir | TCMB |
| `evds_kategoriler` | EVDS konu ağacı (fiyatlar, faiz, kurlar, ödemeler dengesi, anketler, konut…) | TCMB EVDS* |
| `evds_veri_gruplari` | Bir kategorideki veri grupları: kod, frekans, birim, tarih aralığı | TCMB EVDS* |
| `evds_seriler` | Bir veri grubundaki seriler, ad filtresiyle | TCMB EVDS* |
| `evds_seri` | Bir ya da birkaç serinin gözlemleri; formül (yıllık % değişim vb.), frekans ve toplama seçenekleri | TCMB EVDS* |
| `bist_hisse` | Bir hissenin gün sonu fiyat geçmişi (kapanış, AOF, min/max, hacim, piyasa değeri) + aynı günün BIST 100 ve USD/TRY'si | İş Yatırım |
| `afad_depremler` | Tarih aralığı, en küçük büyüklük ve limitle deprem listesi; yeniden eskiye | AFAD |
| `mgm_hava_durumu` | İl/ilçe için anlık gözlem (sıcaklık, hissedilen, nem, rüzgâr, basınç, hadise) + 5 günlük tahmin | MGM |
| `opet_akaryakit` | İlçe bazında benzin/motorin/gazyağı/fuel oil pompa fiyatları; İstanbul iki yaka | Opet |
| `ibb_trafik_indeksi` | İstanbul geneli anlık trafik yoğunluğu (0–100), her çağrıda taze | İBB UYM |
| `acikveri_ara` | İBB ya da İzmir açık veri portalında veri seti arama | İBB, İzmir |
| `acikveri_veriseti` | Veri seti ayrıntısı: lisans, dosyalar, indirme bağlantıları, tablo servisi var mı | İBB, İzmir |
| `acikveri_kayitlar` | Tablo servisi açık kaynağın sütun ve satırları (DataStore), sayfalama ve metin filtresi | İBB, İzmir |
| `resmi_gazete_fihrist` | Günün Resmî Gazete fihristi: sayı, bölüm/tür, madde başlıkları ve bağlantıları | Resmî Gazete |
| `resmi_gazete_metin` | Bir maddenin (yönetmelik, tebliğ, karar) düz metni, 20 bin karakterlik parçalarla | Resmî Gazete |
| `mevzuat_ara` | Kanun, tüzük, yönetmelik, tebliğ, CB kararı/kararnamesi/genelgesi arama (başlık ya da tam metin) | mevzuat.gov.tr |
| `mevzuat_metin` | Bir mevzuatın resmî güncel (konsolide) tam metni, madde listesiyle, parçalı | mevzuat.gov.tr |
| `mevzuat_madde` | Tek bir madde: `6`, `6/A`, `ek 1`, `geçici 3` — başlığıyla birlikte | mevzuat.gov.tr |
| `resmi_tatiller` | Yılın resmî tatilleri: ulusal bayramlar + Diyanet takvimine göre dinî bayramlar (arefe yarım günleri dahil) | yok |
| `tatil_mi` | Bir tarih hafta sonu mu, tatil mi, iş günü mü | yok |
| `dogrula_tckn` | T.C. Kimlik Numarası kontrol basamakları | yok |
| `dogrula_vkn` | Vergi Kimlik Numarası kontrol basamağı | yok |
| `dogrula_iban` | TR IBAN mod-97 kontrolü + banka kodu | yok |
| `plaka_il` | Plaka kodu ↔ il, 81 il | yok |

\* EVDS araçları ücretsiz bir kişisel anahtar ister — bkz. [TCMB EVDS anahtarı](#tcmb-evds-anahtarı). Anahtar yoksa bu dört araç nereden alınacağını söyleyen bir hata döner, diğerleri etkilenmez.

Doğrulama araçları **yalnızca biçim** doğrular: kontrol basamakları hesaplanır, hiçbir kuruma sorulmaz, numara makineden çıkmaz. "Geçerli" bir numaranın gerçek bir kişiye ya da kuruma ait olduğu anlamına gelmez; her yanıt bunu açıkça söyler.

## TCMB EVDS anahtarı

EVDS, Merkez Bankası'nın istatistik servisidir (TÜFE, politika faizi, kurlar, konut fiyat endeksi, ödemeler dengesi, anketler — 40 binden fazla seri) ve ücretsiz bir kişisel anahtar ister:

1. https://evds3.tcmb.gov.tr → **Benim Sayfam → Kayıt** (e-posta doğrulaması).
2. Giriş yapınca kullanıcı adının altındaki **Profilim**'e tıkla.
3. Sayfanın altındaki **API Key Kopyala** butonuna bas.

Anahtarı MCP yapılandırmasında ortam değişkeni olarak ver:

```json
{
  "mcpServers": {
    "turkiye": {
      "command": "npx",
      "args": ["-y", "mcp-turkiye"],
      "env": { "EVDS_API_KEY": "anahtarınız" }
    }
  }
}
```

Anahtar yalnızca EVDS isteklerinin `key` başlığında kullanılır; hiçbir yanıtta, günlükte ya da URL'de yer almaz. EVDS bir istekte en fazla 150 gözlem verir; daha uzun aralıklar için birden çok çağrı gerekir.

## Her yanıt bir zarf içinde gelir

```json
{
  "kaynak": { "id": "tcmb", "ad": "Türkiye Cumhuriyet Merkez Bankası", "url": "https://www.tcmb.gov.tr/kurlar/today.xml" },
  "alindi": "2026-09-16T13:40:12.000Z",
  "veri": { "tarih": "2026-09-16", "bultenNo": "2026/174", "kur": { "kod": "USD", "dovizSatis": 48.6654, "birim": 1 } }
}
```

`kaynak` verinin geldiği kurum ve tam URL, `alindi` verinin çekildiği an. Bir kur ya da deprem listesi tarihsiz sunulursa "zamansız gerçek" gibi okunur; zarf bunu engeller. Kaynak yanıt vermezse araç **hata döner** — tahmini bir değer asla üretilmez, hangi kurumun yanıt vermediği söylenir.

## Tasarım kararları

- **Her yanıt canlı.** Pakette gömülü veri yoktur (tatil takvimi ve plaka tablosu dışında); her araç çağrıldığı anda kurumdan çeker. Önbellek yalnızca kurumu korumak için ve kısadır: trafik indeksi 1 dk, deprem 1 dk, kur 5 dk, hava 10 dk, akaryakıt 30 dk; `alindi` alanı verinin tam olarak ne zaman alındığını söyler.
- **Anahtar yok, kayıt yok.** Bütün kaynaklar kamuya açık ve anahtarsız. Ücretsiz anahtar isteyen kaynaklar (TCMB EVDS gibi) eklendiğinde isteğe bağlı olacak; anahtarsız çalışan araçlar anahtarsız kalır.
- **Kamu sunucularını yormaz.** Her istek zaman aşımlı, 5xx'te bir kez yeniden denenir, 4xx'te denenmez; aynı URL kısa süre önbellekte tutulur. Dünkü bülten değişmez, bir gün saklanır; bugünkü 5 dakika.
- **Kaynak bozulursa biz öğreniriz.** Her kaynağın gerçek uç noktasına karşı haftalık *sözleşme testi* koşar (`npm run test:live`); format değişince CI kırmızıya döner, kullanıcının asistanı yanlış cevap vermeden.
- **Kişisel veri işlenmez.** NVI kimlik doğrulama, e-Nabız, e-Devlet gibi giriş ya da kişisel veri gerektiren hiçbir kaynak yoktur ve eklenmeyecektir.
- **Kendi ilacımız.** Bu repodaki örnek istemci yapılandırması her CI'da [guardmcp](https://github.com/BerkantACUN/guardmcp) ile taranır.

## Yol haritası

Sonraki kaynaklar, diğer CKAN portalları, KAP bildirimleri, Diyanet vakitleri (resmî API anahtarıyla). Bir kaynak eklemek bir klasör eklemektir: [CONTRIBUTING.md](CONTRIBUTING.md).

## Geliştirme

```sh
npm ci
npm run verify      # typecheck + lint + build + test (kapsama eşiği %80)
npm run test:live   # gerçek kaynaklara karşı sözleşme testleri
npm run dev         # stdio üzerinden sunucuyu çalıştır
```

## English

Turkey's public data for AI agents, in one MCP server. Install with `npx -y mcp-turkiye` (Node 20+, no keys except for the optional EVDS tools). Twenty-five tools today: central-bank FX bulletins (all currencies or one, today or any past date), the central bank's EVDS statistics (topic tree, data groups, series and observations with formulas such as year-on-year change; needs a free `EVDS_API_KEY`), Borsa İstanbul daily price history, AFAD earthquake catalogue queries, MGM current conditions and 5-day forecasts for any province or district, Opet fuel pump prices per district, Istanbul's live traffic index, CKAN open-data search/dataset/DataStore access for Istanbul and İzmir, the Official Gazette's daily index and article text, legislation search plus consolidated full text and single-article lookup from mevzuat.gov.tr, public holidays with Diyanet's religious-holiday dates, business-day checks, and offline checksum validation of national ID numbers, tax numbers and IBANs plus province ↔ plate-code lookup. Every answer is an envelope with the source institution, the exact URL and the fetch time; a source that does not answer produces a tool error, never a guessed value. Tool descriptions are bilingual so English-speaking models use them correctly. Data licences: [SOURCES.md](SOURCES.md). Acceptable use: [ACCEPTABLE_USE.md](ACCEPTABLE_USE.md).

## Lisans

Kod: [MIT](LICENSE). Veri: her kaynağın kendi şartları, [SOURCES.md](SOURCES.md).
