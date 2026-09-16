/**
 * The little HTML handling every scraped source needs. No parser: the
 * pages we read (Resmî Gazete, mevzuat.gov.tr, ÖSYM) are regular enough
 * that entities and tags are all there is to undo, and a real HTML parser
 * would be the largest dependency in the package.
 */

const VARLIKLAR: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

/** Decodes numeric (`&#305;`, `&#x131;`) and the common named entities; leaves unknown ones as they are. */
export function varliklariCoz(html: string): string {
  return html
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, (e) => VARLIKLAR[e.toLowerCase()] ?? e);
}

/** Tags out, entities decoded, whitespace collapsed to single spaces. */
export function duzMetin(html: string): string {
  return varliklariCoz(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}
