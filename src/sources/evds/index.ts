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
  },
};
