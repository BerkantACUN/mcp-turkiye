/**
 * The Resmî Gazete daily index is a hand-shaped HTML page in windows-1254:
 * a heading line with the date and issue number, upper-case section titles
 * (YASAMA BÖLÜMÜ, YÖNETMELİKLER, TEBLİĞLER, …) and, under each, links whose
 * visible text is the item's title, often broken across several lines.
 *
 * The parser works on the flattened text rather than on the tag tree: it
 * marks each link, strips everything else, then walks line by line —
 * an all-capitals line opens a section, a link marker opens an item, and
 * every other line belongs to the item that is open. That shape has held
 * for years; the parser refuses a page it cannot find a date on.
 */

export interface GazeteMaddesi {
  readonly baslik: string;
  readonly url: string;
  /** htm for text items, pdf for scanned or tabular ones. */
  readonly bicim: 'htm' | 'pdf' | 'diger';
}

export interface GazeteBolumu {
  /** Top-level part: YASAMA BÖLÜMÜ, YÜRÜTME VE İDARE BÖLÜMÜ, YARGI BÖLÜMÜ, İLÂN BÖLÜMÜ. */
  readonly bolum: string;
  /** Item kind under that part: KANUNLAR, YÖNETMELİKLER, TEBLİĞLER, KURUL KARARI… */
  readonly tur: string;
  readonly maddeler: readonly GazeteMaddesi[];
}

export interface GazeteFihristi {
  /** ISO date of the issue. */
  readonly tarih: string;
  readonly sayi: string;
  readonly bolumler: readonly GazeteBolumu[];
  readonly toplamMadde: number;
}

export class FihristBicimHatasi extends Error {
  override readonly name = 'FihristBicimHatasi';
}

const AYLAR: Readonly<Record<string, string>> = {
  ocak: '01',
  şubat: '02',
  mart: '03',
  nisan: '04',
  mayıs: '05',
  haziran: '06',
  temmuz: '07',
  ağustos: '08',
  eylül: '09',
  ekim: '10',
  kasım: '11',
  aralık: '12',
};

const ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function metneCevir(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;|&#39;/g, (e) => ENTITIES[e] ?? e);
}

