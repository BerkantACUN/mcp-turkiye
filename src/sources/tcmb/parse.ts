/**
 * TCMB publishes the daily bulletin as a small, flat XML that has kept the
 * same shape for decades: one <Currency> element per currency, child
 * elements for the four rates. It is simple enough to read with a
 * deliberate, narrow parser rather than a dependency — and the parser
 * refuses anything that does not look like the bulletin, so a changed
 * format becomes an error, not a silent list of NaNs.
 */

export interface Kur {
  readonly kod: string;
  readonly ad: string;
  readonly adIngilizce: string;
  /** How many units the rates are quoted for — 1 for most, 100 for JPY. */
  readonly birim: number;
  readonly dovizAlis: number | null;
  readonly dovizSatis: number | null;
  readonly efektifAlis: number | null;
  readonly efektifSatis: number | null;
}

export interface KurBulteni {
  /** Bulletin date as TCMB prints it, ISO form: 2026-09-16. */
  readonly tarih: string;
  readonly bultenNo: string;
  readonly kurlar: readonly Kur[];
}

export class BultenBicimHatasi extends Error {
  override readonly name = 'BultenBicimHatasi';
}

const ELEMAN = (xml: string, ad: string): string | null => {
  const m = xml.match(new RegExp(`<${ad}>([^<]*)</${ad}>`));
  return m?.[1]?.trim() ?? null;
};

const SAYI = (s: string | null): number | null => {
  if (s === null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function bulteniAyristir(xml: string): KurBulteni {
  const bas = xml.match(/<Tarih_Date\s+Tarih="(\d{2})\.(\d{2})\.(\d{4})"[^>]*Bulten_No="([^"]*)"/);
  if (!bas) {
    throw new BultenBicimHatasi(
      'TCMB bülteni beklenen biçimde değil: <Tarih_Date> başlığı bulunamadı',
    );
  }
  const [, gun, ay, yil, bultenNo] = bas;

  const kurlar: Kur[] = [];
  const blok = /<Currency\s+[^>]*Kod="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g;
  for (const m of xml.matchAll(blok)) {
    const kod = m[1] as string;
    const icerik = m[2] as string;
    kurlar.push({
      kod,
      ad: ELEMAN(icerik, 'Isim') ?? kod,
      adIngilizce: ELEMAN(icerik, 'CurrencyName') ?? kod,
      birim: SAYI(ELEMAN(icerik, 'Unit')) ?? 1,
      dovizAlis: SAYI(ELEMAN(icerik, 'ForexBuying')),
      dovizSatis: SAYI(ELEMAN(icerik, 'ForexSelling')),
      efektifAlis: SAYI(ELEMAN(icerik, 'BanknoteBuying')),
      efektifSatis: SAYI(ELEMAN(icerik, 'BanknoteSelling')),
    });
  }

  if (kurlar.length === 0) {
    throw new BultenBicimHatasi('TCMB bülteni beklenen biçimde değil: hiç <Currency> kaydı yok');
  }

  return { tarih: `${yil}-${ay}-${gun}`, bultenNo: bultenNo ?? '', kurlar };
}
