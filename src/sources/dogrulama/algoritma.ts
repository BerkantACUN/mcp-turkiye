/**
 * Checksum validators for the identifiers every Turkish system asks for.
 * All of them are pure arithmetic on the string: nothing is sent anywhere,
 * nothing is looked up, and "valid" means "well-formed", never "belongs to
 * a real person or company". That distinction is stated in every answer,
 * because a model that reads "valid" will otherwise say "this person
 * exists".
 */

export interface DogrulamaSonucu {
  readonly gecerli: boolean;
  readonly neden: string;
}

/**
 * T.C. Kimlik Numarası: 11 digits, first non-zero.
 *   d10 = ((d1+d3+d5+d7+d9)·7 − (d2+d4+d6+d8)) mod 10
 *   d11 = (d1+…+d10) mod 10
 */
export function tcknDogrula(girdi: string): DogrulamaSonucu {
  const s = girdi.trim();
  if (!/^\d{11}$/.test(s)) return { gecerli: false, neden: '11 haneli rakam olmalı' };
  if (s[0] === '0') return { gecerli: false, neden: 'ilk hane 0 olamaz' };
  const d = [...s].map(Number) as number[];
  const tek = (d[0] ?? 0) + (d[2] ?? 0) + (d[4] ?? 0) + (d[6] ?? 0) + (d[8] ?? 0);
  const cift = (d[1] ?? 0) + (d[3] ?? 0) + (d[5] ?? 0) + (d[7] ?? 0);
  const d10 = (((tek * 7 - cift) % 10) + 10) % 10;
  if (d10 !== d[9]) return { gecerli: false, neden: '10. hane kontrol basamağı tutmuyor' };
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  if (d11 !== d[10]) return { gecerli: false, neden: '11. hane kontrol basamağı tutmuyor' };
  return { gecerli: true, neden: 'kontrol basamakları tutuyor (biçimsel doğrulama)' };
}

/**
 * Vergi Kimlik Numarası: 10 digits. For i = 0..8:
 *   t = (d[i] + (9 − i)) mod 10
 *   c = t == 9 ? 9 : (t · 2^(9−i)) mod 9
 * check = (10 − Σc mod 10) mod 10 must equal d[9].
 */
export function vknDogrula(girdi: string): DogrulamaSonucu {
  const s = girdi.trim();
  if (!/^\d{10}$/.test(s)) return { gecerli: false, neden: '10 haneli rakam olmalı' };
  const d = [...s].map(Number) as number[];
  let toplam = 0;
  for (let i = 0; i < 9; i++) {
    const t = ((d[i] ?? 0) + (9 - i)) % 10;
    const c = t === 9 ? 9 : (t * 2 ** (9 - i)) % 9;
    toplam += c;
  }
  const kontrol = (10 - (toplam % 10)) % 10;
  if (kontrol !== d[9]) return { gecerli: false, neden: 'kontrol basamağı tutmuyor' };
  return { gecerli: true, neden: 'kontrol basamağı tutuyor (biçimsel doğrulama)' };
}

/**
 * Turkish IBAN: TR + 2 check digits + 5-digit bank code + 1 reserved digit
 * + 16-character account = 26 characters, ISO 13616 mod-97.
 */
export function ibanDogrula(girdi: string): DogrulamaSonucu & { bankaKodu?: string } {
  const s = girdi.replace(/\s+/g, '').toUpperCase();
  if (!/^TR\d{2}\d{5}\d[A-Z0-9]{16}$/.test(s)) {
    return { gecerli: false, neden: 'TR + 24 karakter (toplam 26) biçiminde olmalı' };
  }
  const yeniden = s.slice(4) + s.slice(0, 4);
  const rakamlar = [...yeniden]
    .map((ch) => (/\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)))
    .join('');
  let kalan = 0;
  for (const ch of rakamlar) kalan = (kalan * 10 + Number(ch)) % 97;
  if (kalan !== 1) return { gecerli: false, neden: 'mod-97 kontrolü tutmuyor' };
  return {
    gecerli: true,
    neden: 'mod-97 kontrolü tutuyor (biçimsel doğrulama)',
    bankaKodu: s.slice(4, 9),
  };
}
