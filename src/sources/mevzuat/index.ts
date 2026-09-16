import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi, metinGetir } from '../../core/http.js';
import { GEOTRUST_TLS_RSA_CA_G1 } from '../../core/sertifikalar.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import {
  aramaSonuclariniDonustur,
  kimlikCoz,
  maddeListesi,
  maddeyiCikar,
  metniAyristir,
  mevzuatSayfasi,
} from './parse.js';

const KAYNAK_ID = 'mevzuat';
const SITE = 'https://www.mevzuat.gov.tr';
const ARAMA_URL = `${SITE}/anasayfa/MevzuatDatatable`;
const METIN_PARCA = 20_000;

/**
 * The site's search is the same DataTables call its own search page makes;
 * the text is the page the site shows inside its viewer. Same TLS gap as
 * Resmî Gazete (both are Presidency hosts on one certificate), same fix.
 */
const istek = {
  kaynakId: KAYNAK_ID,
  ekSertifikalar: [GEOTRUST_TLS_RSA_CA_G1],
  headers: { referer: `${SITE}/aramasonuc`, 'x-requested-with': 'XMLHttpRequest' },
};

/** Legislation kinds the search endpoint distinguishes, by the site's own numbers. */
export const TURLER = {
  kanun: 1,
  tuzuk: 2,
  yonetmelik: 3,
  mulga_kanun: 5,
  kurum_yonetmeligi: 7,
  universite_yonetmeligi: 8,
  teblig: 9,
  cb_karari: 20,
  cb_genelgesi: 22,
  cb_kararnamesi: 23,
} as const;

export type TurAdi = keyof typeof TURLER;

const turSemasi = z
  .enum(Object.keys(TURLER) as [TurAdi, ...TurAdi[]])
  .optional()
  .describe(
    'Mevzuat türü, varsayılan kanun: kanun | tuzuk | yonetmelik | kurum_yonetmeligi | universite_yonetmeligi | teblig | cb_karari | cb_genelgesi | cb_kararnamesi | mulga_kanun',
  );

export function aramaGovdesi(
  ifade: string,
  tur: number,
  nerede: 'Baslik' | 'Icerik' | 'Tumu',
  adet: number,
): string {
  const sutun = {
    data: null,
    name: '',
    searchable: true,
    orderable: false,
    search: { value: '', regex: false },
  };
  return JSON.stringify({
    draw: 1,
    columns: [sutun, sutun, sutun],
    order: [],
    start: 0,
    length: adet,
    search: { value: '', regex: false },
    parameters: {
      // The site sends the phrase Base64-encoded so Turkish letters survive.
      AranacakIfade: Buffer.from(ifade, 'utf8').toString('base64'),
      AranacakYer: nerede,
      TamCumle: false,
      MevzuatTur: tur,
      GenelArama: true,
    },
  });
}

export function metinUrl(tur: number, tertip: number, no: string): string {
  return `${SITE}/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=${tur}&MevzuatNo=${encodeURIComponent(no)}&MevzuatTertip=${tertip}`;
}

async function metniGetir(tur: number, tertip: number, no: string) {
  const url = metinUrl(tur, tertip, no);
  // Consolidated text changes only when an amendment is published; a day is safe.
  const html = await metinGetir(url, { ...istek, cacheMs: 24 * 60 * 60 * 1000 });
  try {
    return { url, ...metniAyristir(html) };
  } catch (error) {
    throw new KaynakHatasi(KAYNAK_ID, url, error instanceof Error ? error.message : String(error));
  }
}

/** Resolve `kimlik` or `no` (+ tur/tertip) to the three numbers, or explain what is missing. */
function hedefCoz(args: {
  kimlik?: string | undefined;
  no?: string | undefined;
  tur?: TurAdi | undefined;
  tertip?: number | undefined;
}) {
  if (args.kimlik) {
    const k = kimlikCoz(args.kimlik);
    if (!k)
      return {
        hata: `"${args.kimlik}" geçerli bir kimlik değil; biçim tur.tertip.no, örn. 1.5.6698`,
      };
    return k;
  }
  if (!args.no)
    return { hata: 'kimlik ya da no verilmeli (örn. kimlik "1.5.6698" ya da no "6698")' };
  return { tur: TURLER[args.tur ?? 'kanun'], tertip: args.tertip ?? 5, no: args.no.trim() };
}

const ozetSemasi = z.object({
  kimlik: z.string(),
  ad: z.string(),
  no: z.string(),
  tur: z.number(),
  turAdi: z.string(),
  tertip: z.number(),
  kabulTarihi: z.string().nullable(),
  resmiGazeteTarihi: z.string().nullable(),
  resmiGazeteSayisi: z.string().nullable(),
  url: z.string(),
});

const hedefSemasi = {
  kimlik: z.string().optional().describe('mevzuat_ara sonucundaki kimlik, örn. 1.5.6698'),
  no: z.string().optional().describe('Mevzuat numarası, örn. 6698 (kimlik yoksa)'),
  tur: turSemasi,
  tertip: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Düstur tertibi; 1961 sonrası mevzuat için 5 (varsayılan)'),
};

