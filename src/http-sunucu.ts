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
  /** Clock, injectable for tests. */
  simdi?: (() => number) | undefined;
};

type Ortam = Record<string, string | undefined>;

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
  };
}

/** Fixed-window counter per IP, in memory; enough for one container. */
export class HizSiniri {
  private readonly pencereler = new Map<string, { baslangic: number; sayi: number }>();

  constructor(
    private readonly limit: number,
    private readonly pencereMs: number,
    private readonly simdi: () => number = Date.now,
  ) {}

  /** Counts the request; returns seconds to wait when over the limit, else 0. */
  kaydet(ip: string): number {
    if (this.limit === 0) return 0;
    const an = this.simdi();
    this.supur(an);
    const p = this.pencereler.get(ip);
    if (!p || an - p.baslangic >= this.pencereMs) {
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

  /** Drops expired windows at most once per window, so the map cannot grow unbounded. */
  private supur(an: number): void {
    if (an - this.sonSupurme < this.pencereMs) return;
    this.sonSupurme = an;
    for (const [ip, p] of this.pencereler) {
      if (an - p.baslangic >= this.pencereMs) this.pencereler.delete(ip);
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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, X-API-Key, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
};

function jsonYaz(
  res: ServerResponse,
  durum: number,
  govde: unknown,
  basliklar: Record<string, string> = {},
): void {
  res.writeHead(durum, { ...CORS, 'Content-Type': 'application/json', ...basliklar });
  res.end(JSON.stringify(govde));
}

/** A JSON-RPC error body, the shape MCP clients know how to show. */
function rpcHata(kod: number, mesaj: string) {
  return { jsonrpc: '2.0', error: { code: kod, message: mesaj }, id: null };
}

export function httpSunucusuOlustur(ayarlar: HttpAyarlari): Server {
  const hiz = new HizSiniri(ayarlar.dakikaLimiti, ayarlar.pencereMs, ayarlar.simdi);

  return createServer(async (req, res) => {
    const yol = new URL(req.url ?? '/', 'http://yerel').pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    // Health probes are neither keyed nor counted: the platform polls them.
    if (yol === '/health') {
      if (req.method !== 'GET') {
        jsonYaz(res, 405, { durum: 'yöntem desteklenmiyor' }, { Allow: 'GET' });
        return;
      }
      jsonYaz(res, 200, { durum: 'ok', surum: SURUM });
      return;
    }

    if (yol !== '/mcp') {
      jsonYaz(res, 404, { durum: 'bulunamadı' });
      return;
    }

    const bekle = hiz.kaydet(istemciIp(req, ayarlar.proxyyeGuven));
    if (bekle > 0) {
      jsonYaz(res, 429, rpcHata(-32000, 'Çok fazla istek; biraz sonra yeniden deneyin.'), {
        'Retry-After': String(bekle),
      });
      return;
    }

    if (ayarlar.apiAnahtari && !anahtarDogru(req.headers['x-api-key'], ayarlar.apiAnahtari)) {
      jsonYaz(res, 401, rpcHata(-32001, 'Geçersiz ya da eksik X-API-Key.'));
      return;
    }

    // Stateless: there is no session to stream to or to delete.
    if (req.method !== 'POST') {
      jsonYaz(res, 405, rpcHata(-32000, 'Yöntem desteklenmiyor.'), { Allow: 'POST' });
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
      for (const [ad, deger] of Object.entries(CORS)) res.setHeader(ad, deger);
      await transport.handleRequest(req, res);
    } catch (hata) {
      console.error('mcp-turkiye: istek işlenemedi', hata);
      if (!res.headersSent) jsonYaz(res, 500, rpcHata(-32603, 'Sunucu hatası.'));
    }
  });
}
