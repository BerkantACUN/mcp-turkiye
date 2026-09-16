import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';

/**
 * The whole server, driven through a real MCP client over an in-memory
 * transport, with the network replaced by fixtures. What is under test is
 * the contract a client sees: tool names, the envelope, and that a source
 * failure comes back as a tool error naming the institution — never as a
 * made-up value.
 */
const fixtures = join(__dirname, '..', 'fixtures');
const tcmbXml = readFileSync(join(fixtures, 'tcmb-today.xml'), 'utf8');
const afadJson = readFileSync(join(fixtures, 'afad-events.json'), 'utf8');

type Zarf = {
  kaynak: { id: string; ad: string; url: string };
  alindi: string;
  veri: Record<string, unknown>;
};

let client: Client;

async function baglan() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = sunucuOlustur();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientTransport);
}

async function cagir(name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    structuredContent?: Zarf;
    content: Array<{ type: string; text?: string }>;
  };
  return r;
}

beforeEach(async () => {
  onbellegiTemizle();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('tcmb.gov.tr/kurlar/today.xml')) return new Response(tcmbXml);
      if (url.includes('tcmb.gov.tr/kurlar/202609/')) return new Response('', { status: 404 });
      if (url.includes('deprem.afad.gov.tr')) return new Response(afadJson);
      return new Response('', { status: 500 });
    }),
  );
  await baglan();
});

afterEach(async () => {
  await client.close();
  vi.unstubAllGlobals();
});

describe('mcp-turkiye server', () => {
  it('lists every tool of every source, prefixed by its source', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'tcmb_kurlar',
      'tcmb_kur',
      'bist_hisse',
      'afad_depremler',
      'mgm_hava_durumu',
      'opet_akaryakit',
      'ibb_trafik_indeksi',
      'acikveri_ara',
      'acikveri_veriseti',
      'acikveri_kayitlar',
      'resmi_gazete_fihrist',
      'resmi_gazete_metin',
      'resmi_tatiller',
      'tatil_mi',
      'dogrula_tckn',
      'dogrula_vkn',
      'dogrula_iban',
      'plaka_il',
    ]);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.description, t.name).toBeTruthy();
    }
  });

  it('answers with the envelope: source, fetch time, data', async () => {
    const r = await cagir('tcmb_kur', { kod: 'usd' });
    expect(r.isError).toBeFalsy();
    const zarf = r.structuredContent as Zarf;
    expect(zarf.kaynak).toEqual({
      id: 'tcmb',
      ad: 'Türkiye Cumhuriyet Merkez Bankası',
      url: 'https://www.tcmb.gov.tr/kurlar/today.xml',
    });
    expect(Date.parse(zarf.alindi)).not.toBeNaN();
    expect(zarf.veri).toMatchObject({
      tarih: '2026-09-16',
      kur: { kod: 'USD', dovizSatis: 48.6654 },
    });
    // Text content is the same envelope, for clients that ignore structured content.
    expect(JSON.parse(r.content[0]?.text ?? '')).toEqual(zarf);
  });

  it('names the missing currency and lists what the bulletin has', async () => {
    const r = await cagir('tcmb_kur', { kod: 'XYZ' });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/XYZ bu bültende yok.*USD/);
  });

  it('explains a missing dated bulletin as a non-business day, not as an outage', async () => {
    const r = await cagir('tcmb_kurlar', { tarih: '2026-09-13' });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/hafta sonu ve resmî tatillerde bülten yayımlamaz/);
  });

  it('normalises AFAD events into numbers and keeps the query URL as the citation', async () => {
    const r = await cagir('afad_depremler', {
      baslangic: '2026-09-14',
      bitis: '2026-09-16',
      limit: 3,
    });
    const zarf = r.structuredContent as Zarf;
    const veri = zarf.veri as { toplam: number; depremler: Array<Record<string, unknown>> };
    expect(veri.toplam).toBe(8);
    expect(veri.depremler).toHaveLength(3);
    expect(veri.depremler[0]).toMatchObject({
      buyukluk: 3.4,
      il: 'Muğla',
      ilce: 'Bodrum',
      derinlikKm: 8.89,
    });
    expect(zarf.kaynak.url).toContain('deprem.afad.gov.tr/apiv2/event/filter?start=2026-09-14');
  });

  it('turns a source outage into a tool error that names the institution', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('down', { status: 502 }));
    const r = await cagir('afad_depremler', {});
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/^afad kaynağından veri alınamadı: kaynak 502 döndü/);
  });

  it('validates offline without touching fetch, and says validity is only formal', async () => {
    vi.mocked(fetch).mockClear();
    const r = await cagir('dogrula_tckn', { tckn: '10000000146' });
    expect(fetch).not.toHaveBeenCalled();
    const veri = (r.structuredContent as Zarf).veri as { gecerli: boolean; uyari: string };
    expect(veri.gecerli).toBe(true);
    expect(veri.uyari).toMatch(/gerçek bir kişiye\/kuruma ait olduğu anlamına gelmez/);
  });

  it('resolves plate codes both ways', async () => {
    expect(((await cagir('plaka_il', { kod: 6 })).structuredContent as Zarf).veri).toMatchObject({
      il: 'Ankara',
    });
    expect(
      ((await cagir('plaka_il', { il: 'izmir' })).structuredContent as Zarf).veri,
    ).toMatchObject({
      kod: 35,
      il: 'İzmir',
    });
  });

  it('reports holidays with the religious-calendar coverage flag', async () => {
    const veri = ((await cagir('resmi_tatiller', { yil: 2027 })).structuredContent as Zarf)
      .veri as {
      diniBayramlarDahil: boolean;
      tatiller: Array<{ ad: string }>;
    };
    expect(veri.diniBayramlarDahil).toBe(true);
    expect(veri.tatiller.some((t) => t.ad === 'Kurban Bayramı 1. Gün')).toBe(true);
  });

  it('rejects an impossible date on tatil_mi', async () => {
    const r = await cagir('tatil_mi', { tarih: '2026-13-45' });
    expect(r.isError).toBe(true);
  });
});
