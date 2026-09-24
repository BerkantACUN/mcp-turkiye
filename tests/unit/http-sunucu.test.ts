import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AZAMI_GOVDE,
  HizSiniri,
  type HttpAyarlari,
  httpSunucusuOlustur,
  istemciIp,
  ortamdanAyarlar,
} from '../../src/http-sunucu.js';
import { SURUM } from '../../src/server.js';

/**
 * The Streamable HTTP entry, on a real socket bound to an ephemeral port:
 * health, the key, the per-IP limit, and that a tool called over HTTP returns
 * the same envelope as over stdio. Only offline tools are called.
 */
let sunucu: Server | undefined;

async function baslat(ayar: Partial<HttpAyarlari> = {}): Promise<string> {
  sunucu = httpSunucusuOlustur({
    dakikaLimiti: 60,
    pencereMs: 60_000,
    proxyyeGuven: false,
    ...ayar,
  });
  await new Promise<void>((ok) => sunucu?.listen(0, '127.0.0.1', ok));
  const { port } = sunucu.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  if (!sunucu) return;
  sunucu.closeAllConnections();
  await new Promise((ok) => sunucu?.close(ok));
  sunucu = undefined;
});

const BASLAT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  },
};

function mcpPost(taban: string, basliklar: Record<string, string> = {}) {
  return fetch(`${taban}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...basliklar,
    },
    body: JSON.stringify(BASLAT),
  });
}

describe('ortamdanAyarlar', () => {
  it('defaults to 0.0.0.0:8080, no key, 60 per minute, proxy not trusted', () => {
    expect(ortamdanAyarlar({})).toEqual({
      port: 8080,
      host: '0.0.0.0',
      apiAnahtari: undefined,
      dakikaLimiti: 60,
      pencereMs: 60_000,
      proxyyeGuven: false,
      izinliKaynaklar: [],
    });
  });

  it('reads the allowed browser origins as a comma list', () => {
    expect(
      ortamdanAyarlar({ MCP_TURKIYE_ALLOWED_ORIGINS: ' https://a.dev, ,https://b.dev ' })
        .izinliKaynaklar,
    ).toEqual(['https://a.dev', 'https://b.dev']);
  });

  it('reads PORT, HOST, the key, the limit and TRUST_PROXY', () => {
    expect(
      ortamdanAyarlar({
        PORT: '3000',
        HOST: '127.0.0.1',
        MCP_TURKIYE_API_KEY: 'yeni',
        MCP_PROXY_API_KEY: 'eski',
        MCP_TURKIYE_RATE_LIMIT: '5',
        TRUST_PROXY: '1',
      }),
    ).toMatchObject({
      port: 3000,
      host: '127.0.0.1',
      apiAnahtari: 'yeni',
      dakikaLimiti: 5,
      proxyyeGuven: true,
    });
  });

  it('still accepts the mcp-proxy era key name', () => {
    expect(ortamdanAyarlar({ MCP_PROXY_API_KEY: 'eski' }).apiAnahtari).toBe('eski');
  });

  it('falls back to 60 on a nonsense limit and allows 0 to disable it', () => {
    expect(ortamdanAyarlar({ MCP_TURKIYE_RATE_LIMIT: 'çok' }).dakikaLimiti).toBe(60);
    expect(ortamdanAyarlar({ MCP_TURKIYE_RATE_LIMIT: '-1' }).dakikaLimiti).toBe(60);
    expect(ortamdanAyarlar({ MCP_TURKIYE_RATE_LIMIT: '0' }).dakikaLimiti).toBe(0);
    expect(ortamdanAyarlar({ TRUST_PROXY: 'true' }).proxyyeGuven).toBe(false);
  });
});

describe('HizSiniri', () => {
  it('lets the limit through, then asks to wait until the window ends', () => {
    let an = 0;
    const h = new HizSiniri(2, 60_000, () => an);
    expect(h.kaydet('a')).toBe(0);
    expect(h.kaydet('a')).toBe(0);
    an = 15_000;
    expect(h.kaydet('a')).toBe(45);
    expect(h.kaydet('b')).toBe(0);
    an = 60_000;
    expect(h.kaydet('a')).toBe(0);
  });

  it('never answers 0 seconds while still over the limit', () => {
    let an = 0;
    const h = new HizSiniri(1, 60_000, () => an);
    h.kaydet('a');
    an = 59_999;
    expect(h.kaydet('a')).toBe(1);
  });

  it('forgets expired windows so memory does not grow with every IP seen', () => {
    let an = 0;
    const h = new HizSiniri(5, 1_000, () => an);
    for (let i = 0; i < 100; i++) h.kaydet(`ip${i}`);
    expect(h.boyut).toBe(100);
    an = 2_000;
    h.kaydet('yeni');
    expect(h.boyut).toBe(1);
  });

  it('is off at 0', () => {
    const h = new HizSiniri(0, 60_000);
    for (let i = 0; i < 1000; i++) expect(h.kaydet('a')).toBe(0);
  });

  it('caps the number of addresses between sweeps, evicting the oldest', () => {
    const an = 0;
    const h = new HizSiniri(5, 60_000, () => an, 3);
    for (const ip of ['a', 'b', 'c', 'd', 'e']) h.kaydet(ip);
    expect(h.boyut).toBe(3);
    h.kaydet('e');
    expect(h.boyut).toBe(3);
  });
});

describe('istemciIp', () => {
  const istek = (xff?: string | string[], adres: string | null = '10.0.0.9') =>
    ({
      headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
      socket: { remoteAddress: adres ?? undefined },
    }) as never;

  it('ignores X-Forwarded-For unless the proxy is trusted', () => {
    expect(istemciIp(istek('1.2.3.4'), false)).toBe('10.0.0.9');
  });

  it('takes the entry the trusted proxy appended, not the spoofable ones', () => {
    expect(istemciIp(istek('6.6.6.6, 1.2.3.4'), true)).toBe('1.2.3.4');
    expect(istemciIp(istek(['6.6.6.6', '1.2.3.4 ']), true)).toBe('1.2.3.4');
  });

  it('falls back to the socket when the header is missing or empty', () => {
    expect(istemciIp(istek(undefined), true)).toBe('10.0.0.9');
    expect(istemciIp(istek(' , '), true)).toBe('10.0.0.9');
    expect(istemciIp(istek(undefined, null), false)).toBe('bilinmiyor');
  });
});

describe('HTTP sunucusu', () => {
  it('answers GET /health with 200 and the version, without a key', async () => {
    const taban = await baslat({ apiAnahtari: 'gizli' });
    const r = await fetch(`${taban}/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ durum: 'ok', surum: SURUM });
  });

  it('leaves /health out of the rate limit', async () => {
    const taban = await baslat({ dakikaLimiti: 1 });
    for (let i = 0; i < 3; i++) expect((await fetch(`${taban}/health`)).status).toBe(200);
  });

  it('refuses other methods on /health and unknown paths', async () => {
    const taban = await baslat();
    expect((await fetch(`${taban}/health`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${taban}/sse`)).status).toBe(404);
  });

  it('answers a CORS preflight only for an allowed origin', async () => {
    const taban = await baslat({ apiAnahtari: 'gizli', izinliKaynaklar: ['https://izinli.dev'] });
    const izinli = await fetch(`${taban}/mcp`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://izinli.dev' },
    });
    expect(izinli.status).toBe(204);
    expect(izinli.headers.get('access-control-allow-origin')).toBe('https://izinli.dev');
    expect(izinli.headers.get('access-control-allow-headers')).toMatch(/X-API-Key/);
    const yabanci = await fetch(`${taban}/mcp`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://kotu.example' },
    });
    expect(yabanci.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses a browser origin that is not allowed, DNS rebinding included', async () => {
    const taban = await baslat();
    const r = await mcpPost(taban, { Origin: 'http://kotu.example:8080' });
    expect(r.status).toBe(403);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    expect((await mcpPost(taban)).status).toBe(200);
  });

  it('serves an allowed origin, or any origin with *', async () => {
    const tek = await baslat({ izinliKaynaklar: ['https://izinli.dev'] });
    const r = await mcpPost(tek, { Origin: 'https://izinli.dev' });
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('https://izinli.dev');
    sunucu?.closeAllConnections();
    await new Promise((ok) => sunucu?.close(ok));
    const herkes = await baslat({ izinliKaynaklar: ['*'] });
    const h = await mcpPost(herkes, { Origin: 'https://baska.dev' });
    expect(h.status).toBe(200);
    expect(h.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('answers 413 to a body larger than any tool call needs', async () => {
    const taban = await baslat();
    const r = await fetch(`${taban}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ ...BASLAT, dolgu: 'x'.repeat(AZAMI_GOVDE) }),
    });
    expect(r.status).toBe(413);
  });

  it('answers 413 to an oversized chunked body that carries no Content-Length', async () => {
    const taban = await baslat();
    const durum = await new Promise<number>((ok, hata) => {
      const istek = request(
        `${taban}/mcp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'Transfer-Encoding': 'chunked',
          },
        },
        (res) => {
          res.resume();
          ok(res.statusCode ?? 0);
        },
      );
      // The server may cut the upload short once it has seen enough.
      istek.on('error', (e) => (istek.writableEnded ? undefined : hata(e)));
      const parca = 'x'.repeat(64 * 1024);
      istek.write(`{"jsonrpc":"2.0","id":1,"method":"initialize","dolgu":"`);
      for (let i = 0; i < 20; i++) istek.write(parca);
      istek.end('"}');
    });
    expect(durum).toBe(413);
  });

  it('survives a client that drops the connection mid-upload', async () => {
    const taban = await baslat();
    await new Promise<void>((ok) => {
      const istek = request(`${taban}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
      });
      istek.on('error', () => ok());
      istek.write('{"jsonrpc":"2.0",');
      setTimeout(() => istek.destroy(), 50);
    });
    expect((await fetch(`${taban}/health`)).status).toBe(200);
  });

  it('still serves a small chunked body', async () => {
    const taban = await baslat();
    const govde = await new Promise<string>((ok, hata) => {
      const istek = request(
        `${taban}/mcp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'Transfer-Encoding': 'chunked',
          },
        },
        (res) => {
          let metin = '';
          res.on('data', (p) => {
            metin += p;
          });
          res.on('end', () => ok(metin));
        },
      );
      istek.on('error', hata);
      istek.end(JSON.stringify(BASLAT));
    });
    expect(JSON.parse(govde)).toMatchObject({ result: { serverInfo: { name: 'mcp-turkiye' } } });
  });

  it('requires X-API-Key when a key is set: 401 without or with a wrong one', async () => {
    const taban = await baslat({ apiAnahtari: 'gizli' });
    const yok = await mcpPost(taban);
    expect(yok.status).toBe(401);
    expect(await yok.json()).toMatchObject({ error: { message: /X-API-Key/ } });
    expect((await mcpPost(taban, { 'X-API-Key': 'yanlis' })).status).toBe(401);
    expect((await mcpPost(taban, { 'X-API-Key': 'gizli-uzun' })).status).toBe(401);
    expect((await mcpPost(taban, { 'X-API-Key': 'gizli' })).status).toBe(200);
  });

  it('needs no key when none is configured', async () => {
    const taban = await baslat();
    const r = await mcpPost(taban);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ result: { serverInfo: { name: 'mcp-turkiye' } } });
  });

  it('is stateless: no session id, GET and DELETE are refused', async () => {
    const taban = await baslat();
    const r = await mcpPost(taban);
    expect(r.headers.get('mcp-session-id')).toBeNull();
    expect((await fetch(`${taban}/mcp`)).status).toBe(405);
    expect((await fetch(`${taban}/mcp`, { method: 'DELETE' })).status).toBe(405);
  });

  it('answers 429 with Retry-After past the per-minute limit', async () => {
    const taban = await baslat({ dakikaLimiti: 2 });
    expect((await mcpPost(taban)).status).toBe(200);
    expect((await mcpPost(taban)).status).toBe(200);
    const r = await mcpPost(taban);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(Number(r.headers.get('retry-after'))).toBeLessThanOrEqual(60);
  });

  it('counts unauthorised requests too, so keys cannot be guessed at full speed', async () => {
    const taban = await baslat({ apiAnahtari: 'gizli', dakikaLimiti: 1 });
    expect((await mcpPost(taban)).status).toBe(401);
    expect((await mcpPost(taban, { 'X-API-Key': 'gizli' })).status).toBe(429);
  });

  it('keys the limit on X-Forwarded-For only behind a trusted proxy', async () => {
    const guvenli = await baslat({ dakikaLimiti: 1, proxyyeGuven: true });
    expect((await mcpPost(guvenli, { 'X-Forwarded-For': '1.1.1.1' })).status).toBe(200);
    expect((await mcpPost(guvenli, { 'X-Forwarded-For': '2.2.2.2' })).status).toBe(200);
    expect((await mcpPost(guvenli, { 'X-Forwarded-For': '1.1.1.1' })).status).toBe(429);
  });

  it('does not let a forged X-Forwarded-For dodge the limit when the proxy is not trusted', async () => {
    const taban = await baslat({ dakikaLimiti: 1 });
    expect((await mcpPost(taban, { 'X-Forwarded-For': '1.1.1.1' })).status).toBe(200);
    expect((await mcpPost(taban, { 'X-Forwarded-For': '2.2.2.2' })).status).toBe(429);
  });

  it('serves the same tools and envelope as stdio to a real MCP client', async () => {
    const taban = await baslat({ apiAnahtari: 'gizli' });
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${taban}/mcp`), {
        requestInit: { headers: { 'X-API-Key': 'gizli' } },
      }) as Transport,
    );
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('dogrula_tckn');
    const r = (await client.callTool({
      name: 'dogrula_tckn',
      arguments: { tckn: '10000000146' },
    })) as { structuredContent?: { kaynak: unknown; alindi: string; veri: { gecerli: boolean } } };
    expect(r.structuredContent).toMatchObject({
      kaynak: expect.any(Object),
      alindi: expect.any(String),
      veri: { gecerli: true },
    });
    await client.close();
  });

  it('rejects malformed JSON with 400', async () => {
    const taban = await baslat();
    const r = await fetch(`${taban}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: '{bozuk',
    });
    // The transport answers malformed JSON itself with a JSON-RPC parse error.
    expect(r.status).toBe(400);
  });
});
