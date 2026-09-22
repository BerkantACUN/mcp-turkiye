import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { sadelestir } from '../../core/metin.js';
import type { Kaynak } from '../../core/source.js';
import { zarfla } from '../../core/source.js';

const API = 'https://api.ibb.gov.tr/havakalitesi/OpenDataPortalHandler';
export const ISTASYONLAR_URL = `${API}/GetAQIStations`;
const KAYNAK_ID = 'ibb';
const KIRLETICILER = ['PM10', 'SO2', 'O3', 'NO2', 'CO'] as const;

export interface Istasyon {
  readonly id: string;
  readonly ad: string;
  readonly adres: string;
  readonly enlem: number | null;
  readonly boylam: number | null;
}

export interface Olcum {
  readonly zaman: string;
  readonly endeks: number | null;
  readonly baskinKirletici: string | null;
  readonly durum: string | null;
  readonly renk: string | null;
  readonly derisim: Record<string, number | null>;
  readonly altEndeks: Record<string, number | null>;
}

interface HamIstasyon {
  readonly Id?: string;
  readonly Name?: string;
  readonly Adress?: string;
  readonly Location?: string;
}

interface HamOlcum {
  readonly ReadTime?: string;
  readonly Concentration?: Record<string, number | null>;
  readonly AQI?: Record<string, unknown>;
}

const tarihParametresi = (d: Date) => {
  const gg = String(d.getDate()).padStart(2, '0');
  const aa = String(d.getMonth() + 1).padStart(2, '0');
  const ss = String(d.getHours()).padStart(2, '0');
  const dd = String(d.getMinutes()).padStart(2, '0');
  return `${gg}.${aa}.${d.getFullYear()}%20${ss}:${dd}:00`;
};

export function saatBasi(d: Date): Date {
  const t = new Date(d);
  t.setMinutes(0, 0, 0);
  return t;
}

export function son24Saat(simdi = new Date()): [Date, Date] {
  const bitis = new Date(saatBasi(simdi).getTime() + 60 * 60 * 1000);
  return [new Date(bitis.getTime() - 25 * 60 * 60 * 1000), bitis];
}

export function olcumUrl(istasyonId: string, baslangic: Date, bitis: Date): string {
  return `${API}/GetAQIByStationId?StationId=${istasyonId}&StartDate=${tarihParametresi(baslangic)}&EndDate=${tarihParametresi(bitis)}`;
}

export function istasyonlariDonustur(ham: unknown): Istasyon[] {
  if (!Array.isArray(ham)) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      ISTASYONLAR_URL,
      'yanıt bir liste değil — kaynak formatı değişmiş olabilir',
    );
  }
  return (ham as HamIstasyon[])
    .filter((s) => typeof s.Id === 'string' && typeof s.Name === 'string')
    .map((s) => {
      const nokta = /POINT \(([-\d.]+) ([-\d.]+)\)/.exec(s.Location ?? '');
      return {
        id: s.Id as string,
        ad: (s.Name ?? '').trim(),
        adres: (s.Adress ?? '').trim(),
        boylam: nokta ? Number(nokta[1]) : null,
        enlem: nokta ? Number(nokta[2]) : null,
      };
    })
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

const sayiYaNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function olcumleriDonustur(ham: unknown): Olcum[] {
  if (!Array.isArray(ham)) return [];
  return (ham as HamOlcum[])
    .filter((o) => typeof o.ReadTime === 'string')
    .map((o) => {
      const aqi = o.AQI ?? {};
      return {
        zaman: o.ReadTime as string,
        endeks: sayiYaNull(aqi.AQIIndex),
        baskinKirletici:
          typeof aqi.ContaminantParameter === 'string' ? aqi.ContaminantParameter : null,
        durum: typeof aqi.State === 'string' ? aqi.State : null,
        renk: typeof aqi.Color === 'string' ? aqi.Color : null,
        derisim: Object.fromEntries(KIRLETICILER.map((k) => [k, sayiYaNull(o.Concentration?.[k])])),
        altEndeks: Object.fromEntries(KIRLETICILER.map((k) => [k, sayiYaNull(aqi[k])])),
      };
    });
}

