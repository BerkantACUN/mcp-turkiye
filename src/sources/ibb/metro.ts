import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { sadelestir } from '../../core/metin.js';
import type { Kaynak } from '../../core/source.js';
import { zarfla } from '../../core/source.js';

const API = 'https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile';
export const HATLAR_URL = `${API}/V2/GetLines`;
export const ISTASYONLAR_URL = `${API}/V2/GetStations`;
export const DUYURULAR_URL = `${API}/V3/GetAnnouncementsWithoutHtml/tr`;
const KAYNAK_ID = 'ibb';

export interface Hat {
  readonly id: number;
  readonly ad: string;
  readonly aciklama: string;
  readonly aktif: boolean;
  readonly ilkSefer: string | null;
  readonly sonSefer: string | null;
  readonly renk: string | null;
}

export interface Istasyon {
  readonly id: number;
  readonly ad: string;
  readonly hat: string;
  readonly sira: number;
  readonly enlem: number | null;
  readonly boylam: number | null;
  readonly asansor: number | null;
  readonly yuruyenMerdiven: number | null;
  readonly tuvalet: boolean;
  readonly bebekOdasi: boolean;
  readonly mescit: boolean;
}

export interface Duyuru {
  readonly id: number;
  readonly baslik: string;
  readonly metin: string;
  readonly baslangic: string | null;
}

const veriListesi = (ham: unknown, url: string): unknown[] => {
  const d = (ham as { Data?: unknown } | null)?.Data;
  if (!Array.isArray(d)) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      url,
      'yanıtta Data listesi yok — kaynak formatı değişmiş olabilir',
    );
  }
  return d;
};

const renk = (c: unknown): string | null => {
  const r = c as { Color_R?: string; Color_G?: string; Color_B?: string } | null;
  if (!r || [r.Color_R, r.Color_G, r.Color_B].some((v) => typeof v !== 'string')) return null;
  return `rgb(${r.Color_R},${r.Color_G},${r.Color_B})`;
};

const sayi = (v: unknown): number | null => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) ? n : null;
};

