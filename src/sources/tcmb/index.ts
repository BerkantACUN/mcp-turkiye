import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { KaynakHatasi, metinGetir } from '../../core/http.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import { BultenBicimHatasi, bulteniAyristir, type KurBulteni } from './parse.js';

const KAYNAK_ID = 'tcmb';
const BUGUN_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';

/** TCMB archives bulletins as /kurlar/YYYYMM/DDMMYYYY.xml. */
export function bultenUrl(tarih?: string): string {
  if (!tarih) return BUGUN_URL;
  const [yil, ay, gun] = tarih.split('-');
  return `https://www.tcmb.gov.tr/kurlar/${yil}${ay}/${gun}${ay}${yil}.xml`;
}

export async function bulteniGetir(tarih?: string, fetchImpl?: typeof fetch): Promise<KurBulteni> {
  const url = bultenUrl(tarih);
  let xml: string;
  try {
    xml = await metinGetir(url, {
      kaynakId: KAYNAK_ID,
      // Yesterday's bulletin never changes; today's is published once at 15:30.
      cacheMs: tarih ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  } catch (error) {
    if (error instanceof KaynakHatasi && error.status === 404 && tarih) {
      throw new KaynakHatasi(
        KAYNAK_ID,
        url,
        `${tarih} için bülten yok — TCMB hafta sonu ve resmî tatillerde bülten yayımlamaz; bir önceki iş gününü deneyin`,
        404,
      );
    }
    throw error;
  }
  try {
    return bulteniAyristir(xml);
  } catch (error) {
    if (error instanceof BultenBicimHatasi) throw new KaynakHatasi(KAYNAK_ID, url, error.message);
    throw error;
  }
}

const kurSemasi = z.object({
  kod: z.string(),
  ad: z.string(),
  adIngilizce: z.string(),
  birim: z.number(),
  dovizAlis: z.number().nullable(),
  dovizSatis: z.number().nullable(),
  efektifAlis: z.number().nullable(),
  efektifSatis: z.number().nullable(),
});

const tarihSemasi = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-AA-GG biçiminde olmalı')
  .optional()
  .describe('Bülten tarihi, YYYY-AA-GG. Boş bırakılırsa bugünkü (son) bülten.');

export const tcmb: Kaynak = {
  id: KAYNAK_ID,
  ad: 'Türkiye Cumhuriyet Merkez Bankası',
  url: 'https://www.tcmb.gov.tr/kurlar/kurlar_tr.html',
  lisans: 'TCMB gösterge kurları; kaynak belirtilerek kullanılabilir (bkz. SOURCES.md)',

  kaydet(server) {
    server.registerTool(
      'tcmb_kurlar',
      {
        title: 'TCMB döviz kurları (günlük bülten)',
        description:
          "Türkiye Cumhuriyet Merkez Bankası'nın günlük gösterge döviz kurları: bültendeki tüm para birimleri için döviz alış/satış ve efektif alış/satış, TL cinsinden. Daily indicative FX rates of the Turkish central bank, all currencies. Tarih verilmezse bugünkü bülten.",
        inputSchema: { tarih: tarihSemasi },
        outputSchema: zarfSemasi(
          z.object({ tarih: z.string(), bultenNo: z.string(), kurlar: z.array(kurSemasi) }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ tarih }) => {
        try {
          const bulten = await bulteniGetir(tarih);
          return cevapla(zarfla(tcmb, bulten, bultenUrl(tarih)));
        } catch (error) {
          return hata(error);
        }
      },
    );

    server.registerTool(
      'tcmb_kur',
      {
        title: 'TCMB kuru (tek para birimi)',
        description:
          'Tek bir para biriminin TCMB gösterge kuru (örn. USD, EUR, GBP, JPY). Single-currency rate from the Turkish central bank bulletin. Yanıttaki `birim` alanına dikkat: JPY gibi bazı kurlar 100 birim için verilir.',
        inputSchema: {
          kod: z.string().length(3).describe('ISO 4217 para birimi kodu, örn. USD'),
          tarih: tarihSemasi,
        },
        outputSchema: zarfSemasi(
          z.object({ tarih: z.string(), bultenNo: z.string(), kur: kurSemasi }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ kod, tarih }) => {
        try {
          const bulten = await bulteniGetir(tarih);
          const kur = bulten.kurlar.find((k) => k.kod === kod.toUpperCase());
          if (!kur) {
            return hata(
              new Error(
                `${kod.toUpperCase()} bu bültende yok. Bültendeki kodlar: ${bulten.kurlar.map((k) => k.kod).join(', ')}`,
              ),
            );
          }
          return cevapla(
            zarfla(tcmb, { tarih: bulten.tarih, bultenNo: bulten.bultenNo, kur }, bultenUrl(tarih)),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );
  },
};
