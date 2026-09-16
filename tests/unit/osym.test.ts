import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { sonTarih, takvimiAyristir, tarihiCevir } from '../../src/sources/osym/parse.js';

const sayfa = readFileSync(join(__dirname, '..', 'fixtures', 'osym-sinav-takvimi.html'), 'utf8');

describe('osym parse', () => {
  it('converts ÖSYM dates, with or without a time, and rejects anything else', () => {
    expect(tarihiCevir('07.01.2026 14:00')).toBe('2026-01-07T14:00');
    expect(tarihiCevir(' 24.01.2026 ')).toBe('2026-01-24');
    expect(tarihiCevir('-')).toBeNull();
    expect(tarihiCevir('2026-01-24')).toBeNull();
  });

  it('reads every exam row of the calendar table', () => {
    const sinavlar = takvimiAyristir(sayfa);
    expect(sinavlar.length).toBe(86);
    const tyt = sinavlar.find((s) => s.ad === '2026-YKS 1. Oturum (TYT)');
    expect(tyt).toMatchObject({
      grup: 'YKS',
      uzunAd: 'Yükseköğretim Kurumları Sınavı',
      onBasvuru: null,
      basvuru: { baslangic: '2026-02-06', bitis: '2026-03-02' },
      gecBasvuru: { baslangic: '2026-03-10', bitis: '2026-03-12T23:59' },
      sinav: { baslangic: '2026-06-20', bitis: null },
      onBasvuruSonuc: null,
      sonuc: { baslangic: '2026-07-21T06:00', bitis: null },
      tercih: null,
      url: 'https://www.osym.gov.tr/SinavGrubu/Index/2',
    });
  });

  it('decodes the entity-encoded Turkish in names and notes', () => {
    const eyds = takvimiAyristir(sayfa).find((s) => s.ad === 'e-YDS 2026/1 İngilizce');
    expect(eyds?.uzunAd).toBe('Elektronik Yabancı Dil Sınavı');
    expect(eyds?.aciklama).toMatch(/^Elektronik Yabancı Dil Sınavları/);
  });

  it('keeps a placement-only row, whose only date is the preference window', () => {
    const yer = takvimiAyristir(sayfa).find((s) => s.ad === '2026-YKS Yerleştirme');
    expect(yer?.sinav).toBeNull();
    expect(yer?.tercih).toEqual({ baslangic: '2026-07-29T11:45', bitis: '2026-08-10T23:59' });
    expect(yer && sonTarih(yer)).toBe('2026-08-10');
  });

  it('refuses a page without the calendar table', () => {
    expect(() => takvimiAyristir('<html><table></table></html>')).toThrow(/takvimi tablosu/);
  });
});

describe('osym_sinav_takvimi through the server', () => {
  let client: Client;

  beforeEach(async () => {
    onbellegiTemizle();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-17T09:00:00Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input) === 'https://www.osym.gov.tr/Sayfa/SinavTakvimi'
          ? new Response(sayfa)
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
    (await client.callTool({ name: 'osym_sinav_takvimi', arguments: args })) as unknown as {
      isError?: boolean;
      content: Array<{ text?: string }>;
      structuredContent: {
        kaynak: { id: string; url: string };
        veri: {
          filtre: string | null;
          yalnizGelecek: boolean;
          toplam: number;
          sinavlar: Array<{ ad: string; sinav: { baslangic: string } | null }>;
        };
      };
    };

  it('by default shows only rows with a step still ahead, in calendar order', async () => {
    const r = await cagir({});
    expect(r.isError).toBeFalsy();
    const { veri } = r.structuredContent;
    expect(veri.yalnizGelecek).toBe(true);
    expect(veri.toplam).toBeGreaterThan(0);
    expect(veri.toplam).toBeLessThan(86);
    expect(veri.sinavlar.some((s) => s.ad === '2026-YKS 1. Oturum (TYT)')).toBe(false);
    expect(veri.sinavlar.some((s) => s.ad === '2026-ALES/3')).toBe(true);
    expect(r.structuredContent.kaynak.url).toBe('https://www.osym.gov.tr/Sayfa/SinavTakvimi');
  });

  it('filters by exam name Turkish case-insensitively and can include the past', async () => {
    const gelecek = await cagir({ ara: 'kpss lisans' });
    expect(gelecek.structuredContent.veri.filtre).toBe('kpss lisans');
    expect(gelecek.structuredContent.veri.sinavlar.every((s) => /KPSS Lisans/.test(s.ad))).toBe(
      true,
    );
    // The 6 September session is behind us; its results (7 October) are not.
    expect(gelecek.structuredContent.veri.toplam).toBe(3);
    const hepsi = await cagir({ ara: 'YKS', yalnizGelecek: false, limit: 2 });
    expect(hepsi.structuredContent.veri.toplam).toBe(6);
    expect(hepsi.structuredContent.veri.sinavlar).toHaveLength(2);
    expect(hepsi.structuredContent.veri.sinavlar[0]?.sinav?.baslangic).toBe('2026-06-20');
  });

  it('names ÖSYM when the page cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>bakim</html>')),
    );
    const r = await cagir({});
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/^osym kaynağından veri alınamadı: .*takvimi tablosu/);
  });
});
