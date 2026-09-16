/**
 * Official figures people ask for by name — "asgari ücret ne kadar", "SGK
 * tavanı" — embedded per year with the instrument that set each one. Only
 * values traceable to a primary text are here: a Resmî Gazete issue for the
 * decided figure, and the statute for every derived one. Anything that
 * cannot be tied to such a text is left out rather than copied from news.
 */

export interface Parametre {
  readonly ad: string;
  readonly deger: number;
  readonly birim: string;
  /** Where the number comes from, precisely enough to check. */
  readonly kaynak: string;
  readonly kaynakUrl: string;
  /** For derived figures: the arithmetic and the rule behind it. */
  readonly turetme?: string;
  readonly gecerlilik: { readonly baslangic: string; readonly bitis: string };
}

const GUNLUK_BRUT_2026 = 1101;
const AYLIK_BRUT_2026 = GUNLUK_BRUT_2026 * 30;
const SGK_ISCI_ORANI = 0.14;
const ISSIZLIK_ISCI_ORANI = 0.01;

const RG_2026 = {
  kaynak:
    'Asgari Ücret Tespit Komisyonu Kararı, Resmî Gazete 26.12.2025, sayı 33119 (Tebliğler bölümü)',
  kaynakUrl: 'https://www.resmigazete.gov.tr/eskiler/2025/12/20251226-6.pdf',
};

const YIL_2026 = { baslangic: '2026-01-01', bitis: '2026-12-31' };

export const PARAMETRELER: Readonly<Record<number, readonly Parametre[]>> = {
  2026: [
    {
      ad: 'Asgari ücret, günlük brüt',
      deger: GUNLUK_BRUT_2026,
      birim: 'TL/gün',
      ...RG_2026,
      gecerlilik: YIL_2026,
    },
    {
      ad: 'Asgari ücret, aylık brüt',
      deger: AYLIK_BRUT_2026,
      birim: 'TL/ay',
      ...RG_2026,
      turetme:
        'günlük brüt × 30 (asgari ücret 4857 s. İş Kanunu m. 39 uyarınca Komisyonca günlük belirlenir; aylık tutar 30 gün üzerinden)',
      gecerlilik: YIL_2026,
    },
    {
      ad: 'Asgari ücret, aylık net (bekâr, çocuksuz)',
      deger: Math.round(AYLIK_BRUT_2026 * (1 - SGK_ISCI_ORANI - ISSIZLIK_ISCI_ORANI) * 100) / 100,
      birim: 'TL/ay',
      ...RG_2026,
      turetme:
        'aylık brüt − %14 sigortalı primi (5510 s. K. m. 81: %9 malûllük-yaşlılık-ölüm + %5 genel sağlık sigortası, sigortalı hissesi) − %1 işsizlik sigortası işçi payı (4447 s. K. m. 49); asgari ücrete isabet eden ücret gelir vergisinden (193 s. GVK m. 23/18, 7349 s. K. ile) ve damga vergisinden (488 s. DVK ek (2) sayılı tablo, aynı kanunla) istisnadır',
      gecerlilik: YIL_2026,
    },
    {
      ad: 'SGK prime esas kazanç alt sınırı (taban), aylık',
      deger: AYLIK_BRUT_2026,
      birim: 'TL/ay',
      kaynak:
        '5510 sayılı Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu m. 82 (alt sınır = asgari ücretin otuzda biri, günlük)',
      kaynakUrl: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5510&MevzuatTur=1&MevzuatTertip=5',
      turetme: 'günlük alt sınır (asgari ücret / 30) × 30',
      gecerlilik: YIL_2026,
    },
    {
      ad: 'SGK prime esas kazanç üst sınırı (tavan), aylık',
      deger: AYLIK_BRUT_2026 * 9,
      birim: 'TL/ay',
      kaynak: '5510 sayılı Kanun m. 82: üst sınır, günlük kazanç alt sınırının 9 katı',
      kaynakUrl: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=5510&MevzuatTur=1&MevzuatTertip=5',
      turetme: 'aylık taban × 9',
      gecerlilik: YIL_2026,
    },
  ],
};

export const PARAMETRE_YILLARI: readonly number[] = Object.keys(PARAMETRELER).map(Number);
