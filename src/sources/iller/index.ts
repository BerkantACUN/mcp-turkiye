import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { sadelestir } from '../../core/metin.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import {
  ILCELER_VERI,
  ILLER_VERI,
  ILLER_VERI_KAYNAGI,
  type IlceSatiri,
  type IlSatiri,
} from './veri.js';

const KAYNAK_ID = 'iller';

const ilSemasi = z.object({
  plaka: z.number(),
  ad: z.string(),
  nufus: z.number(),
  yuzolcumuKm2: z.number().nullable(),
  rakimM: z.number().nullable(),
  alanKodlari: z.array(z.number()),
  kiyi: z.boolean(),
  buyuksehir: z.boolean(),
  bolge: z.string().nullable(),
  enlem: z.number().nullable(),
  boylam: z.number().nullable(),
  ilceSayisi: z.number().nullable(),
  mahalleSayisi: z.number().nullable(),
  koySayisi: z.number().nullable(),
});

const ilceSemasi = z.object({
  ad: z.string(),
  il: z.string(),
  plaka: z.number(),
  nufus: z.number().nullable(),
  yuzolcumuKm2: z.number().nullable(),
});

export function ilBul(il: string): IlSatiri | null {
  const girdi = il.trim();
  if (/^\d{1,2}$/.test(girdi)) {
    return ILLER_VERI.find((x) => x.plaka === Number(girdi)) ?? null;
  }
  const anahtar = sadelestir(girdi);
  return ILLER_VERI.find((x) => sadelestir(x.ad) === anahtar) ?? null;
}

export function ilceleri(plaka: number): IlceSatiri[] {
  return ILCELER_VERI.filter((x) => x.plaka === plaka).sort(
    (a, b) => (b.nufus ?? 0) - (a.nufus ?? 0),
  );
}

export function ilceAra(ad: string, plaka?: number): Array<IlceSatiri & { il: string }> {
  const anahtar = sadelestir(ad);
  const adlar = new Map(ILLER_VERI.map((x) => [x.plaka, x.ad]));
  return ILCELER_VERI.filter(
    (x) => (plaka === undefined || x.plaka === plaka) && sadelestir(x.ad).includes(anahtar),
  )
    .map((x) => ({ ...x, il: adlar.get(x.plaka) ?? String(x.plaka) }))
    .sort((a, b) => (b.nufus ?? 0) - (a.nufus ?? 0));
}

export function illeriSirala(olcut: 'nufus' | 'yuzolcumu' | 'plaka', bolge?: string): IlSatiri[] {
  const anahtar = bolge ? sadelestir(bolge) : null;
  const liste = ILLER_VERI.filter((x) => !anahtar || sadelestir(x.bolge ?? '').includes(anahtar));
  if (olcut === 'plaka') return [...liste].sort((a, b) => a.plaka - b.plaka);
  if (olcut === 'yuzolcumu')
    return [...liste].sort((a, b) => (b.yuzolcumuKm2 ?? 0) - (a.yuzolcumuKm2 ?? 0));
  return [...liste].sort((a, b) => b.nufus - a.nufus);
}

