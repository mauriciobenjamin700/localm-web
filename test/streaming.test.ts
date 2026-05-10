import { describe, it, expect } from "vitest";
import { collectStream, tap } from "../src/streaming/token-stream";
import type { TokenChunk } from "../src/types";

async function* makeStream(parts: string[]): AsyncIterable<TokenChunk> {
  let index: number = 0;
  for (const part of parts) {
    yield { text: part, index, done: false };
    index += 1;
  }
  yield { text: "", index, done: true };
}

describe("collectStream", () => {
  it("concatenates every chunk's text in order", async () => {
    const result = await collectStream(makeStream(["Hello", ", ", "world", "!"]));
    expect(result).toBe("Hello, world!");
  });

  it("returns an empty string for an empty stream", async () => {
    async function* empty(): AsyncIterable<TokenChunk> {
      // intentionally empty
    }
    expect(await collectStream(empty())).toBe("");
  });
});

describe("tap", () => {
  it("invokes the callback for every chunk and forwards them unchanged", async () => {
    const seen: string[] = [];
    const tapped = tap(makeStream(["a", "b", "c"]), (c) => seen.push(c.text));
    const collected = await collectStream(tapped);
    expect(seen).toEqual(["a", "b", "c", ""]);
    expect(collected).toBe("abc");
  });
});
