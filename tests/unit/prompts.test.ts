import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sunucuOlustur } from '../../src/server.js';

describe('prompts', () => {
  let client: Client;

  beforeEach(async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await sunucuOlustur().connect(st);
    client = new Client({ name: 't', version: '0' });
    await client.connect(ct);
  });

  afterEach(async () => {
    await client.close();
  });

  it('lists the two prompts', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['gunun_ozeti', 'mevzuat_sorusu']);
  });

  it('gunun_ozeti names every tool it wants called and insists on sources', async () => {
    const r = await client.getPrompt({ name: 'gunun_ozeti', arguments: {} });
    const text = (r.messages[0] as { content: { text: string } }).content.text;
    for (const t of [
      'tcmb_kur',
      'afad_depremler',
      'mgm_hava_durumu',
      'ibb_trafik_indeksi',
      'resmi_gazete_fihrist',
    ]) {
      expect(text).toContain(t);
    }
    expect(text).toContain('İstanbul');
    expect(text).toMatch(/değer uydurma/);
  });

  it('gunun_ozeti skips the Istanbul-only traffic index for another city', async () => {
    const r = await client.getPrompt({ name: 'gunun_ozeti', arguments: { il: 'Ankara' } });
    const text = (r.messages[0] as { content: { text: string } }).content.text;
    expect(text).toContain('Ankara');
    expect(text).toMatch(/Trafik indeksi yalnızca İstanbul için var/);
  });

  it('mevzuat_sorusu embeds the question and asks for the article to be quoted', async () => {
    const r = await client.getPrompt({
      name: 'mevzuat_sorusu',
      arguments: { soru: 'İhbar süresi kaç hafta?' },
    });
    const text = (r.messages[0] as { content: { text: string } }).content.text;
    expect(text).toContain('İhbar süresi kaç hafta?');
    expect(text).toContain('mevzuat_madde');
    expect(text).toMatch(/hukuki danışmanlık olmadığını/);
  });
});
