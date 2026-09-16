import { z } from 'zod';
import { cevapla, hata, zarfSemasi } from '../../core/cevap.js';
import { jsonGetir, KaynakHatasi } from '../../core/http.js';
import { SECTIGO_DV_R36 } from '../../core/sertifikalar.js';
import { type Kaynak, zarfla } from '../../core/source.js';

const KAYNAK_ID = 'acikveri';

/**
 * Municipal open-data portals run CKAN, so one client covers all of them:
 * search, dataset details, and — when the portal has loaded a resource into
 * its DataStore — the rows themselves. Each portal publishes under its own
 * licence, and the dataset answer carries that licence by name, because
 * "open data" from İBB and from İzmir are two different permissions.
 */
interface Portal {
  readonly ad: string;
  readonly url: string;
  readonly lisans: string;
  /** Intermediate CAs a portal fails to send; see core/sertifikalar.ts. */
  readonly ekSertifikalar?: readonly string[];
}

export const PORTALLAR = {
  ibb: {
    ad: 'İBB Açık Veri Portalı (İstanbul Büyükşehir Belediyesi)',
    url: 'https://data.ibb.gov.tr',
    lisans: 'Istanbul Metropolitan Municipality Open Data License',
  },
  izmir: {
    ad: 'İzmir Büyükşehir Belediyesi Açık Veri Portalı',
    url: 'https://acikveri.bizizmir.com',
    lisans: 'Izmir Metropolitan Municipality License (çoğu veri seti); bazıları CC-BY',
  },
  konya: {
    ad: 'Konya Büyükşehir Belediyesi Açık Veri Portalı',
    url: 'https://acikveri.konya.bel.tr',
    lisans: 'Creative Commons Attribution (CC-BY / CC-BY 4.0)',
  },
  gaziantep: {
    ad: 'Gaziantep Büyükşehir Belediyesi Açık Veri Portalı',
    url: 'https://acikveri.gaziantep.bel.tr',
    lisans: 'Gaziantep Açık Veri Lisansı (çoğu veri seti); bir kısmı CC-BY 4.0',
    // The portal serves its chain without the Sectigo intermediate.
    ekSertifikalar: [SECTIGO_DV_R36],
  },
} as const satisfies Record<string, Portal>;

export type PortalId = keyof typeof PORTALLAR;

const portalSemasi = z
  .enum(['ibb', 'izmir', 'konya', 'gaziantep'])
  .describe('ibb (İstanbul) | izmir | konya | gaziantep');

interface CkanYanit<T> {
  readonly success?: boolean;
  readonly result?: T;
  readonly error?: { readonly message?: string };
}

interface CkanKaynak {
  readonly id?: string;
  readonly name?: string;
  readonly format?: string;
  readonly url?: string;
  readonly datastore_active?: boolean | string;
  readonly size?: number | string | null;
  readonly last_modified?: string | null;
}

interface CkanPaket {
  readonly name?: string;
  readonly title?: string;
  readonly notes?: string | null;
  readonly metadata_modified?: string;
  readonly license_title?: string;
  readonly organization?: { readonly title?: string } | null;
  readonly tags?: readonly { readonly name?: string }[];
  readonly resources?: readonly CkanKaynak[];
}

export interface VerisetiOzeti {
  readonly ad: string;
  readonly baslik: string;
  readonly aciklama: string;
  readonly kurum: string | null;
  readonly etiketler: readonly string[];
  readonly formatlar: readonly string[];
  readonly kaynakSayisi: number;
  readonly guncelleme: string | null;
  readonly url: string;
}

export interface KaynakOzeti {
  readonly id: string;
  readonly ad: string;
  readonly format: string;
  readonly url: string;
  readonly tabloServisi: boolean;
  readonly boyutBayt: number | null;
  readonly guncelleme: string | null;
}

const kisalt = (s: string | null | undefined, n = 300): string => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const aktif = (v: unknown): boolean => v === true || v === 'True' || v === 'true';

