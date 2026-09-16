import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { kaynagiOzetle, PORTALLAR, paketiOzetle } from '../../src/sources/acikveri/index.js';

const fixtures = join(__dirname, '..', 'fixtures');
const oku = (f: string) => JSON.parse(readFileSync(join(fixtures, f), 'utf8'));
const arama = oku('ckan-ibb-search.json');
const paket = oku('ckan-ibb-package.json');
const datastore = oku('ckan-ibb-datastore.json');

describe('acikveri parse', () => {
  it('summarises a package: trimmed notes, formats, organisation, portal URL', () => {
    const p = paketiOzetle('ibb', arama.result.results[0]);
    expect(p).toMatchObject({
      ad: 'yatay-trafik-isaretleme-calismalari',
      baslik: 'Yatay Trafik İşaretleme Çalışmaları',
      kurum: 'Ulaşım Dairesi Başkanlığı',
      formatlar: ['XLSX'],
      kaynakSayisi: 1,
      url: 'https://data.ibb.gov.tr/dataset/yatay-trafik-isaretleme-calismalari',
    });
    expect(p?.aciklama.length).toBeLessThanOrEqual(300);
    expect(paketiOzetle('izmir', {})).toBeNull();
  });

  it('summarises a resource, reading CKAN’s stringly booleans and sizes', () => {
    const k = kaynagiOzetle(paket.result.resources[0]);
    expect(k).toMatchObject({ format: 'XLSX', tabloServisi: true, boyutBayt: 11222 });
    expect(kaynagiOzetle({ id: 'x', datastore_active: false, size: 'abc' })).toMatchObject({
      tabloServisi: false,
      boyutBayt: null,
    });
    expect(kaynagiOzetle({})).toBeNull();
  });

  it('knows both portals and their licences', () => {
    expect(Object.keys(PORTALLAR)).toEqual(['ibb', 'izmir', 'konya', 'gaziantep']);
    expect(PORTALLAR.konya.lisans).toMatch(/CC-BY/);
    expect(PORTALLAR.ibb.lisans).toMatch(/Istanbul Metropolitan Municipality/);
  });
});

describe('acikveri tools through the server', () => {
  let client: Client;

  beforeEach(async () => {
    onbellegiTemizle();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('data.ibb.gov.tr/api/3/action/package_search'))
          return new Response(JSON.stringify(arama));
        if (url.includes('acikveri.bizizmir.com/api/3/action/package_search'))
          return new Response(JSON.stringify({ success: true, result: { count: 0, results: [] } }));
        if (url.includes('package_show?id=yatay')) return new Response(JSON.stringify(paket));
        if (url.includes('package_show?id=yok'))
          return new Response(JSON.stringify({ success: false, error: { message: 'Not found' } }), {
            status: 404,
          });
        if (url.includes('datastore_search?resource_id=4b63'))
          return new Response(JSON.stringify(datastore));
        if (url.includes('datastore_search?resource_id=dead'))
          return new Response('{"success":false}', { status: 404 });
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

  it('searches a portal and cites the portal search page', async () => {
    const r = await cagir('acikveri_ara', { portal: 'ibb', sorgu: 'trafik', limit: 3 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri.toplam).toBe(17);
    expect((r.structuredContent.veri.verisetleri as unknown[]).length).toBe(3);
    expect(r.structuredContent.kaynak.url).toBe('https://data.ibb.gov.tr/dataset?q=trafik');
  });

  it('returns an empty list, not an error, when nothing matches', async () => {
    const r = await cagir('acikveri_ara', { portal: 'izmir', sorgu: 'zzz' });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri.toplam).toBe(0);
  });

  it('shows a dataset with its licence and resources', async () => {
    const r = await cagir('acikveri_veriseti', {
      portal: 'ibb',
      ad: 'yatay-trafik-isaretleme-calismalari',
    });
    expect(r.structuredContent.veri.lisans).toBe(
      'Istanbul Metropolitan Municipality Open Data License',
    );
    expect(
      (r.structuredContent.veri.kaynaklar as Array<{ tabloServisi: boolean }>)[0]?.tabloServisi,
    ).toBe(true);
  });

  it('reports a missing dataset as a source error, not a crash', async () => {
    const r = await cagir('acikveri_veriseti', { portal: 'ibb', ad: 'yok' });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/acikveri\/ibb kaynağından veri alınamadı/);
  });

  it('reads DataStore rows with their columns and total', async () => {
    const r = await cagir('acikveri_kayitlar', {
      portal: 'ibb',
      kaynakId: '4b63a1eb-19b3-433c-8aa5-56779dc642e9',
      limit: 2,
    });
    expect(r.structuredContent.veri.toplam).toBe(4);
    expect((r.structuredContent.veri.sutunlar as Array<{ ad: string }>).map((s) => s.ad)).toContain(
      'Olcu',
    );
    // The fixture was captured with limit=3; what is under test is that the limit reaches CKAN.
    expect((r.structuredContent.veri.satirlar as unknown[]).length).toBe(3);
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('limit=2'))).toBe(true);
  });

  it('explains a resource without DataStore instead of a bare 404', async () => {
    const r = await cagir('acikveri_kayitlar', { portal: 'ibb', kaynakId: 'dead-beef-0000' });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/tablo servisi \(DataStore\) açık değil/);
  });
});

describe('acikveri geo-block', () => {
  it('explains a 403 from a portal known to block foreign IPs', async () => {
    const { onbellegiTemizle } = await import('../../src/core/http.js');
    onbellegiTemizle();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    );
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await sunucuOlustur().connect(st);
    const client = new Client({ name: 't', version: '0' });
    await client.connect(ct);
    const r = (await client.callTool({
      name: 'acikveri_ara',
      arguments: { portal: 'konya', sorgu: 'x' },
    })) as unknown as {
      isError?: boolean;
      content: Array<{ text?: string }>;
    };
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/Türkiye dışından gelen istekleri engelliyor/);
    await client.close();
    vi.unstubAllGlobals();
  });
});
