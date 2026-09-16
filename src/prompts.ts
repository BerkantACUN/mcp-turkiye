import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ilPlaka } from './sources/dogrulama/iller.js';

/**
 * Prompts are ready-made questions that chain several tools. They are
 * text, not code: the client shows them as slash-commands or menu items,
 * and the model runs the tools they name. Two things every prompt here
 * insists on — cite the source and time of each figure, and say when a
 * tool failed instead of filling the gap.
 */
export function promptlariKaydet(server: McpServer): void {
  server.registerPrompt(
    'gunun_ozeti',
    {
      title: 'Günün Türkiye özeti',
      description:
        'Kur, deprem, hava, trafik ve Resmî Gazete başlıklarını tek seferde toplayıp kısa bir günlük özet çıkarır. A one-shot daily briefing: FX, earthquakes, weather, traffic and the Official Gazette.',
      argsSchema: {
        il: z.string().optional().describe('Hava durumu ve trafik için il, varsayılan İstanbul'),
      },
    },
    ({ il }) => {
      const sehir = il?.trim() || 'İstanbul';
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `Bugünün Türkiye özetini çıkar. Şu araçları çağır ve sonuçları kısa başlıklar altında topla:`,
                `1. tcmb_kur ile USD ve EUR (bülten tarihini yaz).`,
                `2. afad_depremler ile son 24 saatte büyüklüğü 4 ve üzeri depremler (yoksa "yok" de).`,
                `3. mgm_hava_durumu ile ${sehir} için anlık durum ve yarının tahmini; mgm_uyarilar ile yürürlükte meteorolojik uyarı varsa (il=${sehir}) tek satırda.`,
                ilPlaka(sehir) === 34
                  ? `4. ibb_trafik_indeksi ile İstanbul trafik yoğunluğu.`
                  : `4. (Trafik indeksi yalnızca İstanbul için var; ${sehir} için atla.)`,
                `5. resmi_gazete_fihrist ile bugünün Resmî Gazete'sinde yayımlanan kanun, Cumhurbaşkanı kararı ve yönetmeliklerin başlıkları (varsa ilk 5).`,
                ``,
                `Kurallar: her sayının yanına kaynağı ve verinin alınma zamanını yaz; bir araç hata verirse o başlıkta "kaynak yanıt vermedi" de, değer uydurma; toplam 10 satırı geçme.`,
              ].join('\n'),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'mevzuat_sorusu',
    {
      title: 'Bir kanun maddesini kaynağıyla açıkla',
      description:
        'Bir hukuki soruyu mevzuat.gov.tr metnine dayanarak, ilgili maddeyi çekip alıntılayarak yanıtlar. Answer a legal question from the consolidated statute text, quoting the article.',
      argsSchema: {
        soru: z.string().describe('Soru, örn. "KVKK\'ya göre özel nitelikli kişisel veri nedir?"'),
      },
    },
    ({ soru }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Şu soruyu yalnızca mevzuat metnine dayanarak yanıtla: "${soru}"`,
              ``,
              `Adımlar: önce mevzuat_ara ile ilgili kanun/yönetmeliği bul (gerekirse nerede=icerik ile metinde ara), sonra mevzuat_madde ile ilgili maddeyi çek ve metni aynen alıntıla; alıntının altında sade bir açıklama yaz.`,
              `Kurallar: kaynağı (kanun adı, numarası, madde, mevzuat.gov.tr bağlantısı) mutlaka ver; metinde olmayan bir şeyi söyleme; bunun hukuki danışmanlık olmadığını tek cümleyle belirt.`,
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