export function sonOlcum(olcumler: Olcum[]): Olcum | null {
  const dolu = olcumler.filter((o) => o.endeks !== null);
  return dolu.length ? (dolu[dolu.length - 1] ?? null) : (olcumler[olcumler.length - 1] ?? null);
}

const olcumSemasi = z.object({
  zaman: z.string(),
  endeks: z.number().nullable(),
  baskinKirletici: z.string().nullable(),
  durum: z.string().nullable(),
  renk: z.string().nullable(),
  derisim: z.record(z.string(), z.number().nullable()),
  altEndeks: z.record(z.string(), z.number().nullable()),
});

const istasyonSemasi = z.object({
  id: z.string(),
  ad: z.string(),
  adres: z.string(),
  enlem: z.number().nullable(),
  boylam: z.number().nullable(),
});

export function havaKalitesiAraciniKaydet(kaynak: Kaynak, server: Parameters<Kaynak['kaydet']>[0]) {
  server.registerTool(
    'ibb_hava_kalitesi',
    {
      title: 'İstanbul hava kalitesi: istasyon bazında AQI, PM10, SO2, O3, NO2, CO',
      description:
        "İBB'nin 28 hava kalitesi istasyonundan son ölçüm: hava kalitesi endeksi (AQI), baskın kirletici, İBB'nin durum açıklaması, PM10/SO2/O3/NO2/CO derişimleri ve alt endeksleri; İBB Açık Veri Portalı web servisi. Latest air-quality readings from Istanbul's municipal monitoring stations. `istasyon` verilmezse tüm istasyonların son ölçümü; verilirse o istasyonun son 24 saatlik saatlik serisi. Birimler İBB'nin servisindeki gibidir (µg/m³, CO mg/m³).",
      inputSchema: {
        istasyon: z
          .string()
          .optional()
          .describe('İstasyon adı ya da parçası, örn. Kadıköy, Maslak'),
      },
      outputSchema: zarfSemasi(
        z.object({
          istasyonlar: z.array(istasyonSemasi.extend({ son: olcumSemasi.nullable() })),
          seri: z.array(olcumSemasi).optional(),
        }),
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ istasyon }) => {
      try {
        const hepsi = istasyonlariDonustur(
          await jsonGetir(ISTASYONLAR_URL, { kaynakId: KAYNAK_ID, cacheMs: 24 * 60 * 60 * 1000 }),
        );
        let secilen = hepsi;
        if (istasyon) {
          const aranan = sadelestir(istasyon);
          secilen = hepsi.filter(
            (s) => sadelestir(s.ad).includes(aranan) || sadelestir(s.adres).includes(aranan),
          );
          if (secilen.length === 0) {
            return hata(
              new Error(
                `"${istasyon}" adında istasyon yok. İstasyonlar: ${hepsi.map((s) => s.ad).join(', ')}`,
              ),
            );
          }
        }
        const [baslangic, bitis] = son24Saat();
        const seriler = await Promise.all(
          secilen.map((s) =>
            jsonGetir(olcumUrl(s.id, baslangic, bitis), {
              kaynakId: KAYNAK_ID,
              cacheMs: 10 * 60 * 1000,
            })
              .then(olcumleriDonustur)
              .catch(() => [] as Olcum[]),
          ),
        );
        const istasyonlar = secilen.map((s, i) => ({ ...s, son: sonOlcum(seriler[i] ?? []) }));
        const veri =
          secilen.length === 1 ? { istasyonlar, seri: seriler[0] ?? [] } : { istasyonlar };
        return cevapla(zarfla(kaynak, veri, ISTASYONLAR_URL));
      } catch (error) {
        return hata(error);
      }
    },
  );
}
