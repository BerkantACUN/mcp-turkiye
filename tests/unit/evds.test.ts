import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { ANAHTAR_DEGISKENI, anahtar } from '../../src/sources/evds/index.js';
import {
  gozlemleriDonustur,
  kategorileriDonustur,
  anahtar as seriAnahtari,
  serileriDonustur,
  veriGruplariniDonustur,
} from '../../src/sources/evds/parse.js';

const fixtures = join(__dirname, '..', 'fixtures');
const oku = (f: string) => JSON.parse(readFileSync(join(fixtures, f), 'utf8'));
const kategoriler = oku('evds-categories.json');
const gruplar = oku('evds-datagroups-2501.json');
const seriler = oku('evds-serielist-tukfiy2025.json');
const cpi = oku('evds-series-cpi.json');
const kurlar = oku('evds-series-usd-eur.json');

describe('evds parse', () => {
  it('reads the category tree with parents (−1 becomes null)', () => {
    const k = kategorileriDonustur(kategoriler);
    expect(k.length).toBeGreaterThan(100);
    const kok = k.find((x) => x.id === 10);
    expect(kok).toMatchObject({ ad: 'BEKLENTİ VE EĞİLİM ANKETLERİ', seviye: 1, ustId: null });
    expect(k.find((x) => x.id === 1001)?.ustId).toBe(10);
    expect(kategorileriDonustur('x')).toEqual([]);
  });

  it('reads data groups with frequency and date range', () => {
    const g = veriGruplariniDonustur(gruplar);
    expect(g.map((x) => x.kod)).toEqual(['bie_dkkurbil', 'bie_dkefkytl', 'bie_dkdovytl']);
    expect(g[2]).toMatchObject({ ad: 'Döviz Kurları', frekans: 'GÜNLÜK', kategoriId: 2501 });
    expect(veriGruplariniDonustur([{}])).toEqual([]);
  });

  it('reads series and collapses the double spaces EVDS puts in names', () => {
    const s = serileriDonustur(seriler);
    expect(s[0]).toMatchObject({
      kod: 'TP.TUKFIY2025.GENEL',
      ad: 'Genel Endeks',
      veriGrubu: 'bie_tukfiy2025',
    });
    expect(s.every((x) => !x.ad.includes('  '))).toBe(true);
  });

  it('knows how EVDS mangles a series code into an item key', () => {
    expect(seriAnahtari('TP.DK.USD.S.YTL')).toBe('TP_DK_USD_S_YTL');
    expect(seriAnahtari('TP.TUKFIY2025.GENEL', 3)).toBe('TP_TUKFIY2025_GENEL-3');
  });

  it('keys observations by the requested codes, converting string values to numbers', () => {
    const { toplam, gozlemler } = gozlemleriDonustur(kurlar, [
      'TP.DK.USD.S.YTL',
      'TP.DK.EUR.S.YTL',
    ]);
    expect(toplam).toBe(7);
    const son = gozlemler[gozlemler.length - 1];
    expect(son?.tarih).toBe('16-09-2026');
    expect(son?.degerler).toEqual({ 'TP.DK.USD.S.YTL': 48.646, 'TP.DK.EUR.S.YTL': 56.1216 });
  });

  it('reads formula-suffixed keys and reports a missing series as null', () => {
    const { gozlemler } = gozlemleriDonustur(cpi, ['TP.TUKFIY2025.GENEL', 'TP.YOK'], 3);
    const son = gozlemler[gozlemler.length - 1];
    expect(son?.tarih).toBe('2026-8');
    expect(son?.degerler['TP.TUKFIY2025.GENEL']).toBeCloseTo(31.507, 2);
    expect(son?.degerler['TP.YOK']).toBeNull();
  });

  it('refuses a payload without items', () => {
    expect(() => gozlemleriDonustur({ totalCount: 0 }, ['X'])).toThrow(/items/);
  });

  it('reads the key from the environment and treats blank as absent', () => {
    expect(anahtar({ [ANAHTAR_DEGISKENI]: ' abc ' })).toBe('abc');
    expect(anahtar({ [ANAHTAR_DEGISKENI]: '  ' })).toBeNull();
    expect(anahtar({})).toBeNull();
  });
});

