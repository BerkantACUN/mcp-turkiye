/**
 * All network I/O goes through here. Three policies, applied to every source:
 *
 * - A timeout. Public-sector endpoints do hang; a tool that hangs takes the
 *   whole agent turn with it.
 * - One retry on a network error or a 5xx, never on a 4xx. A 404 from TCMB
 *   means "no bulletin that day" and retrying will not change that.
 * - A short in-memory cache keyed by URL. An agent asking three questions
 *   about today's rates should hit the bank once.
 *
 * Failures come back as `KaynakHatasi` with the source and URL attached, so
 * the tool can tell the user which institution did not answer instead of
 * inventing a number.
 */

import { request as httpsRequest } from 'node:https';
import { rootCertificates } from 'node:tls';
import { SURUM } from '../surum.js';

export class KaynakHatasi extends Error {
  override readonly name = 'KaynakHatasi';
  constructor(
    readonly kaynakId: string,
    readonly url: string,
    readonly neden: string,
    readonly status?: number,
  ) {
    super(`${kaynakId}: ${neden}`);
  }
}

export interface IstekSecenekleri {
  readonly kaynakId: string;
  readonly headers?: Record<string, string>;
  readonly timeoutMs?: number;
  /** Cache lifetime. 0 disables caching for this request. */
  readonly cacheMs?: number;
  /** Fetch implementation, injectable so tests never touch the network. */
  readonly fetchImpl?: typeof fetch;
  /** Body encoding when the source is not UTF-8 (Resmî Gazete is windows-1254). */
  readonly charset?: string;
  /**
   * Extra CA certificates (PEM) for a host that serves an incomplete chain.
   * Appended to Node's own trust store, never replacing it; the request then
   * goes through node:https, since fetch offers no per-request CA option.
   */
  readonly ekSertifikalar?: readonly string[];
  /** POST with this body (already serialised); GET otherwise. */
  readonly govde?: string;
  /**
   * Attempts in total (default 2: one retry on 5xx, timeout or network
   * error, never on 4xx). Raise it only for a host known to stall at random.
   */
  readonly deneme?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const VARSAYILAN_DENEME = 2;
const DEFAULT_CACHE_MS = 60_000;
/** The runtime's own fetch, captured at load so a stubbed one can be told apart. */
const YERLI_FETCH = fetch;
/**
 * Names the project and where to find it, without a URL scheme: at least
 * one government WAF (ÖSYM's) throttles a user-agent carrying
 * `+https://github.com/…` to a trickle while `github.com/…` passes.
 */
const USER_AGENT = `mcp-turkiye/${SURUM} (github.com/BerkantACUN/mcp-turkiye)`;

interface OnbellekKaydi {
  readonly body: string;
  readonly expiresAt: number;
}

const onbellek = new Map<string, OnbellekKaydi>();

/** Test hook; the cache is process-wide by design. */
export function onbellegiTemizle(): void {
  onbellek.clear();
}

export async function metinGetir(url: string, secenek: IstekSecenekleri): Promise<string> {
  const cacheMs = secenek.cacheMs ?? DEFAULT_CACHE_MS;
  // A POST is as cacheable as a GET here — the same search asked twice in
  // a minute should not hit the institution twice — but the body is part of
  // the identity.
  const anahtar = secenek.govde === undefined ? url : `${url}#${secenek.govde}`;
  const cached = onbellek.get(anahtar);
  if (cacheMs > 0 && cached && cached.expiresAt > Date.now()) {
    return cached.body;
  }

  const body = await getirDene(url, secenek, secenek.deneme ?? VARSAYILAN_DENEME);
  if (cacheMs > 0) {
    onbellek.set(anahtar, { body, expiresAt: Date.now() + cacheMs });
  }
  return body;
}

export async function jsonGetir<T = unknown>(url: string, secenek: IstekSecenekleri): Promise<T> {
  const body = await metinGetir(url, {
    ...secenek,
    headers: { accept: 'application/json', ...secenek.headers },
  });
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new KaynakHatasi(
      secenek.kaynakId,
      url,
      'yanıt JSON değil — kaynak formatı değişmiş olabilir',
    );
  }
}

