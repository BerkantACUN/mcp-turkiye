import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { sadelestir } from '../../core/metin.js';
import type { Kaynak } from '../../core/source.js';
import { zarfla } from '../../core/source.js';

export const OTOPARK_URL = 'https://api.ibb.gov.tr/ispark/Park';
export const otoparkDetayUrl = (id: number) => `https://api.ibb.gov.tr/ispark/ParkDetay?id=${id}`;
const KAYNAK_ID = 'ibb';
const VARSAYILAN_LIMIT = 30;

export interface Otopark {
  readonly id: number;
  readonly ad: string;
  readonly ilce: string;
  readonly tur: string;
  readonly kapasite: number;
  readonly bosYer: number;
  readonly dolulukYuzde: number | null;
  readonly acik: boolean;
  readonly calismaSaatleri: string;
  readonly ucretsizDakika: number | null;
  readonly enlem: number | null;
  readonly boylam: number | null;
  readonly uzaklikKm?: number;
}

interface HamOtopark {
  readonly parkID?: number;
  readonly parkName?: string;
  readonly district?: string;
  readonly parkType?: string;
  readonly capacity?: number;
  readonly emptyCapacity?: number;
  readonly isOpen?: number;
  readonly workHours?: string;
  readonly freeTime?: number;
  readonly lat?: string;
  readonly lng?: string;
}

const sayi = (s: unknown): number | null => {
  const n = Number(s);
  return typeof s === 'string' && s.trim() !== '' && Number.isFinite(n) ? n : null;
};

export function otoparklariDonustur(ham: unknown): Otopark[] {
  if (!Array.isArray(ham)) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      OTOPARK_URL,
      'yanıt bir liste değil — kaynak formatı değişmiş olabilir',
    );
  }
  return (ham as HamOtopark[])
    .filter((p) => typeof p.parkID === 'number' && typeof p.parkName === 'string')
    .map((p) => {
      const kapasite = typeof p.capacity === 'number' ? p.capacity : 0;
      const bos = typeof p.emptyCapacity === 'number' ? p.emptyCapacity : 0;
      return {
        id: p.parkID as number,
        ad: (p.parkName ?? '').trim(),
        ilce: (p.district ?? '').trim(),
        tur: (p.parkType ?? '').trim(),
        kapasite,
        bosYer: bos,
        dolulukYuzde: kapasite > 0 ? Math.round(((kapasite - bos) / kapasite) * 1000) / 10 : null,
        acik: p.isOpen === 1,
        calismaSaatleri: (p.workHours ?? '').trim(),
        ucretsizDakika: typeof p.freeTime === 'number' ? p.freeTime : null,
        enlem: sayi(p.lat),
        boylam: sayi(p.lng),
      };
    });
}

