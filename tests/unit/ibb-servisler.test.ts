import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onbellegiTemizle } from '../../src/core/http.js';
import { sunucuOlustur } from '../../src/server.js';
import { eczaneleriDonustur } from '../../src/sources/ibb/eczane.js';
import {
  istasyonlariDonustur,
  olcumleriDonustur,
  olcumUrl,
  son24Saat,
  sonOlcum,
} from '../../src/sources/ibb/havakalitesi.js';
import {
  duyurulariDonustur,
  hatlariDonustur,
  istasyonlariDonustur as metroIstasyonlari,
} from '../../src/sources/ibb/metro.js';
import { otoparklariDonustur, otoparklariSec, uzaklikKm } from '../../src/sources/ibb/otopark.js';

const fixtures = join(__dirname, '..', 'fixtures');
const oku = (f: string) => JSON.parse(readFileSync(join(fixtures, f), 'utf8'));
const eczane = oku('ibb-eczane.json');
const ispark = oku('ibb-ispark.json');
const isparkDetay = oku('ibb-ispark-detay.json');
const aqiIstasyonlar = oku('ibb-aqi-istasyonlar.json');
const aqiMaslak = oku('ibb-aqi-maslak.json');
const metroHatlar = oku('ibb-metro-hatlar.json');
const metroIstasyonlarHam = oku('ibb-metro-istasyonlar.json');
const metroDuyurular = oku('ibb-metro-duyurular.json');

