import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { SURUM } from '../../src/surum.js';

it('the version constant matches package.json', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
  expect(SURUM).toBe(pkg.version);
});
