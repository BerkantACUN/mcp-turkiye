import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { SURUM } from '../../src/surum.js';

it('the version constant matches package.json', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
  expect(SURUM).toBe(pkg.version);
});

it('the Cursor plugin manifest carries the same version and a real MCP config', () => {
  const kok = join(__dirname, '..', '..');
  const eklenti = JSON.parse(readFileSync(join(kok, '.cursor-plugin', 'plugin.json'), 'utf8'));
  expect(eklenti.version).toBe(SURUM);
  expect(eklenti.name).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
  const mcp = JSON.parse(readFileSync(join(kok, eklenti.mcpServers), 'utf8'));
  expect(mcp.mcpServers.turkiye.args).toContain(`mcp-turkiye@${SURUM}`);
});
