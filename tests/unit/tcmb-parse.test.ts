import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BultenBicimHatasi, bulteniAyristir } from '../../src/sources/tcmb/parse.js';

const fixture = readFileSync(join(__dirname, '..', 'fixtures', 'tcmb-today.xml'), 'utf8');

describe('bulteniAyristir', () => {
  it('reads the bulletin date and number from the header', () => {
    const b = bulteniAyristir(fixture);
    expect(b.tarih).toBe('2026-09-16');
    expect(b.bultenNo).toBe('2026/174');
  });

  it('reads every currency block with its four rates', () => {
    const b = bulteniAyristir(fixture);
    expect(b.kurlar.length).toBeGreaterThan(20);
    const usd = b.kurlar.find((k) => k.kod === 'USD');
    expect(usd).toMatchObject({
      ad: 'ABD DOLARI',
      adIngilizce: 'US DOLLAR',
      birim: 1,
      dovizAlis: 48.5779,
      dovizSatis: 48.6654,
      efektifAlis: 48.5439,
      efektifSatis: 48.7384,
    });
  });

  it('keeps an empty rate as null rather than 0', () => {
    // Some currencies (e.g. IRR, BGN) are quoted with blank cells.
    const xml = `<?xml version="1.0"?><Tarih_Date Tarih="01.02.2026" Date="02/01/2026" Bulten_No="2026/1">
      <Currency CrossOrder="0" Kod="XXX" CurrencyCode="XXX"><Unit>1</Unit><Isim>TEST</Isim><CurrencyName>TEST</CurrencyName>
      <ForexBuying>1.5</ForexBuying><ForexSelling></ForexSelling><BanknoteBuying/><BanknoteSelling>1.7</BanknoteSelling></Currency></Tarih_Date>`;
    const b = bulteniAyristir(xml);
    expect(b.kurlar[0]).toMatchObject({
      dovizAlis: 1.5,
      dovizSatis: null,
      efektifAlis: null,
      efektifSatis: 1.7,
    });
  });

  it('carries the unit so JPY (per 100) is not misread as per 1', () => {
    const b = bulteniAyristir(fixture);
    const jpy = b.kurlar.find((k) => k.kod === 'JPY');
    expect(jpy?.birim).toBe(100);
  });

  it('refuses a document that is not a bulletin instead of returning an empty list', () => {
    expect(() => bulteniAyristir('<html>Service unavailable</html>')).toThrow(BultenBicimHatasi);
    expect(() =>
      bulteniAyristir('<Tarih_Date Tarih="01.02.2026" Date="x" Bulten_No="1"></Tarih_Date>'),
    ).toThrow(/hiç <Currency>/);
  });
});