describe('evds tools through the server', () => {
  let client: Client;
  let gonderilenAnahtarlar: string[];

  async function baglan() {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await sunucuOlustur().connect(st);
    client = new Client({ name: 't', version: '0' });
    await client.connect(ct);
  }

  beforeEach(async () => {
    onbellegiTemizle();
    gonderilenAnahtarlar = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        gonderilenAnahtarlar.push(new Headers(init?.headers).get('key') ?? '');
        if (new Headers(init?.headers).get('key') === 'yanlis')
          return new Response('', { status: 403 });
        if (url.includes('/categories/')) return new Response(JSON.stringify(kategoriler));
        if (url.includes('/datagroups/mode=2&code=2501'))
          return new Response(JSON.stringify(gruplar));
        if (url.includes('/serieList/')) return new Response(JSON.stringify(seriler));
        if (url.includes('series=TP.TUKFIY2025.GENEL&') && url.includes('formulas=3'))
          return new Response(JSON.stringify(cpi));
        if (url.includes('series=TP.DK.USD.S.YTL-TP.DK.EUR.S.YTL'))
          return new Response(JSON.stringify(kurlar));
        return new Response('', { status: 500 });
      }),
    );
  });

  afterEach(async () => {
    await client?.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const cagir = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as unknown as {
      isError?: boolean;
      content: Array<{ text?: string }>;
      structuredContent: { kaynak: { url: string }; veri: Record<string, unknown> };
    };

  it('without a key, explains where to get one and never calls EVDS', async () => {
    vi.stubEnv(ANAHTAR_DEGISKENI, '');
    await baglan();
    const r = await cagir('evds_kategoriler');
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(
      /EVDS_API_KEY tanımlı değil.*evds3\.tcmb\.gov\.tr.*API Key Kopyala/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the key as the `key` header and never puts it in the URL or the answer', async () => {
    vi.stubEnv(ANAHTAR_DEGISKENI, 'gizli-anahtar');
    await baglan();
    const r = await cagir('evds_veri_gruplari', { kategoriId: 2501 });
    expect(r.isError).toBeFalsy();
    expect(gonderilenAnahtarlar).toEqual(['gizli-anahtar']);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).not.toContain('gizli');
    expect(JSON.stringify(r)).not.toContain('gizli-anahtar');
    expect((r.structuredContent.veri.veriGruplari as unknown[]).length).toBe(3);
  });

  it('translates a 403 into "key rejected" rather than a generic failure', async () => {
    vi.stubEnv(ANAHTAR_DEGISKENI, 'yanlis');
    await baglan();
    const r = await cagir('evds_kategoriler');
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/anahtarı reddedildi \(403\)/);
  });

  it('fetches several series at once, upper-casing codes, with EVDS-style dates in the query', async () => {
    vi.stubEnv(ANAHTAR_DEGISKENI, 'k');
    await baglan();
    const r = await cagir('evds_seri', {
      seriKodlari: ['tp.dk.usd.s.ytl', 'TP.DK.EUR.S.YTL'],
      baslangic: '2026-09-10',
      bitis: '2026-09-16',
    });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri.seriKodlari).toEqual(['TP.DK.USD.S.YTL', 'TP.DK.EUR.S.YTL']);
    expect(r.structuredContent.veri.formul).toBe('düzey');
    expect(r.structuredContent.kaynak.url).toContain('startDate=10-09-2026&endDate=16-09-2026');
    const gozlemler = r.structuredContent.veri.gozlemler as Array<{
      degerler: Record<string, number>;
    }>;
    expect(gozlemler[gozlemler.length - 1]?.degerler['TP.DK.EUR.S.YTL']).toBe(56.1216);
  });

  it('applies a formula per series and names it in the answer', async () => {
    vi.stubEnv(ANAHTAR_DEGISKENI, 'k');
    await baglan();
    const r = await cagir('evds_seri', {
      seriKodlari: ['TP.TUKFIY2025.GENEL'],
      formul: 3,
      baslangic: '2026-01-01',
      bitis: '2026-09-16',
    });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri.formul).toBe('yıllık yüzde değişim');
    expect(r.structuredContent.veri.sinir).toBe(150);
    expect(r.structuredContent.kaynak.url).toContain('formulas=3');
  });

  it('filters a data group’s series by name', async () => {
    vi.stubEnv(ANAHTAR_DEGISKENI, 'k');
    await baglan();
    const r = await cagir('evds_seriler', { veriGrubuKodu: 'bie_tukfiy2025', ara: 'GENEL' });
    expect((r.structuredContent.veri.seriler as Array<{ kod: string }>).map((s) => s.kod)).toEqual([
      'TP.TUKFIY2025.GENEL',
    ]);
  });
});
