import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { KaynakHatasi, metinGetir } from '../../core/http.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import { type Sinav, sonTarih, takvimiAyristir } from './parse.js';

const KAYNAK_ID = 'osym';
const SAYFA = 'https://www.osym.gov.tr/Sayfa/SinavTakvimi';
const VARSAYILAN_LIMIT = 50;

const araligiSemasi = z.object({ baslangic: z.string(), bitis: z.string().nullable() }).nullable();

const sinavSemasi = z.object({
  grup: z.string(),
  uzunAd: z.string(),
  ad: z.string(),
  onBasvuru: araligiSemasi,
  basvuru: araligiSemasi,
  gecBasvuru: araligiSemasi,
  sinav: araligiSemasi,
  onBasvuruSonuc: araligiSemasi,
  sonuc: araligiSemasi,
  tercih: araligiSemasi,
  aciklama: z.string().nullable(),
  url: z.string(),
});

const eslesir = (s: Sinav, arama: string): boolean =>
  `${s.grup} ${s.uzunAd} ${s.ad}`.toLocaleLowerCase('tr-TR').includes(arama);

/**
 * "When is YKS, when do KPSS applications close, when are ALES results
 * out" — the questions every student in Türkiye asks each year, answered
 * from ÖSYM's own calendar rather than from a news site's copy of it.
 */
export const osym: Kaynak = {
  id: KAYNAK_ID,
  ad: 'Ölçme, Seçme ve Yerleştirme Merkezi',
  url: SAYFA,
  lisans:
    'ÖSYM sınav takvimi, kamuya açık resmî duyuru; kaynak belirtilerek kullanılır (bkz. SOURCES.md)',

  kaydet(server) {
    server.registerTool(
      'osym_sinav_takvimi',
      {
        title: 'ÖSYM sınav takvimi',
        description:
          "ÖSYM'nin yıllık sınav takvimi: YKS, KPSS, ALES, YDS, DGS, TUS, MSÜ ve diğerleri için başvuru, geç başvuru, sınav, sonuç ve tercih tarihleri, ÖSYM'nin açıklamasıyla. Türkiye's national exam calendar (university entrance, civil-service, graduate and language exams) from the testing authority: application, exam, result and preference dates. Varsayılan: yalnızca gelecekteki adımlar (bir tarihi bugünden ileride olan satırlar); `ara` ile sınav adı filtresi. Saatler Türkiye saatidir.",
        inputSchema: {
          ara: z
            .string()
            .min(2)
            .optional()
            .describe('Sınav adı ya da grubu, örn. YKS, KPSS Lisans, ALES (isteğe bağlı)'),
          yalnizGelecek: z
            .boolean()
            .optional()
            .describe('true (varsayılan): en az bir tarihi bugünden ileride olan satırlar'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(500)
            .optional()
            .describe('En fazla satır, varsayılan 50'),
        },
        outputSchema: zarfSemasi(
          z.object({
            filtre: z.string().nullable(),
            yalnizGelecek: z.boolean(),
            toplam: z.number(),
            sinavlar: z.array(sinavSemasi),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ ara, yalnizGelecek, limit }) => {
        const gelecek = yalnizGelecek ?? true;
        try {
          const html = await metinGetir(SAYFA, {
            kaynakId: KAYNAK_ID,
            cacheMs: 6 * 60 * 60 * 1000,
            // ÖSYM's site delivers the page in 0.2 s most of the time, and now and
            // then stalls after ~90 KB and never finishes; a short timeout and a
            // third attempt turn that into a rare failure instead of a common one.
            timeoutMs: 8_000,
            deneme: 3,
          });
          const hepsi = takvimiAyristir(html);
          const bugun = new Date().toISOString().slice(0, 10);
          const arama = ara?.trim().toLocaleLowerCase('tr-TR') || null;
          const secilen = hepsi.filter(
            (s) => (!arama || eslesir(s, arama)) && (!gelecek || (sonTarih(s) ?? '') >= bugun),
          );
          return cevapla(
            zarfla(osym, {
              filtre: ara?.trim() ?? null,
              yalnizGelecek: gelecek,
              toplam: secilen.length,
              sinavlar: secilen.slice(0, limit ?? VARSAYILAN_LIMIT),
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
