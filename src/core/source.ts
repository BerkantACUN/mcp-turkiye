import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * A data source is one public institution or dataset, with its own licence
 * and its own failure modes. Every tool belongs to exactly one source, and
 * every answer names its source — so the model can cite it and the user can
 * check it.
 */
export interface Kaynak {
  /** Short stable id, also the tool-name prefix: `tcmb`, `afad`, `dogrulama`. */
  readonly id: string;
  /** Institution as people know it: "Türkiye Cumhuriyet Merkez Bankası". */
  readonly ad: string;
  /** Where the data comes from, for the citation in every answer. */
  readonly url: string;
  /** The licence or terms the data is published under — see SOURCES.md. */
  readonly lisans: string;
  /** Registers this source's tools on the server. */
  readonly kaydet: (server: McpServer) => void;
}

/**
 * The envelope every tool answers with. `veri` is the payload; the rest is
 * provenance. A model that gets a number without a source and a timestamp
 * will present it as timeless truth, which for an exchange rate or an
 * earthquake list is exactly wrong.
 */
export interface Zarf<T> {
  readonly kaynak: { readonly id: string; readonly ad: string; readonly url: string };
  /** When the data was fetched (ISO 8601). Not when it was published — that lives in `veri` when the source says. */
  readonly alindi: string;
  readonly veri: T;
}

export function zarfla<T>(kaynak: Kaynak, veri: T, url: string = kaynak.url): Zarf<T> {
  return {
    kaynak: { id: kaynak.id, ad: kaynak.ad, url },
    alindi: new Date().toISOString(),
    veri,
  };
}
