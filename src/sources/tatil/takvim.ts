/**
 * Turkey's public holidays: the fixed ones follow from the calendar and the
 * law (2429 sayılı Ulusal Bayram ve Genel Tatiller Hakkında Kanun); the
 * religious ones move with the lunar calendar and are taken from Diyanet's
 * published tables, year by year. A year we have no table for is reported
 * as such — the fixed holidays are still returned, the religious ones are
 * marked unknown rather than estimated.
 */

export interface Tatil {
  /** ISO date. */
  readonly tarih: string;
  readonly ad: string;
  /** Half day: the afternoon only (28 Ekim and the two arefe days). */
  readonly yarimGun: boolean;
  readonly tur: 'ulusal' | 'dini';
}

/** Diyanet İşleri Başkanlığı, "Dini Günler" tables (vakithesaplama.diyanet.gov.tr). */
const DINI_BAYRAMLAR: Readonly<Record<number, readonly Omit<Tatil, 'tur'>[]>> = {
  2026: [
    { tarih: '2026-03-19', ad: 'Ramazan Bayramı Arefesi', yarimGun: true },
    { tarih: '2026-03-20', ad: 'Ramazan Bayramı 1. Gün', yarimGun: false },
    { tarih: '2026-03-21', ad: 'Ramazan Bayramı 2. Gün', yarimGun: false },
    { tarih: '2026-03-22', ad: 'Ramazan Bayramı 3. Gün', yarimGun: false },
    { tarih: '2026-05-26', ad: 'Kurban Bayramı Arefesi', yarimGun: true },
    { tarih: '2026-05-27', ad: 'Kurban Bayramı 1. Gün', yarimGun: false },
    { tarih: '2026-05-28', ad: 'Kurban Bayramı 2. Gün', yarimGun: false },
    { tarih: '2026-05-29', ad: 'Kurban Bayramı 3. Gün', yarimGun: false },
    { tarih: '2026-05-30', ad: 'Kurban Bayramı 4. Gün', yarimGun: false },
  ],
  2027: [
    { tarih: '2027-03-08', ad: 'Ramazan Bayramı Arefesi', yarimGun: true },
    { tarih: '2027-03-09', ad: 'Ramazan Bayramı 1. Gün', yarimGun: false },
    { tarih: '2027-03-10', ad: 'Ramazan Bayramı 2. Gün', yarimGun: false },
    { tarih: '2027-03-11', ad: 'Ramazan Bayramı 3. Gün', yarimGun: false },
    { tarih: '2027-05-15', ad: 'Kurban Bayramı Arefesi', yarimGun: true },
    { tarih: '2027-05-16', ad: 'Kurban Bayramı 1. Gün', yarimGun: false },
    { tarih: '2027-05-17', ad: 'Kurban Bayramı 2. Gün', yarimGun: false },
    { tarih: '2027-05-18', ad: 'Kurban Bayramı 3. Gün', yarimGun: false },
    { tarih: '2027-05-19', ad: 'Kurban Bayramı 4. Gün', yarimGun: false },
  ],
};

export const DINI_TAKVIM_YILLARI: readonly number[] = Object.keys(DINI_BAYRAMLAR).map(Number);

export function ulusalTatiller(yil: number): Tatil[] {
  const y = String(yil);
  return [
    { tarih: `${y}-01-01`, ad: 'Yılbaşı', yarimGun: false, tur: 'ulusal' },
    {
      tarih: `${y}-04-23`,
      ad: 'Ulusal Egemenlik ve Çocuk Bayramı',
      yarimGun: false,
      tur: 'ulusal',
    },
    { tarih: `${y}-05-01`, ad: 'Emek ve Dayanışma Günü', yarimGun: false, tur: 'ulusal' },
    {
      tarih: `${y}-05-19`,
      ad: "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
      yarimGun: false,
      tur: 'ulusal',
    },
    { tarih: `${y}-07-15`, ad: 'Demokrasi ve Millî Birlik Günü', yarimGun: false, tur: 'ulusal' },
    { tarih: `${y}-08-30`, ad: 'Zafer Bayramı', yarimGun: false, tur: 'ulusal' },
    { tarih: `${y}-10-28`, ad: 'Cumhuriyet Bayramı Arefesi', yarimGun: true, tur: 'ulusal' },
    { tarih: `${y}-10-29`, ad: 'Cumhuriyet Bayramı', yarimGun: false, tur: 'ulusal' },
  ];
}

export function diniTatiller(yil: number): Tatil[] | null {
  const liste = DINI_BAYRAMLAR[yil];
  if (!liste) return null;
  return liste.map((t) => ({ ...t, tur: 'dini' as const }));
}

export interface YilTakvimi {
  readonly yil: number;
  readonly tatiller: readonly Tatil[];
  /** False when Diyanet's table for this year is not in this release. */
  readonly diniBayramlarDahil: boolean;
}

export function yilTakvimi(yil: number): YilTakvimi {
  const dini = diniTatiller(yil);
  const tatiller = [...ulusalTatiller(yil), ...(dini ?? [])].sort((a, b) =>
    a.tarih.localeCompare(b.tarih),
  );
  return { yil, tatiller, diniBayramlarDahil: dini !== null };
}

export interface GunDurumu {
  readonly tarih: string;
  readonly haftaninGunu: string;
  readonly haftaSonu: boolean;
  readonly tatil: Tatil | null;
  /** Business day: not a weekend and not a full-day holiday. A half-day counts as a business day. */
  readonly isGunu: boolean;
  readonly diniBayramlarDahil: boolean;
}

const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function gunDurumu(tarih: string): GunDurumu {
  const d = new Date(`${tarih}T12:00:00Z`);
  const yil = d.getUTCFullYear();
  const takvim = yilTakvimi(yil);
  const tatil = takvim.tatiller.find((t) => t.tarih === tarih) ?? null;
  const gun = d.getUTCDay();
  const haftaSonu = gun === 0 || gun === 6;
  return {
    tarih,
    haftaninGunu: GUNLER[gun] ?? '',
    haftaSonu,
    tatil,
    isGunu: !haftaSonu && !(tatil && !tatil.yarimGun),
    diniBayramlarDahil: takvim.diniBayramlarDahil,
  };
}
