import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { aramaGovdesi, metinUrl, TURLER } from '../../src/sources/mevzuat/index.js';
import {
  aramaSonuclariniDonustur,
  kimlikCoz,
  maddeAnahtari,
  maddeListesi,
  maddeyiCikar,
  metniAyristir,
} from '../../src/sources/mevzuat/parse.js';

const fixtures = join(__dirname, '..', 'fixtures');
const arama = JSON.parse(readFileSync(join(fixtures, 'mevzuat-arama-kvkk.json'), 'utf8'));
const kvkk = readFileSync(join(fixtures, 'mevzuat-6698.html'), 'utf8');
const isKanunu = readFileSync(join(fixtures, 'mevzuat-4857.html'), 'utf8');

describe('mevzuat search', () => {
  it('normalises a hit into the id the text tools need, without the highlight markup', () => {
    const { toplam, sonuclar } = aramaSonuclariniDonustur(arama);
    expect(toplam).toBe(1);
    expect(sonuclar[0]).toMatchObject({
      kimlik: '1.5.6698',
      ad: 'KİŞİSEL VERİLERİN KORUNMASI KANUNU',
      no: '6698',
      tur: 1,
      turAdi: 'Kanunlar',
      tertip: 5,
      kabulTarihi: '24.03.2016',
      resmiGazeteTarihi: '07.04.2016',
      resmiGazeteSayisi: '29677',
      url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6698&MevzuatTur=1&MevzuatTertip=5',
    });
  });

  it('refuses a payload without data and skips rows without the three numbers', () => {
    expect(() => aramaSonuclariniDonustur({ recordsTotal: 0 })).toThrow(/data/);
    expect(aramaSonuclariniDonustur({ recordsTotal: 2, data: [{ mevAdi: 'x' }] }).sonuclar).toEqual(
      [],
    );
  });

  it('builds the DataTables body the site expects, with the phrase Base64-encoded', () => {
    const b = JSON.parse(aramaGovdesi('kişisel veri', TURLER.kanun, 'Baslik', 5));
    expect(b.length).toBe(5);
    expect(b.parameters).toMatchObject({ AranacakYer: 'Baslik', MevzuatTur: 1, GenelArama: true });
    expect(Buffer.from(b.parameters.AranacakIfade, 'base64').toString('utf8')).toBe('kişisel veri');
  });

  it('parses and rejects identifiers', () => {
    expect(kimlikCoz('1.5.6698')).toEqual({ tur: 1, tertip: 5, no: '6698' });
    expect(kimlikCoz(' 7.5.24276 ')).toEqual({ tur: 7, tertip: 5, no: '24276' });
    expect(kimlikCoz('6698')).toBeNull();
    expect(metinUrl(1, 5, '6698')).toContain('MevzuatTur=1&MevzuatNo=6698&MevzuatTertip=5');
  });
});

describe('mevzuat text', () => {
  it('reads the title and turns a modern act into one line per paragraph', () => {
    const m = metniAyristir(kvkk);
    expect(m.baslik).toBe('KİŞİSEL VERİLERİN KORUNMASI KANUNU');
    expect(m.metin.length).toBeGreaterThan(40_000);
    expect(m.satirlar.some((s) => s.startsWith('MADDE 6- (1) Kişilerin ırkı'))).toBe(true);
  });

  it('joins the hard-wrapped source lines of an older act ("Madde\\n1 -")', () => {
    const m = metniAyristir(isKanunu);
    expect(m.baslik).toBe('İŞ KANUNU');
    expect(m.satirlar.some((s) => s.startsWith('Madde 1 - Bu Kanunun amacı'))).toBe(true);
    expect(m.satirlar).toContain('BİRİNCİ BÖLÜM');
    expect(m.satirlar).toContain('Amaç ve kapsam');
  });

  it('refuses an empty page', () => {
    expect(() => metniAyristir('<html><body></body></html>')).toThrow(/boş/);
  });
});

