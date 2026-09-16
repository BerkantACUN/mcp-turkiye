import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SURUM, sunucuOlustur } from './server.js';

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(SURUM);
  process.exit(0);
}

const server = sunucuOlustur();
const transport = new StdioServerTransport();
await server.connect(transport);
// stdout is the protocol channel; anything for humans goes to stderr.
console.error(`mcp-turkiye ${SURUM} hazır (stdio)`);