describe('İBB parse', () => {
  it('pharmacies: title-cased district, numeric coordinates, sorted by district then name', () => {
    const e = eczaneleriDonustur(eczane);
    expect(e.length).toBe(12);
    expect(e[0]).toMatchObject({ ilce: 'Adalar', telefon: expect.stringMatching(/^\+90/) });
    expect(e[0]?.enlem).toBeGreaterThan(40);
    expect(e.map((x) => x.ilce)).toEqual(
      [...e.map((x) => x.ilce)].sort((a, b) => a.localeCompare(b, 'tr')),
    );
    expect(() => eczaneleriDonustur({})).toThrow(/AramaList/);
  });

  it('car parks: occupancy percentage, open flag, distance ordering and filters', () => {
    const o = otoparklariDonustur(ispark);
    expect(o.length).toBe(12);
    const ilk = o.find((p) => p.id === 3068);
    expect(ilk).toMatchObject({ ilce: 'ÜMRANİYE', kapasite: 1029, acik: true, ucretsizDakika: 15 });
    expect(ilk?.dolulukYuzde).toBeCloseTo(((1029 - (ilk?.bosYer ?? 0)) / 1029) * 100, 0);
    expect(otoparklariSec(o, { ilce: 'umraniye' }).every((p) => p.ilce === 'ÜMRANİYE')).toBe(true);
    expect(otoparklariSec(o, { ara: 'şehitler' })[0]?.id).toBe(3068);
    const yakin = otoparklariSec(o, { enlem: 41.0246, boylam: 29.0915, limit: 3 });
    expect(yakin[0]?.id).toBe(3068);
    expect(yakin[0]?.uzaklikKm).toBe(0);
    expect(yakin.map((p) => p.uzaklikKm ?? 0)).toEqual(
      [...yakin.map((p) => p.uzaklikKm ?? 0)].sort((a, b) => a - b),
    );
    expect(otoparklariSec(o, {}).map((p) => p.bosYer)).toEqual(
      [...o.map((p) => p.bosYer)].sort((a, b) => b - a).slice(0, 30),
    );
    expect(uzaklikKm(41.0, 29.0, 41.0, 29.0)).toBe(0);
    expect(Math.round(uzaklikKm(41.0082, 28.9784, 39.9334, 32.8597))).toBe(349);
    expect(() => otoparklariDonustur({})).toThrow(/liste/);
  });

  it('air quality: stations with parsed POINT, readings with AQI and pollutants, latest non-null', () => {
    const s = istasyonlariDonustur(aqiIstasyonlar);
    expect(s.length).toBe(28);
    const maslak = s.find((x) => x.ad === 'Maslak');
    expect(maslak?.enlem).toBeCloseTo(41.1, 1);
    expect(maslak?.boylam).toBeCloseTo(29.02, 1);
    const o = olcumleriDonustur(aqiMaslak);
    expect(o.length).toBe(6);
    expect(['PM10', 'SO2', 'O3', 'NO2', 'CO']).toContain(o[0]?.baskinKirletici);
    expect(o[0]?.renk).toMatch(/^#/);
    expect(Object.keys(o[0]?.derisim ?? {})).toEqual(['PM10', 'SO2', 'O3', 'NO2', 'CO']);
    const dolu = o.filter((x) => x.endeks !== null);
    expect(sonOlcum(o)?.zaman).toBe(dolu[dolu.length - 1]?.zaman);
    expect(sonOlcum(o)?.endeks).not.toBeNull();
    expect(sonOlcum([])).toBeNull();
    expect(olcumleriDonustur('x')).toEqual([]);
    const [b, e] = son24Saat(new Date(2026, 8, 21, 9, 17, 30));
    expect(e.getMinutes()).toBe(0);
    expect(e.getHours()).toBe(10);
    expect((e.getTime() - b.getTime()) / 3_600_000).toBe(25);
    expect(olcumUrl('abc', new Date(2026, 8, 21, 0, 0), new Date(2026, 8, 21, 9, 5))).toBe(
      'https://api.ibb.gov.tr/havakalitesi/OpenDataPortalHandler/GetAQIByStationId?StationId=abc&StartDate=21.09.2026%2000:00:00&EndDate=21.09.2026%2009:05:00',
    );
  });

  it('metro: lines with first/last train and rgb colour, stations ordered per line, announcements', () => {
    const h = hatlariDonustur(metroHatlar);
    expect(h.map((x) => x.ad)).toEqual(['F1', 'F4', 'M1A', 'M1B', 'M2', 'M3']);
    const m2 = h.find((x) => x.ad === 'M2');
    expect(m2).toMatchObject({
      ilkSefer: '05:57',
      sonSefer: '00:00',
      renk: 'rgb(0,153,68)',
      aktif: true,
    });
    const i = metroIstasyonlari(metroIstasyonlarHam);
    const m2i = i.filter((x) => x.hat === 'M2');
    expect(m2i[0]?.ad).toBe('Yenikapı');
    expect(m2i.map((x) => x.sira)).toEqual([...m2i.map((x) => x.sira)].sort((a, b) => a - b));
    expect(m2i[0]?.tuvalet).toBe(true);
    const d = duyurulariDonustur(metroDuyurular);
    expect(d[0]?.baslik).toContain('M7');
    expect(d[0]?.metin).not.toMatch(/\s{2,}/);
    expect(() => hatlariDonustur({ Success: false })).toThrow(/Data/);
  });
});

describe('İBB tools through the server', () => {
  let client: Client;

  beforeEach(async () => {
    onbellegiTemizle();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('cbsproxy.ibb.gov.tr')) return new Response(JSON.stringify(eczane));
        if (url.includes('ispark/ParkDetay?id=3068'))
          return new Response(JSON.stringify(isparkDetay));
        if (url.includes('ispark/ParkDetay')) return new Response('[]');
        if (url.includes('ispark/Park')) return new Response(JSON.stringify(ispark));
        if (url.includes('GetAQIStations')) return new Response(JSON.stringify(aqiIstasyonlar));
        if (url.includes('GetAQIByStationId?StationId=6b7a9840'))
          return new Response(JSON.stringify(aqiMaslak));
        if (url.includes('GetAQIByStationId')) return new Response('[]');
        if (url.includes('GetLines')) return new Response(JSON.stringify(metroHatlar));
        if (url.includes('GetStations')) return new Response(JSON.stringify(metroIstasyonlarHam));
        if (url.includes('GetAnnouncements')) return new Response(JSON.stringify(metroDuyurular));
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
      structuredContent: { kaynak: { url: string; ad: string }; veri: Record<string, unknown> };
    };

  it('lists on-duty pharmacies, filters by district, names the districts on a miss', async () => {
    const r = await cagir('ibb_nobetci_eczane', {});
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.veri.sayi).toBe(12);
    expect(r.structuredContent.kaynak.ad).toContain('İBB');
    const a = await cagir('ibb_nobetci_eczane', { ilce: 'adalar' });
    expect(a.structuredContent.veri.sayi).toBeGreaterThan(0);
    const yok = await cagir('ibb_nobetci_eczane', { ilce: 'Kadıköy' });
    expect(yok.isError).toBe(true);
    expect(yok.content[0]?.text).toContain('Adalar');
  });

  it('answers car parks nearest first and the detail with tariff but without the polygon', async () => {
    const r = await cagir('ibb_otopark', { enlem: 41.02, boylam: 29.09, limit: 2 });
    expect(r.isError).toBeFalsy();
    const liste = r.structuredContent.veri.otoparklar as Array<{ uzaklikKm: number }>;
    expect(liste.length).toBe(2);
    expect(liste[0]?.uzaklikKm).toBeLessThanOrEqual(liste[1]?.uzaklikKm ?? 0);
    const d = await cagir('ibb_otopark_detay', { id: 3068 });
    expect(d.structuredContent.veri.tariff).toContain('Saat');
    expect(d.structuredContent.veri.areaPolygon).toBeUndefined();
    expect((await cagir('ibb_otopark_detay', { id: 1 })).isError).toBe(true);
    expect((await cagir('ibb_otopark', { ilce: 'yok' })).isError).toBe(true);
  });

  it('air quality: one station gives a series, a bad name lists the stations', async () => {
    const r = await cagir('ibb_hava_kalitesi', { istasyon: 'maslak' });
    expect(r.isError).toBeFalsy();
    const istasyonlar = r.structuredContent.veri.istasyonlar as Array<{ son: { endeks: number } }>;
    expect(istasyonlar.length).toBe(1);
    expect(istasyonlar[0]?.son.endeks).toBeTypeOf('number');
    expect((r.structuredContent.veri.seri as unknown[]).length).toBe(6);
    const hepsi = await cagir('ibb_hava_kalitesi', {});
    expect((hepsi.structuredContent.veri.istasyonlar as unknown[]).length).toBe(28);
    expect(hepsi.structuredContent.veri.seri).toBeUndefined();
    const yok = await cagir('ibb_hava_kalitesi', { istasyon: 'Mars' });
    expect(yok.isError).toBe(true);
    expect(yok.content[0]?.text).toContain('Maslak');
  });

  it('metro: lines, then stations of one line, announcements filtered', async () => {
    const r = await cagir('ibb_metro', {});
    expect((r.structuredContent.veri.hatlar as unknown[]).length).toBe(6);
    const m2 = await cagir('ibb_metro', { hat: 'm2' });
    expect((m2.structuredContent.veri.istasyonlar as Array<{ ad: string }>)[0]?.ad).toBe(
      'Yenikapı',
    );
    expect((await cagir('ibb_metro', { hat: 'M99' })).isError).toBe(true);
    const d = await cagir('ibb_metro_duyurular', { ara: 'm7' });
    expect(d.structuredContent.veri.sayi).toBe(1);
    expect((await cagir('ibb_metro_duyurular', { ara: 'zzz' })).structuredContent.veri.sayi).toBe(
      0,
    );
  });
});