export const mevzuat: Kaynak = {
  id: KAYNAK_ID,
  ad: 'Mevzuat Bilgi Sistemi (mevzuat.gov.tr)',
  url: SITE,
  lisans:
    'Cumhurbaşkanlığı Mevzuat Bilgi Sistemi; resmî güncel metinler kamuya açıktır (bkz. SOURCES.md)',

  kaydet(server) {
    server.registerTool(
      'mevzuat_ara',
      {
        title: 'Mevzuat ara (kanun, yönetmelik, tebliğ, CB kararı…)',
        description:
          'mevzuat.gov.tr\'de başlıkta ya da tam metinde arama: kanun numarası, adı, türü, kabul tarihi ve Resmî Gazete bilgisi. Search Türkiye\'s consolidated legislation (laws, regulations, communiqués, presidential decrees). Sonuçtaki `kimlik` ile mevzuat_metin ve mevzuat_madde çağrılır. Örnek: "kişisel verilerin korunması" → 1.5.6698.',
        inputSchema: {
          ifade: z.string().min(2).describe('Aranacak ifade'),
          tur: turSemasi,
          nerede: z
            .enum(['baslik', 'icerik', 'tumu'])
            .optional()
            .describe('baslik (varsayılan) | icerik | tumu'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe('En fazla sonuç, varsayılan 10'),
        },
        outputSchema: zarfSemasi(
          z.object({
            ifade: z.string(),
            tur: z.string(),
            toplam: z.number(),
            sonuclar: z.array(ozetSemasi),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ ifade, tur, nerede, limit }) => {
        const turAdi = tur ?? 'kanun';
        const yer = nerede === 'icerik' ? 'Icerik' : nerede === 'tumu' ? 'Tumu' : 'Baslik';
        try {
          const ham = await jsonGetir(ARAMA_URL, {
            ...istek,
            headers: { ...istek.headers, 'content-type': 'application/json' },
            govde: aramaGovdesi(ifade, TURLER[turAdi], yer, limit ?? 10),
            cacheMs: 10 * 60 * 1000,
          });
          const { toplam, sonuclar } = aramaSonuclariniDonustur(ham);
          return cevapla(
            zarfla(mevzuat, { ifade, tur: turAdi, toplam, sonuclar }, `${SITE}/aramasonuc`),
          );
        } catch (error) {
          return hata(
            error instanceof KaynakHatasi
              ? error
              : new KaynakHatasi(
                  KAYNAK_ID,
                  ARAMA_URL,
                  error instanceof Error ? error.message : String(error),
                ),
          );
        }
      },
    );

    server.registerTool(
      'mevzuat_metin',
      {
        title: 'Mevzuatın güncel tam metni',
        description:
          "Bir mevzuatın mevzuat.gov.tr'deki resmî güncel (konsolide) tam metni, düz metin olarak, 20 bin karakterlik parçalarla; madde listesi de döner. Consolidated full text of a Turkish act or regulation. Belirli bir madde isteniyorsa mevzuat_madde daha kısadır.",
        inputSchema: {
          ...hedefSemasi,
          baslangic: z.number().int().min(0).optional().describe('Karakter ofseti (devam için)'),
        },
        outputSchema: zarfSemasi(
          z.object({
            kimlik: z.string(),
            baslik: z.string(),
            url: z.string(),
            maddeler: z.array(z.string()),
            toplamKarakter: z.number(),
            baslangic: z.number(),
            bitis: z.number(),
            devamVar: z.boolean(),
            metin: z.string(),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ kimlik, no, tur, tertip, baslangic }) => {
        const hedef = hedefCoz({ kimlik, no, tur, tertip });
        if ('hata' in hedef) return hata(new Error(hedef.hata));
        try {
          const m = await metniGetir(hedef.tur, hedef.tertip, hedef.no);
          const bas = Math.min(baslangic ?? 0, m.metin.length);
          const bit = Math.min(bas + METIN_PARCA, m.metin.length);
          return cevapla(
            zarfla(
              mevzuat,
              {
                kimlik: `${hedef.tur}.${hedef.tertip}.${hedef.no}`,
                baslik: m.baslik,
                url: mevzuatSayfasi(hedef.tur, hedef.tertip, hedef.no),
                maddeler: maddeListesi(m.satirlar),
                toplamKarakter: m.metin.length,
                baslangic: bas,
                bitis: bit,
                devamVar: bit < m.metin.length,
                metin: m.metin.slice(bas, bit),
              },
              mevzuatSayfasi(hedef.tur, hedef.tertip, hedef.no),
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );

    server.registerTool(
      'mevzuat_madde',
      {
        title: 'Mevzuatın tek bir maddesi',
        description:
          'Bir mevzuatın istenen maddesinin güncel metni: "6", "6/A", "ek 1", "geçici 3". One article of a Turkish act, from the consolidated text. Örnek: kimlik 1.5.6698, madde 6 → KVKK özel nitelikli kişisel veriler maddesi. Madde yoksa mevcut madde listesi döner.',
        inputSchema: {
          ...hedefSemasi,
          madde: z.string().min(1).describe('Madde: 6, 6/A, ek 1, geçici 3'),
        },
        outputSchema: zarfSemasi(
          z.object({
            kimlik: z.string(),
            mevzuatBasligi: z.string(),
            url: z.string(),
            madde: z.string(),
            baslik: z.string().nullable(),
            metin: z.string(),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ kimlik, no, tur, tertip, madde }) => {
        const hedef = hedefCoz({ kimlik, no, tur, tertip });
        if ('hata' in hedef) return hata(new Error(hedef.hata));
        try {
          const m = await metniGetir(hedef.tur, hedef.tertip, hedef.no);
          const bulunan = maddeyiCikar(m.satirlar, madde);
          if (!bulunan) {
            return hata(
              new Error(
                `"${madde}" maddesi ${m.baslik || hedef.no} metninde bulunamadı. Mevcut maddeler: ${maddeListesi(m.satirlar).join(', ')}`,
              ),
            );
          }
          return cevapla(
            zarfla(
              mevzuat,
              {
                kimlik: `${hedef.tur}.${hedef.tertip}.${hedef.no}`,
                mevzuatBasligi: m.baslik,
                url: mevzuatSayfasi(hedef.tur, hedef.tertip, hedef.no),
                ...bulunan,
              },
              mevzuatSayfasi(hedef.tur, hedef.tertip, hedef.no),
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );
  },
};
