import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { promptlariKaydet } from './prompts.js';
import { KAYNAKLAR } from './sources/index.js';
import { SURUM } from './surum.js';

export { SURUM };

export function sunucuOlustur(kaynaklar = KAYNAKLAR): McpServer {
  const server = new McpServer(
    { name: 'mcp-turkiye', version: SURUM },
    {
      instructions: [
        "Türkiye'nin kamu verisi için araçlar: TCMB döviz kurları, AFAD deprem kataloğu, MGM hava durumu, Opet akaryakıt fiyatları, İstanbul trafik indeksi, BIST günlük fiyatlar, İBB/İzmir açık veri portalları, Resmî Gazete fihristi ve metinleri, mevzuat.gov.tr arama/tam metin/madde, resmî tatiller, resmî parametreler (asgari ücret, SGK sınırları) ve TCKN/VKN/IBAN biçim doğrulama.",
        'Her yanıt bir zarf içinde gelir: `kaynak` (kurum ve URL), `alindi` (verinin çekildiği an) ve `veri`. Kullanıcıya sayı verirken kaynağı ve tarihi de söyleyin.',
        'Bir kaynak yanıt vermezse araç hata döner; değer tahmin etmeyin, kaynağın yanıt vermediğini söyleyin.',
        'Doğrulama araçları yalnızca biçim kontrolü yapar; bir numaranın gerçek bir kişiye ya da kuruma ait olduğunu söylemeyin.',
      ].join('\n'),
    },
  );
  for (const kaynak of kaynaklar) {
    kaynak.kaydet(server);
  }
  promptlariKaydet(server);
  return server;
}
