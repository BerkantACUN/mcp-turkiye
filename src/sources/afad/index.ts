import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { type Kaynak, zarfla } from '../../core/source.js';

const KAYNAK_ID = 'afad';
const API = 'https://deprem.afad.gov.tr/apiv2/event/filter';

/** What AFAD's event API returns, as observed — every number is a string. */
interface AfadOlay {
  readonly eventID?: string;
  readonly date?: string;
  readonly magnitude?: string;
  readonly type?: string;
  readonly depth?: string;
  readonly latitude?: string;
  readonly longitude?: string;
  readonly location?: string;
  readonly province?: string | null;
  readonly district?: string | null;
}

export interface Deprem {
  readonly id: string;
  /** Local time as AFAD reports it (Türkiye, UTC+3), ISO form without offset. */
  readonly zaman: string;
  readonly buyukluk: number;
  /** Magnitude type: ML, Mw, Md… */
  readonly tur: string;
  readonly derinlikKm: number | null;
  readonly enlem: number | null;
  readonly boylam: number | null;
  readonly yer: string;
  readonly il: string | null;
  readonly ilce: string | null;
}

const sayi = (s: string | undefined): number | null => {
  if (s === undefined || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Pure. Normalises AFAD's all-strings records; drops anything without an id, time and magnitude. */
export function olaylariDonustur(ham: unknown): Deprem[] {
  if (!Array.isArray(ham)) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      API,
      'yanıt bir liste değil — kaynak formatı değişmiş olabilir',
    );
  }
  const sonuc: Deprem[] = [];
  for (const o of ham as AfadOlay[]) {
    const buyukluk = sayi(o.magnitude);
    if (!o.eventID || !o.date || buyukluk === null) continue;
    sonuc.push({
      id: o.eventID,
      zaman: o.date,
      buyukluk,
      tur: o.type ?? '',
      derinlikKm: sayi(o.depth),
      enlem: sayi(o.latitude),
      boylam: sayi(o.longitude),
      yer: o.location ?? '',
      il: o.province ?? null,
      ilce: o.district ?? null,
    });
  }
  return sonuc;
}

export function sorguUrl(baslangic: string, bitis: string, minBuyukluk: number): string {
  const p = new URLSearchParams({
    start: `${baslangic} 00:00:00`,
    end: `${bitis} 23:59:59`,
    minmag: String(minBuyukluk),
    orderby: 'timedesc',
  });
  return `${API}?${p.toString()}`;
}

const isoGun = (d: Date): string => d.toISOString().slice(0, 10);

const depremSemasi = z.object({
  id: z.string(),
  zaman: z.string(),
  buyukluk: z.number(),
  tur: z.string(),
  derinlikKm: z.number().nullable(),
  enlem: z.number().nullable(),
  boylam: z.number().nullable(),
  yer: z.string(),
  il: z.string().nullable(),
  ilce: z.string().nullable(),
});

export const afad: Kaynak = {
  id: KAYNAK_ID,
  ad: 'AFAD Deprem Dairesi Başkanlığı',
  url: 'https://deprem.afad.gov.tr/event-catalog',
  lisans: 'AFAD deprem kataloğu, kamuya açık; kaynak belirtilerek kullanılabilir (bkz. SOURCES.md)',

  kaydet(server) {
    server.registerTool(
      'afad_depremler',
      {
        title: 'AFAD deprem listesi',
        description:
          "AFAD'ın (Afet ve Acil Durum Yönetimi Başkanlığı) deprem kataloğundan, verilen tarih aralığındaki depremler — büyüklük, derinlik, konum, il/ilçe. Yeniden eskiye sıralı. Recent earthquakes in and around Türkiye from AFAD's catalogue. Varsayılan: son 7 gün, büyüklük ≥ 3.0, en fazla 50 kayıt.",
        inputSchema: {
          baslangic: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe('Başlangıç günü, YYYY-AA-GG. Varsayılan: 7 gün önce.'),
          bitis: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe('Bitiş günü, YYYY-AA-GG. Varsayılan: bugün.'),
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
            aralik: z.object({ baslangic: z.string(), bitis: z.string() }),
            minBuyukluk: z.number(),
            toplam: z.number(),
            depremler: z.array(depremSemasi),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ baslangic, bitis, minBuyukluk, limit }) => {
        const simdi = new Date();
        const bitisGun = bitis ?? isoGun(simdi);
        const baslangicGun =
          baslangic ?? isoGun(new Date(simdi.getTime() - 7 * 24 * 60 * 60 * 1000));
        const esik = minBuyukluk ?? 3;
        const url = sorguUrl(baslangicGun, bitisGun, esik);
        try {
          const ham = await jsonGetir(url, { kaynakId: KAYNAK_ID, cacheMs: 60_000 });
          const depremler = olaylariDonustur(ham);
          return cevapla(
            zarfla(
              afad,
              {
                aralik: { baslangic: baslangicGun, bitis: bitisGun },
                minBuyukluk: esik,
                toplam: depremler.length,
                depremler: depremler.slice(0, limit ?? 50),
              },
              url,
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );
  },
};
