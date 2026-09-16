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

/** One active warning, as `/web/alarmlar/detay?alarmno=` describes it. */
export interface Uyari {
  readonly seriNo: string;
  /** "Meteorolojik Uyarı", "Erken Uyarı"… — MGM's own label for the notice type. */
  readonly tur: string;
  readonly baslik: string;
  readonly hadise: string | null;
  readonly siddet: string | null;
  readonly riskler: string | null;
  /** When the notice was issued and when it lapses (ISO, as MGM sends them). */
  readonly yayin: string | null;
  readonly bitis: string | null;
  /** The window the weather itself is expected in, MGM's wording ("17.09.2026 11:00-17.09.2026 21:00"). */
  readonly hadiseZamani: string | null;
  /** The full text of the notice: where, when, what to watch for. */
  readonly metin: string;
  readonly url: string;
}

const metin = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Pure. The list endpoint gives only serial numbers; everything else comes
 * from the detail. A non-list is read as "no warnings", as the site does.
 */
export function uyariNumaralari(ham: unknown): string[] {
  if (!Array.isArray(ham)) return [];
  return ham
    .map((u) => (u && typeof u === 'object' ? (u as { seriNo?: unknown }).seriNo : undefined))
    .filter((s): s is string => typeof s === 'string' && s !== '');
}

/** Pure. A detail record → the warning; null when the record has no title (nothing to show). */
export function uyariyiDonustur(ham: unknown): Uyari | null {
  if (!ham || typeof ham !== 'object') return null;
  const r = ham as Record<string, unknown>;
  const seriNo = metin(r.seriNo);
  const baslik = metin(r.baslik);
  if (!seriNo || !baslik) return null;
  // The site links "early warning" types (2, 5, 7) to a different page than plain notices.
  const erken = [2, 5, 7].includes(Number(r.ihbarTipi));
  return {
    seriNo,
    tur: metin(r.ihbarText) ?? 'Meteorolojik Uyarı',
    baslik,
    hadise: metin(r.hadiseCinsi),
    siddet: metin(r.hadiseSiddeti),
    riskler: metin(r.riskler),
    yayin: metin(r.baslangic),
    bitis: metin(r.bitis),
    hadiseZamani: metin(r.hadiseZaman),
    metin: metin(r.hadiseYer) ?? baslik,
    url: `https://www.mgm.gov.tr/tahmin/uyari-goster.aspx?sN=${seriNo}${erken ? 'e' : 'y'}`,
  };
}
