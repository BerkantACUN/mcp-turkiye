# Installing mcp-turkiye (guide for AI agents such as Cline)

mcp-turkiye is a local stdio MCP server published on npm. It needs no clone and no build: `npx` downloads and runs it. Every tool answers with an envelope (`kaynak` = source institution and URL, `alindi` = fetch time, `veri` = data); when a source does not answer, the tool returns an error and never a guessed value.

## Requirements

- Node.js 20 or newer (`node --version`). `npx` ships with Node.
- No API key is required. One key is optional, see below.

## 1. Add the server to the MCP settings

Open the MCP settings JSON (Cline: **MCP Servers** icon → **Configure** tab → **Configure MCP Servers**; Cline CLI: `~/.cline/mcp.json`) and add this entry under `mcpServers`, keeping any servers already there:

```json
{
  "mcpServers": {
    "turkiye": {
      "command": "npx",
      "args": ["-y", "mcp-turkiye"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Every tool is read-only, but leave `autoApprove` empty unless the user asks otherwise.

## 2. Optional: the EVDS key

Only the `evds_*` tools (central-bank statistics: inflation, policy rate, series) need a key; every other tool works without one. Ask the user whether they want these tools. If they do, they get a free personal key at https://evds3.tcmb.gov.tr (Profilim → API Key Kopyala) and it goes into `env`:

```json
"env": { "EVDS_API_KEY": "<the user's key>" }
```

Do not invent or reuse a key; if the user has none, skip this step.

## 3. Verify

After the server starts, call a tool that works offline:

- `plaka_il` with `{"kod": 6}` must return `veri.il` = `"Ankara"`.
- `dogrula_tckn` with `{"tckn": "10000000146"}` must return `veri.gecerli` = `true` (a format check only; it never says a number belongs to a real person).

Then one networked tool, for example `tcmb_kurlar` with no arguments, to confirm outbound HTTPS works. A tool error naming the institution means that source did not answer; report it to the user as such.

## Remote alternative

If the user already runs their own mcp-turkiye HTTP server (Docker image `ghcr.io/berkantacun/mcp-turkiye`, see the README section "Uzak sunucu"), connect to it instead of `npx`:

```json
{
  "mcpServers": {
    "turkiye": {
      "type": "streamableHttp",
      "url": "https://<their-host>/mcp",
      "headers": { "X-API-Key": "<their key>" },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

There is no public hosted endpoint; use only a URL the user gives you. Set `"type": "streamableHttp"` explicitly, since Cline otherwise assumes the legacy SSE transport.

## Troubleshooting

- `npx` not found or an old Node: install Node.js 20+ and restart the editor.
- Tools appear but every networked call fails: check proxy/firewall settings for HTTPS to Turkish government sites.
- Data licences per source: `SOURCES.md`. Acceptable use: `ACCEPTABLE_USE.md`.
