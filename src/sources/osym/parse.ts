import { duzMetin, varliklariCoz } from '../../core/metin.js';

/**
 * ÖSYM's exam calendar is one HTML table (`#stTakvimListTable`), one row
 * per exam session. The first cell names the exam three ways — group
 * (YKS), long name, session name (2026-YKS 1. Oturum (TYT)) — and the
 * rest are date cells: a single date, a `<br>`-separated start/end pair,
 * or a lone "-" when the step does not apply. Times, when given, are
 * Türkiye local time.
 */

export interface TarihAraligi {
  readonly baslangic: string;
  /** Null when the cell holds a single date (exam day, result day). */
  readonly bitis: string | null;
}

export interface Sinav {
  /** ÖSYM's short group name: YKS, KPSS, ALES, YDS… */
  readonly grup: string;
  readonly uzunAd: string;
  /** The session as ÖSYM names it: "2026-YKS 1. Oturum (TYT)". */
  readonly ad: string;
  readonly onBasvuru: TarihAraligi | null;
  readonly basvuru: TarihAraligi | null;
  readonly gecBasvuru: TarihAraligi | null;
  readonly sinav: TarihAraligi | null;
  readonly onBasvuruSonuc: TarihAraligi | null;
  readonly sonuc: TarihAraligi | null;
  readonly tercih: TarihAraligi | null;
  readonly aciklama: string | null;
  readonly url: string;
}

const SITE = 'https://www.osym.gov.tr';

/** "07.01.2026 14:00" → "2026-01-07T14:00"; "24.01.2026" → "2026-01-24". */
export function tarihiCevir(s: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}:\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}${m[4] ? `T${m[4]}` : ''}`;
}

function araligiCevir(hucre: string): TarihAraligi | null {
  const parcalar = hucre
    .split('<br')
    .map((p) => duzMetin(p.replace(/^[^>]*>/, '')))
    .filter((p) => p !== '' && p !== '-');
  const baslangic = parcalar[0] ? tarihiCevir(parcalar[0]) : null;
  if (!baslangic) return null;
  const bitis = parcalar[1] ? tarihiCevir(parcalar[1]) : null;
  return { baslangic, bitis };
}

function hucreler(satir: string): string[] {
  return [...satir.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1] ?? '');
}

function satiriDonustur(satir: string): Sinav | null {
  const h = hucreler(satir);
  if (h.length < 8) return null;
  const ilk = h[0] ?? '';
  const grup = duzMetin(/<a[^>]*>([\s\S]*?)<\/a>/.exec(ilk)?.[1] ?? '');
  const uzunAd = duzMetin(/st-takvim-list-uzun"[^>]*>([\s\S]*?)<\/div>/.exec(ilk)?.[1] ?? '');
  const ad = duzMetin(/st-takvim-list-sinav-adi"[^>]*>([\s\S]*?)<\/div>/.exec(ilk)?.[1] ?? '');
  if (!grup && !ad) return null;
  const yol = /<a[^>]*href="([^"]+)"/.exec(ilk)?.[1];
  const aciklamaHam = /data-aciklama="([^"]*)"/.exec(satir)?.[1];
  const aciklama = aciklamaHam ? duzMetin(varliklariCoz(aciklamaHam)) : null;
  return {
    grup: grup || ad,
    uzunAd,
    ad: ad || grup,
    onBasvuru: araligiCevir(h[1] ?? ''),
    basvuru: araligiCevir(h[2] ?? ''),
    gecBasvuru: araligiCevir(h[3] ?? ''),
    sinav: araligiCevir(h[4] ?? ''),
    onBasvuruSonuc: araligiCevir(h[5] ?? ''),
    sonuc: araligiCevir(h[6] ?? ''),
    tercih: araligiCevir(h[7] ?? ''),
    aciklama: aciklama || null,
    url: yol ? `${SITE}${yol}` : `${SITE}/Sayfa/SinavTakvimi`,
  };
}

/** Pure. The calendar page → every exam row, in the page's (chronological) order. */
export function takvimiAyristir(html: string): Sinav[] {
  const bas = html.indexOf('id="stTakvimListTable"');
  const son = html.indexOf('</table>', bas);
  if (bas === -1 || son === -1) {
    throw new Error('sayfada sınav takvimi tablosu yok — kaynak formatı değişmiş olabilir');
  }
  const tablo = html.slice(bas, son);
  return [...tablo.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => satiriDonustur(m[1] ?? ''))
    .filter((s): s is Sinav => s !== null);
}

const TARIH_ALANLARI = [
  'onBasvuru',
  'basvuru',
  'gecBasvuru',
  'sinav',
  'onBasvuruSonuc',
  'sonuc',
  'tercih',
] as const;

/** The latest date in a row, as YYYY-MM-DD — what "is this still ahead of us" is judged by. */
export function sonTarih(s: Sinav): string | null {
  const gunler = TARIH_ALANLARI.flatMap((alan) => {
    const a = s[alan];
    return a ? [a.baslangic.slice(0, 10), (a.bitis ?? a.baslangic).slice(0, 10)] : [];
  });
  return [...gunler].sort().at(-1) ?? null;
}
