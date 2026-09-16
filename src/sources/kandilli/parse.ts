/**
 * Kandilli's "last 500 earthquakes" page is a `<pre>` block of fixed-width
 * lines, windows-1254, refreshed every few minutes:
 *
 *   2026.09.17 00:33:49  36.9750   29.3485        5.0      -.-  1.1  -.-   ARIKAYA-CAMELI (DENIZLI)   REVIZE01   (2026.09.17 00:33:55)
 *
 * Date and time are Türkiye local time. Three magnitude columns (MD, ML,
 * Mw) with `-.-` for "not computed"; the place name is free text in
 * upper-case ASCII; the last column says whether the solution is
 * preliminary (İlksel) or revised (REVIZEnn, with the revision time).
 */

export type BuyuklukTuru = 'ML' | 'Mw' | 'MD';

export interface KandilliDeprem {
  /** Local time (Türkiye, UTC+3), ISO form without offset — as AFAD's tool reports it too. */
  readonly zaman: string;
  readonly enlem: number;
  readonly boylam: number;
  readonly derinlikKm: number;
  /** Headline magnitude: ML when computed, else Mw, else MD — Kandilli's own preference on the page. */
  readonly buyukluk: number;
  readonly buyuklukTuru: BuyuklukTuru;
  readonly md: number | null;
  readonly ml: number | null;
  readonly mw: number | null;
  readonly yer: string;
  /** "İlksel" (preliminary) or "REVIZE01 (2026.09.17 00:33:55)". */
  readonly cozum: string;
}

const SATIR =
  /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+?)\s+(İlksel|REVIZE\d+.*?)\s*$/;

const buyukluk = (s: string | undefined): number | null => {
  if (s === undefined || s === '-.-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function satiriDonustur(satir: string): KandilliDeprem | null {
  const m = SATIR.exec(satir);
  if (!m) return null;
  const [, y, ay, g, saat, enlem, boylam, derinlik, mdS, mlS, mwS, yer, cozum] = m;
  const md = buyukluk(mdS);
  const ml = buyukluk(mlS);
  const mw = buyukluk(mwS);
  const secim: ReadonlyArray<readonly [number | null, BuyuklukTuru]> = [
    [ml, 'ML'],
    [mw, 'Mw'],
    [md, 'MD'],
  ];
  const ilk = secim.find(([v]) => v !== null);
  if (!ilk || ilk[0] === null) return null;
  return {
    zaman: `${y}-${ay}-${g}T${saat}`,
    enlem: Number(enlem),
    boylam: Number(boylam),
    derinlikKm: Number(derinlik),
    buyukluk: ilk[0],
    buyuklukTuru: ilk[1],
    md,
    ml,
    mw,
    yer: (yer ?? '').replace(/\s+/g, ' ').trim(),
    cozum: (cozum ?? '').replace(/\s+/g, ' ').trim(),
  };
}

export interface KandilliListe {
  readonly depremler: readonly KandilliDeprem[];
  /** "Yenileme zamanı" from the page footer, local time ISO — or null if the footer changed. */
  readonly guncelleme: string | null;
}

/** Pure. The page → every parseable line, newest first as the page lists them. */
export function listeyiAyristir(html: string): KandilliListe {
  const bas = html.indexOf('<pre>');
  const son = html.indexOf('</pre>');
  if (bas === -1 || son === -1) {
    throw new Error('sayfada <pre> bloğu yok — kaynak formatı değişmiş olabilir');
  }
  const depremler = html
    .slice(bas + 5, son)
    .split('\n')
    .map((s) => satiriDonustur(s.replace(/\r$/, '')))
    .filter((d): d is KandilliDeprem => d !== null);
  const g = /Yenileme zamanı:\s*(\d{2})\.(\d{2})\.(\d{4})\s+saat\s+(\d{2}:\d{2}:\d{2})/.exec(html);
  const guncelleme = g ? `${g[3]}-${g[2]}-${g[1]}T${g[4]}` : null;
  return { depremler, guncelleme };
}

/** Local Türkiye time (fixed UTC+3 since 2016) → epoch ms. */
export const yerelZaman = (iso: string): number => Date.parse(`${iso}+03:00`);
