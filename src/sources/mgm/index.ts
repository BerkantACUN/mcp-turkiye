import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import {
  gunlukTahminiDonustur,
  type Merkez,
  merkezleriDonustur,
  sonDurumuDonustur,
} from './parse.js';

const KAYNAK_ID = 'mgm';
const SERVIS = 'https://servis.mgm.gov.tr/web';

/**
 * MGM's service answers only requests that look like they come from its own
 * site — the same Origin/Referer pair the browser sends. There is no key,
 * no login and no rate documentation; we cache to stay well inside what a
 * person clicking around the site would produce.
 */
const BASLIKLAR = { origin: 'https://www.mgm.gov.tr', referer: 'https://www.mgm.gov.tr/' };

const istek = { kaynakId: KAYNAK_ID, headers: BASLIKLAR };

export function merkezUrl(il: string, ilce?: string): string {
  const p = new URLSearchParams({ il });
  if (ilce) p.set('ilce', ilce);
  return `${SERVIS}/merkezler?${p.toString()}`;
}

export async function merkezBul(il: string, ilce?: string): Promise<Merkez> {
  const url = merkezUrl(il, ilce);
  // A district's station does not move; a day of caching is conservative.
  const ham = await jsonGetir(url, { ...istek, cacheMs: 24 * 60 * 60 * 1000 });
  const merkezler = merkezleriDonustur(ham);
  const merkez = merkezler[0];
  if (!merkez) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      url,
      `MGM "${il}${ilce ? ` / ${ilce}` : ''}" için merkez bulamadı — il ve ilçe adını MGM'nin yazdığı gibi verin (örn. İstanbul, Kadıköy)`,
      404,
    );
  }
  return merkez;
}

const sonDurumSemasi = z.object({
  veriZamani: z.string().nullable(),
  sicaklik: z.number().nullable(),
  hissedilenSicaklik: z.number().nullable(),
  nem: z.number().nullable(),
  ruzgarHizKmSaat: z.number().nullable(),
  ruzgarYonDerece: z.number().nullable(),
  basincHpa: z.number().nullable(),
  gorusM: z.number().nullable(),
  yagis24SaatMm: z.number().nullable(),
  hadiseKodu: z.string().nullable(),
  hadise: z.string().nullable(),
});

const gunlukSemasi = z.object({
  tarih: z.string(),
  enDusuk: z.number().nullable(),
  enYuksek: z.number().nullable(),
  hadiseKodu: z.string().nullable(),
  hadise: z.string().nullable(),
  ruzgarHizKmSaat: z.number().nullable(),
  ruzgarYonDerece: z.number().nullable(),
  nemAralik: z.tuple([z.number().nullable(), z.number().nullable()]),
});

export const mgm: Kaynak = {
  id: KAYNAK_ID,
  ad: 'Meteoroloji Genel Müdürlüğü',
  url: 'https://www.mgm.gov.tr/',
  lisans:
    'MGM tahmin ve gözlem verisi, kamuya açık; kaynak belirtilerek kullanılır (bkz. SOURCES.md)',

  kaydet(server) {
    server.registerTool(
      'mgm_hava_durumu',
      {
        title: 'MGM hava durumu (şu an + 5 günlük tahmin)',
        description:
          "Meteoroloji Genel Müdürlüğü'nden bir il ya da ilçe için anlık gözlem (sıcaklık, hissedilen, nem, rüzgâr, basınç, hadise) ve 5 günlük tahmin (günlük en düşük/en yüksek, hadise, rüzgâr). Current conditions and 5-day forecast for a Turkish province or district from the state meteorological service. İlçe verilmezse il merkezi.",
        inputSchema: {
          il: z.string().min(2).describe('İl adı, örn. İstanbul'),
          ilce: z.string().optional().describe('İlçe adı, örn. Kadıköy (isteğe bağlı)'),
        },
        outputSchema: zarfSemasi(
          z.object({
            merkez: z.object({
              il: z.string(),
              ilce: z.string(),
              enlem: z.number().nullable(),
              boylam: z.number().nullable(),
              yukseklik: z.number().nullable(),
            }),
            sonDurum: sonDurumSemasi.nullable(),
            tahmin: z.array(gunlukSemasi),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ il, ilce }) => {
        try {
          const merkez = await merkezBul(il, ilce);
          const sonDurumUrl = `${SERVIS}/sondurumlar?merkezid=${merkez.merkezId}`;
          const tahminUrl = `${SERVIS}/tahminler/gunluk?istno=${merkez.gunlukTahminIstNo ?? merkez.merkezId}`;
          const [sonDurumHam, tahminHam] = await Promise.all([
            jsonGetir(sonDurumUrl, { ...istek, cacheMs: 10 * 60 * 1000 }),
            jsonGetir(tahminUrl, { ...istek, cacheMs: 30 * 60 * 1000 }),
          ]);
          return cevapla(
            zarfla(
              mgm,
              {
                merkez: {
                  il: merkez.il,
                  ilce: merkez.ilce,
                  enlem: merkez.enlem,
                  boylam: merkez.boylam,
                  yukseklik: merkez.yukseklik,
                },
                sonDurum: sonDurumuDonustur(sonDurumHam),
                tahmin: gunlukTahminiDonustur(tahminHam),
              },
              `https://www.mgm.gov.tr/tahmin/il-ve-ilceler.aspx?il=${encodeURIComponent(merkez.il)}&ilce=${encodeURIComponent(merkez.ilce)}`,
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );
  },
};
