import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { listeyiAyristir, yerelZaman } from '../../src/sources/kandilli/parse.js';

// Kandilli serves windows-1254; the fixture is the raw bytes of the page.
const bytes = readFileSync(join(__dirname, '..', 'fixtures', 'kandilli-lst0.html'));
const sayfa = new TextDecoder('windows-1254').decode(bytes);

const satir = (md: string, ml: string, mw: string) =>
  `<pre>\n2026.09.16 12:00:00  38.0000   27.0000       10.0      ${md}  ${ml}  ${mw}   TEST (IZMIR)   İlksel\n</pre>`;

describe('kandilli parse', () => {
  it('reads all 500 lines of the fixed-width list, newest first, with the refresh time', () => {
    const { depremler, guncelleme } = listeyiAyristir(sayfa);
    expect(depremler).toHaveLength(500);
    expect(guncelleme).toBe('2026-09-17T00:50:32');
    expect(depremler[0]).toEqual({
      zaman: '2026-09-17T00:42:48',
      enlem: 35.8702,
      boylam: 33.9887,
      derinlikKm: 24.1,
      buyukluk: 1.8,
      buyuklukTuru: 'ML',
      md: null,
      ml: 1.8,
      mw: null,
      yer: 'AKDENIZ',
      cozum: 'İlksel',
    });
    // A revised solution keeps the revision stamp; the place name keeps its inner spaces only.
    expect(depremler[1]).toMatchObject({
      zaman: '2026-09-17T00:33:49',
      yer: 'ARIKAYA-CAMELI (DENIZLI)',
      cozum: 'REVIZE01 (2026.09.17 00:33:55)',
    });
  });

  it('keeps every magnitude column and picks ML as the headline when it exists', () => {
    const ege = listeyiAyristir(sayfa).depremler.find((d) => d.mw !== null);
    expect(ege).toMatchObject({ yer: 'EGE DENIZI', ml: 3.5, mw: 3.4, buyukluk: 3.5 });
  });

  it('falls back to Mw, then MD, when ML is not computed; drops a line with none', () => {
    expect(listeyiAyristir(satir('2.0', '-.-', '4.1')).depremler[0]).toMatchObject({
      buyukluk: 4.1,
      buyuklukTuru: 'Mw',
    });
    expect(listeyiAyristir(satir('2.0', '-.-', '-.-')).depremler[0]).toMatchObject({
      buyukluk: 2,
      buyuklukTuru: 'MD',
    });
    expect(listeyiAyristir(satir('-.-', '-.-', '-.-')).depremler).toEqual([]);
  });

  it('refuses a page without the <pre> block', () => {
    expect(() => listeyiAyristir('<html>maintenance</html>')).toThrow(/<pre>/);
  });

  it('treats the times as Türkiye local time (UTC+3)', () => {
    expect(new Date(yerelZaman('2026-09-17T00:33:49')).toISOString()).toBe(
      '2026-09-16T21:33:49.000Z',
    );
  });
});

describe('kandilli_depremler through the server', () => {
  let client: Client;

  beforeEach(async () => {
    onbellegiTemizle();
    vi.useFakeTimers({ toFake: ['Date'] });
    // 01:00 local, just after the fixture's refresh time.
    vi.setSystemTime(new Date('2026-09-16T22:00:00Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input) === 'http://www.koeri.boun.edu.tr/scripts/lst0.asp'
          ? new Response(bytes)
          : new Response('', { status: 500 }),
      ),
    );
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await sunucuOlustur().connect(st);
    client = new Client({ name: 't', version: '0' });
    await client.connect(ct);
  });

  afterEach(async () => {
    await client.close();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const cagir = async (args: Record<string, unknown>) =>
    (await client.callTool({ name: 'kandilli_depremler', arguments: args })) as unknown as {
      isError?: boolean;
      content: Array<{ text?: string }>;
      structuredContent: {
        kaynak: { id: string; url: string };
        veri: {
          sonSaat: number;
          minBuyukluk: number;
          guncelleme: string | null;
          toplam: number;
          depremler: Array<{ zaman: string; buyukluk: number; yer: string }>;
        };
      };
    };

  it('applies the defaults — last 24 hours, magnitude 3 and up — and decodes the Turkish text', async () => {
    const r = await cagir({});
    expect(r.isError).toBeFalsy();
    const { veri } = r.structuredContent;
    expect(veri).toMatchObject({ sonSaat: 24, minBuyukluk: 3, guncelleme: '2026-09-17T00:50:32' });
    expect(veri.toplam).toBeGreaterThan(0);
    expect(veri.depremler.every((d) => d.buyukluk >= 3)).toBe(true);
    expect(veri.depremler.every((d) => d.zaman >= '2026-09-16T01:00:00')).toBe(true);
    expect(veri.toplam).toBe(veri.depremler.length);
    expect(r.structuredContent.kaynak.id).toBe('kandilli');
  });

  it('widens the window and lowers the threshold on request, capping at limit', async () => {
    const r = await cagir({ sonSaat: 720, minBuyukluk: 0, limit: 5 });
    const { veri } = r.structuredContent;
    expect(veri.toplam).toBe(500);
    expect(veri.depremler).toHaveLength(5);
    expect(veri.depremler[0]?.yer).toBe('AKDENIZ');
  });

  it('names Kandilli when the page cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>bakim</html>')),
    );
    const r = await cagir({});
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/^kandilli kaynağından veri alınamadı: .*<pre>/);
  });
});
