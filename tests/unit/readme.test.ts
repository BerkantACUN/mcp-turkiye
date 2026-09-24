import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { sunucuOlustur } from '../../src/server.js';

/**
 * The README is what people read before installing; it must not promise a
 * tool the server does not register, miss one it does, or miscount them.
 */
const readme = readFileSync(join(__dirname, '..', '..', 'README.md'), 'utf8');

async function araclar(): Promise<string[]> {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await sunucuOlustur().connect(st);
  const client = new Client({ name: 't', version: '0' });
  await client.connect(ct);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t) => t.name);
}

const BIRLER = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const ONLAR = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

/** 20–99 in English words, the range the tool count lives in. */
function ingilizce(n: number): string {
  const onlar = ONLAR[Math.floor(n / 10)] ?? '';
  const birler = BIRLER[n % 10] ?? '';
  return birler ? `${onlar}-${birler}` : onlar;
}

it('the README tool table lists exactly the registered tools', async () => {
  const bolum = readme.slice(readme.indexOf('## Araçlar'), readme.indexOf('## Hazır sorular'));
  const tablodakiler = [...bolum.matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map((m) => m[1]);
  expect(tablodakiler.sort()).toEqual((await araclar()).sort());
});

it('the English summary states the real tool count', async () => {
  const n = (await araclar()).length;
  expect(n).toBeGreaterThanOrEqual(20);
  expect(n).toBeLessThan(100);
  const kelime = ingilizce(n);
  expect(readme).toContain(`${kelime[0]?.toUpperCase()}${kelime.slice(1)} tools today`);
});
