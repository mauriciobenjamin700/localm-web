import type { TokenChunk } from "../types";

/**
 * Drain an async iterable of token chunks into a single string.
 *
 * Useful in tests, for non-streaming consumers, and as a one-line way to
 * reconstruct the final text from a `Chat.stream(...)` call.
 *
 * @param stream - The token-chunk async iterable to consume.
 * @returns The concatenation of every chunk's `text` field.
 */
export async function collectStream(
  stream: AsyncIterable<TokenChunk>
): Promise<string> {
  let acc: string = "";
  for await (const chunk of stream) {
    acc += chunk.text;
  }
  return acc;
}

/**
 * Wrap an async iterable so that each `TokenChunk` is also passed to a
 * caller-supplied side-effect callback before being yielded downstream.
 *
 * This is intentionally a passthrough — it does not buffer.
 *
 * @param stream - The upstream token-chunk async iterable.
 * @param onChunk - Side-effect invoked for every chunk.
 * @returns A new async iterable yielding the same chunks.
 */
export async function* tap(
  stream: AsyncIterable<TokenChunk>,
  onChunk: (chunk: TokenChunk) => void
): AsyncIterable<TokenChunk> {
  for await (const chunk of stream) {
    onChunk(chunk);
    yield chunk;
  }
}
