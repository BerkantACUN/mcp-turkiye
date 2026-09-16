import { z } from 'zod';
import { cevapla, zarfSemasi } from '../../core/cevap.js';
import { type Kaynak, zarfla } from '../../core/source.js';
import { PARAMETRE_YILLARI, PARAMETRELER } from './veri.js';

const parametreSemasi = z.object({
  ad: z.string(),
  deger: z.number(),
  birim: z.string(),
  kaynak: z.string(),
  kaynakUrl: z.string(),
  turetme: z.string().optional(),
  gecerlilik: z.object({ baslangic: z.string(), bitis: z.string() }),
});

export const parametreler: Kaynak = {
  id: 'parametreler',
  ad: 'Resmî parametreler (asgari ücret, SGK sınırları)',
  url: 'https://github.com/BerkantACUN/mcp-turkiye/blob/master/SOURCES.md#parametreler',
  lisans: 'Resmî Gazete ve kanun metinlerinden alınmış, kaynağıyla gömülü değerler',

  kaydet(server) {
    server.registerTool(
      'resmi_parametreler',
      {
        title: 'Resmî parametreler: asgari ücret, SGK taban/tavan',
        description: `Yılın resmî sayıları, her biri kaynağıyla: asgari ücret (günlük brüt, aylık brüt, aylık net) ve SGK prime esas kazanç alt/üst sınırı. Türkiye's official annual figures (minimum wage, social-security earnings floor and ceiling), each with the instrument that set it. Bu sürümde gömülü yıllar: ${PARAMETRE_YILLARI.join(', ')}. Türetilen değerler için hesap ve dayanak \`turetme\` alanındadır. Kıdem tazminatı tavanı ve gelir vergisi dilimleri bu sürümde yoktur.`,
        inputSchema: {
          yil: z
            .number()
            .int()
            .min(2000)
            .max(2100)
            .optional()
            .describe('Yıl, varsayılan içinde bulunulan yıl'),
        },
        outputSchema: zarfSemasi(
          z.object({
            yil: z.number(),
            mevcut: z.boolean(),
            parametreler: z.array(parametreSemasi),
            gomuluYillar: z.array(z.number()),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ yil }) => {
        const y = yil ?? new Date().getFullYear();
        const liste = PARAMETRELER[y] ?? [];
        return cevapla(
          zarfla(parametreler, {
            yil: y,
            mevcut: liste.length > 0,
            parametreler: [...liste],
            gomuluYillar: [...PARAMETRE_YILLARI],
          }),
        );
      },
    );
  },
};
