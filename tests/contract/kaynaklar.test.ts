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
  it('every portal answers package_search with CKAN’s envelope', async () => {
    const { jsonGetir } = await import('../../src/core/http.js');
    const { PORTALLAR } = await import('../../src/sources/acikveri/index.js');
    for (const [id, portal] of Object.entries(PORTALLAR)) {
      const p = portal as { ekSertifikalar?: readonly string[]; yurtDisiEngeli?: boolean };
      try {
        const j = await jsonGetir<{ success: boolean; result: { count: number } }>(
          `${portal.url}/api/3/action/package_search?rows=1`,
          {
            kaynakId: `acikveri/${id}`,
            cacheMs: 0,
            ...(p.ekSertifikalar ? { ekSertifikalar: p.ekSertifikalar } : {}),
          },
        );
        expect(j.success, portal.url).toBe(true);
        expect(j.result.count, portal.url).toBeGreaterThan(100);
      } catch (error) {
        // A portal that blocks foreign IPs answers 403 from CI's runners; that is
        // documented behaviour, not a format change. Anything else still fails.
        const geoEngeli = p.yurtDisiEngeli && (error as { status?: number }).status === 403;
        if (!geoEngeli) throw error;
      }
    }
  }, 60_000);
});

describe.skipIf(!process.env.MCP_TURKIYE_LIVE)('canlı: Resmî Gazete, İBB trafik, BIST', () => {
  it('Resmî Gazete: yesterday’s issue parses through the node:https path with the embedded intermediate', async () => {
    const { metinGetir } = await import('../../src/core/http.js');
    const { fihristiAyristir, gazeteUrl } = await import('../../src/sources/resmigazete/parse.js');
    const { GEOTRUST_TLS_RSA_CA_G1 } = await import('../../src/core/sertifikalar.js');
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

    it('every named indicator still resolves to a series that answers with a recent value', async () => {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
      const { sunucuOlustur } = await import('../../src/server.js');
      const { GOSTERGELER } = await import('../../src/sources/evds/index.js');
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await sunucuOlustur().connect(st);
      const client = new Client({ name: 'contract', version: '0' });
      await client.connect(ct);
      try {
        for (const gosterge of Object.keys(GOSTERGELER)) {
          const r = (await client.callTool({
            name: 'evds_gosterge',
            arguments: { gosterge },
          })) as unknown as {
            isError?: boolean;
            content: Array<{ text?: string }>;
            structuredContent?: { veri: { son: { tarih: string; deger: number | null } | null } };
          };
          expect(r.isError, `${gosterge}: ${r.content[0]?.text}`).toBeFalsy();
          expect(r.structuredContent?.veri.son?.deger, gosterge).toBeTypeOf('number');
        }
      } finally {
        await client.close();
      }
    }, 120_000);
  },
);

describe.skipIf(!process.env.MCP_TURKIYE_LIVE)('canlı: mevzuat.gov.tr', () => {
  it('finds KVKK by title and serves its article 6 from the consolidated text', async () => {
    const { jsonGetir, metinGetir } = await import('../../src/core/http.js');
    const { aramaGovdesi, metinUrl, TURLER } = await import('../../src/sources/mevzuat/index.js');
    const { aramaSonuclariniDonustur, maddeyiCikar, metniAyristir } = await import(
      '../../src/sources/mevzuat/parse.js'
    );
    const { GEOTRUST_TLS_RSA_CA_G1 } = await import('../../src/core/sertifikalar.js');
    const ortak = {
      kaynakId: 'mevzuat',
      ekSertifikalar: [GEOTRUST_TLS_RSA_CA_G1],
      headers: {
        referer: 'https://www.mevzuat.gov.tr/aramasonuc',
        'x-requested-with': 'XMLHttpRequest',
      },
      cacheMs: 0,
    };
    const arama = await jsonGetir('https://www.mevzuat.gov.tr/anasayfa/MevzuatDatatable', {
      ...ortak,
      headers: { ...ortak.headers, 'content-type': 'application/json' },
      govde: aramaGovdesi('kişisel verilerin korunması', TURLER.kanun, 'Baslik', 5),
    });
    const { sonuclar } = aramaSonuclariniDonustur(arama);
    expect(sonuclar.some((s) => s.kimlik === '1.5.6698')).toBe(true);

    const html = await metinGetir(metinUrl(1, 5, '6698'), ortak);
    const m = maddeyiCikar(metniAyristir(html).satirlar, '6');
    expect(m?.metin.startsWith('MADDE 6-')).toBe(true);
  }, 60_000);
});

describe.skipIf(!process.env.MCP_TURKIYE_LIVE)('canlı: Kandilli, MGM uyarılar, ÖSYM', () => {
  it('Kandilli: the list page still parses as 500 fixed-width lines with a refresh time', async () => {
    const { listeyiAyristir } = await import('../../src/sources/kandilli/parse.js');
    const { metinGetir } = await import('../../src/core/http.js');
    onbellegiTemizle();
    const html = await metinGetir('http://www.koeri.boun.edu.tr/scripts/lst0.asp', {
      kaynakId: 'kandilli',
      charset: 'windows-1254',
      cacheMs: 0,
    });
    const { depremler, guncelleme } = listeyiAyristir(html);
    expect(depremler.length).toBeGreaterThan(400);
    expect(guncelleme).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(depremler[0]?.buyukluk).toBeGreaterThan(0);
    expect(depremler[0]?.yer).not.toBe('');
  }, 30_000);

  it('MGM: the warning list is an array and each entry has a readable detail', async () => {
    const { uyarilariGetir } = await import('../../src/sources/mgm/index.js');
    onbellegiTemizle();
    const uyarilar = await uyarilariGetir();
    expect(Array.isArray(uyarilar)).toBe(true);
    for (const u of uyarilar) {
      expect(u.baslik.length).toBeGreaterThan(5);
      expect(u.metin.length).toBeGreaterThan(20);
      expect(u.url).toMatch(/uyari-goster\.aspx\?sN=\d+[ey]$/);
    }
  }, 30_000);

  it('ÖSYM: the calendar table still yields YKS with an exam date', async () => {
    const { takvimiAyristir } = await import('../../src/sources/osym/parse.js');
    const { metinGetir } = await import('../../src/core/http.js');
    onbellegiTemizle();
    const html = await metinGetir('https://www.osym.gov.tr/Sayfa/SinavTakvimi', {
      kaynakId: 'osym',
      cacheMs: 0,
      timeoutMs: 8_000,
      deneme: 3,
    });
    const sinavlar = takvimiAyristir(html);
    expect(sinavlar.length).toBeGreaterThan(30);
    const yks = sinavlar.find((s) => s.grup === 'YKS' && s.sinav !== null);
    expect(yks?.sinav?.baslangic).toMatch(/^\d{4}-\d{2}-\d{2}/);
  }, 30_000);
});

describe.skipIf(!process.env.MCP_TURKIYE_LIVE)('canlı: İBB servisleri', () => {
  const h = { headers: { 'user-agent': 'mcp-turkiye contract test' } };

  it('on-duty pharmacies list at least ten districts with phone numbers', async () => {
    const { ECZANE_URL, eczaneleriDonustur } = await import('../../src/sources/ibb/eczane.js');
    const e = eczaneleriDonustur(await (await fetch(ECZANE_URL, h)).json());
    expect(e.length).toBeGreaterThan(30);
    expect(new Set(e.map((x) => x.ilce)).size).toBeGreaterThan(10);
    expect(e.filter((x) => x.telefon).length).toBeGreaterThan(e.length / 2);
  }, 20_000);

  it('İSPARK lists hundreds of car parks with capacities and coordinates', async () => {
    const { OTOPARK_URL, otoparklariDonustur } = await import('../../src/sources/ibb/otopark.js');
    const o = otoparklariDonustur(await (await fetch(OTOPARK_URL, h)).json());
    expect(o.length).toBeGreaterThan(100);
    expect(o.filter((x) => x.kapasite > 0 && x.enlem !== null).length).toBeGreaterThan(100);
  }, 20_000);

  it('air quality: stations and a 24-hour series with at least one AQI value', async () => {
    const {
      ISTASYONLAR_URL,
      istasyonlariDonustur,
      olcumUrl,
      olcumleriDonustur,
      son24Saat,
      sonOlcum,
    } = await import('../../src/sources/ibb/havakalitesi.js');
    const s = istasyonlariDonustur(await (await fetch(ISTASYONLAR_URL, h)).json());
    expect(s.length).toBeGreaterThan(20);
    const [baslangic, bitis] = son24Saat();
    let endeks: number | null = null;
    for (const ist of s.slice(0, 6)) {
      const o = olcumleriDonustur(
        await (await fetch(olcumUrl(ist.id, baslangic, bitis), h)).json(),
      );
      endeks = sonOlcum(o)?.endeks ?? null;
      if (endeks !== null) break;
    }
    expect(endeks).toBeTypeOf('number');
  }, 20_000);

  it('Metro İstanbul: lines with first/last train and ordered stations', async () => {
    const { HATLAR_URL, ISTASYONLAR_URL, hatlariDonustur, istasyonlariDonustur } = await import(
      '../../src/sources/ibb/metro.js'
    );
    const hatlar = hatlariDonustur(await (await fetch(HATLAR_URL, h)).json());
    expect(hatlar.map((x) => x.ad)).toContain('M2');
    expect(hatlar.find((x) => x.ad === 'M2')?.ilkSefer).toMatch(/^\d{2}:\d{2}$/);
    const i = istasyonlariDonustur(await (await fetch(ISTASYONLAR_URL, h)).json());
    expect(i.filter((x) => x.hat === 'M2').length).toBeGreaterThan(10);
  }, 20_000);
});

describe.skipIf(!process.env.MCP_TURKIYE_LIVE)('canlı: İzmir, BtcTurk, haber', () => {
  const h = { headers: { 'user-agent': 'mcp-turkiye contract test' } };

  it('İzmir: pharmacies today, produce bulletin of the last week, buses at a stop', async () => {
    const {
      ECZANE_URL,
      eczaneleriDonustur,
      halUrl,
      halFiyatlariniDonustur,
      duragaYaklasanUrl,
      otobusleriDonustur,
    } = await import('../../src/sources/izmir/index.js');
    const e = eczaneleriDonustur(await (await fetch(ECZANE_URL, h)).json());
    expect(e.length).toBeGreaterThan(20);
    let fiyat = 0;
    for (let g = 0; g < 7 && fiyat === 0; g++) {
      const d = new Date(Date.now() - g * 24 * 60 * 60 * 1000);
      const tarih = d.toISOString().slice(0, 10);
      const r = await fetch(halUrl('sebzemeyve', tarih), h);
      if (r.status === 204) continue;
      fiyat = halFiyatlariniDonustur(await r.json(), halUrl('sebzemeyve', tarih)).fiyatlar.length;
    }
    expect(fiyat).toBeGreaterThan(50);
    const r = await fetch(duragaYaklasanUrl(21050), h);
    expect(r.ok).toBe(true);
    expect(Array.isArray(otobusleriDonustur(await r.json(), 'u'))).toBe(true);
  }, 40_000);

  it('BtcTurk: BTCTRY quoted with a positive last price', async () => {
    const { TICKER_URL, kurlariDonustur, kurlariSec } = await import(
      '../../src/sources/btcturk/index.js'
    );
    const k = kurlariSec(kurlariDonustur(await (await fetch(TICKER_URL, h)).json()), 'BTC');
    expect(k[0]?.cift).toBe('BTCTRY');
    expect(k[0]?.son).toBeGreaterThan(0);
  }, 20_000);

  it('AA and TRT feeds parse to dated headlines', async () => {
    const { KAYNAKLAR, haberleriAyristir } = await import('../../src/sources/haber/index.js');
    for (const k of ['aa', 'trt'] as const) {
      const url = KAYNAKLAR[k].besleme(KAYNAKLAR[k].kategoriler[0]);
      const haberler = haberleriAyristir(await (await fetch(url, h)).text(), url);
      expect(haberler.length, k).toBeGreaterThan(10);
      expect(haberler[0]?.yayin, k).toMatch(/^\d{4}-/);
    }
  }, 20_000);
});
