import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { sadelestir } from '../../core/metin.js';
import type { Kaynak } from '../../core/source.js';
import { zarfla } from '../../core/source.js';

export const ECZANE_URL = 'https://cbsproxy.ibb.gov.tr/?eczanews&ilceID=all';
const KAYNAK_ID = 'ibb';

export interface Eczane {
  readonly ad: string;
  readonly ilce: string;
  readonly adres: string;
  readonly telefon: string | null;
  readonly enlem: number | null;
  readonly boylam: number | null;
}

interface HamEczane {
  readonly ADI?: string;
  readonly ADRES?: string;
  readonly TELEFON?: string;
  readonly LON?: string;
  readonly LAT?: string;
  readonly ILCEADI?: string;
}

const sayi = (s: string | undefined): number | null => {
  const n = Number(s);
  return s && Number.isFinite(n) && n !== 0 ? n : null;
};

const baslikYap = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/(^|[\s(-])(\S)/g, (_, b, c: string) => b + c.toLocaleUpperCase('tr'));

export function eczaneleriDonustur(ham: unknown): Eczane[] {
  const liste = (ham as { ArrayOfAramaList?: { AramaList?: unknown } } | null)?.ArrayOfAramaList
    ?.AramaList;
  if (!Array.isArray(liste)) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      ECZANE_URL,
      'yanıtta ArrayOfAramaList.AramaList listesi yok — kaynak formatı değişmiş olabilir',
    );
  }
  return (liste as HamEczane[])
    .filter((e) => typeof e.ADI === 'string' && e.ADI.trim())
    .map((e) => ({
      ad: (e.ADI ?? '').trim(),
      ilce: baslikYap((e.ILCEADI ?? '').trim()),
      adres: (e.ADRES ?? '').trim(),
      telefon: e.TELEFON?.trim() || null,
      enlem: sayi(e.LAT),
      boylam: sayi(e.LON),
    }))
    .sort((a, b) => a.ilce.localeCompare(b.ilce, 'tr') || a.ad.localeCompare(b.ad, 'tr'));
}

export function eczaneAracinikaydet(kaynak: Kaynak, server: Parameters<Kaynak['kaydet']>[0]) {
  server.registerTool(
    'ibb_nobetci_eczane',
    {
      title: 'İstanbul nöbetçi eczaneler (bugün, ilçe bazında)',
      description:
        "İstanbul'da bugün nöbetçi olan eczaneler: ad, ilçe, adres, telefon, koordinat; İBB Şehir Haritası'nın nöbetçi eczane servisinden. Today's on-duty pharmacies in Istanbul by district, from the metropolitan municipality's city-map service. `ilce` verilirse yalnızca o ilçe. Nöbet listesi her gün değişir; yanıt alınma zamanını taşır.",
      inputSchema: {
        ilce: z.string().optional().describe('İlçe adı, örn. Kadıköy, Beşiktaş'),
      },
      outputSchema: zarfSemasi(
        z.object({
          sayi: z.number(),
          ilceler: z.array(z.string()),
          eczaneler: z.array(
            z.object({
              ad: z.string(),
              ilce: z.string(),
              adres: z.string(),
              telefon: z.string().nullable(),
              enlem: z.number().nullable(),
              boylam: z.number().nullable(),
            }),
          ),
        }),
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ ilce }) => {
      try {
        const hepsi = eczaneleriDonustur(
          await jsonGetir(ECZANE_URL, { kaynakId: KAYNAK_ID, cacheMs: 30 * 60 * 1000 }),
        );
        const ilceler = [...new Set(hepsi.map((e) => e.ilce))];
        let eczaneler = hepsi;
        if (ilce) {
          const aranan = sadelestir(ilce);
          eczaneler = hepsi.filter((e) => sadelestir(e.ilce) === aranan);
          if (eczaneler.length === 0) {
            return hata(
              new Error(`"${ilce}" için nöbetçi eczane kaydı yok. İlçeler: ${ilceler.join(', ')}`),
            );
          }
        }
        return cevapla(zarfla(kaynak, { sayi: eczaneler.length, ilceler, eczaneler }, ECZANE_URL));
      } catch (error) {
        return hata(error);
      }
    },
  );
}
