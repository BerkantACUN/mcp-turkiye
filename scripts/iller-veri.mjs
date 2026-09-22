import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KAYNAK = 'https://raw.githubusercontent.com/ubeydeozdmr/turkiye-api/main/datasets';
const hedef = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'sources',
  'iller',
  'veri.ts',
);

const oku = async (ad) => {
  const r = await fetch(`${KAYNAK}/${ad}.json`);
  if (!r.ok) throw new Error(`${ad}: ${r.status}`);
  return r.json();
};

const [iller, ilceler] = await Promise.all([oku('provinces'), oku('districts')]);

const ilSatirlari = iller.map((p) => ({
  plaka: p.id,
  ad: p.name,
  nufus: p.population,
  yuzolcumuKm2: p.area?.value ?? null,
  rakimM: p.altitude?.value ?? null,
  alanKodlari: p.phoneAreaCodes ?? [],
  kiyi: Boolean(p.isCoastal),
  buyuksehir: Boolean(p.isMetropolitan),
  bolge: p.region?.tr ?? null,
  enlem: p.coordinates?.latitude ?? null,
  boylam: p.coordinates?.longitude ?? null,
  ilceSayisi: p.stats?.districtCount ?? null,
  mahalleSayisi: p.stats?.neighborhoodCount ?? null,
  koySayisi: p.stats?.villageCount ?? null,
}));

const ilceSatirlari = ilceler.map((d) => ({
  ad: d.name,
  plaka: d.provinceId,
  nufus: d.population ?? null,
  yuzolcumuKm2: d.area?.value ?? null,
}));

const tarih = new Date().toISOString().slice(0, 10);
const cikti = `export const ILLER_VERI_KAYNAGI = {
  ad: 'ubeydeozdmr/turkiye-api (MIT), TÜİK ADNKS verisi',
  url: 'https://github.com/ubeydeozdmr/turkiye-api',
  alindi: '${tarih}',
} as const;

export interface IlSatiri {
  readonly plaka: number;
  readonly ad: string;
  readonly nufus: number;
  readonly yuzolcumuKm2: number | null;
  readonly rakimM: number | null;
  readonly alanKodlari: readonly number[];
  readonly kiyi: boolean;
  readonly buyuksehir: boolean;
  readonly bolge: string | null;
  readonly enlem: number | null;
  readonly boylam: number | null;
  readonly ilceSayisi: number | null;
  readonly mahalleSayisi: number | null;
  readonly koySayisi: number | null;
}

export interface IlceSatiri {
  readonly ad: string;
  readonly plaka: number;
  readonly nufus: number | null;
  readonly yuzolcumuKm2: number | null;
}

export const ILLER_VERI: readonly IlSatiri[] = ${JSON.stringify(ilSatirlari)};

export const ILCELER_VERI: readonly IlceSatiri[] = ${JSON.stringify(ilceSatirlari)};
`;
writeFileSync(hedef, cikti);
console.log(`${ilSatirlari.length} il, ${ilceSatirlari.length} ilçe → ${hedef}`);
