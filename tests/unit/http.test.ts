import { beforeEach, describe, expect, it } from 'vitest';
import { jsonGetir, KaynakHatasi, metinGetir, onbellegiTemizle } from '../../src/core/http.js';

/** A fetch that answers from a script of responses and records what it was asked. */
function sahteFetch(cevaplar: Array<{ status?: number; body?: string } | Error>) {
  const istekler: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    istekler.push(String(input));
    const next = cevaplar.shift();
    if (next === undefined) throw new Error('script exhausted');
    if (next instanceof Error) throw next;
    return new Response(next.body ?? '', { status: next.status ?? 200 });
  }) as typeof fetch;
  return { fetchImpl, istekler };
}

beforeEach(() => onbellegiTemizle());

describe('metinGetir', () => {
  it('returns the body and sends a user-agent that names the project', async () => {
    let gonderilen: RequestInit['headers'];
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      gonderilen = init?.headers;
      return new Response('merhaba');
    }) as typeof fetch;
    expect(await metinGetir('https://x/a', { kaynakId: 't', fetchImpl, cacheMs: 0 })).toBe(
      'merhaba',
    );
    expect(JSON.stringify(gonderilen)).toMatch(/mcp-turkiye/);
  });

  it('retries once on a 5xx, then reports the status', async () => {
    const { fetchImpl, istekler } = sahteFetch([{ status: 503 }, { status: 503 }]);
    await expect(
      metinGetir('https://x/b', { kaynakId: 't', fetchImpl, cacheMs: 0 }),
    ).rejects.toMatchObject({
      name: 'KaynakHatasi',
      status: 503,
    });
    expect(istekler).toHaveLength(2);
  });

  it('does not retry a 404 — a missing bulletin will still be missing', async () => {
    const { fetchImpl, istekler } = sahteFetch([{ status: 404 }]);
    await expect(
      metinGetir('https://x/c', { kaynakId: 't', fetchImpl, cacheMs: 0 }),
    ).rejects.toBeInstanceOf(KaynakHatasi);
    expect(istekler).toHaveLength(1);
  });

  it('retries once on a network error and names the source when it still fails', async () => {
    const { fetchImpl, istekler } = sahteFetch([new Error('ECONNRESET'), new Error('ECONNRESET')]);
    const err = await metinGetir('https://x/d', { kaynakId: 'tcmb', fetchImpl, cacheMs: 0 }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(KaynakHatasi);
    expect(err.message).toMatch(/^tcmb: kaynağa ulaşılamadı/);
    expect(istekler).toHaveLength(2);
  });

  it('serves a second request for the same URL from cache within the TTL', async () => {
    const { fetchImpl, istekler } = sahteFetch([{ body: 'ilk' }, { body: 'ikinci' }]);
    expect(await metinGetir('https://x/e', { kaynakId: 't', fetchImpl, cacheMs: 60_000 })).toBe(
      'ilk',
    );
    expect(await metinGetir('https://x/e', { kaynakId: 't', fetchImpl, cacheMs: 60_000 })).toBe(
      'ilk',
    );
    expect(istekler).toHaveLength(1);
  });

  it('gives up after the timeout instead of hanging the agent', async () => {
    const fetchImpl = ((_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      })) as typeof fetch;
    const err = await metinGetir('https://x/f', {
      kaynakId: 't',
      fetchImpl,
      cacheMs: 0,
      timeoutMs: 20,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(KaynakHatasi);
    expect(err.neden).toMatch(/zamanında yanıt vermedi/);
  });
});

describe('jsonGetir', () => {
  it('parses JSON', async () => {
    const { fetchImpl } = sahteFetch([{ body: '{"a":1}' }]);
    expect(await jsonGetir('https://x/g', { kaynakId: 't', fetchImpl, cacheMs: 0 })).toEqual({
      a: 1,
    });
  });

  it('reports a non-JSON body as a format change, not a parse stack trace', async () => {
    const { fetchImpl } = sahteFetch([{ body: '<html>maintenance</html>' }]);
    const err = (await jsonGetir('https://x/h', { kaynakId: 'afad', fetchImpl, cacheMs: 0 }).catch(
      (e: unknown) => e,
    )) as KaynakHatasi;
    expect(err).toBeInstanceOf(KaynakHatasi);
    expect(err.neden).toMatch(/JSON değil/);
  });
});
