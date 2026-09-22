import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { sadelestir } from '../../core/metin.js';
import { type Kaynak, zarfla } from '../../core/source.js';

const KAYNAK_ID = 'izmir';
const API = 'https://openapi.izmir.bel.tr/api';
export const ECZANE_URL = `${API}/ibb/nobetcieczaneler`;
export const halUrl = (tur: 'sebzemeyve' | 'balik', tarih: string) =>
  `${API}/ibb/halfiyatlari/${tur}/${tarih}`;
export const duragaYaklasanUrl = (durakId: number) =>
  `${API}/iztek/duragayaklasanotobusler/${durakId}`;
export const hattinYaklasanUrl = (hatNo: number, durakId: number) =>
  `${API}/iztek/hattinyaklasanotobusleri/${hatNo}/${durakId}`;

export interface Eczane {
  readonly ad: string;
  readonly bolge: string;
  readonly bolgeAciklama: string;
  readonly adres: string;
  readonly telefon: string | null;
  readonly enlem: number | null;
  readonly boylam: number | null;
  readonly tarih: string | null;
}

export interface HalFiyati {
  readonly mal: string;
  readonly tip: string;
  readonly birim: string;
  readonly asgari: number;
  readonly azami: number;
  readonly ortalama: number;
}

export interface YaklasanOtobus {
  readonly hatNo: number;
  readonly hatAdi: string;
  readonly otobusId: number;
  readonly kalanDurak: number;
  readonly yon: number;
  readonly engelliErisimi: boolean;
  readonly bisikletAparati: boolean;
  readonly enlem: number | null;
  readonly boylam: number | null;
}

const listeOlmali = (ham: unknown, url: string): Record<string, unknown>[] => {
  if (!Array.isArray(ham)) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      url,
      'yanıt bir liste değil — kaynak formatı değişmiş olabilir',
    );
  }
  return ham as Record<string, unknown>[];
};

const koordinat = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

const metin = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function eczaneleriDonustur(ham: unknown): Eczane[] {
  return listeOlmali(ham, ECZANE_URL)
    .filter((e) => metin(e.Adi))
    .map((e) => ({
      ad: metin(e.Adi),
      bolge: metin(e.Bolge),
      bolgeAciklama: metin(e.BolgeAciklama),
      adres: metin(e.Adres),
      telefon: metin(e.Telefon) || null,
      enlem: koordinat(e.LokasyonX),
      boylam: koordinat(e.LokasyonY),
      tarih: metin(e.Tarih) || null,
    }))
    .sort((a, b) => a.bolge.localeCompare(b.bolge, 'tr') || a.ad.localeCompare(b.ad, 'tr'));
}

export function halFiyatlariniDonustur(
  ham: unknown,
  url: string,
): { tarih: string | null; fiyatlar: HalFiyati[] } {
  if (ham === null || ham === undefined || ham === '') return { tarih: null, fiyatlar: [] };
  const kok = ham as { BultenTarihi?: unknown; HalFiyatListesi?: unknown };
  const liste = kok.HalFiyatListesi;
  if (!Array.isArray(liste)) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      url,
      'yanıtta HalFiyatListesi yok — kaynak formatı değişmiş olabilir',
    );
  }
  const fiyatlar = (liste as Record<string, unknown>[])
    .filter((f) => metin(f.MalAdi))
    .map((f) => ({
      mal: metin(f.MalAdi).replace(/\s+/g, ' '),
      tip: metin(f.MalTipAdi),
      birim: metin(f.Birim),
      asgari: Number(f.AsgariUcret) || 0,
      azami: Number(f.AzamiUcret) || 0,
      ortalama: Number(f.OrtalamaUcret) || 0,
    }))
    .sort((a, b) => a.mal.localeCompare(b.mal, 'tr'));
  return { tarih: metin(kok.BultenTarihi).slice(0, 10) || null, fiyatlar };
}

export function otobusleriDonustur(ham: unknown, url: string): YaklasanOtobus[] {
  return listeOlmali(ham, url)
    .filter((o) => typeof o.HatNumarasi === 'number')
    .map((o) => ({
      hatNo: o.HatNumarasi as number,
      hatAdi: metin(o.HatAdi),
      otobusId: Number(o.OtobusId) || 0,
      kalanDurak: Number(o.KalanDurakSayisi) || 0,
      yon: Number(o.HattinYonu) || 0,
      engelliErisimi: o.EngelliMi === true,
      bisikletAparati: o.BisikletAparatliMi === true,
      enlem: koordinat(o.KoorX),
      boylam: koordinat(o.KoorY),
    }))
    .sort((a, b) => a.kalanDurak - b.kalanDurak);
}

const bugun = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const eczaneSemasi = z.object({
  ad: z.string(),
  bolge: z.string(),
  bolgeAciklama: z.string(),
  adres: z.string(),
  telefon: z.string().nullable(),
  enlem: z.number().nullable(),
  boylam: z.number().nullable(),
  tarih: z.string().nullable(),
});