export function uzaklikKm(
  enlem1: number,
  boylam1: number,
  enlem2: number,
  boylam2: number,
): number {
  const r = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(enlem2 - enlem1);
  const dLon = rad(boylam2 - boylam1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(enlem1)) * Math.cos(rad(enlem2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export interface OtoparkFiltre {
  readonly ilce?: string | undefined;
  readonly ara?: string | undefined;
  readonly enlem?: number | undefined;
  readonly boylam?: number | undefined;
  readonly sadeceAcik?: boolean | undefined;
  readonly limit?: number | undefined;
}

export function otoparklariSec(hepsi: Otopark[], f: OtoparkFiltre): Otopark[] {
  let liste = hepsi;
  if (f.sadeceAcik) liste = liste.filter((p) => p.acik);
  if (f.ilce) {
    const aranan = sadelestir(f.ilce);
    liste = liste.filter((p) => sadelestir(p.ilce) === aranan);
  }
  if (f.ara) {
    const aranan = sadelestir(f.ara);
    liste = liste.filter((p) => sadelestir(p.ad).includes(aranan));
  }
  if (f.enlem !== undefined && f.boylam !== undefined) {
    const { enlem, boylam } = f;
    liste = liste
      .filter((p) => p.enlem !== null && p.boylam !== null)
      .map((p) => ({
        ...p,
        uzaklikKm:
          Math.round(uzaklikKm(enlem, boylam, p.enlem as number, p.boylam as number) * 100) / 100,
      }))
      .sort((a, b) => (a.uzaklikKm ?? 0) - (b.uzaklikKm ?? 0));
  } else {
    liste = [...liste].sort((a, b) => b.bosYer - a.bosYer);
  }
  return liste.slice(0, f.limit ?? VARSAYILAN_LIMIT);
}

const otoparkSemasi = z.object({
  id: z.number(),
  ad: z.string(),
  ilce: z.string(),
  tur: z.string(),
  kapasite: z.number(),
  bosYer: z.number(),
  dolulukYuzde: z.number().nullable(),
  acik: z.boolean(),
  calismaSaatleri: z.string(),
  ucretsizDakika: z.number().nullable(),
  enlem: z.number().nullable(),
  boylam: z.number().nullable(),
  uzaklikKm: z.number().optional(),
});

export function otoparkAraclariniKaydet(kaynak: Kaynak, server: Parameters<Kaynak['kaydet']>[0]) {
  server.registerTool(
    'ibb_otopark',
    {
      title: 'İSPARK otoparkları: anlık boş yer, doluluk, konum',
      description:
        "İstanbul'daki İSPARK otoparklarının anlık boş yer sayısı, kapasite, doluluk yüzdesi, açık/kapalı, çalışma saati, ücretsiz süre ve koordinatı; İBB Açık Veri Portalı'nın İSPARK web servisinden. Live occupancy of Istanbul's municipal (İSPARK) car parks. `enlem`+`boylam` verilirse en yakından uzağa (km ile), yoksa boş yeri en çok olandan; `ilce` ve `ara` (ad parçası) ile süzme; `limit` varsayılan 30.",
      inputSchema: {
        ilce: z.string().optional().describe('İlçe adı, örn. Kadıköy'),
        ara: z.string().optional().describe('Otopark adında geçen parça, örn. Taksim'),
        enlem: z.number().min(40).max(42).optional().describe('Yakınlık sıralaması için enlem'),
        boylam: z.number().min(27).max(30).optional().describe('Yakınlık sıralaması için boylam'),
        sadeceAcik: z.boolean().optional().describe('Yalnız şu an açık olanlar'),
        limit: z.number().int().min(1).max(200).optional(),
      },
      outputSchema: zarfSemasi(
        z.object({ toplam: z.number(), sayi: z.number(), otoparklar: z.array(otoparkSemasi) }),
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (f) => {
      try {
        const hepsi = otoparklariDonustur(
          await jsonGetir(OTOPARK_URL, { kaynakId: KAYNAK_ID, cacheMs: 2 * 60 * 1000 }),
        );
        const secilen = otoparklariSec(hepsi, f);
        if (secilen.length === 0) {
          return hata(new Error('Bu süzgeçle eşleşen İSPARK otoparkı yok'));
        }
        return cevapla(
          zarfla(
            kaynak,
            { toplam: hepsi.length, sayi: secilen.length, otoparklar: secilen },
            OTOPARK_URL,
          ),
        );
      } catch (error) {
        return hata(error);
      }
    },
  );

  server.registerTool(
    'ibb_otopark_detay',
    {
      title: 'İSPARK otopark ayrıntısı: tarife, adres, aylık abonelik',
      description:
        'Bir İSPARK otoparkının ayrıntısı: adres, saatlik tarife, aylık abonelik ücreti, güncelleme zamanı, anlık boş yer. Tariff, address and monthly fee of one İSPARK car park by its id (from `ibb_otopark`).',
      inputSchema: { id: z.number().int().positive().describe('`ibb_otopark` yanıtındaki id') },
      outputSchema: zarfSemasi(z.record(z.string(), z.unknown())),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) => {
      const url = otoparkDetayUrl(id);
      try {
        const ham = await jsonGetir<unknown>(url, { kaynakId: KAYNAK_ID, cacheMs: 2 * 60 * 1000 });
        const d = (Array.isArray(ham) ? ham[0] : ham) as Record<string, unknown> | undefined;
        if (!d || typeof d !== 'object' || typeof d.parkID !== 'number') {
          return hata(new Error(`${id} numaralı otopark bulunamadı`));
        }
        const { areaPolygon: _alan, ...kalan } = d;
        return cevapla(zarfla(kaynak, kalan, url));
      } catch (error) {
        return hata(error);
      }
    },
  );
}
