import { httpSunucusuOlustur, ortamdanAyarlar } from './http-sunucu.js';
import { SURUM } from './server.js';

// Streamable HTTP entry point: no arguments, everything from the environment
// (PORT, HOST, MCP_TURKIYE_API_KEY, MCP_TURKIYE_RATE_LIMIT, TRUST_PROXY).
const ayarlar = ortamdanAyarlar();
const sunucu = httpSunucusuOlustur(ayarlar);

sunucu.listen(ayarlar.port, ayarlar.host, () => {
  const anahtar = ayarlar.apiAnahtari ? 'X-API-Key zorunlu' : 'anahtarsız';
  console.error(
    `mcp-turkiye ${SURUM} hazır (http://${ayarlar.host}:${ayarlar.port}/mcp, ${anahtar})`,
  );
});

// Graceful stop on a revision change or scale-in: stop accepting, drop idle
// keep-alive sockets, let in-flight requests finish, and give up after a grace
// period shorter than the platform's (Azure Container Apps waits 30 s).
const KAPANMA_SURESI_MS = 10_000;

for (const sinyal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sinyal, () => {
    sunucu.close(() => process.exit(0));
    sunucu.closeIdleConnections();
    setTimeout(() => process.exit(0), KAPANMA_SURESI_MS).unref();
  });
}
