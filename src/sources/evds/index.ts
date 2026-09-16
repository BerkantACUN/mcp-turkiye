import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import {
  gozlemleriDonustur,
  kategorileriDonustur,
  serileriDonustur,
  veriGruplariniDonustur,
} from './parse.js';

const KAYNAK_ID = 'evds';
const BASE = 'https://evds3.tcmb.gov.tr/igmevdsms-dis';
export const ANAHTAR_DEGISKENI = 'EVDS_API_KEY';
/** EVDS caps one request at 150 observations, counted back from the end date. */
const GOZLEM_SINIRI = 150;

/**
 * TCMB's statistics service: 40,000+ series — inflation, policy rates,
 * exchange rates, housing, balance of payments, surveys — behind a free
 * personal key. The key is read from the environment at call time, never
 * stored, and the tools are registered even without one so a user learns
 * the capability exists and how to switch it on.
 */
export function anahtar(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = env[ANAHTAR_DEGISKENI]?.trim();
  return v ? v : null;
}

const ANAHTAR_YOK = `${ANAHTAR_DEGISKENI} tanımlı değil. TCMB EVDS ücretsiz bir kişisel anahtar ister: https://evds3.tcmb.gov.tr adresinde üye olun, "Profilim" sayfasının altındaki "API Key Kopyala" ile anahtarı alın ve MCP yapılandırmanızda ${ANAHTAR_DEGISKENI} ortam değişkeni olarak verin. Diğer araçlar anahtarsız çalışmaya devam eder.`;

async function evds<T>(yol: string, cacheMs: number): Promise<T> {
  const key = anahtar();
  if (!key) throw new KaynakHatasi(KAYNAK_ID, BASE, ANAHTAR_YOK, 401);
  const url = `${BASE}/${yol}`;
  try {
    return await jsonGetir<T>(url, { kaynakId: KAYNAK_ID, headers: { key }, cacheMs });
  } catch (error) {
    if (error instanceof KaynakHatasi && error.status === 403) {
      throw new KaynakHatasi(
        KAYNAK_ID,
        url,
        `EVDS anahtarı reddedildi (403) — ${ANAHTAR_DEGISKENI} değerini kontrol edin`,
        403,
      );
    }
    throw error;
  }
}

/** EVDS wants DD-MM-YYYY. */
const evdsTarih = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
};
const isoGun = (d: Date): string => d.toISOString().slice(0, 10);

const FORMULLER = {
  0: 'düzey',
  1: 'yüzde değişim',
  2: 'fark',
  3: 'yıllık yüzde değişim',
  4: 'yıllık fark',
  5: 'yıl başına göre yüzde değişim',
  6: 'yıl başına göre fark',
  7: 'hareketli ortalama',
  8: 'hareketli toplam',
} as const;

const FREKANSLAR = {
  1: 'günlük',
  2: 'iş günü',
  3: 'haftalık',
  4: 'ayda iki kez',
  5: 'aylık',
  6: 'üç aylık',
  7: 'altı aylık',
  8: 'yıllık',
} as const;

const tarihSemasi = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-AA-GG biçiminde olmalı');

interface Gosterge {
  readonly kod: string;
  readonly aciklama: string;
  readonly birim: string;
  /** EVDS formula applied server-side (3 = year-on-year % change, 1 = month-on-month). */
  readonly formul?: number;
}

/**
 * Headline indicators by name, so a caller never has to know that annual
 * inflation is `TP.TUKFIY2025.GENEL` with formula 3. Every code here was
 * resolved from the EVDS catalogue and answered with data when added
 * (2026-09-17); the weekly contract test keeps them honest.
 */