export function hatlariDonustur(ham: unknown): Hat[] {
  return veriListesi(ham, HATLAR_URL)
    .map((h) => h as Record<string, unknown>)
    .filter((h) => typeof h.Id === 'number' && typeof h.Name === 'string')
    .map((h) => ({
      id: h.Id as number,
      ad: h.Name as string,
      aciklama: typeof h.LongDescription === 'string' ? h.LongDescription.trim() : '',
      aktif: h.IsActive !== false,
      ilkSefer: typeof h.FirstTime === 'string' ? h.FirstTime : null,
      sonSefer: typeof h.LastTime === 'string' ? h.LastTime : null,
      renk: renk(h.Color),
    }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

export function istasyonlariDonustur(ham: unknown): Istasyon[] {
  return veriListesi(ham, ISTASYONLAR_URL)
    .map((s) => s as Record<string, unknown>)
    .filter((s) => typeof s.Id === 'number' && typeof s.Name === 'string')
    .map((s) => {
      const d = (s.DetailInfo ?? {}) as Record<string, unknown>;
      return {
        id: s.Id as number,
        ad:
          typeof s.Description === 'string' && s.Description.trim()
            ? s.Description.trim()
            : (s.Name as string),
        hat: typeof s.LineName === 'string' ? s.LineName : '',
        sira: typeof s.Order === 'number' ? s.Order : 0,
        enlem: sayi(d.Latitude),
        boylam: sayi(d.Longitude),
        asansor: sayi(d.Lift),
        yuruyenMerdiven: sayi(d.Escolator),
        tuvalet: d.WC === true,
        bebekOdasi: d.BabyRoom === true,
        mescit: d.Masjid === true,
      };
    })
    .sort((a, b) => a.hat.localeCompare(b.hat, 'tr') || a.sira - b.sira);
}

export function duyurulariDonustur(ham: unknown): Duyuru[] {
  return veriListesi(ham, DUYURULAR_URL)
    .map((d) => d as Record<string, unknown>)
    .filter((d) => typeof d.Id === 'number' && typeof d.Title === 'string')
    .map((d) => ({
      id: d.Id as number,
      baslik: (d.Title as string).trim(),
      metin: typeof d.Content === 'string' ? d.Content.replace(/\s+/g, ' ').trim() : '',
      baslangic: typeof d.StartDate === 'string' ? d.StartDate : null,
    }));
}

const hatSemasi = z.object({
  id: z.number(),
  ad: z.string(),
  aciklama: z.string(),
  aktif: z.boolean(),
  ilkSefer: z.string().nullable(),
  sonSefer: z.string().nullable(),
  renk: z.string().nullable(),
});

const istasyonSemasi = z.object({
  id: z.number(),
  ad: z.string(),
  hat: z.string(),
  sira: z.number(),
  enlem: z.number().nullable(),
  boylam: z.number().nullable(),
  asansor: z.number().nullable(),
  yuruyenMerdiven: z.number().nullable(),
  tuvalet: z.boolean(),
  bebekOdasi: z.boolean(),
  mescit: z.boolean(),
});

export function metroAraclariniKaydet(kaynak: Kaynak, server: Parameters<Kaynak['kaydet']>[0]) {
  server.registerTool(
    'ibb_metro',
    {
      title: 'Metro İstanbul hatları ve istasyonları',
      description:
        'Metro İstanbul hatları (M1A, M2, M4, M5, M7, T1, F1…): güzergâh adı, ilk/son sefer saati, aktif mi; `hat` verilirse o hattın istasyonları sırayla, koordinat, asansör/yürüyen merdiven sayısı, tuvalet/bebek odası/mescit bilgisiyle. Istanbul metro lines with first/last train times, and the ordered station list of one line. İBB Açık Veri Portalı Metro İstanbul web servisi; sefer saatleri değişebilir.',
      inputSchema: { hat: z.string().optional().describe('Hat adı, örn. M2, M4, T1') },
      outputSchema: zarfSemasi(
        z.object({ hatlar: z.array(hatSemasi), istasyonlar: z.array(istasyonSemasi).optional() }),
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ hat }) => {
      try {
        const hatlar = hatlariDonustur(
          await jsonGetir(HATLAR_URL, { kaynakId: KAYNAK_ID, cacheMs: 6 * 60 * 60 * 1000 }),
        );
        if (!hat) return cevapla(zarfla(kaynak, { hatlar }, HATLAR_URL));
        const aranan = sadelestir(hat);
        const secilen = hatlar.filter((h) => sadelestir(h.ad) === aranan);
        if (secilen.length === 0) {
          return hata(
            new Error(`"${hat}" adında hat yok. Hatlar: ${hatlar.map((h) => h.ad).join(', ')}`),
          );
        }
        const istasyonlar = istasyonlariDonustur(
          await jsonGetir(ISTASYONLAR_URL, { kaynakId: KAYNAK_ID, cacheMs: 6 * 60 * 60 * 1000 }),
        ).filter((s) => sadelestir(s.hat) === aranan);
        return cevapla(zarfla(kaynak, { hatlar: secilen, istasyonlar }, ISTASYONLAR_URL));
      } catch (error) {
        return hata(error);
      }
    },
  );

  server.registerTool(
    'ibb_metro_duyurular',
    {
      title: 'Metro İstanbul duyuruları: arıza, sefer düzenlemesi, kapalı istasyon',
      description:
        "Metro İstanbul'un güncel yolcu duyuruları: sefer düzenlemeleri, arızalar, kapalı istasyonlar, gece metrosu değişiklikleri; başlık, tam metin, başlangıç tarihi. Current service announcements (disruptions, schedule changes) from Istanbul's metro operator.",
      inputSchema: { ara: z.string().optional().describe('Başlık/metinde geçen parça, örn. M2') },
      outputSchema: zarfSemasi(
        z.object({
          sayi: z.number(),
          duyurular: z.array(
            z.object({
              id: z.number(),
              baslik: z.string(),
              metin: z.string(),
              baslangic: z.string().nullable(),
            }),
          ),
        }),
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ ara }) => {
      try {
        let duyurular = duyurulariDonustur(
          await jsonGetir(DUYURULAR_URL, { kaynakId: KAYNAK_ID, cacheMs: 5 * 60 * 1000 }),
        );
        if (ara) {
          const aranan = sadelestir(ara);
          duyurular = duyurular.filter((d) =>
            sadelestir(`${d.baslik} ${d.metin}`).includes(aranan),
          );
        }
        return cevapla(zarfla(kaynak, { sayi: duyurular.length, duyurular }, DUYURULAR_URL));
      } catch (error) {
        return hata(error);
      }
    },
  );
}
