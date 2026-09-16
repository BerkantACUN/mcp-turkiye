import { z } from 'zod';
import { KaynakHatasi } from './http.js';
import type { Zarf } from './source.js';

/**
 * How every tool answers. The structured content is the envelope, verbatim;
 * the text content is the same envelope as JSON, for clients that do not
 * read structured content yet. One shape, so a model that learns to read one
 * tool has learned to read all of them.
 */
export function cevapla<T>(zarf: Zarf<T>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(zarf, null, 2) }],
    structuredContent: zarf as unknown as Record<string, unknown>,
  };
}

/**
 * A failed lookup is reported as a tool error with the institution named.
 * Never a fabricated fallback value: "TCMB did not answer" is information,
 * "USD 48.60" from nowhere is a lie the model will repeat with confidence.
 */
export function hata(error: unknown) {
  const mesaj =
    error instanceof KaynakHatasi
      ? `${error.kaynakId} kaynağından veri alınamadı: ${error.neden} (${error.url})`
      : error instanceof Error
        ? error.message
        : String(error);
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: mesaj }],
  };
}

/** Output schema for an envelope whose `veri` has the given shape. */
export function zarfSemasi<T extends z.ZodTypeAny>(veri: T) {
  return {
    kaynak: z.object({ id: z.string(), ad: z.string(), url: z.string() }),
    alindi: z.string(),
    veri,
  };
}
