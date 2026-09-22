import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { type Kaynak, zarfla } from '../../core/source.js';

const KAYNAK_ID = 'btcturk';
export const TICKER_URL = 'https://api.btcturk.com/api/v2/ticker';
const VARSAYILAN_LIMIT = 30;

export interface Kur {
  readonly cift: string;
  readonly varlik: string;
  readonly paraBirimi: string;
  readonly son: number;
  readonly alis: number | null;
  readonly satis: number | null;
  readonly acilis: number | null;
  readonly enDusuk: number | null;
  readonly enYuksek: number | null;
  readonly ortalama: number | null;
  readonly hacim: number | null;
  readonly gunlukDegisim: number | null;
  readonly gunlukYuzde: number | null;
  readonly zaman: string | null;
}

const sayi = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function kurlariDonustur(ham: unknown): Kur[] {
  const liste = (ham as { data?: unknown } | null)?.data;
  if (!Array.isArray(liste)) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      TICKER_URL,
      'yanıtta data listesi yok — kaynak formatı değişmiş olabilir',
    );
  }
  return (liste as Record<string, unknown>[])
    .filter((k) => typeof k.pair === 'string' && typeof k.last === 'number')
    .map((k) => ({
      cift: k.pair as string,
      varlik: typeof k.numeratorSymbol === 'string' ? k.numeratorSymbol : '',
      paraBirimi: typeof k.denominatorSymbol === 'string' ? k.denominatorSymbol : '',
      son: k.last as number,
      alis: sayi(k.bid),
      satis: sayi(k.ask),
      acilis: sayi(k.open),
      enDusuk: sayi(k.low),
      enYuksek: sayi(k.high),
      ortalama: sayi(k.average),
      hacim: sayi(k.volume),
      gunlukDegisim: sayi(k.daily),
      gunlukYuzde: sayi(k.dailyPercent),
      zaman: typeof k.timestamp === 'number' ? new Date(k.timestamp).toISOString() : null,
    }));
}

export function kurlariSec(
  hepsi: Kur[],
  varlik?: string,
  paraBirimi = 'TRY',
  limit = VARSAYILAN_LIMIT,
): Kur[] {
  const birim = paraBirimi.toUpperCase();
  let liste = hepsi.filter((k) => k.paraBirimi === birim);
  if (varlik) {
    const istenen = new Set(
      varlik
        .toUpperCase()
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((v) => v.replace(/[_/]/g, '').replace(new RegExp(`${birim}$`), '')),
    );
    liste = liste.filter((k) => istenen.has(k.varlik));
  } else {
    liste = [...liste].sort(
      (a, b) => (b.hacim ?? 0) * (b.ortalama ?? 0) - (a.hacim ?? 0) * (a.ortalama ?? 0),
    );
  }
  return liste.slice(0, limit);
}

const kurSemasi = z.object({
  cift: z.string(),
  varlik: z.string(),
  paraBirimi: z.string(),
  son: z.number(),
  alis: z.number().nullable(),
  satis: z.number().nullable(),
  acilis: z.number().nullable(),
  enDusuk: z.number().nullable(),
  enYuksek: z.number().nullable(),
  ortalama: z.number().nullable(),
  hacim: z.number().nullable(),
  gunlukDegisim: z.number().nullable(),
  gunlukYuzde: z.number().nullable(),
  zaman: z.string().nullable(),
});

export const btcturk: Kaynak = {
  id: KAYNAK_ID,
  ad: 'BtcTurk (kripto varlık TRY piyasası)',
  url: 'https://www.btcturk.com/',
  lisans:
    "BtcTurk'ün herkese açık (public) piyasa verisi API'si, anahtarsız; tek borsanın fiyatıdır, yatırım tavsiyesi değildir (bkz. SOURCES.md)",

  kaydet(server) {
    server.registerTool(
      'btcturk_kripto',
      {
        title: 'Kripto varlıkların TL fiyatı (BtcTurk anlık)',
        description:
          "Bitcoin, Ethereum ve 180'den fazla kripto varlığın Türk lirası fiyatı BtcTurk'ten, anlık: son işlem, alış/satış, günlük açılış, en düşük/en yüksek, 24 saatlik hacim ve yüzde değişim. Live crypto prices in Turkish lira from BtcTurk, Türkiye's largest exchange. `varlik` verilmezse hacme göre ilk 30 çift; `varlik` BTC, ETH gibi bir ya da virgülle birkaç sembol. Tek borsanın fiyatıdır, yatırım tavsiyesi değildir.",
        inputSchema: {
          varlik: z.string().optional().describe('Sembol(ler): BTC, ETH, "BTC,ETH,SOL"'),
          paraBirimi: z
            .enum(['TRY', 'USDT'])
            .optional()
            .describe('Karşı para birimi, varsayılan TRY'),
          limit: z.number().int().min(1).max(200).optional(),
        },
        outputSchema: zarfSemasi(z.object({ sayi: z.number(), kurlar: z.array(kurSemasi) })),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ varlik, paraBirimi, limit }) => {
        try {
          const hepsi = kurlariDonustur(
            await jsonGetir(TICKER_URL, { kaynakId: KAYNAK_ID, cacheMs: 30_000 }),
          );
          const kurlar = kurlariSec(hepsi, varlik, paraBirimi ?? 'TRY', limit);
          if (kurlar.length === 0) {
            return hata(new Error(`"${varlik}" için ${paraBirimi ?? 'TRY'} çifti BtcTurk'te yok`));
          }
          return cevapla(zarfla(btcturk, { sayi: kurlar.length, kurlar }, TICKER_URL));
        } catch (error) {
          return hata(error);
        }
      },
    );
  },
};
