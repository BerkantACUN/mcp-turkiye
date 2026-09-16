import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { gazeteAdresiMi } from '../../src/sources/resmigazete/index.js';
import {
  FihristBicimHatasi,
  fihristiAyristir,
  gazeteUrl,
  maddeMetniniCikar,
} from '../../src/sources/resmigazete/parse.js';

const fixtures = join(__dirname, '..', 'fixtures');
// The Gazette is served as windows-1254; the fixtures are the raw bytes.
const decode = (f: string) =>
  new TextDecoder('windows-1254').decode(readFileSync(join(fixtures, f)));
const gun16 = decode('rg-20260916.html');
const gun13 = decode('rg-20260913.html');

describe('fihristiAyristir', () => {
  it('reads the date, issue number and every item under its part and kind', () => {
    const f = fihristiAyristir(gun16, '2026-09-16');
    expect(f.tarih).toBe('2026-09-16');
    expect(f.sayi).toBe('33372');
    expect(f.toplamMadde).toBe(10);
    expect(f.bolumler.map((b) => [b.bolum, b.tur, b.maddeler.length])).toEqual([
      ['YÜRÜTME VE İDARE BÖLÜMÜ', 'YÖNETMELİKLER', 3],
      ['YÜRÜTME VE İDARE BÖLÜMÜ', 'TEBLİĞLER', 6],
      ['YÜRÜTME VE İDARE BÖLÜMÜ', 'KURUL KARARI', 1],
    ]);
  });

  it('joins a title wrapped over several lines and strips the leading dash', () => {
    const f = fihristiAyristir(gun16, '2026-09-16');
    const ilk = f.bolumler[0]?.maddeler[0];
    expect(ilk?.baslik).toBe(
      'Hava Kalitesinin Korunması Amacıyla Katı Yakıtların Kontrolü Yönetmeliği',
    );
    expect(ilk?.url).toBe('https://www.resmigazete.gov.tr/eskiler/2026/09/20260916-1.htm');
    expect(ilk?.bicim).toBe('htm');
    expect(f.bolumler[1]?.maddeler[0]?.bicim).toBe('pdf');
  });

  it('joins a part title the page wraps ("YÜRÜTME" / "VE İDARE BÖLÜMÜ")', () => {
    const f = fihristiAyristir(gun13, '2026-09-13');
    expect(f.sayi).toBe('33369');
    expect(f.bolumler[0]?.bolum).toBe('YÜRÜTME VE İDARE BÖLÜMÜ');
    expect(f.bolumler[0]?.tur).toBe('YÖNETMELİKLER');
    expect(f.toplamMadde).toBe(8);
  });

  it('leaves the issue cover PDF and the ilânlar gateway out of the items', () => {
    const f = fihristiAyristir(gun16, '2026-09-16');
    const urls = f.bolumler.flatMap((b) => b.maddeler.map((m) => m.url));
    expect(urls.some((u) => u.endsWith('/20260916.pdf'))).toBe(false);
    expect(urls.some((u) => u.includes('main.aspx'))).toBe(false);
  });

  it('refuses a page without the date/issue line', () => {
    expect(() =>
      fihristiAyristir('<html><body>Bakım çalışması</body></html>', '2026-01-01'),
    ).toThrow(FihristBicimHatasi);
  });

  it('builds archive URLs the way the Gazette lays them out', () => {
    expect(gazeteUrl('2026-09-16')).toBe(
      'https://www.resmigazete.gov.tr/eskiler/2026/09/20260916.htm',
    );
    expect(gazeteUrl('2026-09-16', '20260916-3.htm')).toBe(
      'https://www.resmigazete.gov.tr/eskiler/2026/09/20260916-3.htm',
    );
  });
});

describe('maddeMetniniCikar', () => {
  it('turns an article page into line-broken plain text without tags or entities', () => {
    const html =
      '<html><body><p class="x">MADDE 1 &#8211; (1) Bu Y&#246;netmeliğin amacı;</p><p>hava kalitesini korumaktır.</p><script>x()</script></body></html>';
    expect(maddeMetniniCikar(html)).toBe(
      'MADDE 1 – (1) Bu Yönetmeliğin amacı;\nhava kalitesini korumaktır.',
    );
  });
});

describe('gazeteAdresiMi', () => {
  it('accepts only https on the Gazette host', () => {
    expect(gazeteAdresiMi('https://www.resmigazete.gov.tr/eskiler/2026/09/20260916-1.htm')).toBe(
      true,
    );
    expect(gazeteAdresiMi('http://www.resmigazete.gov.tr/x.htm')).toBe(false);
    expect(gazeteAdresiMi('https://resmigazete.gov.tr.evil.example/x.htm')).toBe(false);
    expect(gazeteAdresiMi('not a url')).toBe(false);
  });
});

describe('resmi_gazete tools through the server', () => {
  let client: Client;
  const bytes16 = readFileSync(join(fixtures, 'rg-20260916.html'));

  beforeEach(async () => {
    onbellegiTemizle();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/20260916.htm')) return new Response(bytes16);
        if (url.endsWith('/20260914.htm')) return new Response('', { status: 404 });
        if (url.endsWith('/20260916-1.htm'))
          return new Response(
            Buffer.from('<html><body><p>MADDE 1</p><p>Metin.</p></body></html>', 'latin1'),
          );
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

  it('returns the day’s index with the issue URL as citation', async () => {
    const r = await cagir('resmi_gazete_fihrist', { tarih: '2026-09-16' });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri.sayi).toBe('33372');
    expect(r.structuredContent.kaynak.url).toBe(
      'https://www.resmigazete.gov.tr/eskiler/2026/09/20260916.htm',
    );
  });

  it('explains a day with no issue instead of a bare 404', async () => {
    const r = await cagir('resmi_gazete_fihrist', { tarih: '2026-09-14' });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/2026-09-14 tarihli Resmî Gazete bulunamadı/);
  });

  it('reads an article as plain text with paging fields', async () => {
    const r = await cagir('resmi_gazete_metin', {
      url: 'https://www.resmigazete.gov.tr/eskiler/2026/09/20260916-1.htm',
    });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri).toMatchObject({
      metin: 'MADDE 1\nMetin.',
      devamVar: false,
      baslangic: 0,
    });
  });

  it('refuses to fetch anything off the Gazette host, and does not fetch PDFs', async () => {
    const dis = await cagir('resmi_gazete_metin', { url: 'https://example.com/20260916-1.htm' });
    expect(dis.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    const pdf = await cagir('resmi_gazete_metin', {
      url: 'https://www.resmigazete.gov.tr/eskiler/2026/09/20260916-4.pdf',
    });
    expect(pdf.isError).toBe(true);
    expect(pdf.content[0]?.text).toMatch(/PDF/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
