import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { merkezUrl } from '../../src/sources/mgm/index.js';
import {
  gunlukTahminiDonustur,
  HADISE,
  hadiseAdi,
  merkezleriDonustur,
  sonDurumuDonustur,
} from '../../src/sources/mgm/parse.js';

const fixtures = join(__dirname, '..', 'fixtures');
const oku = (f: string) => readFileSync(join(fixtures, f), 'utf8');
const merkezler = JSON.parse(oku('mgm-merkezler-ankara.json'));
const sonDurum = JSON.parse(oku('mgm-sondurum-ankara.json'));
const gunluk = JSON.parse(oku('mgm-gunluk-ankara.json'));

describe('mgm parse', () => {
  it('reads the centre MGM serves a province from', () => {
    const m = merkezleriDonustur(merkezler);
    expect(m[0]).toMatchObject({
      merkezId: 90601,
      il: 'Ankara',
      ilce: 'Keçiören',
      yukseklik: 891,
      gunlukTahminIstNo: 90601,
    });
    expect(merkezleriDonustur('not a list')).toEqual([]);
    expect(merkezleriDonustur([{ il: 'x' }])).toEqual([]);
  });

  it('normalises current conditions and turns the -9999 sentinel into null', () => {
    const s = sonDurumuDonustur(sonDurum);
    expect(s).toMatchObject({
      sicaklik: 22.5,
      nem: 55,
      ruzgarHizKmSaat: 12.96,
      basincHpa: 1009.8,
      hadiseKodu: 'CB',
      hadise: 'Çok Bulutlu',
      veriZamani: '2026-09-16T15:19:00.000Z',
    });
    expect(sonDurumuDonustur([{ istNo: 1, sicaklik: -9999 }])?.sicaklik).toBeNull();
    expect(sonDurumuDonustur([])).toBeNull();
  });

  it('unrolls the day-suffixed forecast keys into ordered days with readable conditions', () => {
    const g = gunlukTahminiDonustur(gunluk);
    expect(g.length).toBeGreaterThanOrEqual(5);
    expect(g[0]).toMatchObject({
      tarih: '2026-09-17',
      enDusuk: 13,
      enYuksek: 23,
      hadiseKodu: 'KGY',
      hadise: 'Kuvvetli Gökgürültülü Sağanak Yağışlı',
      nemAralik: [53, 96],
    });
    expect(g[2]?.hadise).toBe('Parçalı Bulutlu');
    expect(gunlukTahminiDonustur(null)).toEqual([]);
  });

  it('passes an unknown condition code through rather than dropping it', () => {
    expect(hadiseAdi('ZZZ')).toBe('ZZZ');
    expect(hadiseAdi('')).toBeNull();
    expect(hadiseAdi(undefined)).toBeNull();
    expect(Object.keys(HADISE).length).toBeGreaterThan(25);
  });

  it('builds the centre lookup URL with an optional district', () => {
    expect(merkezUrl('Ankara')).toBe('https://servis.mgm.gov.tr/web/merkezler?il=Ankara');
    expect(merkezUrl('İstanbul', 'Kadıköy')).toContain('ilce=Kad%C4%B1k%C3%B6y');
  });
});

describe('mgm_hava_durumu through the server', () => {
  let client: Client;

  beforeEach(async () => {
    onbellegiTemizle();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        // MGM refuses requests without its own Origin; the stub does too.
        const h = new Headers(init?.headers);
        if (h.get('origin') !== 'https://www.mgm.gov.tr') return new Response('', { status: 403 });
        if (url.includes('/merkezler?il=Nowhere')) return new Response('[]');
        if (url.includes('/merkezler?')) return new Response(JSON.stringify(merkezler));
        if (url.includes('/sondurumlar?merkezid=90601'))
          return new Response(JSON.stringify(sonDurum));
        if (url.includes('/tahminler/gunluk?istno=90601'))
          return new Response(JSON.stringify(gunluk));
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

  it('answers with centre, current conditions and forecast, citing the MGM page', async () => {
    const r = (await client.callTool({
      name: 'mgm_hava_durumu',
      arguments: { il: 'Ankara' },
    })) as unknown as {
      isError?: boolean;
      structuredContent: { kaynak: { url: string }; veri: Record<string, unknown> };
    };
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri.merkez).toMatchObject({ il: 'Ankara', ilce: 'Keçiören' });
    expect((r.structuredContent.veri.sonDurum as { hadise: string }).hadise).toBe('Çok Bulutlu');
    expect((r.structuredContent.veri.tahmin as unknown[]).length).toBeGreaterThanOrEqual(5);
    expect(r.structuredContent.kaynak.url).toContain(
      'mgm.gov.tr/tahmin/il-ve-ilceler.aspx?il=Ankara',
    );
  });

  it('tells the user when MGM knows no such place', async () => {
    const r = (await client.callTool({
      name: 'mgm_hava_durumu',
      arguments: { il: 'Nowhere' },
    })) as {
      isError?: boolean;
      content: Array<{ text?: string }>;
    };
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/merkez bulamadı/);
  });
});
