import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KaynakHatasi, onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { bolgeKodlari, fiyatUrl, satirlariDonustur } from '../../src/sources/opet/index.js';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'opet-34.json'), 'utf8'));

describe('opet parse', () => {
  it('flattens each district row to product → price', () => {
    const rows = satirlariDonustur(fixture);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows[0]).toMatchObject({ ilce: 'ADALAR', bolge: 'İSTANBUL ANADOLU' });
    expect(rows[0]?.fiyatlar['Kurşunsuz Benzin 95']).toBe(80.16);
    expect(rows[0]?.fiyatlar['Motorin EcoForce']).toBe(95.53);
  });

  it('skips rows without a district or a price list and refuses a non-list', () => {
    expect(satirlariDonustur([{ districtName: 'X' }, { prices: [] }])).toEqual([]);
    expect(() => satirlariDonustur({})).toThrow(KaynakHatasi);
  });

  it('asks for both Istanbul sides unless one is named, and one region elsewhere', () => {
    expect(bolgeKodlari(34)).toEqual([34, 934]);
    expect(bolgeKodlari(34, 'avrupa')).toEqual([934]);
    expect(bolgeKodlari(34, 'anadolu')).toEqual([34]);
    expect(bolgeKodlari(6, 'avrupa')).toEqual([6]);
    expect(fiyatUrl(934)).toContain('ProvinceCode=934');
  });
});

describe('opet_akaryakit through the server', () => {
  let client: Client;
  let istekler: string[];

  beforeEach(async () => {
    onbellegiTemizle();
    istekler = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        istekler.push(url);
        if (url.includes('ProvinceCode=934')) {
          const avrupa = fixture.map((r: Record<string, unknown>) => ({
            ...r,
            provinceName: 'İSTANBUL AVRUPA',
            districtName: `AVRUPA-${r.districtName}`,
          }));
          return new Response(JSON.stringify(avrupa));
        }
        if (url.includes('ProvinceCode=')) return new Response(JSON.stringify(fixture));
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

  const cagir = async (args: Record<string, unknown>) =>
    (await client.callTool({ name: 'opet_akaryakit', arguments: args })) as unknown as {
      isError?: boolean;
      content: Array<{ text?: string }>;
      structuredContent?: { veri: { il: string; ilceler: Array<{ ilce: string; bolge: string }> } };
    };

  it('accepts a province name in any spelling and returns its districts', async () => {
    const r = await cagir({ il: 'ankara' });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent?.veri.il).toBe('Ankara');
    expect(istekler).toEqual([fiyatUrl(6)]);
  });

  it('accepts a plate code and fetches both Istanbul regions by default', async () => {
    const r = await cagir({ il: '34' });
    expect(r.structuredContent?.veri.il).toBe('İstanbul');
    expect(istekler.sort()).toEqual([fiyatUrl(34), fiyatUrl(934)].sort());
    const bolgeler = new Set(r.structuredContent?.veri.ilceler.map((x) => x.bolge));
    expect(bolgeler).toEqual(new Set(['İSTANBUL ANADOLU', 'İSTANBUL AVRUPA']));
  });

  it('filters to one district regardless of case and diacritics', async () => {
    const r = await cagir({ il: 'İstanbul', ilce: 'adalar', yaka: 'anadolu' });
    expect(r.structuredContent?.veri.ilceler).toHaveLength(1);
    expect(r.structuredContent?.veri.ilceler[0]?.ilce).toBe('ADALAR');
  });

  it('lists the known districts when the requested one is not there', async () => {
    const r = await cagir({ il: 'Ankara', ilce: 'Yokistan' });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/Listedekiler: ADALAR/);
  });

  it('rejects something that is neither a province nor a plate code', async () => {
    const r = await cagir({ il: 'Gotham' });
    expect(r.isError).toBe(true);
    expect(istekler).toEqual([]);
  });
});