export const izmir: Kaynak = {
  id: KAYNAK_ID,
  ad: 'İzmir Büyükşehir Belediyesi açık veri API',
  url: 'https://acikveri.bizizmir.com/',
  lisans:
    'İzmir Büyükşehir Belediyesi Açık Veri Lisansı; openapi.izmir.bel.tr servisleri açık veri portalında ilanlıdır, kaynak belirtilerek kullanılır (bkz. SOURCES.md)',

  kaydet(server) {
    server.registerTool(
      'izmir_nobetci_eczane',
      {
        title: 'İzmir nöbetçi eczaneler (bugün, bölge bazında)',
        description:
          "İzmir'de bugün nöbetçi eczaneler: ad, bölge (ilçe/semt), nöbet açıklaması (24:00'dan sonra vb.), adres, telefon, koordinat; İzmir Büyükşehir açık veri API'sinden. Today's on-duty pharmacies in İzmir by district. `bolge` ile süzme.",
        inputSchema: {
          bolge: z.string().optional().describe('İlçe/bölge adı, örn. Bornova, Karşıyaka'),
        },
        outputSchema: zarfSemasi(
          z.object({
            sayi: z.number(),
            bolgeler: z.array(z.string()),
            eczaneler: z.array(eczaneSemasi),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ bolge }) => {
        try {
          const hepsi = eczaneleriDonustur(
            await jsonGetir(ECZANE_URL, { kaynakId: KAYNAK_ID, cacheMs: 30 * 60 * 1000 }),
          );
          const bolgeler = [...new Set(hepsi.map((e) => e.bolge))];
          let eczaneler = hepsi;
          if (bolge) {
            const aranan = sadelestir(bolge);
            eczaneler = hepsi.filter(
              (e) =>
                sadelestir(e.bolge).includes(aranan) ||
                sadelestir(e.bolgeAciklama).includes(aranan),
            );
            if (eczaneler.length === 0) {
              return hata(
                new Error(
                  `"${bolge}" için nöbetçi eczane kaydı yok. Bölgeler: ${bolgeler.join(', ')}`,
                ),
              );
            }
          }
          return cevapla(
            zarfla(izmir, { sayi: eczaneler.length, bolgeler, eczaneler }, ECZANE_URL),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );

    server.registerTool(
      'izmir_hal_fiyatlari',
      {
        title: 'İzmir hal fiyatları: sebze-meyve ve balık, günlük (asgari/azami/ortalama)',
        description:
          "İzmir Büyükşehir toptancı hallerinin günlük fiyat bülteni: ürün, tip (sebze/meyve/ithal…), birim, asgari, azami ve ortalama TL fiyat; `tur` sebzemeyve (varsayılan) ya da balik, `tarih` YYYY-AA-GG (varsayılan bugün), `ara` ile ürün süzme. Daily wholesale market prices (produce and fish) published by İzmir's metropolitan municipality — the only official daily food-price series. Bülten olmayan günde (pazar, tatil, balıkta bazı günler) boş liste döner.",
        inputSchema: {
          tur: z.enum(['sebzemeyve', 'balik']).optional(),
          tarih: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe('YYYY-AA-GG; varsayılan bugün'),
          ara: z.string().optional().describe('Ürün adı parçası, örn. domates'),
        },
        outputSchema: zarfSemasi(
          z.object({
            tur: z.string(),
            istenenTarih: z.string(),
            bultenTarihi: z.string().nullable(),
            sayi: z.number(),
            fiyatlar: z.array(
              z.object({
                mal: z.string(),
                tip: z.string(),
                birim: z.string(),
                asgari: z.number(),
                azami: z.number(),
                ortalama: z.number(),
              }),
            ),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ tur, tarih, ara }) => {
        const secilenTur = tur ?? 'sebzemeyve';
        const gun = tarih ?? bugun();
        const url = halUrl(secilenTur, gun);
        try {
          const govde = await jsonGetir<unknown>(url, {
            kaynakId: KAYNAK_ID,
            cacheMs: 60 * 60 * 1000,
          }).catch((e: unknown) => {
            if (e instanceof KaynakHatasi && e.neden.includes('JSON değil')) return null;
            throw e;
          });
          const { tarih: bultenTarihi, fiyatlar } = halFiyatlariniDonustur(govde, url);
          let liste = fiyatlar;
          if (ara) {
            const aranan = sadelestir(ara);
            liste = fiyatlar.filter((f) => sadelestir(f.mal).includes(aranan));
          }
          return cevapla(
            zarfla(
              izmir,
              {
                tur: secilenTur,
                istenenTarih: gun,
                bultenTarihi,
                sayi: liste.length,
                fiyatlar: liste,
              },
              url,
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );

    server.registerTool(
      'izmir_otobus',
      {
        title: 'İzmir ESHOT: durağa yaklaşan otobüsler (canlı)',
        description:
          'Bir ESHOT durağına yaklaşan otobüsler, anlık: hat no ve adı, kalan durak sayısı, otobüs konumu, engelli erişimi ve bisiklet aparatı; `hatNo` verilirse yalnızca o hat. Live buses approaching an ESHOT stop in İzmir. Durak numarası (durakId) İzmir açık veri portalındaki ESHOT durak listesindedir (`acikveri_ara` ile "eshot durak" aranabilir); durakta bekleyen otobüs yoksa boş liste döner.',
        inputSchema: {
          durakId: z.number().int().positive().describe('ESHOT durak numarası, örn. 21050'),
          hatNo: z.number().int().positive().optional().describe('Yalnızca bu hat'),
        },
        outputSchema: zarfSemasi(
          z.object({
            durakId: z.number(),
            sayi: z.number(),
            otobusler: z.array(
              z.object({
                hatNo: z.number(),
                hatAdi: z.string(),
                otobusId: z.number(),
                kalanDurak: z.number(),
                yon: z.number(),
                engelliErisimi: z.boolean(),
                bisikletAparati: z.boolean(),
                enlem: z.number().nullable(),
                boylam: z.number().nullable(),
              }),
            ),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ durakId, hatNo }) => {
        const url = hatNo ? hattinYaklasanUrl(hatNo, durakId) : duragaYaklasanUrl(durakId);
        try {
          const otobusler = otobusleriDonustur(
            await jsonGetir(url, { kaynakId: KAYNAK_ID, cacheMs: 30_000 }),
            url,
          );
          return cevapla(zarfla(izmir, { durakId, sayi: otobusler.length, otobusler }, url));
        } catch (error) {
          return hata(error);
        }
      },
    );
  },
};
