import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { KaynakHatasi, metinGetir } from '../../core/http.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import { listeyiAyristir, yerelZaman } from './parse.js';

const KAYNAK_ID = 'kandilli';
/** Plain HTTP: the host does not answer on 443. The page carries nothing personal and nothing secret. */
const SAYFA = 'http://www.koeri.boun.edu.tr/scripts/lst0.asp';
const VARSAYILAN_SAAT = 24;
const VARSAYILAN_BUYUKLUK = 3;
const VARSAYILAN_LIMIT = 50;

const depremSemasi = z.object({
  zaman: z.string(),
  enlem: z.number(),
  boylam: z.number(),
  derinlikKm: z.number(),
  buyukluk: z.number(),
  buyuklukTuru: z.enum(['ML', 'Mw', 'MD']),
  md: z.number().nullable(),
  ml: z.number().nullable(),
  mw: z.number().nullable(),
  yer: z.string(),
  cozum: z.string(),
});

/**
 * Kandilli is the second earthquake voice in Türkiye — the one the news
 * quotes alongside AFAD, and the one still answering when AFAD's API is
 * saturated after a large event. Same question, independent catalogue.
 */
export const kandilli: Kaynak = {
  id: KAYNAK_ID,
  ad: 'Boğaziçi Üniversitesi Kandilli Rasathanesi ve Deprem Araştırma Enstitüsü',
  url: SAYFA,
  lisans:
    'Kandilli Rasathanesi BDTİM verisi; kaynak gösterilerek kullanılabilir, ticari kullanım Boğaziçi Üniversitesi Rektörlüğü’nün yazılı iznine tabidir (bkz. SOURCES.md)',

  kaydet(server) {
    server.registerTool(
      'kandilli_depremler',
      {
        title: 'Kandilli son depremler',
        description:
          "Boğaziçi Üniversitesi Kandilli Rasathanesi'nin (BDTİM) son depremler listesi — AFAD'dan bağımsız ikinci katalog. Büyüklük (ML/Mw/MD), derinlik, konum, yer adı ve çözümün ilksel mi revize mi olduğu; yeniden eskiye. Latest earthquakes from Kandilli Observatory, Türkiye's second seismic catalogue. Kandilli yalnızca son 500 depremi yayımlar (genelde birkaç gün); varsayılan: son 24 saat, büyüklük ≥ 3.0, en fazla 50 kayıt. Zamanlar Türkiye saatidir.",
        inputSchema: {
          sonSaat: z
            .number()
            .int()
            .min(1)
            .max(24 * 30)
            .optional()
            .describe('Kaç saat geriye bakılsın. Varsayılan 24.'),
          minBuyukluk: z
            .number()
            .min(0)
            .max(10)
            .optional()
            .describe('En küçük büyüklük. Varsayılan 3.0.'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(500)
            .optional()
            .describe('En fazla kayıt. Varsayılan 50.'),
        },
        outputSchema: zarfSemasi(
          z.object({
            sonSaat: z.number(),
            minBuyukluk: z.number(),
            guncelleme: z.string().nullable(),
            toplam: z.number(),
            depremler: z.array(depremSemasi),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ sonSaat, minBuyukluk, limit }) => {
        const saat = sonSaat ?? VARSAYILAN_SAAT;
        const esik = minBuyukluk ?? VARSAYILAN_BUYUKLUK;
        try {
          const html = await metinGetir(SAYFA, {
            kaynakId: KAYNAK_ID,
            charset: 'windows-1254',
            cacheMs: 2 * 60 * 1000,
          });
          const { depremler, guncelleme } = listeyiAyristir(html);
          const sinir = Date.now() - saat * 60 * 60 * 1000;
          const secilen = depremler.filter(
            (d) => d.buyukluk >= esik && yerelZaman(d.zaman) >= sinir,
          );
          return cevapla(
            zarfla(kandilli, {
              sonSaat: saat,
              minBuyukluk: esik,
              guncelleme,
              toplam: secilen.length,
              depremler: secilen.slice(0, limit ?? VARSAYILAN_LIMIT),
            }),
          );
        } catch (error) {
          return hata(
            error instanceof KaynakHatasi
              ? error
              : new KaynakHatasi(
                  KAYNAK_ID,
                  SAYFA,
                  error instanceof Error ? error.message : String(error),
                ),
          );
        }
      },
    );
  },
};