export function paketiOzetle(portal: PortalId, p: CkanPaket): VerisetiOzeti | null {
  if (!p.name) return null;
  const formatlar = [
    ...new Set((p.resources ?? []).map((r) => (r.format ?? '').toUpperCase()).filter(Boolean)),
  ];
  return {
    ad: p.name,
    baslik: p.title ?? p.name,
    aciklama: kisalt(p.notes),
    kurum: p.organization?.title ?? null,
    etiketler: (p.tags ?? []).map((t) => t.name ?? '').filter(Boolean),
    formatlar,
    kaynakSayisi: p.resources?.length ?? 0,
    guncelleme: p.metadata_modified ?? null,
    url: `${PORTALLAR[portal].url}/dataset/${p.name}`,
  };
}

export function kaynagiOzetle(r: CkanKaynak): KaynakOzeti | null {
  if (!r.id) return null;
  const boyut = r.size === null || r.size === undefined ? null : Number(r.size);
  return {
    id: r.id,
    ad: r.name ?? r.id,
    format: (r.format ?? '').toUpperCase(),
    url: r.url ?? '',
    tabloServisi: aktif(r.datastore_active),
    boyutBayt: boyut !== null && Number.isFinite(boyut) ? boyut : null,
    guncelleme: r.last_modified ?? null,
  };
}

async function ckan<T>(
  portal: PortalId,
  eylem: string,
  params: Record<string, string>,
  cacheMs: number,
): Promise<T> {
  const url = `${PORTALLAR[portal].url}/api/3/action/${eylem}?${new URLSearchParams(params).toString()}`;
  const ek = (PORTALLAR[portal] as Portal).ekSertifikalar;
  const yanit = await jsonGetir<CkanYanit<T>>(url, {
    kaynakId: `${KAYNAK_ID}/${portal}`,
    cacheMs,
    ...(ek ? { ekSertifikalar: ek } : {}),
  });
  if (!yanit.success || yanit.result === undefined) {
    throw new KaynakHatasi(
      `${KAYNAK_ID}/${portal}`,
      url,
      yanit.error?.message ?? 'CKAN success=false döndü',
    );
  }
  return yanit.result;
}

const verisetiSemasi = z.object({
  ad: z.string(),
  baslik: z.string(),
  aciklama: z.string(),
  kurum: z.string().nullable(),
  etiketler: z.array(z.string()),
  formatlar: z.array(z.string()),
  kaynakSayisi: z.number(),
  guncelleme: z.string().nullable(),
  url: z.string(),
});

const kaynakSemasi = z.object({
  id: z.string(),
  ad: z.string(),
  format: z.string(),
  url: z.string(),
  tabloServisi: z.boolean(),
  boyutBayt: z.number().nullable(),
  guncelleme: z.string().nullable(),
});

