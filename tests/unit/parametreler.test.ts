import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sunucuOlustur } from '../../src/server.js';
import { PARAMETRELER } from '../../src/sources/parametreler/veri.js';

describe('resmî parametreler 2026', () => {
  const p = PARAMETRELER[2026] ?? [];
  const bul = (ad: string) => p.find((x) => x.ad.startsWith(ad));

  it('carries the decided daily gross and derives the monthly figures from it', () => {
    expect(bul('Asgari ücret, günlük brüt')?.deger).toBe(1101);
    expect(bul('Asgari ücret, aylık brüt')?.deger).toBe(33030);
    expect(bul('Asgari ücret, aylık net')?.deger).toBe(28075.5);
  });

  it('derives the SGK floor and ceiling from the statute (floor = wage, ceiling = 9× floor)', () => {
    expect(bul('SGK prime esas kazanç alt')?.deger).toBe(33030);
    expect(bul('SGK prime esas kazanç üst')?.deger).toBe(297270);
    expect(bul('SGK prime esas kazanç üst')?.kaynak).toMatch(/5510 .* m\. 82/);
  });

  it('names a primary source and a URL on every figure, and the arithmetic on derived ones', () => {
    for (const x of p) {
      expect(x.kaynak.length, x.ad).toBeGreaterThan(20);
      expect(x.kaynakUrl, x.ad).toMatch(/^https:\/\/www\.(resmigazete|mevzuat)\.gov\.tr\//);
      expect(x.gecerlilik).toEqual({ baslangic: '2026-01-01', bitis: '2026-12-31' });
    }
    expect(bul('Asgari ücret, aylık net')?.turetme).toMatch(/%14 .* %1 /);
  });
});

describe('resmi_parametreler through the server', () => {
  let client: Client;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
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
    (await client.callTool({ name: 'resmi_parametreler', arguments: args })) as unknown as {
      isError?: boolean;
      structuredContent: {
        veri: { yil: number; mevcut: boolean; parametreler: unknown[]; gomuluYillar: number[] };
      };
    };

  it('answers a known year offline with all figures', async () => {
    const r = await cagir({ yil: 2026 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri).toMatchObject({ yil: 2026, mevcut: true });
    expect(r.structuredContent.veri.parametreler).toHaveLength(5);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says a year is not embedded instead of guessing', async () => {
    const r = await cagir({ yil: 2031 });
    expect(r.structuredContent.veri).toMatchObject({ yil: 2031, mevcut: false, parametreler: [] });
    expect(r.structuredContent.veri.gomuluYillar).toContain(2026);
  });
});