export const iller: Kaynak = {
  id: KAYNAK_ID,
  ad: 'İl ve ilçe bilgileri (TÜİK ADNKS verisi, turkiye-api derlemesi)',
  url: ILLER_VERI_KAYNAGI.url,
  lisans: `${ILLER_VERI_KAYNAGI.ad}; veri pakete gömülüdür, ${ILLER_VERI_KAYNAGI.alindi} tarihinde alındı (bkz. SOURCES.md)`,

  kaydet(server) {
    server.registerTool(
      'il_bilgisi',
      {
        title: 'İl bilgisi: nüfus, yüzölçümü, plaka, alan kodu, bölge, ilçeler',
        description:
          "Bir ilin kimliği, çevrimdışı: plaka kodu, nüfus, yüzölçümü (km²), rakım, telefon alan kodları, kıyı/büyükşehir, coğrafi bölge, koordinat, ilçe/mahalle/köy sayıları ve nüfusa göre sıralı ilçe listesi. Province profile (population, area, plate code, area codes, region, districts) for any of Türkiye's 81 provinces, offline. `il` ad ya da plaka kodu; `ilceler=false` ile ilçe listesi atlanır.",
        inputSchema: {
          il: z.string().min(1).describe('İl adı ya da plaka kodu: İstanbul, izmir, 06'),
          ilceler: z.boolean().optional().describe('İlçe listesi de gelsin mi (varsayılan true)'),
        },
        outputSchema: zarfSemasi(
          z.object({
            il: ilSemasi,
            ilceler: z.array(ilceSemasi).optional(),
            veriTarihi: z.string(),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ il, ilceler: ilcelerIstendi }) => {
        const bulunan = ilBul(il);
        if (!bulunan) {
          return hata(new Error(`"${il}" bir il adı ya da 1–81 arası plaka kodu değil`));
        }
        const veri = {
          il: bulunan,
          ...(ilcelerIstendi === false
            ? {}
            : { ilceler: ilceleri(bulunan.plaka).map((x) => ({ ...x, il: bulunan.ad })) }),
          veriTarihi: ILLER_VERI_KAYNAGI.alindi,
        };
        return cevapla(zarfla(iller, veri));
      },
    );

    server.registerTool(
      'ilce_ara',
      {
        title: 'İlçe ara: hangi ile bağlı, nüfusu, yüzölçümü',
        description:
          'İlçe adından ili ve ilçe nüfusunu bulur; aynı adlı ilçeler (Merkez, Çınar, Yenişehir…) hepsi döner, `il` ile daraltılır. Finds which province a district belongs to, with its population and area, offline. Ad parçası da olur: "kadi" → Kadıköy.',
        inputSchema: {
          ilce: z.string().min(2).describe('İlçe adı ya da parçası'),
          il: z.string().optional().describe('İl adı ya da plaka ile daralt'),
        },
        outputSchema: zarfSemasi(
          z.object({ sayi: z.number(), ilceler: z.array(ilceSemasi), veriTarihi: z.string() }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ ilce, il }) => {
        let plaka: number | undefined;
        if (il) {
          const bulunan = ilBul(il);
          if (!bulunan) return hata(new Error(`"${il}" bir il adı ya da plaka kodu değil`));
          plaka = bulunan.plaka;
        }
        const sonuc = ilceAra(ilce, plaka).slice(0, 50);
        if (sonuc.length === 0) {
          return hata(new Error(`"${ilce}" adında ya da adı bunu içeren ilçe bulunamadı`));
        }
        return cevapla(
          zarfla(iller, {
            sayi: sonuc.length,
            ilceler: sonuc,
            veriTarihi: ILLER_VERI_KAYNAGI.alindi,
          }),
        );
      },
    );

    server.registerTool(
      'iller_listesi',
      {
        title: '81 il: nüfusa, yüzölçümüne ya da plakaya göre sıralı',
        description:
          "Türkiye'nin 81 ilinin listesi; `sirala` nufus | yuzolcumu | plaka, `bolge` ile (Marmara, Ege, Akdeniz, İç Anadolu, Karadeniz, Doğu Anadolu, Güneydoğu Anadolu) süzülür. All 81 provinces sorted by population, area or plate code, optionally filtered by geographic region; offline.",
        inputSchema: {
          sirala: z.enum(['nufus', 'yuzolcumu', 'plaka']).optional().describe('Varsayılan nufus'),
          bolge: z.string().optional().describe('Coğrafi bölge adı ya da parçası'),
        },
        outputSchema: zarfSemasi(
          z.object({ sayi: z.number(), iller: z.array(ilSemasi), veriTarihi: z.string() }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ sirala, bolge }) => {
        const liste = illeriSirala(sirala ?? 'nufus', bolge);
        if (liste.length === 0) return hata(new Error(`"${bolge}" adında bir bölge yok`));
        return cevapla(
          zarfla(iller, {
            sayi: liste.length,
            iller: liste,
            veriTarihi: ILLER_VERI_KAYNAGI.alindi,
          }),
        );
      },
    );
  },
};
