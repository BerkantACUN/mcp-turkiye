import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import { DINI_TAKVIM_YILLARI, gunDurumu, yilTakvimi } from './takvim.js';

const tatilSemasi = z.object({
  tarih: z.string(),
  ad: z.string(),
  yarimGun: z.boolean(),
  tur: z.enum(['ulusal', 'dini']),
});

const tarihSemasi = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-AA-GG biçiminde olmalı');

export const tatil: Kaynak = {
  id: 'tatil',
  ad: 'Resmî tatiller (2429 sayılı Kanun + Diyanet dinî günler takvimi)',
  url: 'https://vakithesaplama.diyanet.gov.tr/',
  lisans: 'Kanun metni ve Diyanet takvimi kamuya açık; tarihler bu pakette gömülü',

  kaydet(server) {
    server.registerTool(
      'resmi_tatiller',
      {
        title: 'Yılın resmî tatilleri',
        description: `Türkiye'nin bir yıldaki resmî tatilleri: ulusal bayramlar (sabit) ve dinî bayramlar (Diyanet takvimi, arefe yarım günleri dahil). Turkish public holidays for a year. Dinî bayram tarihleri bu sürümde şu yıllar için gömülü: ${DINI_TAKVIM_YILLARI.join(', ')}; başka bir yıl sorulursa yanıtta diniBayramlarDahil=false döner ve dinî bayramlar listelenmez — tahmin edilmez.`,
        inputSchema: {
          yil: z
            .number()
            .int()
            .min(1900)
            .max(2200)
            .optional()
            .describe('Yıl. Varsayılan: içinde bulunulan yıl.'),
        },
        outputSchema: zarfSemasi(
          z.object({
            yil: z.number(),
            tatiller: z.array(tatilSemasi),
            diniBayramlarDahil: z.boolean(),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ yil }) => cevapla(zarfla(tatil, yilTakvimi(yil ?? new Date().getFullYear()))),
    );

    server.registerTool(
      'tatil_mi',
      {
        title: 'Bir gün tatil mi, iş günü mü?',
        description:
          'Verilen tarihin haftanın hangi günü olduğunu, hafta sonu/resmî tatil olup olmadığını ve iş günü sayılıp sayılmadığını söyler (yarım günler iş günü sayılır). Is a given date a business day in Türkiye?',
        inputSchema: { tarih: tarihSemasi.describe('YYYY-AA-GG') },
        outputSchema: zarfSemasi(
          z.object({
            tarih: z.string(),
            haftaninGunu: z.string(),
            haftaSonu: z.boolean(),
            tatil: tatilSemasi.nullable(),
            isGunu: z.boolean(),
            diniBayramlarDahil: z.boolean(),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ tarih }) => {
        if (Number.isNaN(Date.parse(`${tarih}T00:00:00Z`))) {
          return hata(new Error(`${tarih} geçerli bir tarih değil`));
        }
        return cevapla(zarfla(tatil, gunDurumu(tarih)));
      },
    );
  },
};
