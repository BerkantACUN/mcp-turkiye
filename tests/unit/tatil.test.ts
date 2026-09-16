import { describe, expect, it } from 'vitest';
import { DINI_TAKVIM_YILLARI, gunDurumu, yilTakvimi } from '../../src/sources/tatil/takvim.js';

describe('yilTakvimi', () => {
  it('lists the eight fixed national holidays for any year, sorted', () => {
    const t = yilTakvimi(2031);
    const ulusal = t.tatiller.filter((x) => x.tur === 'ulusal');
    expect(ulusal.map((x) => x.tarih)).toEqual([
      '2031-01-01',
      '2031-04-23',
      '2031-05-01',
      '2031-05-19',
      '2031-07-15',
      '2031-08-30',
      '2031-10-28',
      '2031-10-29',
    ]);
    expect(ulusal.find((x) => x.tarih === '2031-10-28')?.yarimGun).toBe(true);
  });

  it("includes Diyanet's religious holidays for the years it has a table for", () => {
    expect(DINI_TAKVIM_YILLARI).toContain(2026);
    const t = yilTakvimi(2026);
    expect(t.diniBayramlarDahil).toBe(true);
    const dini = t.tatiller.filter((x) => x.tur === 'dini');
    // 4 Ramazan (arefe + 3) + 5 Kurban (arefe + 4)
    expect(dini).toHaveLength(9);
    expect(dini.find((x) => x.ad === 'Ramazan Bayramı 1. Gün')?.tarih).toBe('2026-03-20');
    expect(dini.find((x) => x.ad === 'Kurban Bayramı Arefesi')).toMatchObject({
      tarih: '2026-05-26',
      yarimGun: true,
    });
  });

  it('says so, instead of guessing, for a year without a table', () => {
    const t = yilTakvimi(2031);
    expect(t.diniBayramlarDahil).toBe(false);
    expect(t.tatiller.every((x) => x.tur === 'ulusal')).toBe(true);
  });
});

describe('gunDurumu', () => {
  it('knows a full-day holiday is not a business day', () => {
    const g = gunDurumu('2026-10-29');
    expect(g).toMatchObject({ haftaninGunu: 'Perşembe', haftaSonu: false, isGunu: false });
    expect(g.tatil?.ad).toBe('Cumhuriyet Bayramı');
  });

  it('counts a half-day as a business day', () => {
    const g = gunDurumu('2026-10-28');
    expect(g.tatil?.yarimGun).toBe(true);
    expect(g.isGunu).toBe(true);
  });

  it('knows weekends', () => {
    expect(gunDurumu('2026-09-19')).toMatchObject({
      haftaninGunu: 'Cumartesi',
      haftaSonu: true,
      isGunu: false,
    });
  });

  it('flags an ordinary weekday as a business day', () => {
    expect(gunDurumu('2026-09-16')).toMatchObject({
      haftaninGunu: 'Çarşamba',
      tatil: null,
      isGunu: true,
    });
  });
});
