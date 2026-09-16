import type { Kaynak } from '../core/source.js';
import { acikveri } from './acikveri/index.js';
import { afad } from './afad/index.js';
import { bist } from './bist/index.js';
import { dogrulama } from './dogrulama/index.js';
import { evdsKaynagi } from './evds/index.js';
import { ibb } from './ibb/index.js';
import { mevzuat } from './mevzuat/index.js';
import { mgm } from './mgm/index.js';
import { opet } from './opet/index.js';
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
  afad,
  mgm,
  opet,
  ibb,
  acikveri,
  resmigazete,
  mevzuat,
  tatil,
  dogrulama,
];
