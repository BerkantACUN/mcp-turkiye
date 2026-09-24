import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { SURUM } from '../../src/surum.js';

/**
 * Files outside src that name the release: bumped by hand at every version,
 * so a forgotten one is caught here rather than by a registry or a user.
 */
const kok = join(__dirname, '..', '..');
const oku = (ad: string) => JSON.parse(readFileSync(join(kok, ad), 'utf8'));
const pkg = oku('package.json');

it('server.json (MCP registry) names the same package, version and registry name', () => {
  const kayit = oku('server.json');
  expect(kayit.name).toBe(pkg.mcpName);
  expect(kayit.version).toBe(SURUM);
  expect(kayit.packages).toHaveLength(1);
  expect(kayit.packages[0]).toMatchObject({
    registryType: 'npm',
    identifier: pkg.name,
    version: SURUM,
    transport: { type: 'stdio' },
  });
});

it('server.json description fits the registry schema (1–100 characters)', () => {
  const { description } = oku('server.json');
  expect([...description].length).toBeGreaterThan(0);
  expect([...description].length).toBeLessThanOrEqual(100);
});

it.each(['.mcp.json', join('examples', 'mcp.json')])('%s pins the released version', (ad) => {
  expect(oku(ad).mcpServers.turkiye.args).toEqual(['-y', `mcp-turkiye@${SURUM}`]);
});
