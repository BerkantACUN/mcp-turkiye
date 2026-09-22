import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { sadelestir } from '../../src/core/metin.js';
import { sunucuOlustur } from '../../src/server.js';
import { kurlariDonustur } from '../../src/sources/btcturk/index.js';
import { haberleriAyristir } from '../../src/sources/haber/index.js';
import { eczaneleriDonustur } from '../../src/sources/ibb/eczane.js';
import { istasyonlariDonustur, olcumleriDonustur } from '../../src/sources/ibb/havakalitesi.js';
import {
  duyurulariDonustur,
  hatlariDonustur,
  istasyonlariDonustur as metroIstasyonlari,
} from '../../src/sources/ibb/metro.js';
import { otoparklariDonustur, otoparklariSec } from '../../src/sources/ibb/otopark.js';
import {
  halFiyatlariniDonustur,
  eczaneleriDonustur as izmirEczaneleri,
  otobusleriDonustur,
} from '../../src/sources/izmir/index.js';

describe('yeni kaynaklar: eksik ve bozuk alanlar', () => {
  it('sadelestir folds Turkish letters and whitespace', () => {
    expect(sadelestir('  İSTANBUL  Kadıköy ')).toBe('istanbul kadikoy');
    expect(sadelestir('Çorum Şile Ğ â')).toBe('corum sile g a');
  });

  it('İBB pharmacies without coordinates or phone, rows without a name dropped', () => {
    const e = eczaneleriDonustur({
      ArrayOfAramaList: {
        AramaList: [
          { ADI: ' X ECZANESİ', ADRES: 'a', TELEFON: '', LON: '0', LAT: 'abc', ILCEADI: 'ŞİŞLİ' },
          { ADI: '', ADRES: 'b' },
          { ADRES: 'c' },
        ],
      },
    });
    expect(e).toEqual([
      { ad: 'X ECZANESİ', ilce: 'Şişli', adres: 'a', telefon: null, enlem: null, boylam: null },
    ]);
  });

  it('car parks with missing numbers and no coordinates', () => {
    const o = otoparklariDonustur([
      { parkID: 1, parkName: 'A', lat: '', lng: 'x' },
      { parkID: 'no', parkName: 'B' },
      { parkName: 'C' },
    ]);
    expect(o).toEqual([
      {
        id: 1,
        ad: 'A',
        ilce: '',
        tur: '',
        kapasite: 0,
        bosYer: 0,
        dolulukYuzde: null,
        acik: false,
        calismaSaatleri: '',
        ucretsizDakika: null,
        enlem: null,
        boylam: null,
      },
    ]);
    expect(otoparklariSec(o, { enlem: 41, boylam: 29 })).toEqual([]);
    expect(otoparklariSec(o, { sadeceAcik: true })).toEqual([]);
  });

  it('air-quality stations without POINT and readings without AQI block', () => {
    expect(istasyonlariDonustur([{ Id: 'a', Name: 'N' }, { Name: 'x' }])).toEqual([
      { id: 'a', ad: 'N', adres: '', enlem: null, boylam: null },
    ]);
    const o = olcumleriDonustur([{ ReadTime: 't' }, { Foo: 1 }]);
    expect(o.length).toBe(1);
    expect(o[0]?.endeks).toBeNull();
    expect(o[0]?.derisim.PM10).toBeNull();
  });

  it('metro rows with missing details, inactive line, colour absent', () => {
    const h = hatlariDonustur({
      Data: [{ Id: 1, Name: 'X', IsActive: false, Color: null }, { Id: 2 }],
    });
    expect(h).toEqual([
      { id: 1, ad: 'X', aciklama: '', aktif: false, ilkSefer: null, sonSefer: null, renk: null },
    ]);
    const i = metroIstasyonlari({
      Data: [{ Id: 5, Name: 'YENIKAPI', Description: ' ', DetailInfo: null }],
    });
    expect(i[0]).toMatchObject({ ad: 'YENIKAPI', hat: '', sira: 0, enlem: null, tuvalet: false });
    expect(duyurulariDonustur({ Data: [{ Id: 1, Title: ' T ' }, { Id: 'x' }] })).toEqual([
      { id: 1, baslik: 'T', metin: '', baslangic: null },
    ]);
  });

  it('İzmir rows with numeric coordinates, missing prices and non-numeric line numbers', () => {
    const e = izmirEczaneleri([
      { Adi: 'E', LokasyonX: 38.4, LokasyonY: '', Bolge: 'B' },
      { Adi: '' },
    ]);
    expect(e[0]).toMatchObject({ enlem: 38.4, boylam: null, telefon: null, tarih: null });
    const { fiyatlar } = halFiyatlariniDonustur(
      { HalFiyatListesi: [{ MalAdi: 'A  B', AsgariUcret: 'x' }, { MalAdi: '' }] },
      'u',
    );
    expect(fiyatlar).toEqual([
      { mal: 'A B', tip: '', birim: '', asgari: 0, azami: 0, ortalama: 0 },
    ]);
    expect(halFiyatlariniDonustur(undefined, 'u').fiyatlar).toEqual([]);
    expect(
      otobusleriDonustur([{ HatNumarasi: '5' }, { HatNumarasi: 7, KoorX: 'abc' }], 'u'),
    ).toEqual([
      {
        hatNo: 7,
        hatAdi: '',
        otobusId: 0,
        kalanDurak: 0,
        yon: 0,
        engelliErisimi: false,
        bisikletAparati: false,
        enlem: null,
        boylam: null,
      },
    ]);
  });

  it('crypto rows without numbers, RSS items without date or link', () => {
    const k = kurlariDonustur({ data: [{ pair: 'ATRY', last: 1 }, { pair: 'B' }] });
    expect(k[0]).toMatchObject({ varlik: '', paraBirimi: '', alis: null, zaman: null });
    expect(k.length).toBe(1);
    const h = haberleriAyristir(
      '<rss><channel><item><title>A</title><link>u</link><pubDate>garbage</pubDate></item><item><title>B</title></item><item><title><![CDATA[C &amp; D]]></title><link>v</link></item></channel></rss>',
      'u',
    );
    expect(h).toEqual([
      { baslik: 'A', ozet: '', url: 'u', yayin: null },
      { baslik: 'C & D', ozet: '', url: 'v', yayin: null },
    ]);
  });
});

describe('yeni kaynaklar: kaynak yanıt vermeyince', () => {
  let client: Client;

  beforeEach(async () => {
    onbellegiTemizle();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('halfiyatlari')) return new Response('{"BultenTarihi":"x"}');
        return new Response('yok', { status: 503 });
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

  it.each([
    ['ibb_nobetci_eczane', {}],
    ['ibb_otopark', {}],
    ['ibb_otopark_detay', { id: 3 }],
    ['ibb_hava_kalitesi', {}],
    ['ibb_metro', {}],
    ['ibb_metro_duyurular', {}],
    ['izmir_nobetci_eczane', {}],
    ['izmir_hal_fiyatlari', {}],
    ['izmir_otobus', { durakId: 1 }],
    ['btcturk_kripto', {}],
    ['haber_basliklari', { kaynak: 'trt' }],
  ])('%s reports the institution instead of inventing data', async (name, args) => {
    const r = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: Array<{ text?: string }>;
    };
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/kaynağından veri alınamadı|değişmiş|yok/);
  });
});
