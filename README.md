# mcp-turkiye

**Türkiye'nin kamu verisi, tek MCP sunucusunda.** Claude, Cursor, VS Code, Codex ve MCP konuşan her asistan için: TCMB döviz kurları, AFAD deprem kataloğu, resmî tatiller ve TCKN / VKN / IBAN biçim doğrulama — her yanıt kaynağı ve alınma zamanıyla birlikte.

*Turkey's public data as one MCP server: central-bank FX rates, the national earthquake catalogue, public holidays and offline ID/tax/IBAN checksum validation. Every answer carries its source and fetch time.*

[![CI](https://github.com/BerkantACUN/mcp-turkiye/actions/workflows/ci.yml/badge.svg)](https://github.com/BerkantACUN/mcp-turkiye/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-turkiye)](https://www.npmjs.com/package/mcp-turkiye)
[![license: MIT](https://img.shields.io/badge/code-MIT-yellow.svg)](LICENSE)
[![sources](https://img.shields.io/badge/data-SOURCES.md-blue)](SOURCES.md)

> **Bağımsız projedir.** mcp-turkiye hiçbir kamu kurumunun resmî hizmeti değildir. MIT lisansı yalnızca **kodu** kapsar; her veri kaynağının kendi kullanım şartı vardır ([SOURCES.md](SOURCES.md)) ve sunucunun kullanımı [Kabul Edilebilir Kullanım](ACCEPTABLE_USE.md) politikasına tabidir.

## Kurulum

Node.js 20+ yeterli; kurulacak başka bir şey yok, anahtar gerekmiyor.

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
> "29 Ekim 2026 hangi güne geliyor, iş günü mü?"
> "TR33 0006 1005 1978 6457 8413 26 geçerli bir IBAN mı, hangi banka?"

## Araçlar

| Araç | Ne yapar | Ağ |
|---|---|---|
| `tcmb_kurlar` | Günün (ya da verilen tarihin) TCMB gösterge kur bülteni, tüm para birimleri | TCMB |
| `tcmb_kur` | Tek para biriminin kuru — `birim` alanına dikkat, JPY 100 birim için verilir | TCMB |
| `afad_depremler` | Tarih aralığı, en küçük büyüklük ve limitle deprem listesi; yeniden eskiye | AFAD |
| `resmi_tatiller` | Yılın resmî tatilleri: ulusal bayramlar + Diyanet takvimine göre dinî bayramlar (arefe yarım günleri dahil) | yok |
| `tatil_mi` | Bir tarih hafta sonu mu, tatil mi, iş günü mü | yok |
| `dogrula_tckn` | T.C. Kimlik Numarası kontrol basamakları | yok |
| `dogrula_vkn` | Vergi Kimlik Numarası kontrol basamağı | yok |
| `dogrula_iban` | TR IBAN mod-97 kontrolü + banka kodu | yok |
| `plaka_il` | Plaka kodu ↔ il, 81 il | yok |

Doğrulama araçları **yalnızca biçim** doğrular: kontrol basamakları hesaplanır, hiçbir kuruma sorulmaz, numara makineden çıkmaz. "Geçerli" bir numaranın gerçek bir kişiye ya da kuruma ait olduğu anlamına gelmez; her yanıt bunu açıkça söyler.

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

- **Anahtar yok, kayıt yok.** Bütün kaynaklar kamuya açık ve anahtarsız. Ücretsiz anahtar isteyen kaynaklar (TCMB EVDS gibi) eklendiğinde isteğe bağlı olacak; anahtarsız çalışan araçlar anahtarsız kalır.
- **Kamu sunucularını yormaz.** Her istek zaman aşımlı, 5xx'te bir kez yeniden denenir, 4xx'te denenmez; aynı URL kısa süre önbellekte tutulur. Dünkü bülten değişmez, bir gün saklanır; bugünkü 5 dakika.
- **Kaynak bozulursa biz öğreniriz.** Her kaynağın gerçek uç noktasına karşı haftalık *sözleşme testi* koşar (`npm run test:live`); format değişince CI kırmızıya döner, kullanıcının asistanı yanlış cevap vermeden.
- **Kişisel veri işlenmez.** NVI kimlik doğrulama, e-Nabız, e-Devlet gibi giriş ya da kişisel veri gerektiren hiçbir kaynak yoktur ve eklenmeyecektir.
- **Kendi ilacımız.** Bu repodaki örnek istemci yapılandırması her CI'da [guardmcp](https://github.com/BerkantACUN/guardmcp) ile taranır.

## Yol haritası

Sonraki kaynaklar, hepsi bugün anahtarsız JSON verdiği doğrulanmış: MGM hava durumu, Opet akaryakıt fiyatları (81 il), İş Yatırım hisse fiyat geçmişi, İBB ve İzmir açık veri (CKAN), İBB trafik indeksi, Diyanet vakitleri, Kandilli, Resmî Gazete günlük fihristi, mevzuat.gov.tr tam metin, TCMB EVDS (ücretsiz anahtar). Bir kaynak eklemek bir klasör eklemektir: [CONTRIBUTING.md](CONTRIBUTING.md).

## Geliştirme

```sh
npm ci
npm run verify      # typecheck + lint + build + test (kapsama eşiği %80)
npm run test:live   # gerçek kaynaklara karşı sözleşme testleri
npm run dev         # stdio üzerinden sunucuyu çalıştır
```

## English

Turkey's public data for AI agents, in one MCP server. Install with `npx -y mcp-turkiye` (Node 20+, no keys). Nine tools today: central-bank FX bulletins (all currencies or one, today or any past date), AFAD earthquake catalogue queries, public holidays with Diyanet's religious-holiday dates, business-day checks, and offline checksum validation of national ID numbers, tax numbers and IBANs plus province ↔ plate-code lookup. Every answer is an envelope with the source institution, the exact URL and the fetch time; a source that does not answer produces a tool error, never a guessed value. Tool descriptions are bilingual so English-speaking models use them correctly. Data licences: [SOURCES.md](SOURCES.md). Acceptable use: [ACCEPTABLE_USE.md](ACCEPTABLE_USE.md).

## Lisans

Kod: [MIT](LICENSE). Veri: her kaynağın kendi şartları, [SOURCES.md](SOURCES.md).
