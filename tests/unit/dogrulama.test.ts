import { describe, expect, it } from 'vitest';
import { ibanDogrula, tcknDogrula, vknDogrula } from '../../src/sources/dogrulama/algoritma.js';
import { ILLER, ilPlaka, plakaIl } from '../../src/sources/dogrulama/iller.js';

describe('tcknDogrula', () => {
  it('accepts the documented test number 10000000146', () => {
    expect(tcknDogrula('10000000146').gecerli).toBe(true);
  });

  it('rejects a wrong 11th digit and says which digit failed', () => {
    const s = tcknDogrula('10000000147');
    expect(s.gecerli).toBe(false);
    expect(s.neden).toMatch(/11\. hane/);
  });

  it('rejects a wrong 10th digit', () => {
    expect(tcknDogrula('12345678901').neden).toMatch(/10\. hane/);
  });

  it('rejects a leading zero, wrong length and non-digits', () => {
    expect(tcknDogrula('00000000000').gecerli).toBe(false);
    expect(tcknDogrula('1000000014').gecerli).toBe(false);
    expect(tcknDogrula('1000000014a').gecerli).toBe(false);
  });

  it('tolerates surrounding whitespace', () => {
    expect(tcknDogrula(' 10000000146 ').gecerli).toBe(true);
  });
});

describe('vknDogrula', () => {
  // Two tax numbers Turkish Airlines publishes on its own legal-notice page.
  it('accepts real, publicly published tax numbers', () => {
    expect(vknDogrula('8760047464').gecerli).toBe(true);
    expect(vknDogrula('8760578179').gecerli).toBe(true);
  });

  it('rejects a single changed digit', () => {
    expect(vknDogrula('8760047465').gecerli).toBe(false);
  });

  it('rejects wrong length and all zeros', () => {
    expect(vknDogrula('876004746').gecerli).toBe(false);
    expect(vknDogrula('0000000000').gecerli).toBe(false);
  });
});

describe('ibanDogrula', () => {
  it('accepts a valid TR IBAN, with or without spaces, and extracts the bank code', () => {
    const s = ibanDogrula('TR33 0006 1005 1978 6457 8413 26');
    expect(s.gecerli).toBe(true);
    expect(s.bankaKodu).toBe('00061');
    expect(ibanDogrula('tr330006100519786457841326').gecerli).toBe(true);
  });

  it('rejects a single changed digit', () => {
    expect(ibanDogrula('TR330006100519786457841327').gecerli).toBe(false);
  });

  it('rejects non-Turkish and malformed IBANs before doing arithmetic', () => {
    expect(ibanDogrula('GB82WEST12345698765432').neden).toMatch(/26/);
    expect(ibanDogrula('TR33').gecerli).toBe(false);
  });
});

describe('plaka ↔ il', () => {
  it('has exactly 81 provinces in official order', () => {
    expect(ILLER).toHaveLength(81);
    expect(plakaIl(1)).toBe('Adana');
    expect(plakaIl(34)).toBe('İstanbul');
    expect(plakaIl(81)).toBe('Düzce');
  });

  it('returns null outside 1–81', () => {
    expect(plakaIl(0)).toBeNull();
    expect(plakaIl(82)).toBeNull();
    expect(plakaIl(1.5)).toBeNull();
  });

  it('resolves names regardless of case and Turkish diacritics', () => {
    expect(ilPlaka('İstanbul')).toBe(34);
    expect(ilPlaka('istanbul')).toBe(34);
    expect(ilPlaka('ISTANBUL')).toBe(34);
    expect(ilPlaka('Sanliurfa')).toBe(63);
    expect(ilPlaka('ŞANLIURFA')).toBe(63);
    expect(ilPlaka('hakkari')).toBe(30);
    expect(ilPlaka('Atlantis')).toBeNull();
  });
});
