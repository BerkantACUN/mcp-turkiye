import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { type Kaynak, zarfla } from '../../core/source.js';

const KAYNAK_ID = 'bist';
const API =
  'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/HisseTekil';

/**
 * Daily Borsa İstanbul prices from İş Yatırım's public price pages — the
 * same endpoint the site itself calls. End-of-day data, one row per trading
 * day, with the BIST 100 close and the USD rate of that day alongside. It
 * is one brokerage's publication, not Borsa İstanbul's licensed feed, and
 * the tool says so.
 */
interface IsYatirimSatir {
  readonly HGDG_HS_KODU?: string;
  readonly HGDG_TARIH?: string;
  readonly HGDG_KAPANIS?: number;
  readonly HGDG_AOF?: number;
  readonly HGDG_MIN?: number;
  readonly HGDG_MAX?: number;
  readonly HGDG_HACIM?: number;
  readonly END_DEGER?: number;
  readonly DD_DEGER?: number;
  readonly PD?: number;
}

export interface GunlukFiyat {
  /** ISO date. */
  readonly tarih: string;
  readonly kapanis: number;
  readonly agirlikliOrtalama: number | null;
  readonly enDusuk: number | null;
  readonly enYuksek: number | null;
  readonly hacimTL: number | null;
  readonly piyasaDegeriTL: number | null;
  readonly bist100: number | null;
  readonly usdTry: number | null;
}

const sayi = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** İş Yatırım writes dates as DD-MM-YYYY. */
function isoTarih(s: string | undefined): string | null {
  const m = s?.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function trTarih(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export function sorguUrl(kod: string, baslangic: string, bitis: string): string {
  const p = new URLSearchParams({
    hisse: kod,
    startdate: trTarih(baslangic),
    enddate: trTarih(bitis),
  });
  return `${API}?${p.toString()}`;
}

/** Pure. Rejects the envelope when the site says `ok: false`, and drops rows without a date and close. */
export function satirlariDonustur(ham: unknown): GunlukFiyat[] {
  const zarf =
    typeof ham === 'object' && ham !== null
      ? (ham as { ok?: boolean; value?: unknown; errorDescription?: string })
      : null;
  if (zarf?.ok !== true || !Array.isArray(zarf.value)) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      API,
      zarf?.errorDescription
        ? `kaynak hata döndü: ${zarf.errorDescription}`
        : 'yanıt beklenen zarfta değil — kaynak formatı değişmiş olabilir',
    );
  }
  const sonuc: GunlukFiyat[] = [];
  for (const s of zarf.value as IsYatirimSatir[]) {
    const tarih = isoTarih(s.HGDG_TARIH);
    const kapanis = sayi(s.HGDG_KAPANIS);
    if (!tarih || kapanis === null) continue;
    sonuc.push({
      tarih,
      kapanis,
      agirlikliOrtalama: sayi(s.HGDG_AOF),
      enDusuk: sayi(s.HGDG_MIN),
      enYuksek: sayi(s.HGDG_MAX),
      hacimTL: sayi(s.HGDG_HACIM),
      piyasaDegeriTL: sayi(s.PD),
      bist100: sayi(s.END_DEGER),
      usdTry: sayi(s.DD_DEGER),
    });
  }
  return sonuc.sort((a, b) => a.tarih.localeCompare(b.tarih));
}

const isoGun = (d: Date): string => d.toISOString().slice(0, 10);

const fiyatSemasi = z.object({
  tarih: z.string(),
  kapanis: z.number(),
  agirlikliOrtalama: z.number().nullable(),
  enDusuk: z.number().nullable(),
  enYuksek: z.number().nullable(),
  hacimTL: z.number().nullable(),
  piyasaDegeriTL: z.number().nullable(),
  bist100: z.number().nullable(),
  usdTry: z.number().nullable(),
});

export const bist: Kaynak = {
  id: KAYNAK_ID,
  ad: 'Borsa İstanbul günlük fiyatlar (İş Yatırım verisi)',
  url: 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/default.aspx',
  lisans:
    "İş Yatırım'ın kendi hisse sayfalarının kullandığı açık uç nokta; gün sonu verisi, resmî BIST veri yayını değildir (bkz. SOURCES.md)",

  kaydet(server) {
    server.registerTool(
      'bist_hisse',
      {
        title: 'BIST hisse günlük fiyat geçmişi',
        description:
          "Bir Borsa İstanbul hissesinin gün sonu fiyatları: kapanış, ağırlıklı ortalama, gün içi en düşük/en yüksek, TL hacim, piyasa değeri; aynı günün BIST 100 kapanışı ve USD/TRY kuru yanında. Daily end-of-day prices for a Borsa İstanbul stock (İş Yatırım's public data). Veri gün sonudur, anlık fiyat değildir; tek aracı kurumun yayınıdır. Varsayılan aralık: son 30 gün.",
        inputSchema: {
          kod: z.string().min(3).max(6).describe('Hisse kodu, örn. THYAO, ASELS, GARAN'),
          baslangic: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe('YYYY-AA-GG, varsayılan 30 gün önce'),
          bitis: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe('YYYY-AA-GG, varsayılan bugün'),
        },
        outputSchema: zarfSemasi(
          z.object({
            kod: z.string(),
            aralik: z.object({ baslangic: z.string(), bitis: z.string() }),
            gunSayisi: z.number(),
            son: fiyatSemasi.nullable(),
            gunler: z.array(fiyatSemasi),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ kod, baslangic, bitis }) => {
        const simdi = new Date();
        const bitisGun = bitis ?? isoGun(simdi);
        const baslangicGun =
          baslangic ?? isoGun(new Date(simdi.getTime() - 30 * 24 * 60 * 60 * 1000));
        const kodBuyuk = kod.trim().toUpperCase();
        const url = sorguUrl(kodBuyuk, baslangicGun, bitisGun);
        try {
          // End-of-day data: today's row appears after the close and does not change afterwards.
          const gunler = satirlariDonustur(
            await jsonGetir(url, { kaynakId: KAYNAK_ID, cacheMs: 15 * 60 * 1000 }),
          );
          if (gunler.length === 0) {
            return hata(
              new Error(
                `${kodBuyuk} için ${baslangicGun}–${bitisGun} aralığında veri yok — kod yanlış olabilir ya da aralıkta işlem günü yoktur`,
              ),
            );
          }
          return cevapla(
            zarfla(
              bist,
              {
                kod: kodBuyuk,
                aralik: { baslangic: baslangicGun, bitis: bitisGun },
                gunSayisi: gunler.length,
                son: gunler[gunler.length - 1] ?? null,
                gunler,
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