describe('article extraction', () => {
  const kvkkSatirlar = metniAyristir(kvkk).satirlar;

  it('normalises how people write article numbers', () => {
    expect(maddeAnahtari('6')).toBe('6');
    expect(maddeAnahtari('madde 6')).toBe('6');
    expect(maddeAnahtari('6/A')).toBe('6/A');
    expect(maddeAnahtari('ek 1')).toBe('EK 1');
    expect(maddeAnahtari('Geçici madde 3')).toBe('GEÇİCİ 3');
    expect(maddeAnahtari('gecici 3')).toBe('GEÇİCİ 3');
    expect(maddeAnahtari('altı')).toBeNull();
  });

  it('returns KVKK article 6 with its heading, ending before article 7', () => {
    const m = maddeyiCikar(kvkkSatirlar, '6');
    expect(m).not.toBeNull();
    expect(m?.madde).toBe('6');
    expect(m?.baslik).toBe('Özel nitelikli kişisel verilerin işlenme şartları');
    expect(m?.metin.startsWith('MADDE 6- (1) Kişilerin ırkı, etnik kökeni')).toBe(true);
    expect(m?.metin).not.toContain('MADDE 7-');
    expect(m?.metin).not.toMatch(/Kişisel verilerin silinmesi.*$/);
  });

  it('finds transitional articles and lists every article in document order', () => {
    expect(maddeyiCikar(kvkkSatirlar, 'geçici 1')?.metin.startsWith('GEÇİCİ MADDE 1-')).toBe(true);
    const liste = maddeListesi(kvkkSatirlar);
    expect(liste.slice(0, 3)).toEqual(['1', '2', '3']);
    expect(liste).toContain('GEÇİCİ 3');
    expect(liste[liste.length - 1]).toBe('33');
  });

  it('handles the older "Madde 17 -" style and returns null for a missing article', () => {
    const is = metniAyristir(isKanunu).satirlar;
    const m = maddeyiCikar(is, '2');
    expect(m?.baslik).toBe('Tanımlar');
    expect(m?.metin.startsWith('Madde 2 - Bir iş sözleşmesine dayanarak')).toBe(true);
    expect(maddeyiCikar(is, '999')).toBeNull();
  });
});

describe('mevzuat tools through the server', () => {
  let client: Client;
  let istekler: Array<{ url: string; method: string; body?: string }>;

  beforeEach(async () => {
    onbellegiTemizle();
    istekler = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        istekler.push({
          url,
          method: init?.method ?? 'GET',
          ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        });
        if (url.endsWith('/MevzuatDatatable')) return new Response(JSON.stringify(arama));
        if (url.includes('MevzuatNo=6698')) return new Response(kvkk);
        if (url.includes('MevzuatNo=4857')) return new Response(isKanunu);
        if (url.includes('MevzuatNo=0')) return new Response('<html><body></body></html>');
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

  it('searches with a POST carrying the site’s body and headers', async () => {
    const r = await cagir('mevzuat_ara', { ifade: 'kişisel verilerin korunması' });
    expect(r.isError).toBeFalsy();
    expect((r.structuredContent.veri.sonuclar as Array<{ kimlik: string }>)[0]?.kimlik).toBe(
      '1.5.6698',
    );
    const istek = istekler[0];
    expect(istek?.method).toBe('POST');
    expect(JSON.parse(istek?.body ?? '{}').parameters.MevzuatTur).toBe(1);
  });

  it('serves article 6 of KVKK by id, and by number with defaults', async () => {
    const a = await cagir('mevzuat_madde', { kimlik: '1.5.6698', madde: '6' });
    expect(a.isError).toBeFalsy();
    expect(a.structuredContent.veri).toMatchObject({
      kimlik: '1.5.6698',
      mevzuatBasligi: 'KİŞİSEL VERİLERİN KORUNMASI KANUNU',
      madde: '6',
      baslik: 'Özel nitelikli kişisel verilerin işlenme şartları',
    });
    const b = await cagir('mevzuat_madde', { no: '6698', madde: 'madde 6' });
    expect(b.structuredContent.veri.metin).toBe(a.structuredContent.veri.metin);
    expect(a.structuredContent.kaynak.url).toBe(
      'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6698&MevzuatTur=1&MevzuatTertip=5',
    );
  });

  it('lists the existing articles when the requested one is not there', async () => {
    const r = await cagir('mevzuat_madde', { kimlik: '1.5.6698', madde: '99' });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/"99" maddesi .* bulunamadı\. Mevcut maddeler: 1, 2, 3/);
  });

  it('pages the full text and returns the article list', async () => {
    const r = await cagir('mevzuat_metin', { kimlik: '1.5.6698' });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri).toMatchObject({
      baslik: 'KİŞİSEL VERİLERİN KORUNMASI KANUNU',
      baslangic: 0,
      bitis: 20_000,
      devamVar: true,
    });
    expect((r.structuredContent.veri.maddeler as string[]).length).toBeGreaterThan(30);
    const devam = await cagir('mevzuat_metin', { kimlik: '1.5.6698', baslangic: 40_000 });
    expect(devam.structuredContent.veri.devamVar).toBe(false);
  });

  it('rejects a malformed id and a call with neither id nor number without fetching', async () => {
    const a = await cagir('mevzuat_madde', { kimlik: 'abc', madde: '1' });
    expect(a.isError).toBe(true);
    const b = await cagir('mevzuat_metin', {});
    expect(b.isError).toBe(true);
    expect(istekler).toEqual([]);
  });

  it('reports an empty page as a source error naming mevzuat.gov.tr', async () => {
    const r = await cagir('mevzuat_metin', { no: '0' });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/^mevzuat kaynağından veri alınamadı: mevzuat metni boş/);
  });
});
