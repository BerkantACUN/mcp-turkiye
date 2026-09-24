import { httpSunucusuOlustur, kapanisiKur, ortamdanAyarlar } from './http-sunucu.js';
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

kapanisiKur(sunucu);
