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
        // Built from the registered sources, so a new source is never missing here.
        `Türkiye'nin kamu verisi için araçlar. Kaynaklar: ${kaynaklar.map((k) => k.ad).join('; ')}.`,
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