export const acikveri: Kaynak = {
  id: KAYNAK_ID,
  ad: 'Belediye açık veri portalları (CKAN): İBB, İzmir, Konya, Gaziantep',
  url: 'https://data.ibb.gov.tr',
  lisans:
    'Her portalın kendi açık veri lisansı; veri seti yanıtı lisansı adıyla taşır (bkz. SOURCES.md)',

  kaydet(server) {
    server.registerTool(
      'acikveri_ara',
      {
        title: 'Açık veri portalında veri seti ara',
        description:
          'İBB (İstanbul), İzmir, Konya ya da Gaziantep Büyükşehir açık veri portalında veri seti arar: başlık, açıklama, kurum, etiketler, dosya biçimleri. Search datasets on the Istanbul, İzmir, Konya or Gaziantep municipal open-data portal (CKAN). Sonuçtaki `ad` ile acikveri_veriseti çağrılır.',
        inputSchema: {
          portal: portalSemasi,
          sorgu: z.string().min(1).describe('Arama metni, örn. "otopark", "trafik", "nüfus"'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe('En fazla sonuç, varsayılan 10'),
        },
        outputSchema: zarfSemasi(
          z.object({
            portal: z.string(),
            toplam: z.number(),
            verisetleri: z.array(verisetiSemasi),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ portal, sorgu, limit }) => {
        try {
          const r = await ckan<{ count?: number; results?: CkanPaket[] }>(
            portal,
            'package_search',
            { q: sorgu, rows: String(limit ?? 10) },
            10 * 60 * 1000,
          );
          const verisetleri = (r.results ?? [])
            .map((p) => paketiOzetle(portal, p))
            .filter((x): x is VerisetiOzeti => x !== null);
          return cevapla(
            zarfla(
              acikveri,
              { portal: PORTALLAR[portal].ad, toplam: r.count ?? verisetleri.length, verisetleri },
              `${PORTALLAR[portal].url}/dataset?q=${encodeURIComponent(sorgu)}`,
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );

    server.registerTool(
      'acikveri_veriseti',
      {
        title: 'Açık veri seti ayrıntısı ve dosyaları',
        description:
          'Bir veri setinin açıklaması, lisansı ve dosyaları (kaynakları): biçim, indirme bağlantısı, tablo servisinin (DataStore) açık olup olmadığı. Dataset details and resources from a municipal CKAN portal. Tablo servisi açık kaynaklar acikveri_kayitlar ile satır satır okunur.',
        inputSchema: {
          portal: portalSemasi,
          ad: z
            .string()
            .min(1)
            .describe('Veri setinin `ad` değeri (URL adı), acikveri_ara sonucundan'),
        },
        outputSchema: zarfSemasi(
          z.object({
            portal: z.string(),
            veriseti: verisetiSemasi,
            lisans: z.string().nullable(),
            kaynaklar: z.array(kaynakSemasi),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ portal, ad }) => {
        try {
          const p = await ckan<CkanPaket>(portal, 'package_show', { id: ad }, 10 * 60 * 1000);
          const veriseti = paketiOzetle(portal, p);
          if (!veriseti) return hata(new Error(`"${ad}" adlı veri seti bulunamadı`));
          const kaynaklar = (p.resources ?? [])
            .map(kaynagiOzetle)
            .filter((x): x is KaynakOzeti => x !== null);
          return cevapla(
            zarfla(
              acikveri,
              {
                portal: PORTALLAR[portal].ad,
                veriseti,
                lisans: p.license_title ?? null,
                kaynaklar,
              },
              veriseti.url,
            ),
          );
        } catch (error) {
          return hata(error);
        }
      },
    );

    server.registerTool(
      'acikveri_kayitlar',
      {
        title: 'Açık veri kaynağından satırları oku (DataStore)',
        description:
          'Tablo servisi açık bir kaynağın (acikveri_veriseti → kaynaklar → tabloServisi=true) sütunlarını ve satırlarını verir; isteğe bağlı tam metin filtresi. Rows from a CKAN DataStore resource. Büyük tablolar için limit ve sayfa (offset) kullanın; toplam satır sayısı yanıttadır.',
        inputSchema: {
          portal: portalSemasi,
          kaynakId: z.string().min(8).describe('Kaynağın `id` değeri'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .optional()
            .describe('En fazla satır, varsayılan 50'),
          offset: z.number().int().min(0).optional().describe('Atlanacak satır sayısı (sayfalama)'),
          filtre: z.string().optional().describe('Tam metin arama, isteğe bağlı'),
        },
        outputSchema: zarfSemasi(
          z.object({
            portal: z.string(),
            toplam: z.number().nullable(),
            sutunlar: z.array(z.object({ ad: z.string(), tur: z.string() })),
            satirlar: z.array(z.record(z.string(), z.unknown())),
          }),
        ),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ portal, kaynakId, limit, offset, filtre }) => {
        try {
          const params: Record<string, string> = {
            resource_id: kaynakId,
            limit: String(limit ?? 50),
          };
          if (offset) params.offset = String(offset);
          if (filtre) params.q = filtre;
          const r = await ckan<{
            total?: number;
            fields?: { id?: string; type?: string }[];
            records?: Record<string, unknown>[];
          }>(portal, 'datastore_search', params, 5 * 60 * 1000);
          return cevapla(
            zarfla(
              acikveri,
              {
                portal: PORTALLAR[portal].ad,
                toplam: typeof r.total === 'number' ? r.total : null,
                sutunlar: (r.fields ?? []).map((f) => ({ ad: f.id ?? '', tur: f.type ?? '' })),
                satirlar: r.records ?? [],
              },
              `${PORTALLAR[portal].url}/api/3/action/datastore_search?resource_id=${kaynakId}`,
            ),
          );
        } catch (error) {
          if (error instanceof KaynakHatasi && error.status === 404) {
            return hata(
              new KaynakHatasi(
                error.kaynakId,
                error.url,
                'bu kaynak için tablo servisi (DataStore) açık değil; acikveri_veriseti yanıtındaki indirme bağlantısını kullanın',
                404,
              ),
            );
          }
          return hata(error);
        }
      },
    );
  },
};
