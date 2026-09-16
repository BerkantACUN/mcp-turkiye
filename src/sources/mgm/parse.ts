/**
 * MGM's public site API. Three shapes, all observed rather than documented:
 * a centre record (which station serves a district), a current-conditions
 * record, and a daily forecast record with day-suffixed keys
 * (`enDusukGun1`, `hadiseGun1`, …). The sentinel `-9999` means "no
 * measurement" and is turned into null; a sea temperature of -9999°C is not
 * a temperature.
 */

/** Condition codes, taken from MGM's own site script (ililceler.js), verbatim. */
export const HADISE: Readonly<Record<string, string>> = {
  A: 'Açık',
  AB: 'Az Bulutlu',
  PB: 'Parçalı Bulutlu',
  CB: 'Çok Bulutlu',
  HY: 'Hafif Yağmurlu',
  Y: 'Yağmurlu',
  KY: 'Kuvvetli Yağmurlu',
  KKY: 'Karla Karışık Yağmurlu',
  HKY: 'Hafif Kar Yağışlı',
  K: 'Kar Yağışlı',
  KYK: 'Yoğun Kar Yağışlı',
  YKY: 'Yoğun Kar Yağışlı',
  HSY: 'Hafif Sağanak Yağışlı',
  SY: 'Sağanak Yağışlı',
  KSY: 'Kuvvetli Sağanak Yağışlı',
  MSY: 'Mevzi Sağanak Yağışlı',
  DY: 'Dolu',
  GSY: 'Gökgürültülü Sağanak Yağışlı',
  KGY: 'Kuvvetli Gökgürültülü Sağanak Yağışlı',
  SIS: 'Sisli',
  PUS: 'Puslu',
  DNM: 'Dumanlı',
  KF: 'Toz veya Kum Fırtınası',
  R: 'Rüzgarlı',
  GKR: 'Güneyli Kuvvetli Rüzgar',
  KKR: 'Kuzeyli Kuvvetli Rüzgar',
  SCK: 'Sıcak',
  SGK: 'Soğuk',
  HHY: 'Yağışlı',
};

export function hadiseAdi(kod: unknown): string | null {
  if (typeof kod !== 'string' || kod === '') return null;
  return HADISE[kod] ?? kod;
}

export interface Merkez {
  readonly merkezId: number;
  readonly il: string;
  readonly ilce: string;
  readonly enlem: number | null;
  readonly boylam: number | null;
  readonly yukseklik: number | null;
  readonly sondurumIstNo: number | null;
  readonly gunlukTahminIstNo: number | null;
}

export interface SonDurum {
  readonly veriZamani: string | null;
  readonly sicaklik: number | null;
  readonly hissedilenSicaklik: number | null;
  readonly nem: number | null;
  readonly ruzgarHizKmSaat: number | null;
  readonly ruzgarYonDerece: number | null;
  readonly basincHpa: number | null;
  readonly gorusM: number | null;
  readonly yagis24SaatMm: number | null;
  readonly hadiseKodu: string | null;
  readonly hadise: string | null;
}

export interface GunlukTahmin {
  readonly tarih: string;
  readonly enDusuk: number | null;
  readonly enYuksek: number | null;
  readonly hadiseKodu: string | null;
  readonly hadise: string | null;
  readonly ruzgarHizKmSaat: number | null;
  readonly ruzgarYonDerece: number | null;
  readonly nemAralik: readonly [number | null, number | null];
}

const SENTINEL = -9999;

function sayi(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v === SENTINEL) return null;
  return v;
}

function kayit(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

/** Pure. Centre lookup answers with a list; the first entry is the one MGM itself shows. */
export function merkezleriDonustur(ham: unknown): Merkez[] {
  if (!Array.isArray(ham)) return [];
  const sonuc: Merkez[] = [];
  for (const h of ham) {
    const r = kayit(h);
    if (!r || typeof r.merkezId !== 'number') continue;
    sonuc.push({
      merkezId: r.merkezId,
      il: typeof r.il === 'string' ? r.il : '',
      ilce: typeof r.ilce === 'string' ? r.ilce : '',
      enlem: sayi(r.enlem),
      boylam: sayi(r.boylam),
      yukseklik: sayi(r.yukseklik),
      sondurumIstNo: sayi(r.sondurumIstNo),
      gunlukTahminIstNo: sayi(r.gunlukTahminIstNo),
    });
  }
  return sonuc;
}

/** Pure. `sondurumlar` answers with a one-element list. */
export function sonDurumuDonustur(ham: unknown): SonDurum | null {
  const r = kayit(Array.isArray(ham) ? ham[0] : ham);
  if (!r || typeof r.istNo !== 'number') return null;
  return {
    veriZamani: typeof r.veriZamani === 'string' ? r.veriZamani : null,
    sicaklik: sayi(r.sicaklik),
    hissedilenSicaklik: sayi(r.hissedilenSicaklik),
    nem: sayi(r.nem),
    ruzgarHizKmSaat: sayi(r.ruzgarHiz),
    ruzgarYonDerece: sayi(r.ruzgarYon),
    basincHpa: sayi(r.denizeIndirgenmisBasinc),
    gorusM: sayi(r.gorus),
    yagis24SaatMm: sayi(r.yagis24Saat),
    hadiseKodu: typeof r.hadiseKodu === 'string' ? r.hadiseKodu : null,
    hadise: hadiseAdi(r.hadiseKodu),
  };
}

/** Pure. Unrolls the day-suffixed keys into one record per day, in order. */
export function gunlukTahminiDonustur(ham: unknown): GunlukTahmin[] {
  const r = kayit(Array.isArray(ham) ? ham[0] : ham);
  if (!r) return [];
  const gunler: GunlukTahmin[] = [];
  for (let g = 1; g <= 7; g++) {
    const tarih = r[`tarihGun${g}`];
    if (typeof tarih !== 'string') continue;
    gunler.push({
      tarih: tarih.slice(0, 10),
      enDusuk: sayi(r[`enDusukGun${g}`]),
      enYuksek: sayi(r[`enYuksekGun${g}`]),
      hadiseKodu: typeof r[`hadiseGun${g}`] === 'string' ? (r[`hadiseGun${g}`] as string) : null,
      hadise: hadiseAdi(r[`hadiseGun${g}`]),
      ruzgarHizKmSaat: sayi(r[`ruzgarHizGun${g}`]),
      ruzgarYonDerece: sayi(r[`ruzgarYonGun${g}`]),
      nemAralik: [sayi(r[`enDusukNemGun${g}`]), sayi(r[`enYuksekNemGun${g}`])],
    });
  }
  return gunler;
}
