import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { kurlariDonustur, kurlariSec } from '../../src/sources/btcturk/index.js';
import { haberleriAyristir, KAYNAKLAR } from '../../src/sources/haber/index.js';
import { ilBul, ilceAra, ilceleri, illeriSirala } from '../../src/sources/iller/index.js';
import { ILCELER_VERI, ILLER_VERI } from '../../src/sources/iller/veri.js';
import {
  eczaneleriDonustur,
  halFiyatlariniDonustur,
  halUrl,
  otobusleriDonustur,
} from '../../src/sources/izmir/index.js';

const fixtures = join(__dirname, '..', 'fixtures');
const oku = (f: string) => JSON.parse(readFileSync(join(fixtures, f), 'utf8'));
const metin = (f: string) => readFileSync(join(fixtures, f), 'utf8');
const izmirEczane = oku('izmir-eczane.json');
const izmirHal = oku('izmir-hal.json');
const izmirDurak = oku('izmir-durak.json');
const btcturk = oku('btcturk-ticker.json');
const aa = metin('aa-guncel.xml');
const trt = metin('trt-manset.xml');

describe('İzmir parse', () => {
  it('pharmacies with comma-free coordinates and region', () => {
    const e = eczaneleriDonustur(izmirEczane);
    expect(e.length).toBe(10);
    expect(e[0]?.enlem).toBeGreaterThan(38);
    expect(e[0]?.boylam).toBeGreaterThan(26);
    expect(e[0]?.bolge).toBeTruthy();
    expect(() => eczaneleriDonustur({})).toThrow(/liste/);
  });

  it('wholesale prices sorted by product, empty bulletin tolerated', () => {
    const { tarih, fiyatlar } = halFiyatlariniDonustur(
      izmirHal,
      halUrl('sebzemeyve', '2026-09-21'),
    );
    expect(tarih).toBe('2026-09-21');
    expect(fiyatlar.length).toBe(12);
    expect(fiyatlar[0]).toMatchObject({
      mal: 'ACUR',
      birim: 'KG',
      asgari: 30,
      azami: 70,
      ortalama: 50,
    });
    expect(halFiyatlariniDonustur(null, 'x')).toEqual({ tarih: null, fiyatlar: [] });
    expect(() => halFiyatlariniDonustur({ BultenTarihi: 'x' }, 'u')).toThrow(/HalFiyatListesi/);
  });

  it('approaching buses: Turkish decimal commas become numbers, nearest first', () => {
    const o = otobusleriDonustur(izmirDurak, 'u');
    expect(o.length).toBe(3);
    expect(o[0]?.kalanDurak).toBeLessThanOrEqual(o[1]?.kalanDurak ?? 0);
    expect(o[0]?.enlem).toBeCloseTo(38.51, 1);
    expect(o[0]?.hatNo).toBe(816);
  });
});

describe('BtcTurk parse', () => {
  it('tickers become lira quotes; selection by symbol list and by quote currency', () => {
    const k = kurlariDonustur(btcturk);
    expect(k.length).toBe(7);
    const btc = k.find((x) => x.cift === 'BTCTRY');
    expect(btc).toMatchObject({ varlik: 'BTC', paraBirimi: 'TRY' });
    expect(btc?.son).toBeGreaterThan(0);
    expect(btc?.zaman).toMatch(/^\d{4}-/);
    expect(
      kurlariSec(k, 'btc, eth')
        .map((x) => x.cift)
        .sort(),
    ).toEqual(['BTCTRY', 'ETHTRY']);
    expect(kurlariSec(k, 'BTC_TRY').map((x) => x.cift)).toEqual(['BTCTRY']);
    expect(kurlariSec(k, undefined, 'USDT').every((x) => x.paraBirimi === 'USDT')).toBe(true);
    expect(kurlariSec(k, undefined, 'TRY', 2).length).toBe(2);
    expect(kurlariSec(k, 'YOK')).toEqual([]);
    expect(() => kurlariDonustur({ success: true })).toThrow(/data/);
  });
});

