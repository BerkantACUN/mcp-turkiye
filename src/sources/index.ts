import type { Kaynak } from '../core/source.js';
import { acikveri } from './acikveri/index.js';
import { afad } from './afad/index.js';
import { bist } from './bist/index.js';
import { btcturk } from './btcturk/index.js';
import { dogrulama } from './dogrulama/index.js';
import { evdsKaynagi } from './evds/index.js';
import { haber } from './haber/index.js';
import { ibb } from './ibb/index.js';
import { iller } from './iller/index.js';
import { izmir } from './izmir/index.js';
import { kandilli } from './kandilli/index.js';
import { mevzuat } from './mevzuat/index.js';
import { mgm } from './mgm/index.js';
import { opet } from './opet/index.js';
import { osym } from './osym/index.js';
import { parametreler } from './parametreler/index.js';
import { resmigazete } from './resmigazete/index.js';
import { tatil } from './tatil/index.js';
import { tcmb } from './tcmb/index.js';

/**
 * Every source the server knows. Adding one is adding a folder under
 * src/sources and a line here — see CONTRIBUTING.md. Order is the order
 * tools are listed to the client.
 */
export const KAYNAKLAR: readonly Kaynak[] = [
  tcmb,
  evdsKaynagi,
  bist,
  btcturk,
  afad,
  kandilli,
  mgm,
  opet,
  ibb,
  izmir,
  acikveri,
  resmigazete,
  mevzuat,
  tatil,
  osym,
  parametreler,
  iller,
  dogrulama,
  haber,
];
