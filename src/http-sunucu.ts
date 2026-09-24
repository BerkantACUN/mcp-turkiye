import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { SURUM, sunucuOlustur } from './server.js';

/**
 * The server over Streamable HTTP, without mcp-proxy in between. Stateless:
 * every POST to /mcp gets a fresh McpServer and transport, so no session
 * lives in memory and any replica can answer any request. The tools and the
 * envelope are exactly the stdio server's — `sunucuOlustur()` is reused as is.
 */
export type HttpAyarlari = {
  /** When set, every /mcp request must carry it in `X-API-Key`. */
  apiAnahtari?: string | undefined;
  /** Requests per IP per window; 0 turns the limit off. */
  dakikaLimiti: number;
  /** Window length in ms (a minute outside tests). */
  pencereMs: number;
  /** Read the client IP from `X-Forwarded-For` (only behind a trusted proxy). */
  proxyyeGuven: boolean;
  /**
   * Browser origins allowed to call /mcp (`*` allows any). A request carrying
   * an `Origin` header that is not listed gets 403: MCP clients send none, while
   * browsers send one on every POST, DNS-rebinding requests included.
   */
  izinliKaynaklar?: readonly string[] | undefined;
  /** Clock, injectable for tests. */
  simdi?: (() => number) | undefined;
};

type Ortam = Record<string, string | undefined>;

/** Tool arguments are small; anything larger is not a legitimate MCP request. */
export const AZAMI_GOVDE = 1024 * 1024;

