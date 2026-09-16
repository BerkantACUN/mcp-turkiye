import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KaynakHatasi, onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { satirlariDonustur, sorguUrl } from '../../src/sources/bist/index.js';
import { trafikIndeksiniOku } from '../../src/sources/ibb/index.js';

const fixtures = join(__dirname, '..', 'fixtures');
const thyao = JSON.parse(readFileSync(join(fixtures, 'isyatirim-thyao.json'), 'utf8'));

describe('ibb trafik', () => {
  it('reads the index and rejects anything outside 0–100 or not a number', () => {
    expect(trafikIndeksiniOku({ Result: 76 })).toBe(76);
    expect(trafikIndeksiniOku({ Result: 0 })).toBe(0);
    for (const kotu of [{ Result: '76' }, { Result: 140 }, { Result: -1 }, {}, null, 'x']) {
      expect(() => trafikIndeksiniOku(kotu), JSON.stringify(kotu)).toThrow(KaynakHatasi);
    }
  });
});

describe('bist parse', () => {
  it('normalises İş Yatırım rows into ISO-dated, ascending daily prices', () => {
    const g = satirlariDonustur(thyao);
    expect(g.length).toBe(4);
    expect((g[0]?.tarih ?? '') < (g[g.length - 1]?.tarih ?? '')).toBe(true);
    const son = g[g.length - 1];
    expect(son).toMatchObject({
      tarih: '2026-09-15',
      kapanis: 285.25,
      agirlikliOrtalama: 291.151,
      enDusuk: 285.25,
      enYuksek: 296.5,
      bist100: 13892.3,
      usdTry: 48.646,
    });
    expect(son?.hacimTL).toBeGreaterThan(1e9);
  });

  it('refuses an envelope the site marks as failed, quoting its reason', () => {
    expect(() => satirlariDonustur({ ok: false, errorDescription: 'Hisse bulunamadı' })).toThrow(
      /Hisse bulunamadı/,
    );
    expect(() => satirlariDonustur({ ok: true, value: 'x' })).toThrow(KaynakHatasi);
    expect(() => satirlariDonustur(null)).toThrow(KaynakHatasi);
  });

  it('drops rows without a date or close', () => {
    expect(
      satirlariDonustur({
        ok: true,
        value: [
          { HGDG_TARIH: '01-09-2026' },
          { HGDG_KAPANIS: 1 },
          { HGDG_TARIH: 'bad', HGDG_KAPANIS: 1 },
        ],
      }),
    ).toEqual([]);
  });

  it('writes dates the way the site expects (DD-MM-YYYY)', () => {
    expect(sorguUrl('THYAO', '2026-09-01', '2026-09-16')).toContain(
      'hisse=THYAO&startdate=01-09-2026&enddate=16-09-2026',
    );
  });
});

describe('ibb_trafik_indeksi and bist_hisse through the server', () => {
  let client: Client;

  beforeEach(async () => {
    onbellegiTemizle();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('TrafficIndex')) return new Response('{"Result":42}');
        if (url.includes('hisse=THYAO')) return new Response(JSON.stringify(thyao));
        if (url.includes('hisse=YOKKK')) return new Response('{"ok":true,"value":[]}');
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

  const cagir = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as unknown as {
      isError?: boolean;
      content: Array<{ text?: string }>;
      structuredContent: { kaynak: { url: string }; veri: Record<string, unknown> };
    };

  it('returns the live traffic index with its scale', async () => {
    const r = await cagir('ibb_trafik_indeksi');
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri.indeks).toBe(42);
    expect(String(r.structuredContent.veri.olcek)).toMatch(/0 .* 100/);
  });

  it('upper-cases the ticker, returns the range, count, last day and all days', async () => {
    const r = await cagir('bist_hisse', {
      kod: 'thyao',
      baslangic: '2026-09-10',
      bitis: '2026-09-16',
    });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri).toMatchObject({
      kod: 'THYAO',
      gunSayisi: 4,
      aralik: { baslangic: '2026-09-10', bitis: '2026-09-16' },
    });
    expect((r.structuredContent.veri.son as { kapanis: number }).kapanis).toBe(285.25);
    expect(r.structuredContent.kaynak.url).toContain('startdate=10-09-2026');
  });

  it('says so when a ticker returns no rows', async () => {
    const r = await cagir('bist_hisse', { kod: 'YOKKK' });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/YOKKK için .* veri yok/);
  });
});
