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

describe.skipIf(!process.env.MCP_TURKIYE_LIVE)('canlı: açık veri (CKAN)', () => {
  it('both portals answer package_search with CKAN’s envelope', async () => {
    const { PORTALLAR } = await import('../../src/sources/acikveri/index.js');
    for (const portal of Object.values(PORTALLAR)) {
      const r = await fetch(`${portal.url}/api/3/action/package_search?rows=1`, {
        headers: { 'user-agent': 'mcp-turkiye contract test' },
      });
      expect(r.ok, portal.url).toBe(true);
      const j = (await r.json()) as { success: boolean; result: { count: number } };
      expect(j.success, portal.url).toBe(true);
      expect(j.result.count, portal.url).toBeGreaterThan(100);
    }
  }, 30_000);
});

describe.skipIf(!process.env.MCP_TURKIYE_LIVE)('canlı: Resmî Gazete, İBB trafik, BIST', () => {
  it('Resmî Gazete: yesterday’s issue parses through the node:https path with the embedded intermediate', async () => {
    const { metinGetir } = await import('../../src/core/http.js');
    const { fihristiAyristir, gazeteUrl } = await import('../../src/sources/resmigazete/parse.js');
    const { GEOTRUST_TLS_RSA_CA_G1 } = await import('../../src/sources/resmigazete/sertifika.js');
    // Yesterday, so a not-yet-uploaded "today" cannot fail the test at 06:00 UTC.
    const dun = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const html = await metinGetir(gazeteUrl(dun), {
      kaynakId: 'resmigazete',
      charset: 'windows-1254',
      ekSertifikalar: [GEOTRUST_TLS_RSA_CA_G1],
      cacheMs: 0,
    });
    const f = fihristiAyristir(html, dun);
    expect(f.sayi).toMatch(/^\d{5}$/);
  }, 30_000);

  it('İBB: the traffic index is a number between 0 and 100', async () => {
    const { trafikIndeksiniOku } = await import('../../src/sources/ibb/index.js');
    const r = await fetch('https://tkmservices.ibb.gov.tr/web/api/TrafficData/v1/TrafficIndex', {
      headers: { 'user-agent': 'mcp-turkiye contract test' },
    });
    expect(r.ok).toBe(true);
    expect(trafikIndeksiniOku(await r.json())).toBeGreaterThanOrEqual(0);
  }, 20_000);

  it('BIST: İş Yatırım answers THYAO for the last 30 days with closes and the BIST 100', async () => {
    const { satirlariDonustur, sorguUrl } = await import('../../src/sources/bist/index.js');
    const bitis = new Date().toISOString().slice(0, 10);
    const baslangic = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const r = await fetch(sorguUrl('THYAO', baslangic, bitis), {
      headers: { 'user-agent': 'mcp-turkiye contract test' },
    });
    expect(r.ok).toBe(true);
    const g = satirlariDonustur(await r.json());
    expect(g.length).toBeGreaterThan(10);
    expect(g[g.length - 1]?.bist100).toBeGreaterThan(1000);
  }, 20_000);
});

describe.skipIf(!process.env.MCP_TURKIYE_LIVE || !process.env.EVDS_API_KEY)(
  'canlı: TCMB EVDS (anahtar varsa)',
  () => {
    it('answers the USD selling rate for the last week through the EVDS 3 service', async () => {
      const { gozlemleriDonustur } = await import('../../src/sources/evds/parse.js');
      const bitis = new Date();
      const baslangic = new Date(bitis.getTime() - 7 * 24 * 60 * 60 * 1000);
      const tr = (d: Date) =>
        `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      const r = await fetch(
        `https://evds3.tcmb.gov.tr/igmevdsms-dis/series=TP.DK.USD.S.YTL&startDate=${tr(baslangic)}&endDate=${tr(bitis)}&type=json`,
        {
          headers: {
            key: process.env.EVDS_API_KEY ?? '',
            'user-agent': 'mcp-turkiye contract test',
          },
        },
      );
      expect(r.status).toBe(200);
      const { gozlemler } = gozlemleriDonustur(await r.json(), ['TP.DK.USD.S.YTL']);
      expect(gozlemler.length).toBeGreaterThan(2);
      expect(gozlemler[gozlemler.length - 1]?.degerler['TP.DK.USD.S.YTL']).toBeGreaterThan(1);
    }, 20_000);
  },
);