/** Settings from the environment; the entry point takes no arguments. */
export function ortamdanAyarlar(env: Ortam = process.env): HttpAyarlari & {
  port: number;
  host: string;
} {
  const limit = Number(env.MCP_TURKIYE_RATE_LIMIT ?? 60);
  return {
    port: Number(env.PORT) || 8080,
    // The IPv4 wildcard: "::" fails with EAFNOSUPPORT on hosts without IPv6
    // (Azure Container Apps).
    host: env.HOST || '0.0.0.0',
    // The mcp-proxy era name keeps working so existing deployments need no change.
    apiAnahtari: env.MCP_TURKIYE_API_KEY || env.MCP_PROXY_API_KEY || undefined,
    dakikaLimiti: Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 60,
    pencereMs: 60_000,
    proxyyeGuven: env.TRUST_PROXY === '1',
    izinliKaynaklar: (env.MCP_TURKIYE_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** Fixed-window counter per IP, in memory; enough for one container. */
export class HizSiniri {
  private readonly pencereler = new Map<string, { baslangic: number; sayi: number }>();

  constructor(
    private readonly limit: number,
    private readonly pencereMs: number,
    private readonly simdi: () => number = Date.now,
    private readonly enFazlaIp = 10_000,
  ) {}

  /** Counts the request; returns seconds to wait when over the limit, else 0. */
  kaydet(ip: string): number {
    if (this.limit === 0) return 0;
    const an = this.simdi();
    this.supur(an);
    const p = this.pencereler.get(ip);
    if (!p || an - p.baslangic >= this.pencereMs) {
      if (!p) this.yerAc(an);
      this.pencereler.set(ip, { baslangic: an, sayi: 1 });
      return 0;
    }
    p.sayi += 1;
    if (p.sayi <= this.limit) return 0;
    return Math.max(1, Math.ceil((p.baslangic + this.pencereMs - an) / 1000));
  }

  get boyut(): number {
    return this.pencereler.size;
  }

  private sonSupurme = 0;

  /** Drops expired windows at most once per window. */
  private supur(an: number, zorla = false): void {
    if (!zorla && an - this.sonSupurme < this.pencereMs) return;
    this.sonSupurme = an;
    for (const [ip, p] of this.pencereler) {
      if (an - p.baslangic >= this.pencereMs) this.pencereler.delete(ip);
    }
  }

  /**
   * Caps the map between sweeps: a burst of distinct addresses first forces a
   * sweep, then evicts the oldest windows. An evicted address starts a fresh
   * window, which is the price of bounded memory under such a burst.
   */
  private yerAc(an: number): void {
    if (this.pencereler.size < this.enFazlaIp) return;
    this.supur(an, true);
    for (const ip of this.pencereler.keys()) {
      if (this.pencereler.size < this.enFazlaIp) break;
      this.pencereler.delete(ip);
    }
  }
}

/**
 * The client address. Behind a trusted proxy the rightmost X-Forwarded-For
 * entry is the one that proxy appended; entries to its left are whatever the
 * client sent and cannot be trusted.
 */
export function istemciIp(req: IncomingMessage, proxyyeGuven: boolean): string {
  if (proxyyeGuven) {
    const baslik = req.headers['x-forwarded-for'];
    const deger = Array.isArray(baslik) ? baslik.join(',') : baslik;
    const son = deger
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .pop();
    if (son) return son;
  }
  return req.socket.remoteAddress ?? 'bilinmiyor';
}

function anahtarDogru(gelen: string | string[] | undefined, beklenen: string): boolean {
  if (typeof gelen !== 'string') return false;
  const a = Buffer.from(gelen);
  const b = Buffer.from(beklenen);
  return a.length === b.length && timingSafeEqual(a, b);
}

function kaynakIzinli(kaynak: string | undefined, izinli: readonly string[]): boolean {
  return kaynak === undefined || izinli.includes('*') || izinli.includes(kaynak);
}

/** CORS headers only for an allowed browser origin; none for everyone else. */
function corsBasliklari(
  kaynak: string | undefined,
  izinli: readonly string[],
): Record<string, string> {
  if (kaynak === undefined || !kaynakIzinli(kaynak, izinli)) return {};
  return {
    'Access-Control-Allow-Origin': izinli.includes('*') ? '*' : kaynak,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Accept, X-API-Key, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
    Vary: 'Origin',
  };
}

function jsonYaz(
  res: ServerResponse,
  durum: number,
  govde: unknown,
  basliklar: Record<string, string> = {},
): void {
  res.writeHead(durum, { 'Content-Type': 'application/json', ...basliklar });
  res.end(JSON.stringify(govde));
}

/** A JSON-RPC error body, the shape MCP clients know how to show. */
function rpcHata(kod: number, mesaj: string) {
  return { jsonrpc: '2.0', error: { code: kod, message: mesaj }, id: null };
}

/**
 * The request body as text, or null when it passes AZAMI_GOVDE — declared or
 * not. Past the limit nothing more is kept, but the rest is still read and
 * dropped: answering and closing while the client is still uploading resets
 * the connection (macOS reports ECONNRESET) instead of delivering the 413.
 */
function govdeOku(req: IncomingMessage): Promise<string | null> {
  return new Promise((ok, hata) => {
    const parcalar: Buffer[] = [];
    let boyut = 0;
    let fazla = Number(req.headers['content-length']) > AZAMI_GOVDE;
    req.on('data', (parca: Buffer) => {
      if (fazla) return;
      boyut += parca.length;
      if (boyut > AZAMI_GOVDE) {
        fazla = true;
        parcalar.length = 0;
        return;
      }
      parcalar.push(parca);
    });
    req.on('end', () => ok(fazla ? null : Buffer.concat(parcalar).toString('utf8')));
    req.on('error', hata);
  });
}

export function httpSunucusuOlustur(ayarlar: HttpAyarlari): Server {
  const hiz = new HizSiniri(ayarlar.dakikaLimiti, ayarlar.pencereMs, ayarlar.simdi);
  const izinli = ayarlar.izinliKaynaklar ?? [];

  return createServer(async (req, res) => {
    const yol = new URL(req.url ?? '/', 'http://yerel').pathname;
    const kaynak = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    const cors = corsBasliklari(kaynak, izinli);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    // Health probes are neither keyed nor counted: the platform polls them.
    if (yol === '/health') {
      if (req.method !== 'GET') {
        jsonYaz(res, 405, { durum: 'yöntem desteklenmiyor' }, { ...cors, Allow: 'GET' });
        return;
      }
      jsonYaz(res, 200, { durum: 'ok', surum: SURUM }, cors);
      return;
    }

    if (yol !== '/mcp') {
      jsonYaz(res, 404, { durum: 'bulunamadı' }, cors);
      return;
    }

    const bekle = hiz.kaydet(istemciIp(req, ayarlar.proxyyeGuven));
    if (bekle > 0) {
      jsonYaz(res, 429, rpcHata(-32000, 'Çok fazla istek; biraz sonra yeniden deneyin.'), {
        ...cors,
        'Retry-After': String(bekle),
      });
      return;
    }

    if (!kaynakIzinli(kaynak, izinli)) {
      jsonYaz(res, 403, rpcHata(-32000, 'Bu kaynaktan (Origin) gelen isteklere izin verilmiyor.'));
      return;
    }

    if (ayarlar.apiAnahtari && !anahtarDogru(req.headers['x-api-key'], ayarlar.apiAnahtari)) {
      jsonYaz(res, 401, rpcHata(-32001, 'Geçersiz ya da eksik X-API-Key.'), cors);
      return;
    }

    // Stateless: there is no session to stream to or to delete.
    if (req.method !== 'POST') {
      jsonYaz(res, 405, rpcHata(-32000, 'Yöntem desteklenmiyor.'), { ...cors, Allow: 'POST' });
      return;
    }

    // Content-Length alone is not enough: a chunked body carries none, and the
    // SDK transport would read any size into memory. Read it here, capped.
    let govde: string | null;
    try {
      govde = await govdeOku(req);
    } catch {
      // The client went away mid-upload; there is no one left to answer.
      res.destroy();
      return;
    }
    if (govde === null) {
      jsonYaz(res, 413, rpcHata(-32000, 'İstek gövdesi çok büyük.'), cors);
      return;
    }
    let ayristirilmis: unknown;
    try {
      ayristirilmis = JSON.parse(govde);
    } catch {
      jsonYaz(res, 400, rpcHata(-32700, 'Ayrıştırma hatası: gövde geçerli JSON değil.'), cors);
      return;
    }

    const server = sunucuOlustur();
    // No sessionIdGenerator: that is what makes the transport stateless.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      // The SDK's getter/setter pair for onclose trips exactOptionalPropertyTypes.
      await server.connect(transport as Transport);
      for (const [ad, deger] of Object.entries(cors)) res.setHeader(ad, deger);
      await transport.handleRequest(req, res, ayristirilmis);
    } catch (hata) {
      console.error('mcp-turkiye: istek işlenemedi', hata);
      if (!res.headersSent) jsonYaz(res, 500, rpcHata(-32603, 'Sunucu hatası.'), cors);
    }
  });
}

/** The part of `process` the shutdown needs, injectable for tests. */
export type Surec = {
  once(sinyal: 'SIGTERM' | 'SIGINT', dinleyici: () => void): unknown;
  exit(kod: number): void;
};

/**
 * Well under the platform's own grace period (Azure Container Apps waits 30 s
 * before SIGKILL).
 */
export const KAPANMA_SURESI_MS = 10_000;

/**
 * Graceful stop on a revision change or scale-in: stop accepting, drop idle
 * keep-alive sockets, let in-flight requests finish, and exit anyway once the
 * grace period is over.
 */
export function kapanisiKur(
  sunucu: Server,
  surec: Surec = process,
  sureMs = KAPANMA_SURESI_MS,
): void {
  for (const sinyal of ['SIGTERM', 'SIGINT'] as const) {
    surec.once(sinyal, () => {
      // A request that finishes during the wait leaves its keep-alive socket
      // idle, and close() would then wait for keepAliveTimeout (5 s); sweep
      // idle sockets until the last one is gone.
      const supurge = setInterval(() => sunucu.closeIdleConnections(), 100);
      supurge.unref();
      sunucu.close(() => {
        clearInterval(supurge);
        surec.exit(0);
      });
      sunucu.closeIdleConnections();
      setTimeout(() => surec.exit(0), sureMs).unref();
    });
  }
}
