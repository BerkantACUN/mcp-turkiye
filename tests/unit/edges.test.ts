import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hata } from '../../src/core/cevap.js';
import { KaynakHatasi, onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { olaylariDonustur, sorguUrl } from '../../src/sources/afad/index.js';
import { bultenUrl } from '../../src/sources/tcmb/index.js';

const fixtures = join(__dirname, '..', 'fixtures');
const tcmbXml = readFileSync(join(fixtures, 'tcmb-today.xml'), 'utf8');
const afadJson = readFileSync(join(fixtures, 'afad-events.json'), 'utf8');

describe('hata', () => {
  it('formats a KaynakHatasi with institution, reason and URL', () => {
    const r = hata(new KaynakHatasi('tcmb', 'https://t/x', 'kaynak 503 döndü', 503));
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toBe(
      'tcmb kaynağından veri alınamadı: kaynak 503 döndü (https://t/x)',
    );
  });

  it('passes a plain Error message through, and stringifies anything else', () => {
    expect(hata(new Error('düz')).content[0]?.text).toBe('düz');
    expect(hata('ham').content[0]?.text).toBe('ham');
  });
});

describe('afad helpers', () => {
  it('builds the query with a full-day window and newest-first order', () => {
    const url = sorguUrl('2026-01-01', '2026-01-02', 2.5);
    expect(url).toContain('start=2026-01-01+00%3A00%3A00');
    expect(url).toContain('end=2026-01-02+23%3A59%3A59');
    expect(url).toContain('minmag=2.5');
    expect(url).toContain('orderby=timedesc');
  });

  it('drops records without an id, time or magnitude and nulls blank fields', () => {
    const out = olaylariDonustur([
      { eventID: '1', date: '2026-01-01T00:00:00', magnitude: '4.1' },
      { eventID: '2', date: '2026-01-01T00:00:00' },
      { date: '2026-01-01T00:00:00', magnitude: '3' },
      { eventID: '4', date: '2026-01-01T00:00:00', magnitude: 'abc' },
    ]);
    expect(out.map((d) => d.id)).toEqual(['1']);
    expect(out[0]).toMatchObject({
      tur: '',
      derinlikKm: null,
      enlem: null,
      yer: '',
      il: null,
      ilce: null,
    });
  });

  it('refuses a non-list payload as a format change', () => {
    expect(() => olaylariDonustur({ events: [] })).toThrow(KaynakHatasi);
  });
});

describe('tcmb helpers', () => {
  it('maps a date to the archive path TCMB uses', () => {
    expect(bultenUrl('2026-09-15')).toBe('https://www.tcmb.gov.tr/kurlar/202609/15092026.xml');
    expect(bultenUrl()).toBe('https://www.tcmb.gov.tr/kurlar/today.xml');
  });
});

describe('server, remaining tools', () => {
  let client: Client;

  beforeEach(async () => {
    onbellegiTemizle();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('tcmb.gov.tr')) return new Response(tcmbXml);
        if (url.includes('afad.gov.tr')) return new Response(afadJson);
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

  const veri = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      structuredContent?: { veri: Record<string, unknown> };
    };
    expect(r.isError, name).toBeFalsy();
    return r.structuredContent?.veri as Record<string, unknown>;
  };

  it('tcmb_kurlar returns the whole bulletin', async () => {
    const v = await veri('tcmb_kurlar');
    expect(v.tarih).toBe('2026-09-16');
    expect((v.kurlar as unknown[]).length).toBeGreaterThan(20);
  });

  it('afad_depremler works with no arguments (defaults: last 7 days, ≥3.0, 50)', async () => {
    const v = await veri('afad_depremler');
    expect(v.minBuyukluk).toBe(3);
    expect((v.aralik as { baslangic: string }).baslangic).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('dogrula_vkn and dogrula_iban answer with the formal-validity warning', async () => {
    expect(await veri('dogrula_vkn', { vkn: '8760047464' })).toMatchObject({ gecerli: true });
    expect(await veri('dogrula_iban', { iban: 'TR33 0006 1005 1978 6457 8413 26' })).toMatchObject({
      gecerli: true,
      bankaKodu: '00061',
    });
  });

  it('plaka_il with neither argument answers with nulls and the province count', async () => {
    expect(await veri('plaka_il')).toEqual({ kod: null, il: null, toplamIl: 81 });
    expect(await veri('plaka_il', { il: 'yok böyle il' })).toMatchObject({ kod: null, il: null });
  });

  it('tatil_mi answers for a normal day and resmi_tatiller defaults to the current year', async () => {
    expect(await veri('tatil_mi', { tarih: '2026-09-16' })).toMatchObject({ isGunu: true });
    expect((await veri('resmi_tatiller')).yil).toBe(new Date().getFullYear());
  });
});