/** Upper-case Turkish, with room for the punctuation section titles use. */
const BASLIK_SATIRI = /^[A-ZÇĞİÖŞÜÂÎÛ0-9 .,:;/'’()–-]+$/;

const BOLUM_SATIRI = /BÖLÜMÜ$/;

export function gazeteUrl(tarih: string, dosya = ''): string {
  const [yil, ay, gun] = tarih.split('-');
  return `https://www.resmigazete.gov.tr/eskiler/${yil}/${ay}/${dosya || `${yil}${ay}${gun}.htm`}`;
}

const baslikMi = (satir: string): boolean =>
  BASLIK_SATIRI.test(satir) && satir.length > 3 && !/^\d/.test(satir) && !satir.startsWith('@@');

/** Single-word kinds that are complete titles on their own. */
const TEK_KELIME_TURLER = new Set([
  'MEVZUAT',
  'KANUNLAR',
  'KANUN',
  'YÖNETMELİKLER',
  'YÖNETMELİK',
  'TEBLİĞLER',
  'TEBLİĞ',
  'GENELGELER',
  'GENELGE',
  'KARARLAR',
  'KARAR',
  'İLÂNLAR',
  'İLANLAR',
]);

/**
 * Section titles are sometimes wrapped by the page's own line breaks:
 * "YÜRÜTME" / "VE İDARE BÖLÜMÜ", or "CUMHURBAŞKANI" / "KARARLARI". Two
 * consecutive all-capitals lines are one title when the second completes a
 * "… BÖLÜMÜ" part, or when the first is a lone word that is not a complete
 * kind by itself. "YÜRÜTME VE İDARE BÖLÜMÜ" followed by "YÖNETMELİKLER"
 * stays two titles.
 */
function baslikSatirlariniBirlestir(satirlar: readonly string[]): string[] {
  const sonuc: string[] = [];
  for (const satir of satirlar) {
    const onceki = sonuc[sonuc.length - 1];
    const birlesir =
      onceki !== undefined &&
      baslikMi(onceki) &&
      baslikMi(satir) &&
      !BOLUM_SATIRI.test(onceki) &&
      (BOLUM_SATIRI.test(satir) || (!onceki.includes(' ') && !TEK_KELIME_TURLER.has(onceki)));
    if (birlesir) {
      sonuc[sonuc.length - 1] = `${onceki} ${satir}`;
    } else {
      sonuc.push(satir);
    }
  }
  return sonuc;
}

export function fihristiAyristir(html: string, tarih: string): GazeteFihristi {
  const govde = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const isaretli = govde
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>/gi, '\n@@$1@@ ')
    .replace(/<[^>]+>/g, '\n');
  const satirlar = baslikSatirlariniBirlestir(
    metneCevir(isaretli)
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length > 0),
  );

  const bas = satirlar
    .join(' ')
    .match(/(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})\s+Tarihli ve\s+(\d+)\s+Sayılı/);
  if (!bas) {
    throw new FihristBicimHatasi(
      'Resmî Gazete fihristi beklenen biçimde değil: tarih ve sayı satırı bulunamadı',
    );
  }
  const ay = AYLAR[(bas[2] ?? '').toLocaleLowerCase('tr-TR')];
  const gazeteTarihi = ay ? `${bas[3]}-${ay}-${(bas[1] ?? '').padStart(2, '0')}` : tarih;

  const bolumler: GazeteBolumu[] = [];
  let bolum = '';
  let tur = '';
  let acik: { baslik: string[]; url: string } | null = null;

  const kapat = () => {
    if (!acik) return;
    const baslik = acik.baslik
      .join(' ')
      .replace(/^[–-]+\s*/, '')
      .trim();
    if (baslik) {
      const url = acik.url.startsWith('http') ? acik.url : gazeteUrl(tarih, acik.url);
      const bicim: GazeteMaddesi['bicim'] = /\.pdf(\?|$)/i.test(url)
        ? 'pdf'
        : /\.htm/i.test(url)
          ? 'htm'
          : 'diger';
      let hedef = bolumler[bolumler.length - 1];
      if (!hedef || hedef.bolum !== bolum || hedef.tur !== tur) {
        hedef = { bolum, tur, maddeler: [] };
        bolumler.push(hedef);
      }
      (hedef.maddeler as GazeteMaddesi[]).push({ baslik, url, bicim });
    }
    acik = null;
  };

  for (const satir of satirlar) {
    const baglanti = satir.match(/^@@([^@]+)@@\s*(.*)$/);
    if (baglanti) {
      kapat();
      const href = baglanti[1] ?? '';
      // The cover PDF of the whole issue and the "ilânlar" gateway are not items.
      if (/^\d{8}\.pdf$/i.test(href) || /main\.aspx/i.test(href)) continue;
      acik = { baslik: baglanti[2] ? [baglanti[2]] : [], url: href };
      continue;
    }
    if (baslikMi(satir)) {
      kapat();
      if (BOLUM_SATIRI.test(satir)) {
        bolum = satir;
        tur = '';
      } else if (satir !== 'MEVZUAT') {
        tur = satir;
      }
      continue;
    }
    if (acik) acik.baslik.push(satir);
  }
  kapat();

  return {
    tarih: gazeteTarihi,
    sayi: bas[4] ?? '',
    bolumler,
    toplamMadde: bolumler.reduce((n, b) => n + b.maddeler.length, 0),
  };
}

/** Plain text of an article page, for reading a regulation rather than just its title. */
export function maddeMetniniCikar(html: string): string {
  const govde = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  // Word-exported HTML wraps text with hard newlines mid-sentence; only
  // block boundaries are real line breaks.
  const metin = metneCevir(
    govde
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
      .replace(/\r?\n/g, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/h\d>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
  return metin
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n');
}