export const GOSTERGELER = {
  enflasyon_yillik: {
    kod: 'TP.TUKFIY2025.GENEL',
    aciklama: 'TÜFE yıllık değişim (%), 2025=100 endeksi, TÜİK verisi',
    birim: '%',
    formul: 3,
  },
  enflasyon_aylik: {
    kod: 'TP.TUKFIY2025.GENEL',
    aciklama: 'TÜFE aylık değişim (%), 2025=100 endeksi, TÜİK verisi',
    birim: '%',
    formul: 1,
  },
  tufe_endeks: {
    kod: 'TP.TUKFIY2025.GENEL',
    aciklama: 'TÜFE genel endeks düzeyi (2025=100)',
    birim: 'endeks',
  },
  ufe_yillik: {
    kod: 'TP.TUFE1YI.T1',
    aciklama: 'Yurt içi üretici fiyat endeksi (Yİ-ÜFE) yıllık değişim (%)',
    birim: '%',
    formul: 3,
  },
  politika_faizi: {
    kod: 'TP.BISPOLFAIZ.TUR',
    aciklama:
      "TCMB politika faizi (%), BIS'in aylık merkez bankası politika faizi tablosundaki Türkiye satırı — ay sonu değeri, ay içi değişiklikleri bir sonraki ayda görünür",
    birim: '%',
  },
  dolar: {
    kod: 'TP.DK.USD.S.YTL',
    aciklama: 'USD/TRY, TCMB döviz satış kuru (günlük)',
    birim: 'TL',
  },
  euro: {
    kod: 'TP.DK.EUR.S.YTL',
    aciklama: 'EUR/TRY, TCMB döviz satış kuru (günlük)',
    birim: 'TL',
  },
  sterlin: {
    kod: 'TP.DK.GBP.S.YTL',
    aciklama: 'GBP/TRY, TCMB döviz satış kuru (günlük)',
    birim: 'TL',
  },
  konut_fiyat_endeksi: {
    kod: 'TP.KFE.TR',
    aciklama: 'Konut Fiyat Endeksi (KFE), Türkiye geneli, aylık',
    birim: 'endeks',
  },
  konut_fiyat_yillik: {
    kod: 'TP.KFE.TR',
    aciklama: 'Konut Fiyat Endeksi yıllık değişim (%), Türkiye geneli',
    birim: '%',
    formul: 3,
  },
  reel_efektif_kur: {
    kod: 'TP.RK.T1.Y',
    aciklama:
      "TÜFE bazlı reel efektif döviz kuru (2025=100), aylık; yükselişi TL'nin reel değerlenmesi",
    birim: 'endeks',
  },
} as const satisfies Record<string, Gosterge>;

export type GostergeAdi = keyof typeof GOSTERGELER;

/** Default window for an indicator: long enough for a monthly series to show a year, short enough to stay under EVDS's 150-observation cap for daily FX. */
const VARSAYILAN_ARALIK_MS = 400 * 24 * 60 * 60 * 1000;

/** The `series=…` path for one indicator; the formula is only sent when the table names one. */
function gostergeYolu(g: Gosterge, baslangic: string, bitis: string): string {
  return [
    `series=${g.kod}`,
    `startDate=${evdsTarih(baslangic)}`,
    `endDate=${evdsTarih(bitis)}`,
    'type=json',
    ...(g.formul === undefined ? [] : [`formulas=${g.formul}`]),
  ].join('&');
}