async function getirDene(
  url: string,
  secenek: IstekSecenekleri,
  kalanDeneme: number,
): Promise<string> {
  // A replaced global fetch (tests stub it) always wins, so no test ever
  // reaches a real host through the node:https path either.
  const fetchImpl =
    secenek.fetchImpl ??
    (secenek.ekSertifikalar && fetch === YERLI_FETCH
      ? ekSertifikaliFetch(secenek.ekSertifikalar)
      : fetch);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), secenek.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      method: secenek.govde === undefined ? 'GET' : 'POST',
      headers: { 'user-agent': USER_AGENT, ...secenek.headers },
      ...(secenek.govde === undefined ? {} : { body: secenek.govde }),
      signal: controller.signal,
      redirect: 'follow',
    });

    if (response.ok) {
      if (secenek.charset) {
        return new TextDecoder(secenek.charset).decode(await response.arrayBuffer());
      }
      return await response.text();
    }
    if (response.status >= 500 && kalanDeneme > 1) {
      return getirDene(url, secenek, kalanDeneme - 1);
    }
    throw new KaynakHatasi(
      secenek.kaynakId,
      url,
      `kaynak ${response.status} döndü`,
      response.status,
    );
  } catch (error) {
    if (error instanceof KaynakHatasi) throw error;
    if (kalanDeneme > 1) {
      return getirDene(url, secenek, kalanDeneme - 1);
    }
    const neden =
      error instanceof Error && error.name === 'AbortError'
        ? 'kaynak zamanında yanıt vermedi'
        : `kaynağa ulaşılamadı (${error instanceof Error ? error.message : String(error)})`;
    throw new KaynakHatasi(secenek.kaynakId, url, neden);
  } finally {
    clearTimeout(timer);
  }
}

/* v8 ignore start -- real TLS only; exercised by the weekly live contract test, not by unit tests with a stubbed fetch */
/**
 * A fetch-shaped GET/POST over node:https with extra CAs. Only what the
 * sources need: method, headers, a string body, abort signal, redirects
 * followed up to a few hops, and a Response whose status/ok/text/arrayBuffer
 * behave like fetch's.
 */
function ekSertifikaliFetch(ekSertifikalar: readonly string[]): typeof fetch {
  const ca = [...rootCertificates, ...ekSertifikalar];
  const iste = (
    url: string,
    init: RequestInit | undefined,
    kalanYonlendirme: number,
  ): Promise<Response> =>
    new Promise((resolve, reject) => {
      const govde = typeof init?.body === 'string' ? init.body : undefined;
      const req = httpsRequest(
        url,
        {
          method: init?.method ?? 'GET',
          headers: {
            ...(init?.headers as Record<string, string> | undefined),
            ...(govde === undefined ? {} : { 'content-length': String(Buffer.byteLength(govde)) }),
          },
          ca,
          signal: init?.signal ?? undefined,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const konum = res.headers.location;
          if (status >= 300 && status < 400 && konum && kalanYonlendirme > 0) {
            res.resume();
            resolve(iste(new URL(konum, url).toString(), init, kalanYonlendirme - 1));
            return;
          }
          const parcalar: Buffer[] = [];
          res.on('data', (c: Buffer) => parcalar.push(c));
          res.on('end', () =>
            resolve(
              new Response(Buffer.concat(parcalar), {
                status,
                headers: { 'content-type': String(res.headers['content-type'] ?? '') },
              }),
            ),
          );
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      if (govde !== undefined) req.write(govde);
      req.end();
    });
  return ((input: string | URL | Request, init?: RequestInit) =>
    iste(String(input), init, 3)) as typeof fetch;
}
/* v8 ignore stop */
