import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { KaynakHatasi, metinGetir } from '../../core/http.js';
import { GEOTRUST_TLS_RSA_CA_G1 } from '../../core/sertifikalar.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import { FihristBicimHatasi, fihristiAyristir, gazeteUrl, maddeMetniniCikar } from './parse.js';

const KAYNAK_ID = 'resmigazete';
const CHARSET = 'windows-1254';
const METIN_PARCA = 20_000;

const istek = { kaynakId: KAYNAK_ID, charset: CHARSET, ekSertifikalar: [GEOTRUST_TLS_RSA_CA_G1] };

const isoGun = (d: Date): string =>
  new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10); // Türkiye is UTC+3, no DST

/** Only the Gazette's own host is ever fetched — an agent cannot point this at anything else. */
export function gazeteAdresiMi(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'www.resmigazete.gov.tr';
  } catch {
    return false;
  }
}

const maddeSemasi = z.object({
  baslik: z.string(),
  url: z.string(),
  bicim: z.enum(['htm', 'pdf', 'diger']),
});

export const resmigazete: Kaynak = {
  id: KAYNAK_ID,
  ad: 'T.C. Resmî Gazete',
  url: 'https://www.resmigazete.gov.tr/',
  lisans: 'Resmî Gazete metinleri kamuya açıktır (bkz. SOURCES.md)',

  kaydet(server) {
    server.registerTool(
      'resmi_gazete_fihrist',
      {
        title: 'Resmî Gazete günlük fihrist',
        description:
          "Bir günün Resmî Gazete fihristi: sayı numarası ve bölümlere göre (yasama, yürütme ve idare, yargı, ilân) yayımlanan kanun, Cumhurbaşkanı kararı, yönetmelik, tebliğ ve kurul kararlarının başlıkları ve bağlantıları. Table of contents of Türkiye's Official Gazette for a day. Tarih verilmezse bugün. Mükerrer sayılar bu fihristte yer almaz.",
        inputSchema: {
          tarih: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-AA-GG biçiminde olmalı')
            .optional()
            .describe('Gazete tarihi, YYYY-AA-GG. Varsayılan: bugün (Türkiye saati).'),
        },
        outputSchema: zarfSemasi(
          z.object({
            tarih: z.string(),
            sayi: z.string(),
            toplamMadde: z.number(),
            bolumler: z.array(
              z.object({ bolum: z.string(), tur: z.string(), maddeler: z.array(maddeSemasi) }),
            ),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ tarih }) => {
        const gun = tarih ?? isoGun(new Date());
        const url = gazeteUrl(gun);
        try {
          // Today's issue can be amended during the day; older issues are fixed.
          const html = await metinGetir(url, {
            ...istek,
            cacheMs: tarih ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000,
          });
          return cevapla(zarfla(resmigazete, fihristiAyristir(html, gun), url));
        } catch (error) {
          if (error instanceof KaynakHatasi && error.status === 404) {
            return hata(
              new KaynakHatasi(
                KAYNAK_ID,
                url,
                `${gun} tarihli Resmî Gazete bulunamadı — o gün gazete yayımlanmamış olabilir ya da henüz yüklenmemiştir`,
                404,
              ),
            );
          }
          if (error instanceof FihristBicimHatasi)
            return hata(new KaynakHatasi(KAYNAK_ID, url, error.message));
          return hata(error);
        }
      },
    );

    server.registerTool(
      'resmi_gazete_metin',
      {
        title: 'Resmî Gazete maddesinin metni',
        description:
          'Fihristteki bir .htm maddesinin (yönetmelik, tebliğ, karar) düz metnini verir; uzun metinler parça parça okunur (`baslangic`). Plain text of an Official Gazette item. Yalnızca resmigazete.gov.tr adresleri kabul edilir; PDF maddeler için bağlantı verilir, metin çıkarılmaz.',
        inputSchema: {
          url: z.string().url().describe('Fihristten alınan .htm bağlantısı'),
          baslangic: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('Karakter ofseti (uzun metinlerde devam için)'),
        },
        outputSchema: zarfSemasi(
          z.object({
            url: z.string(),
            toplamKarakter: z.number(),
            baslangic: z.number(),
            bitis: z.number(),
            devamVar: z.boolean(),
            metin: z.string(),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ url, baslangic }) => {
        if (!gazeteAdresiMi(url)) {
          return hata(new Error('Yalnızca https://www.resmigazete.gov.tr adresleri okunur'));
        }
        if (/\.pdf(\?|$)/i.test(url)) {
          return hata(
            new Error(`Bu madde PDF olarak yayımlanmış; metin çıkarılmaz. Bağlantı: ${url}`),
          );
        }
        try {
          const html = await metinGetir(url, { ...istek, cacheMs: 24 * 60 * 60 * 1000 });
          const metin = maddeMetniniCikar(html);
          const bas = Math.min(baslangic ?? 0, metin.length);
          const bit = Math.min(bas + METIN_PARCA, metin.length);
          return cevapla(
            zarfla(
              resmigazete,
              {
                url,
                toplamKarakter: metin.length,
                baslangic: bas,
                bitis: bit,
                devamVar: bit < metin.length,
                metin: metin.slice(bas, bit),
              },
              url,
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );
  },
};