export const evdsKaynagi: Kaynak = {
  id: KAYNAK_ID,
  ad: 'TCMB Elektronik Veri Dağıtım Sistemi (EVDS)',
  url: 'https://evds3.tcmb.gov.tr/',
  lisans:
    'TCMB EVDS verisi; ücretsiz kişisel API anahtarı ile, kaynak belirtilerek (bkz. SOURCES.md)',

  kaydet(server) {
    server.registerTool(
      'evds_kategoriler',
      {
        title: 'EVDS konu kategorileri',
        description:
          "TCMB EVDS'deki istatistik konularının ağacı (fiyatlar, faiz, kurlar, ödemeler dengesi, anketler, konut…): kategori numarası, adı, seviyesi ve üst kategorisi. Topic tree of the Turkish central bank's statistics service. Sonraki adım: evds_veri_gruplari. EVDS_API_KEY gerektirir.",
        inputSchema: {},
        outputSchema: zarfSemasi(
          z.object({
            toplam: z.number(),
            kategoriler: z.array(
              z.object({
                id: z.number(),
                ad: z.string(),
                adIngilizce: z.string(),
                seviye: z.number(),
                ustId: z.number().nullable(),
              }),
            ),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async () => {
        try {
          const kategoriler = kategorileriDonustur(
            await evds('categories/type=json', 24 * 60 * 60 * 1000),
          );
          return cevapla(
            zarfla(
              evdsKaynagi,
              { toplam: kategoriler.length, kategoriler },
              'https://evds3.tcmb.gov.tr/tumSeriler',
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );

    server.registerTool(
      'evds_veri_gruplari',
      {
        title: 'EVDS veri grupları (bir kategoride)',
        description:
          'Bir EVDS kategorisindeki veri grupları: grup kodu (örn. bie_dkdovytl = Döviz Kurları, bie_tukfiy2025 = TÜFE 2025=100), ad, frekans, birim, kaynak kurum, tarih aralığı. Data groups within an EVDS topic. Sonraki adım: evds_seriler. EVDS_API_KEY gerektirir.',
        inputSchema: { kategoriId: z.number().int().describe('evds_kategoriler çıktısındaki id') },
        outputSchema: zarfSemasi(
          z.object({
            kategoriId: z.number(),
            toplam: z.number(),
            veriGruplari: z.array(
              z.object({
                kod: z.string(),
                ad: z.string(),
                adIngilizce: z.string(),
                frekans: z.string(),
                birim: z.string(),
                kaynak: z.string(),
                baslangic: z.string().nullable(),
                bitis: z.string().nullable(),
                sonGuncelleme: z.string().nullable(),
                kategoriId: z.number().nullable(),
              }),
            ),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ kategoriId }) => {
        try {
          const veriGruplari = veriGruplariniDonustur(
            await evds(`datagroups/mode=2&code=${kategoriId}&type=json`, 24 * 60 * 60 * 1000),
          );
          return cevapla(
            zarfla(
              evdsKaynagi,
              { kategoriId, toplam: veriGruplari.length, veriGruplari },
              'https://evds3.tcmb.gov.tr/tumSeriler',
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );

    server.registerTool(
      'evds_seriler',
      {
        title: 'EVDS serileri (bir veri grubunda)',
        description:
          'Bir EVDS veri grubundaki seriler: seri kodu (evds_seri için), ad, frekans, etiketler; isteğe bağlı ad filtresi. Series within an EVDS data group. Örnek: bie_tukfiy2025 grubunda TP.TUKFIY2025.GENEL = TÜFE genel endeks. EVDS_API_KEY gerektirir.',
        inputSchema: {
          veriGrubuKodu: z.string().min(3).describe('Veri grubu kodu, örn. bie_dkdovytl'),
          ara: z
            .string()
            .optional()
            .describe('Seri adında geçmesi istenen metin (büyük/küçük harf duyarsız)'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(500)
            .optional()
            .describe('En fazla seri, varsayılan 100'),
        },
        outputSchema: zarfSemasi(
          z.object({
            veriGrubuKodu: z.string(),
            toplam: z.number(),
            seriler: z.array(
              z.object({
                kod: z.string(),
                ad: z.string(),
                adIngilizce: z.string(),
                frekans: z.string(),
                veriGrubu: z.string(),
                etiket: z.string(),
              }),
            ),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ veriGrubuKodu, ara, limit }) => {
        try {
          let seriler = serileriDonustur(
            await evds(
              `serieList/type=json&code=${encodeURIComponent(veriGrubuKodu)}`,
              24 * 60 * 60 * 1000,
            ),
          );
          if (ara) {
            const a = ara.toLocaleLowerCase('tr-TR');
            seriler = seriler.filter((s) =>
              `${s.ad} ${s.adIngilizce} ${s.kod}`.toLocaleLowerCase('tr-TR').includes(a),
            );
          }
          return cevapla(
            zarfla(
              evdsKaynagi,
              { veriGrubuKodu, toplam: seriler.length, seriler: seriler.slice(0, limit ?? 100) },
              'https://evds3.tcmb.gov.tr/tumSeriler',
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );

    server.registerTool(
      'evds_seri',
      {
        title: 'EVDS seri verisi',
        description: `TCMB EVDS'den bir ya da birkaç serinin gözlemleri. Sık kullanılan kodlar: TP.DK.USD.S.YTL (dolar satış), TP.DK.EUR.S.YTL (euro satış), TP.TUKFIY2025.GENEL (TÜFE genel endeks; formul=3 ile yıllık enflasyon %). Time-series observations from the Turkish central bank's EVDS. Bir istekte en fazla ${GOZLEM_SINIRI} gözlem gelir (bitişten geriye); daha uzun aralık için birden çok çağrı yapın. Varsayılan aralık: son 365 gün. EVDS_API_KEY gerektirir.`,
        inputSchema: {
          seriKodlari: z
            .array(z.string().min(3))
            .min(1)
            .max(10)
            .describe('Seri kodları, örn. ["TP.DK.USD.S.YTL"]'),
          baslangic: tarihSemasi.optional().describe('YYYY-AA-GG, varsayılan 365 gün önce'),
          bitis: tarihSemasi.optional().describe('YYYY-AA-GG, varsayılan bugün'),
          formul: z
            .number()
            .int()
            .min(0)
            .max(8)
            .optional()
            .describe(
              '0 düzey (varsayılan), 1 yüzde değişim, 2 fark, 3 yıllık yüzde değişim, 4 yıllık fark, 5 yıl başına göre yüzde değişim, 6 yıl başına göre fark, 7 hareketli ortalama, 8 hareketli toplam',
            ),
          frekans: z
            .number()
            .int()
            .min(1)
            .max(8)
            .optional()
            .describe(
              '1 günlük, 2 iş günü, 3 haftalık, 4 ayda iki kez, 5 aylık, 6 üç aylık, 7 altı aylık, 8 yıllık — verilmezse serinin kendi frekansı',
            ),
          toplama: z
            .enum(['avg', 'min', 'max', 'first', 'last', 'sum'])
            .optional()
            .describe('Frekans düşürülürken toplama yöntemi'),
        },
        outputSchema: zarfSemasi(
          z.object({
            seriKodlari: z.array(z.string()),
            aralik: z.object({ baslangic: z.string(), bitis: z.string() }),
            formul: z.string(),
            frekans: z.string(),
            toplam: z.number(),
            sinir: z.number(),
            gozlemler: z.array(
              z.object({
                tarih: z.string(),
                degerler: z.record(z.string(), z.number().nullable()),
              }),
            ),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ seriKodlari, baslangic, bitis, formul, frekans, toplama }) => {
        const simdi = new Date();
        const bitisGun = bitis ?? isoGun(simdi);
        const baslangicGun =
          baslangic ?? isoGun(new Date(simdi.getTime() - 365 * 24 * 60 * 60 * 1000));
        const kodlar = seriKodlari.map((k) => k.trim().toUpperCase());
        const params: string[] = [
          `series=${kodlar.join('-')}`,
          `startDate=${evdsTarih(baslangicGun)}`,
          `endDate=${evdsTarih(bitisGun)}`,
          'type=json',
        ];
        if (formul !== undefined) params.push(`formulas=${kodlar.map(() => formul).join('-')}`);
        if (frekans !== undefined) params.push(`frequency=${frekans}`);
        if (toplama !== undefined)
          params.push(`aggregationTypes=${kodlar.map(() => toplama).join('-')}`);
        const yol = params.join('&');
        try {
          const { toplam, gozlemler } = gozlemleriDonustur(
            await evds(yol, 10 * 60 * 1000),
            kodlar,
            formul,
          );
          return cevapla(
            zarfla(
              evdsKaynagi,
              {
                seriKodlari: kodlar,
                aralik: { baslangic: baslangicGun, bitis: bitisGun },
                formul: FORMULLER[(formul ?? 0) as keyof typeof FORMULLER],
                frekans:
                  frekans === undefined
                    ? 'serinin kendi frekansı'
                    : FREKANSLAR[frekans as keyof typeof FREKANSLAR],
                toplam,
                sinir: GOZLEM_SINIRI,
                gozlemler,
              },
              `${BASE}/${yol}`,
            ),
          );
        } catch (error) {
          return hata(
            error instanceof KaynakHatasi
              ? error
              : new KaynakHatasi(
                  KAYNAK_ID,
                  `${BASE}/${yol}`,
                  error instanceof Error ? error.message : String(error),
                ),
          );
        }
      },
    );

    server.registerTool(
      'evds_gosterge',
      {
        title: 'EVDS başlıca göstergeler (kod bilmeden)',
        description: `Türkiye'nin başlıca ekonomik göstergeleri, seri kodu bilmeden, adıyla: ${Object.keys(GOSTERGELER).join(', ')}. Headline Turkish economic indicators by name (inflation, PPI, policy rate, FX, housing index, real effective exchange rate) from the central bank's EVDS. Yanıtta son değer ve tarih, seri kodu ve uygulanan formül vardır. Varsayılan aralık: son 400 gün (EVDS bitişten geriye en fazla ${GOZLEM_SINIRI} gözlem verir). EVDS_API_KEY gerektirir.`,
        inputSchema: {
          gosterge: z
            .enum(Object.keys(GOSTERGELER) as [GostergeAdi, ...GostergeAdi[]])
            .describe('Gösterge adı'),
          baslangic: tarihSemasi.optional().describe('YYYY-AA-GG, varsayılan 400 gün önce'),
          bitis: tarihSemasi.optional().describe('YYYY-AA-GG, varsayılan bugün'),
        },
        outputSchema: zarfSemasi(
          z.object({
            gosterge: z.string(),
            aciklama: z.string(),
            seriKodu: z.string(),
            formul: z.string(),
            birim: z.string(),
            aralik: z.object({ baslangic: z.string(), bitis: z.string() }),
            son: z.object({ tarih: z.string(), deger: z.number().nullable() }).nullable(),
            gozlemler: z.array(z.object({ tarih: z.string(), deger: z.number().nullable() })),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ gosterge, baslangic, bitis }) => {
        const g: Gosterge = GOSTERGELER[gosterge];
        const simdi = new Date();
        const bitisGun = bitis ?? isoGun(simdi);
        const baslangicGun = baslangic ?? isoGun(new Date(simdi.getTime() - VARSAYILAN_ARALIK_MS));
        const yol = gostergeYolu(g, baslangicGun, bitisGun);
        try {
          const { gozlemler } = gozlemleriDonustur(
            await evds(yol, 10 * 60 * 1000),
            [g.kod],
            g.formul,
          );
          const duz = gozlemler.map((o) => ({ tarih: o.tarih, deger: o.degerler[g.kod] ?? null }));
          const son = [...duz].reverse().find((o) => o.deger !== null) ?? null;
          return cevapla(
            zarfla(
              evdsKaynagi,
              {
                gosterge,
                aciklama: g.aciklama,
                seriKodu: g.kod,
                formul: FORMULLER[(g.formul ?? 0) as keyof typeof FORMULLER],
                birim: g.birim,
                aralik: { baslangic: baslangicGun, bitis: bitisGun },
                son,
                gozlemler: duz,
              },
              `${BASE}/${yol}`,
            ),
          );
        } catch (error) {
          return hata(
            error instanceof KaynakHatasi
              ? error
              : new KaynakHatasi(
                  KAYNAK_ID,
                  `${BASE}/${yol}`,
                  error instanceof Error ? error.message : String(error),
                ),
          );
        }
      },
    );
  },
};
