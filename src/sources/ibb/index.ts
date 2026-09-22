import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import { eczaneAracinikaydet } from './eczane.js';
import { havaKalitesiAraciniKaydet } from './havakalitesi.js';
import { metroAraclariniKaydet } from './metro.js';
import { otoparkAraclariniKaydet } from './otopark.js';

const KAYNAK_ID = 'ibb';
const TRAFIK_URL = 'https://tkmservices.ibb.gov.tr/web/api/TrafficData/v1/TrafficIndex';

/** Pure. İBB answers `{"Result": 76}`; anything else is a format change. */
export function trafikIndeksiniOku(ham: unknown): number {
  const r =
    typeof ham === 'object' && ham !== null ? (ham as { Result?: unknown }).Result : undefined;
  if (typeof r !== 'number' || !Number.isFinite(r) || r < 0 || r > 100) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      TRAFIK_URL,
      'yanıt 0–100 arası bir "Result" sayısı değil — kaynak formatı değişmiş olabilir',
    );
  }
  return r;
}

export const ibb: Kaynak = {
  id: KAYNAK_ID,
  ad: 'İstanbul Büyükşehir Belediyesi (İBB)',
  url: 'https://data.ibb.gov.tr/',
  lisans:
    "İSPARK, hava kalitesi ve Metro İstanbul servisleri İBB Açık Veri Portalı'nda ilanlı (Istanbul Metropolitan Municipality Open Data License); trafik indeksi ve nöbetçi eczane İBB'nin kendi harita sitelerinin açık uç noktaları, kaynak belirtilerek (bkz. SOURCES.md)",

  kaydet(server) {
    server.registerTool(
      'ibb_trafik_indeksi',
      {
        title: 'İstanbul anlık trafik yoğunluk indeksi',
        description:
          "İstanbul geneli anlık trafik yoğunluğu, İBB Ulaşım Yönetim Merkezi'nin 0–100 indeksi (İBB trafik haritasındaki yüzde). Istanbul's live citywide traffic density index from the metropolitan transport centre. Anlık değerdir; her çağrıda taze alınır.",
        inputSchema: {},
        outputSchema: zarfSemasi(z.object({ indeks: z.number(), olcek: z.string() })),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async () => {
        try {
          // Live by nature: a minute of caching only protects İBB from a chatty agent.
          const ham = await jsonGetir(TRAFIK_URL, { kaynakId: KAYNAK_ID, cacheMs: 60_000 });
          return cevapla(
            zarfla(
              ibb,
              {
                indeks: trafikIndeksiniOku(ham),
                olcek: "0 (boş) – 100 (durma noktası), İBB'nin kendi ölçeği",
              },
              TRAFIK_URL,
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );
    eczaneAracinikaydet(ibb, server);
    otoparkAraclariniKaydet(ibb, server);
    havaKalitesiAraciniKaydet(ibb, server);
    metroAraclariniKaydet(ibb, server);
  },
};
