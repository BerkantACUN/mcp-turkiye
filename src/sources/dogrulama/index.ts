import { z } from 'zod';
import { cevapla, zarfSemasi } from '../../core/cevap.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import { ibanDogrula, tcknDogrula, vknDogrula } from './algoritma.js';
import { ILLER, ilPlaka, plakaIl } from './iller.js';

const UYARI =
  'Biçimsel doğrulama: kontrol basamakları hesaplandı, hiçbir kuruma sorulmadı. "Geçerli" bu numaranın gerçek bir kişiye/kuruma ait olduğu anlamına gelmez.';

const sonucSemasi = z.object({
  girdi: z.string(),
  gecerli: z.boolean(),
  neden: z.string(),
  uyari: z.string(),
});

export const dogrulama: Kaynak = {
  id: 'dogrulama',
  ad: 'Çevrimdışı biçim doğrulama (TCKN, VKN, IBAN, plaka)',
  url: 'https://github.com/BerkantACUN/mcp-turkiye/blob/master/SOURCES.md#dogrulama',
  lisans: 'Kamuya açık kontrol basamağı algoritmaları; veri hiçbir yere gönderilmez',

  kaydet(server) {
    server.registerTool(
      'dogrula_tckn',
      {
        title: 'T.C. Kimlik Numarası biçim kontrolü',
        description:
          'Bir T.C. Kimlik Numarasının kontrol basamaklarını hesaplar (11 hane, ilk hane sıfır olamaz). Tamamen çevrimdışı; numara hiçbir kuruma gönderilmez. Sadece biçim doğrular, kişinin varlığını doğrulamaz. Offline checksum validation of a Turkish national ID number.',
        inputSchema: { tckn: z.string().describe('11 haneli numara') },
        outputSchema: zarfSemasi(sonucSemasi),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ tckn }) => {
        const s = tcknDogrula(tckn);
        return cevapla(zarfla(dogrulama, { girdi: tckn.trim(), ...s, uyari: UYARI }));
      },
    );

    server.registerTool(
      'dogrula_vkn',
      {
        title: 'Vergi Kimlik Numarası biçim kontrolü',
        description:
          'Bir Vergi Kimlik Numarasının (10 hane) kontrol basamağını hesaplar. Çevrimdışı; GİB sorgusu yapılmaz, mükellefin varlığı doğrulanmaz. Offline checksum validation of a Turkish tax ID.',
        inputSchema: { vkn: z.string().describe('10 haneli numara') },
        outputSchema: zarfSemasi(sonucSemasi),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ vkn }) => {
        const s = vknDogrula(vkn);
        return cevapla(zarfla(dogrulama, { girdi: vkn.trim(), ...s, uyari: UYARI }));
      },
    );

    server.registerTool(
      'dogrula_iban',
      {
        title: 'Türkiye IBAN biçim kontrolü',
        description:
          'Bir TR IBAN’ının ISO 13616 mod-97 kontrolünü yapar ve banka kodunu (5 hane) ayırır. Çevrimdışı; hesabın varlığı doğrulanmaz. Offline mod-97 validation of a Turkish IBAN, with the bank code extracted.',
        inputSchema: {
          iban: z.string().describe('TR ile başlayan 26 karakterlik IBAN, boşluklu yazılabilir'),
        },
        outputSchema: zarfSemasi(sonucSemasi.extend({ bankaKodu: z.string().optional() })),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ iban }) => {
        const s = ibanDogrula(iban);
        return cevapla(
          zarfla(dogrulama, { girdi: iban.replace(/\s+/g, '').toUpperCase(), ...s, uyari: UYARI }),
        );
      },
    );

    server.registerTool(
      'plaka_il',
      {
        title: 'Plaka kodu ↔ il',
        description:
          'Plaka kodundan ili (34 → İstanbul) ya da il adından plaka kodunu (Ankara → 06) verir; 81 il. Turkish province ↔ plate code lookup.',
        inputSchema: {
          kod: z.number().int().min(1).max(81).optional().describe('Plaka kodu 1–81'),
          il: z
            .string()
            .optional()
            .describe('İl adı; büyük/küçük harf ve Türkçe karakter farkı önemsizdir'),
        },
        outputSchema: zarfSemasi(
          z.object({
            kod: z.number().nullable(),
            il: z.string().nullable(),
            toplamIl: z.number(),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ kod, il }) => {
        if (kod !== undefined) {
          return cevapla(zarfla(dogrulama, { kod, il: plakaIl(kod), toplamIl: ILLER.length }));
        }
        if (il !== undefined) {
          const bulunan = ilPlaka(il);
          return cevapla(
            zarfla(dogrulama, {
              kod: bulunan,
              il: bulunan === null ? null : (plakaIl(bulunan) ?? null),
              toplamIl: ILLER.length,
            }),
          );
        }
        return cevapla(zarfla(dogrulama, { kod: null, il: null, toplamIl: ILLER.length }));
      },
    );
  },
};