describe('haber parse', () => {
  it('reads RSS items from AA and TRT (CDATA, HTML in description, pubDate)', () => {
    const a = haberleriAyristir(aa, 'u');
    expect(a.length).toBe(5);
    expect(a[0]?.url).toMatch(/^https:\/\/www\.aa\.com\.tr\//);
    expect(a[0]?.yayin).toMatch(/^2026-/);
    const t = haberleriAyristir(trt, 'u');
    expect(t.length).toBe(5);
    expect(t[0]?.ozet).not.toContain('<img');
    expect(t[0]?.ozet.length).toBeGreaterThan(20);
    expect(() => haberleriAyristir('<html>', 'u')).toThrow(/RSS/);
    expect(KAYNAKLAR.aa.besleme('spor')).toBe('https://www.aa.com.tr/tr/rss/default?cat=spor');
  });
});

describe('iller (offline)', () => {
  it('has 81 provinces and 973 districts, finds by name or plate', () => {
    expect(ILLER_VERI.length).toBe(81);
    expect(ILCELER_VERI.length).toBe(973);
    expect(ilBul('istanbul')?.plaka).toBe(34);
    expect(ilBul('06')?.ad).toBe('Ankara');
    expect(ilBul('Kahramanmaraş')?.plaka).toBe(46);
    expect(ilBul('Atlantis')).toBeNull();
    expect(ilceleri(34).length).toBe(39);
    expect(ilceleri(34)[0]?.ad).toBe('Esenyurt');
    expect(ilceAra('kadi').map((x) => `${x.il}/${x.ad}`)).toContain('İstanbul/Kadıköy');
    expect(ilceAra('merkez').length).toBeGreaterThan(40);
    expect(ilceAra('merkez', 10).every((x) => x.plaka === 10)).toBe(true);
    expect(illeriSirala('nufus')[0]?.ad).toBe('İstanbul');
    expect(illeriSirala('yuzolcumu')[0]?.ad).toBe('Konya');
    expect(illeriSirala('plaka')[0]?.plaka).toBe(1);
    expect(illeriSirala('nufus', 'ege').every((x) => x.bolge === 'Ege')).toBe(true);
    expect(illeriSirala('nufus', 'ege').length).toBe(8);
  });
});

describe('İzmir, BtcTurk, haber, iller tools through the server', () => {
  let client: Client;

  beforeEach(async () => {
    onbellegiTemizle();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('nobetcieczaneler')) return new Response(JSON.stringify(izmirEczane));
        if (url.includes('halfiyatlari/balik')) return new Response(null, { status: 204 });
        if (url.includes('halfiyatlari/sebzemeyve')) return new Response(JSON.stringify(izmirHal));
        if (url.includes('duragayaklasanotobusler/21050'))
          return new Response(JSON.stringify(izmirDurak));
        if (url.includes('hattinyaklasanotobusleri/816/21050'))
          return new Response(JSON.stringify(izmirDurak.slice(0, 1)));
        if (url.includes('api.btcturk.com')) return new Response(JSON.stringify(btcturk));
        if (url.includes('aa.com.tr/tr/rss')) return new Response(aa);
        if (url.includes('trthaber.com')) return new Response(trt);
        return new Response('', { status: 500 });
      }),
    );
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await sunucuOlustur().connect(st);
    client = new Client({ name: 't', version: '0' });
    await client.connect(ct);
  });

  afterEach(async () => {
    await client.close();
    vi.unstubAllGlobals();
  });

  const cagir = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as unknown as {
      isError?: boolean;
      content: Array<{ text?: string }>;
      structuredContent: { kaynak: { url: string }; veri: Record<string, unknown> };
    };

  it('İzmir pharmacies, prices (incl. an empty fish bulletin) and buses', async () => {
    const e = await cagir('izmir_nobetci_eczane', {});
    expect(e.structuredContent.veri.sayi).toBe(10);
    expect((await cagir('izmir_nobetci_eczane', { bolge: 'Atlantis' })).isError).toBe(true);
    const h = await cagir('izmir_hal_fiyatlari', { tarih: '2026-09-21', ara: 'acur' });
    expect(h.structuredContent.veri.sayi).toBe(1);
    expect(h.structuredContent.veri.bultenTarihi).toBe('2026-09-21');
    const b = await cagir('izmir_hal_fiyatlari', { tur: 'balik', tarih: '2026-09-21' });
    expect(b.isError).toBeFalsy();
    expect(b.structuredContent.veri.sayi).toBe(0);
    const o = await cagir('izmir_otobus', { durakId: 21050 });
    expect(o.structuredContent.veri.sayi).toBe(3);
    const oh = await cagir('izmir_otobus', { durakId: 21050, hatNo: 816 });
    expect(oh.structuredContent.veri.sayi).toBe(1);
    expect(oh.structuredContent.kaynak.url).toContain('hattinyaklasanotobusleri/816/21050');
  });

  it('crypto quotes default to the largest TRY markets and accept a symbol list', async () => {
    const r = await cagir('btcturk_kripto', {});
    expect(r.isError).toBeFalsy();
    expect(
      (r.structuredContent.veri.kurlar as Array<{ paraBirimi: string }>).every(
        (k) => k.paraBirimi === 'TRY',
      ),
    ).toBe(true);
    const s = await cagir('btcturk_kripto', { varlik: 'sol' });
    expect((s.structuredContent.veri.kurlar as Array<{ cift: string }>)[0]?.cift).toBe('SOLTRY');
    expect((await cagir('btcturk_kripto', { varlik: 'YOK' })).isError).toBe(true);
  });

  it('headlines from AA by default, TRT on request, category validated, search filter', async () => {
    const r = await cagir('haber_basliklari', {});
    expect(r.structuredContent.veri.kaynakAdi).toBe('Anadolu Ajansı');
    expect(r.structuredContent.veri.sayi).toBe(5);
    const t = await cagir('haber_basliklari', { kaynak: 'trt', limit: 2 });
    expect(t.structuredContent.veri.sayi).toBe(2);
    expect(t.structuredContent.kaynak.url).toBe('https://www.trthaber.com/manset_articles.rss');
    expect((await cagir('haber_basliklari', { kategori: 'magazin' })).isError).toBe(true);
    const a = await cagir('haber_basliklari', { ara: 'zzzz-yok' });
    expect(a.structuredContent.veri.sayi).toBe(0);
  });

  it('province tools answer offline with the data date', async () => {
    const r = await cagir('il_bilgisi', { il: '35' });
    expect(r.isError).toBeFalsy();
    expect((r.structuredContent.veri.il as { ad: string }).ad).toBe('İzmir');
    expect((r.structuredContent.veri.ilceler as unknown[]).length).toBe(30);
    expect(r.structuredContent.veri.veriTarihi).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const kisa = await cagir('il_bilgisi', { il: 'Ankara', ilceler: false });
    expect(kisa.structuredContent.veri.ilceler).toBeUndefined();
    expect((await cagir('il_bilgisi', { il: '99' })).isError).toBe(true);
    const i = await cagir('ilce_ara', { ilce: 'Bornova' });
    expect((i.structuredContent.veri.ilceler as Array<{ il: string }>)[0]?.il).toBe('İzmir');
    expect((await cagir('ilce_ara', { ilce: 'Bornova', il: 'Ankara' })).isError).toBe(true);
    expect((await cagir('ilce_ara', { ilce: 'xx', il: 'Yok' })).isError).toBe(true);
    const l = await cagir('iller_listesi', { sirala: 'yuzolcumu', bolge: 'Karadeniz' });
    expect((l.structuredContent.veri.iller as Array<{ ad: string }>)[0]?.ad).toBe('Kastamonu');
    expect((await cagir('iller_listesi', { bolge: 'Mars' })).isError).toBe(true);
  });
});
