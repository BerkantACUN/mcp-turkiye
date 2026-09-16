import { describe, expect, it } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { olaylariDonustur, sorguUrl } from '../../src/sources/afad/index.js';
import { bulteniGetir } from '../../src/sources/tcmb/index.js';

/**
 * Contract tests: the real endpoints, no fixtures. They pin the shape each
 * source publishes today, so when an institution changes its format the
 * failure shows up here — in our CI — before it shows up as a wrong answer
 * in someone's assistant.
 *
 * Opt-in (`npm run test:live`): they need the network and they load public
 * servers, so the default suite never runs them.
 */
describe.skipIf(!process.env.MCP_TURKIYE_LIVE)('canlı kaynak sözleşmeleri', () => {
  it('TCMB: today.xml is a bulletin with USD and EUR quoted per unit', async () => {
    onbellegiTemizle();
    const b = await bulteniGetir();
    expect(b.tarih).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.kurlar.length).toBeGreaterThan(15);
    for (const kod of ['USD', 'EUR', 'GBP']) {
      const k = b.kurlar.find((x) => x.kod === kod);
      expect(k, kod).toBeDefined();
      expect(k?.birim).toBe(1);
      expect(k?.dovizSatis).toBeGreaterThan(0);
    }
  }, 20_000);

  it('AFAD: the event API answers a 7-day window with parseable records', async () => {
    const bitis = new Date();
    const baslangic = new Date(bitis.getTime() - 7 * 24 * 60 * 60 * 1000);
    const url = sorguUrl(baslangic.toISOString().slice(0, 10), bitis.toISOString().slice(0, 10), 2);
    const r = await fetch(url, { headers: { 'user-agent': 'mcp-turkiye contract test' } });
    expect(r.ok).toBe(true);
    const depremler = olaylariDonustur(await r.json());
    // Türkiye records well over a hundred M≥2 events a week.
    expect(depremler.length).toBeGreaterThan(20);
    expect(depremler[0]?.zaman).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }, 20_000);
});

describe.skipIf(!process.env.MCP_TURKIYE_LIVE)('canlı: MGM', () => {
  it('finds a district station and answers with a temperature and a 5-day forecast', async () => {
    const { merkezBul } = await import('../../src/sources/mgm/index.js');
    const { gunlukTahminiDonustur, sonDurumuDonustur } = await import(
      '../../src/sources/mgm/parse.js'
    );
    const merkez = await merkezBul('İstanbul', 'Kadıköy');
    expect(merkez.il).toBe('İstanbul');
    const h = {
      origin: 'https://www.mgm.gov.tr',
      referer: 'https://www.mgm.gov.tr/',
      'user-agent': 'mcp-turkiye contract test',
    };
    const son = sonDurumuDonustur(
      await (
        await fetch(`https://servis.mgm.gov.tr/web/sondurumlar?merkezid=${merkez.merkezId}`, {
          headers: h,
        })
      ).json(),
    );
    expect(son?.sicaklik).toBeTypeOf('number');
    const tahmin = gunlukTahminiDonustur(
      await (
        await fetch(
          `https://servis.mgm.gov.tr/web/tahminler/gunluk?istno=${merkez.gunlukTahminIstNo}`,
          { headers: h },
        )
      ).json(),
    );
    expect(tahmin.length).toBeGreaterThanOrEqual(5);
  }, 20_000);
});

describe.skipIf(!process.env.MCP_TURKIYE_LIVE)('canlı: Opet', () => {
  it('answers Ankara with districts that quote petrol and diesel', async () => {
    const { fiyatUrl, satirlariDonustur } = await import('../../src/sources/opet/index.js');
    const r = await fetch(fiyatUrl(6), { headers: { 'user-agent': 'mcp-turkiye contract test' } });
    expect(r.ok).toBe(true);
    const rows = satirlariDonustur(await r.json());
    expect(rows.length).toBeGreaterThan(5);
    const urunler = Object.keys(rows[0]?.fiyatlar ?? {});
    expect(urunler.some((u) => /benzin/i.test(u))).toBe(true);
    expect(urunler.some((u) => /motorin/i.test(u))).toBe(true);
  }, 20_000);
});
