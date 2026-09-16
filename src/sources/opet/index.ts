import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import { ilPlaka, plakaIl } from '../dogrulama/iller.js';

const KAYNAK_ID = 'opet';
const API = 'https://api.opet.com.tr/api/fuelprices';

/**
 * Opet publishes its pump prices per district through the same API its
 * own price page uses. Istanbul is two price regions: the Anatolian side
 * under the normal plate code 34 and the European side under 934 — the
 * tool takes `yaka` for that and asks for both when it is not given.
 */
const ISTANBUL = 34;
const ISTANBUL_AVRUPA = 934;

interface OpetFiyat {
  readonly productCode?: string;
  readonly productName?: string;
  readonly amount?: number;
}

interface OpetSatir {
  readonly provinceCode?: number;
  readonly provinceName?: string;
  readonly districtName?: string;
  readonly prices?: readonly OpetFiyat[];
}

export interface IlceFiyat {
  readonly ilce: string;
  readonly bolge: string;
  /** Product name → TL per litre (or per kg for LPG/fuel oil, as Opet quotes). */
  readonly fiyatlar: Readonly<Record<string, number>>;
}

export function fiyatUrl(bolgeKodu: number): string {
  return `${API}/prices?ProvinceCode=${bolgeKodu}&IncludeAllProducts=true`;
}

/** Pure. One row per district; product list flattened to name → amount. */
export function satirlariDonustur(ham: unknown): IlceFiyat[] {
  if (!Array.isArray(ham)) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      API,
      'yanıt bir liste değil — kaynak formatı değişmiş olabilir',
    );
  }
  const sonuc: IlceFiyat[] = [];
  for (const s of ham as OpetSatir[]) {
    if (!s.districtName || !Array.isArray(s.prices)) continue;
    const fiyatlar: Record<string, number> = {};
    for (const f of s.prices) {
      if (
        typeof f.productName === 'string' &&
        typeof f.amount === 'number' &&
        Number.isFinite(f.amount)
      ) {
        fiyatlar[f.productName] = f.amount;
      }
    }
    sonuc.push({ ilce: s.districtName, bolge: s.provinceName ?? '', fiyatlar });
  }
  return sonuc;
}

/** Which region codes to ask for: one for every province, two for Istanbul. */
export function bolgeKodlari(plaka: number, yaka?: 'anadolu' | 'avrupa'): number[] {
  if (plaka !== ISTANBUL) return [plaka];
  if (yaka === 'anadolu') return [ISTANBUL];
  if (yaka === 'avrupa') return [ISTANBUL_AVRUPA];
  return [ISTANBUL, ISTANBUL_AVRUPA];
}

const sadelestir = (s: string) =>
  s
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');

export const opet: Kaynak = {
  id: KAYNAK_ID,
  ad: 'Opet akaryakıt pompa fiyatları',
  url: 'https://www.opet.com.tr/akaryakit-fiyatlari',
  lisans:
    "Opet'in kendi fiyat sayfasının kullandığı açık uç nokta; tek dağıtıcının fiyatıdır, kaynak belirtilerek kullanılır (bkz. SOURCES.md)",

  kaydet(server) {
    server.registerTool(
      'opet_akaryakit',
      {
        title: 'Akaryakıt pompa fiyatları (Opet, ilçe bazında)',
        description:
          "Opet'in ilçe bazında güncel pompa fiyatları: benzin, motorin, gazyağı, kalorifer yakıtı, fuel oil — TL. Current fuel pump prices per district from Opet, one of Türkiye's largest distributors. Tek dağıtıcının fiyatıdır; diğer markalar birkaç kuruş farklı olabilir. İstanbul iki bölgedir (Anadolu/Avrupa); `yaka` verilmezse ikisi de gelir. `ilce` verilirse yalnızca o ilçe.",
        inputSchema: {
          il: z.string().min(2).describe('İl adı ya da plaka kodu, örn. Ankara, İzmir, 34'),
          ilce: z.string().optional().describe('İlçe adı (isteğe bağlı)'),
          yaka: z
            .enum(['anadolu', 'avrupa'])
            .optional()
            .describe('Yalnızca İstanbul için: anadolu | avrupa'),
        },
        outputSchema: zarfSemasi(
          z.object({
            il: z.string(),
            ilceler: z.array(
              z.object({
                ilce: z.string(),
                bolge: z.string(),
                fiyatlar: z.record(z.string(), z.number()),
              }),
            ),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ il, ilce, yaka }) => {
        const plaka = /^\d{1,2}$/.test(il.trim()) ? Number(il) : ilPlaka(il);
        const ilAdi = plaka === null ? null : plakaIl(plaka);
        if (plaka === null || ilAdi === null) {
          return hata(new Error(`"${il}" bir il adı ya da 1–81 arası plaka kodu değil`));
        }
        try {
          const sayfalar = await Promise.all(
            bolgeKodlari(plaka, yaka).map((kod) =>
              // Opet updates prices at most a few times a day.
              jsonGetir(fiyatUrl(kod), { kaynakId: KAYNAK_ID, cacheMs: 30 * 60 * 1000 }),
            ),
          );
          let ilceler = sayfalar.flatMap(satirlariDonustur);
          if (ilce) {
            const aranan = sadelestir(ilce);
            ilceler = ilceler.filter((x) => sadelestir(x.ilce) === aranan);
            if (ilceler.length === 0) {
              return hata(
                new Error(
                  `${ilAdi} için "${ilce}" ilçesi Opet listesinde yok. Listedekiler: ${sayfalar
                    .flatMap(satirlariDonustur)
                    .map((x) => x.ilce)
                    .join(', ')}`,
                ),
              );
            }
          }
          return cevapla(
            zarfla(opet, { il: ilAdi, ilceler }, fiyatUrl(bolgeKodlari(plaka, yaka)[0] ?? plaka)),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );
  },
};
