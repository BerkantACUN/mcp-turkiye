import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { KaynakHatasi, metinGetir } from '../../core/http.js';
import { duzMetin, sadelestir, varliklariCoz } from '../../core/metin.js';
import { type Kaynak, zarfla } from '../../core/source.js';

const KAYNAK_ID = 'haber';
const VARSAYILAN_LIMIT = 20;

export const KAYNAKLAR = {
  aa: {
    ad: 'Anadolu Ajansı',
    url: 'https://www.aa.com.tr/',
    kategoriler: [
      'guncel',
      'ekonomi',
      'spor',
      'dunya',
      'politika',
      'kultur',
      'saglik',
      'bilim-teknoloji',
      'egitim',
      'yasam',
      'analiz',
    ],
    besleme: (k: string) => `https://www.aa.com.tr/tr/rss/default?cat=${k}`,
  },
  trt: {
    ad: 'TRT Haber',
    url: 'https://www.trthaber.com/',
    kategoriler: [
      'manset',
      'sondakika',
      'gundem',
      'ekonomi',
      'spor',
      'dunya',
      'turkiye',
      'saglik',
      'kultur_sanat',
      'bilim_teknoloji',
      'yasam',
      'egitim',
    ],
    besleme: (k: string) => `https://www.trthaber.com/${k}_articles.rss`,
  },
} as const;

export type HaberKaynagi = keyof typeof KAYNAKLAR;

export interface Haber {
  readonly baslik: string;
  readonly ozet: string;
  readonly url: string;
  readonly yayin: string | null;
}

const etiket = (blok: string, ad: string): string => {
  const m = new RegExp(`<${ad}(?:\\s[^>]*)?>([\\s\\S]*?)</${ad}>`, 'i').exec(blok);
  if (!m) return '';
  const ic = (m[1] ?? '').trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(ic);
  return (cdata ? (cdata[1] ?? '') : ic).trim();
};

const isoTarih = (s: string): string | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function haberleriAyristir(xml: string, url: string): Haber[] {
  if (!/<rss[\s>]|<feed[\s>]/i.test(xml)) {
    throw new KaynakHatasi(
      KAYNAK_ID,
      url,
      'yanıt bir RSS beslemesi değil — kaynak formatı değişmiş olabilir',
    );
  }
  const haberler: Haber[] = [];
  for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const blok = m[1] ?? '';
    const baslik = duzMetin(varliklariCoz(etiket(blok, 'title')));
    const link = varliklariCoz(etiket(blok, 'link'));
    if (!baslik || !link) continue;
    haberler.push({
      baslik,
      ozet: duzMetin(varliklariCoz(etiket(blok, 'description'))).slice(0, 500),
      url: link,
      yayin: isoTarih(etiket(blok, 'pubDate')),
    });
  }
  return haberler;
}

const haberSemasi = z.object({
  baslik: z.string(),
  ozet: z.string(),
  url: z.string(),
  yayin: z.string().nullable(),
});

export const haber: Kaynak = {
  id: KAYNAK_ID,
  ad: 'Haber başlıkları (Anadolu Ajansı, TRT Haber RSS)',
  url: 'https://www.aa.com.tr/tr/rss',
  lisans:
    'Kurumların kamuya açık RSS beslemeleri; yalnız başlık, özet, bağlantı ve tarih aktarılır, haber metni alınmaz; içerik hakları yayıncıya aittir (bkz. SOURCES.md)',

  kaydet(server) {
    server.registerTool(
      'haber_basliklari',
      {
        title: 'Güncel haber başlıkları: AA ve TRT Haber, kategoriye göre',
        description:
          "Anadolu Ajansı ya da TRT Haber RSS beslemesinden son haberler: başlık, kısa özet, bağlantı, yayın zamanı. Latest headlines from Türkiye's state news agency (AA) and public broadcaster (TRT). `kaynak` aa | trt; `kategori` AA için guncel, ekonomi, spor, dunya, politika, kultur, saglik, bilim-teknoloji, egitim, yasam, analiz; TRT için manset, sondakika, gundem, ekonomi, spor, dunya, turkiye, saglik, kultur_sanat, bilim_teknoloji, yasam, egitim. `ara` başlık/özet süzgeci, `limit` varsayılan 20. Haber metni için bağlantıya gidilir; başlıklar yayıncının ifadesidir.",
        inputSchema: {
          kaynak: z.enum(['aa', 'trt']).optional().describe('Varsayılan aa'),
          kategori: z.string().optional().describe('Varsayılan aa: guncel, trt: manset'),
          ara: z.string().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        },
        outputSchema: zarfSemasi(
          z.object({
            kaynakAdi: z.string(),
            kategori: z.string(),
            sayi: z.number(),
            haberler: z.array(haberSemasi),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ kaynak, kategori, ara, limit }) => {
        const secilen = KAYNAKLAR[kaynak ?? 'aa'];
        const k = (kategori ?? secilen.kategoriler[0]).toLowerCase().trim();
        if (!(secilen.kategoriler as readonly string[]).includes(k)) {
          return hata(
            new Error(
              `"${kategori}" ${secilen.ad} için geçerli kategori değil: ${secilen.kategoriler.join(', ')}`,
            ),
          );
        }
        const url = secilen.besleme(k);
        try {
          const xml = await metinGetir(url, { kaynakId: KAYNAK_ID, cacheMs: 5 * 60 * 1000 });
          let haberler = haberleriAyristir(xml, url);
          if (ara) {
            const aranan = sadelestir(ara);
            haberler = haberler.filter((h) => sadelestir(`${h.baslik} ${h.ozet}`).includes(aranan));
          }
          haberler = haberler.slice(0, limit ?? VARSAYILAN_LIMIT);
          return cevapla(
            zarfla(
              haber,
              { kaynakAdi: secilen.ad, kategori: k, sayi: haberler.length, haberler },
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
