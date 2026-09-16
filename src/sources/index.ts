import type { Kaynak } from '../core/source.js';
import { afad } from './afad/index.js';
import { dogrulama } from './dogrulama/index.js';
import { mgm } from './mgm/index.js';
import { tatil } from './tatil/index.js';
import { tcmb } from './tcmb/index.js';

/**
 * Every source the server knows. Adding one is adding a folder under
 * src/sources and a line here — see CONTRIBUTING.md. Order is the order
 * tools are listed to the client.
 */
export const KAYNAKLAR: readonly Kaynak[] = [tcmb, afad, mgm, tatil, dogrulama];
