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
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_MS = 60_000;
const USER_AGENT = 'mcp-turkiye/0.1.0 (+https://github.com/BerkantACUN/mcp-turkiye)';

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
  const cached = onbellek.get(url);
  if (cacheMs > 0 && cached && cached.expiresAt > Date.now()) {
    return cached.body;
  }

  const body = await getirDene(url, secenek, 2);
  if (cacheMs > 0) {
    onbellek.set(url, { body, expiresAt: Date.now() + cacheMs });
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
  const fetchImpl = secenek.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), secenek.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT, ...secenek.headers },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (response.ok) {
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
