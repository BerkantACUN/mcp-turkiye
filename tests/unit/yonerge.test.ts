import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { sunucuOlustur } from '../../src/server.js';
import { KAYNAKLAR } from '../../src/sources/index.js';

/** The instructions a client hands the model name every registered source. */
async function yonerge(kaynaklar = KAYNAKLAR): Promise<string> {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await sunucuOlustur(kaynaklar).connect(st);
  const client = new Client({ name: 't', version: '0' });
  await client.connect(ct);
  const metin = client.getInstructions() ?? '';
  await client.close();
  return metin;
}

it('names every registered source', async () => {
  const metin = await yonerge();
  for (const k of KAYNAKLAR) expect(metin).toContain(k.ad);
});

it('names only the sources the server was built with, and keeps the envelope rules', async () => {
  const [ilk, ...digerleri] = KAYNAKLAR;
  const metin = await yonerge(ilk ? [ilk] : []);
  expect(metin).toContain(ilk?.ad);
  for (const k of digerleri) expect(metin).not.toContain(k.ad);
  expect(metin).toMatch(/değer tahmin etmeyin/);
  expect(metin).toMatch(/`kaynak`.*`alindi`.*`veri`/);
});
