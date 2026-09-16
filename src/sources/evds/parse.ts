/**
 * EVDS (TCMB Elektronik Veri Dağıtım Sistemi) answers three catalogue
 * shapes and one data shape. The catalogue records are flat objects with
 * upper-case keys; the data response is `{ totalCount, items[] }` where each
 * item has `Tarih`, a `UNIXTIME` object and one key per requested series —
 * the series code with dots turned into underscores and, when a formula was
 * asked for, a `-<formula>` suffix. Values arrive as strings, or null when
 * the series has no observation for that date.
 */

export interface Kategori {
  readonly id: number;
  readonly ad: string;
  readonly adIngilizce: string;
  readonly seviye: number;
  readonly ustId: number | null;
}

export interface VeriGrubu {
  readonly kod: string;
  readonly ad: string;
  readonly adIngilizce: string;
  readonly frekans: string;
  readonly birim: string;
  readonly kaynak: string;
  readonly baslangic: string | null;
  readonly bitis: string | null;
  readonly sonGuncelleme: string | null;
  readonly kategoriId: number | null;
}

export interface Seri {
  readonly kod: string;
  readonly ad: string;
  readonly adIngilizce: string;
  readonly frekans: string;
  readonly veriGrubu: string;
  readonly etiket: string;
}

export interface Gozlem {
  readonly tarih: string;
  readonly degerler: Readonly<Record<string, number | null>>;
}

const metin = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const sayi = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const kayit = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

export function kategorileriDonustur(ham: unknown): Kategori[] {
  if (!Array.isArray(ham)) return [];
  const sonuc: Kategori[] = [];
  for (const h of ham) {
    const r = kayit(h);
    const id = sayi(r?.CATEGORY_ID);
    if (!r || id === null) continue;
    const ust = sayi(r.UST_CATEGORY_ID);
    sonuc.push({
      id,
      ad: metin(r.TOPIC_TITLE_TR),
      adIngilizce: metin(r.TOPIC_TITLE_ENG),
      seviye: sayi(r.SEVIYE) ?? 1,
      ustId: ust === null || ust < 0 ? null : ust,
    });
  }
  return sonuc;
}

export function veriGruplariniDonustur(ham: unknown): VeriGrubu[] {
  if (!Array.isArray(ham)) return [];
  const sonuc: VeriGrubu[] = [];
  for (const h of ham) {
    const r = kayit(h);
    const kod = metin(r?.DATAGROUP_CODE);
    if (!r || !kod) continue;
    sonuc.push({
      kod,
      ad: metin(r.DATAGROUP_NAME),
      adIngilizce: metin(r.DATAGROUP_NAME_ENG),
      frekans: metin(r.FREQUENCY_STR),
      birim: metin(r.BIRIMI),
      kaynak: metin(r.DATASOURCE),
      baslangic: metin(r.START_DATE) || null,
      bitis: metin(r.END_DATE) || null,
      sonGuncelleme: metin(r.LAST_UPDATED) || null,
      kategoriId: sayi(r.CATEGORY_ID),
    });
  }
  return sonuc;
}

export function serileriDonustur(ham: unknown): Seri[] {
  if (!Array.isArray(ham)) return [];
  const sonuc: Seri[] = [];
  for (const h of ham) {
    const r = kayit(h);
    const kod = metin(r?.SERIE_CODE);
    if (!r || !kod) continue;
    sonuc.push({
      kod,
      ad: metin(r.SERIE_NAME).replace(/\s+/g, ' '),
      adIngilizce: metin(r.SERIE_NAME_ENG).replace(/\s+/g, ' '),
      frekans: metin(r.FREQUENCY_STR),
      veriGrubu: metin(r.DATAGROUP_CODE),
      etiket: metin(r.TAG).replace(/\s+/g, ' '),
    });
  }
  return sonuc;
}

/** The key EVDS uses for a series in a data item. */
export function anahtar(seriKodu: string, formul?: number): string {
  const taban = seriKodu.replace(/\./g, '_');
  return formul === undefined ? taban : `${taban}-${formul}`;
}

/**
 * Pure. Turns `items` into observations keyed by the *requested* series
 * codes, so the caller never has to know EVDS's key mangling. A requested
 * series with no key in the item is reported as null, not dropped.
 */
export function gozlemleriDonustur(
  ham: unknown,
  seriKodlari: readonly string[],
  formul?: number,
): { toplam: number; gozlemler: Gozlem[] } {
  const r = kayit(ham);
  const items = Array.isArray(r?.items) ? (r.items as unknown[]) : null;
  if (!r || !items) {
    throw new Error(
      'yanıt beklenen zarfta değil (items listesi yok) — kaynak formatı değişmiş olabilir',
    );
  }
  const gozlemler: Gozlem[] = [];
  for (const it of items) {
    const k = kayit(it);
    const tarih = metin(k?.Tarih);
    if (!k || !tarih) continue;
    const degerler: Record<string, number | null> = {};
    for (const kod of seriKodlari) {
      degerler[kod] = sayi(k[anahtar(kod, formul)] ?? k[anahtar(kod)]);
    }
    gozlemler.push({ tarih, degerler });
  }
  return { toplam: sayi(r.totalCount) ?? gozlemler.length, gozlemler };
}
