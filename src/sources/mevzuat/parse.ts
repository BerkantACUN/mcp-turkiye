/**
 * mevzuat.gov.tr — the Presidency's consolidated legislation. Two shapes:
 * a DataTables-style search response (JSON) and the consolidated text of
 * one act as a Word-exported HTML page. The text is what people want, and
 * the unit people want it in is the article: "KVKK madde 6". Articles in
 * Turkish legislation start on their own line as `MADDE 6- (1) …`, with
 * `EK MADDE` and `GEÇİCİ MADDE` for additional and transitional ones, and
 * the line before an article is its short heading.
 */

export interface MevzuatOzeti {
  /** `<tur>.<tertip>.<no>` — the three numbers every mevzuat.gov.tr URL needs. */
  readonly kimlik: string;
  readonly ad: string;
  readonly no: string;
  readonly tur: number;
  readonly turAdi: string;
  readonly tertip: number;
  readonly kabulTarihi: string | null;
  readonly resmiGazeteTarihi: string | null;
  readonly resmiGazeteSayisi: string | null;
  readonly url: string;
}

export interface Madde {
  readonly madde: string;
  readonly baslik: string | null;
  readonly metin: string;
}

export interface MevzuatMetni {
  readonly baslik: string;
  readonly satirlar: readonly string[];
  readonly metin: string;
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function metneCevir(html: string): string {
  return html
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
}

const kisalt = (s: string): string =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Pure. One search hit → the summary a caller needs to fetch the text. */
export function aramaSonuclariniDonustur(ham: unknown): {
  toplam: number;
  sonuclar: MevzuatOzeti[];
} {
  const r = typeof ham === 'object' && ham !== null ? (ham as Record<string, unknown>) : null;
  const data = Array.isArray(r?.data) ? (r.data as Record<string, unknown>[]) : null;
  if (!r || !data) {
    throw new Error(
      'yanıt beklenen zarfta değil (data listesi yok) — kaynak formatı değişmiş olabilir',
    );
  }
  const sonuclar: MevzuatOzeti[] = [];
  for (const x of data) {
    const no = String(x.mevzuatNo ?? '').trim();
    const tur = Number(x.mevzuatTur);
    const tertip = Number(x.mevzuatTertip);
    if (!no || !Number.isInteger(tur) || !Number.isInteger(tertip)) continue;
    sonuclar.push({
      kimlik: `${tur}.${tertip}.${no}`,
      ad: kisalt(String(x.mevAdi ?? '')),
      no,
      tur,
      turAdi: String(x.mevzuatTurEnumString ?? ''),
      tertip,
      kabulTarihi: typeof x.kabulTarih === 'string' && x.kabulTarih ? x.kabulTarih : null,
      resmiGazeteTarihi:
        typeof x.resmiGazeteTarihi === 'string' && x.resmiGazeteTarihi ? x.resmiGazeteTarihi : null,
      resmiGazeteSayisi:
        typeof x.resmiGazeteSayisi === 'string' && x.resmiGazeteSayisi ? x.resmiGazeteSayisi : null,
      url: mevzuatSayfasi(tur, tertip, no),
    });
  }
  const toplam = Number(r.recordsTotal);
  return { toplam: Number.isFinite(toplam) ? toplam : sonuclar.length, sonuclar };
}

export function mevzuatSayfasi(tur: number, tertip: number, no: string): string {
  return `https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=${encodeURIComponent(no)}&MevzuatTur=${tur}&MevzuatTertip=${tertip}`;
}

/** `1.5.6698` → parts; null when it is not three dot-separated fields. */
export function kimlikCoz(kimlik: string): { tur: number; tertip: number; no: string } | null {
  const m = kimlik.trim().match(/^(\d+)\.(\d+)\.([A-Za-z0-9/-]+)$/);
  if (!m) return null;
  return { tur: Number(m[1]), tertip: Number(m[2]), no: m[3] ?? '' };
}

/** Pure. The consolidated text as lines, with the title read off the top. */
export function metniAyristir(html: string): MevzuatMetni {
  const govde = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  // The page is a Word export: the source wraps text at ~80 columns with
  // hard newlines ("Madde\n1 -"), so those are collapsed first and only
  // block boundaries become lines.
  const duz = metneCevir(
    govde
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
      .replace(/\r?\n/g, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/h\d>|<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
  const satirlar = duz
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
  if (satirlar.length === 0) {
    throw new Error('mevzuat metni boş — kaynak formatı değişmiş ya da kayıt bulunamamış olabilir');
  }
  // Title: the all-capitals lines before the first metadata line ("Kanun Numarası"…).
  const baslikSatirlari: string[] = [];
  for (const s of satirlar) {
    if (
      /^(Kanun|Karar|Yönetmelik|Tebliğ|Tüzük)\b/.test(s) ||
      /Numarası|Tarihi|Resmî Gazete/.test(s)
    )
      break;
    if (baslikSatirlari.length >= 4) break;
    baslikSatirlari.push(s);
  }
  return { baslik: baslikSatirlari.join(' ').trim(), satirlar, metin: satirlar.join('\n') };
}

const MADDE_BASI =
  /^(?:(EK|GEÇİCİ|GECICI|Geçici|Ek)\s+)?(?:MADDE|Madde)\s+(\d+)(?:\s*\/\s*([A-ZÇĞİÖŞÜ]))?\s*[-–—:]/;

/** "6", "6/A", "ek 1", "geçici 3" → a normalised key like `6`, `6/A`, `EK 1`, `GEÇİCİ 3`. */
export function maddeAnahtari(girdi: string): string | null {
  // Turkish upper-casing turns "gecici" into "GECİCİ"; accept every spelling.
  const m = girdi
    .trim()
    .toLocaleUpperCase('tr-TR')
    .match(/^(?:(EK|GE[CÇ][İI][CÇ][İI])\s+)?(?:MADDE\s+)?(\d+)(?:\s*\/\s*([A-ZÇĞİÖŞÜ]))?$/);
  if (!m) return null;
  const on = m[1] === undefined ? '' : m[1] === 'EK' ? 'EK ' : 'GEÇİCİ ';
  return `${on}${m[2]}${m[3] ? `/${m[3]}` : ''}`;
}

function satirAnahtari(satir: string): string | null {
  const m = satir.match(MADDE_BASI);
  if (!m) return null;
  const on = m[1]?.toLocaleUpperCase('tr-TR');
  return `${on ? `${on === 'GECICI' ? 'GEÇİCİ' : on} ` : ''}${m[2]}${m[3] ? `/${m[3]}` : ''}`;
}

const kisaBaslikMi = (s: string): boolean =>
  s.length < 90 && !/[.;:]$/.test(s) && !MADDE_BASI.test(s);

/**
 * Pure. The first article whose key matches. Ends at the next article start;
 * a short, sentence-less last line is the next article's heading and is
 * dropped, and the line before the start is this article's own heading.
 */
export function maddeyiCikar(satirlar: readonly string[], istenen: string): Madde | null {
  const anahtar = maddeAnahtari(istenen);
  if (!anahtar) return null;
  const bas = satirlar.findIndex((s) => satirAnahtari(s) === anahtar);
  if (bas === -1) return null;
  let son = satirlar.length;
  for (let i = bas + 1; i < satirlar.length; i++) {
    if (
      satirAnahtari(satirlar[i] ?? '') !== null ||
      /^(BİRİNCİ|İKİNCİ|ÜÇÜNCÜ|DÖRDÜNCÜ|BEŞİNCİ|ALTINCI|YEDİNCİ|SEKİZİNCİ|DOKUZUNCU|ONUNCU)\s+(BÖLÜM|KISIM)$/.test(
        satirlar[i] ?? '',
      )
    ) {
      son = i;
      break;
    }
  }
  const govde = satirlar.slice(bas, son);
  while (govde.length > 1 && kisaBaslikMi(govde[govde.length - 1] ?? '')) govde.pop();
  const onceki = satirlar[bas - 1];
  return {
    madde: anahtar,
    baslik: onceki !== undefined && kisaBaslikMi(onceki) ? onceki : null,
    metin: govde.join('\n'),
  };
}

/** Every article key in document order — so a caller can see what exists. */
export function maddeListesi(satirlar: readonly string[]): string[] {
  const gorulen = new Set<string>();
  for (const s of satirlar) {
    const k = satirAnahtari(s);
    if (k && !gorulen.has(k)) gorulen.add(k);
  }
  return [...gorulen];
}
