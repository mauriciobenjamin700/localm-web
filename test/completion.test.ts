import { describe, it, expect } from "vitest";
import { Completion } from "../src/tasks/completion";
import { collectStream } from "../src/streaming/token-stream";
import type { Engine } from "../src/core/engine";
import type { GenerationOptions, Message, TokenChunk } from "../src/types";

class FakeEngine implements Engine {
  loaded: boolean = true;
  lastPrompt: string = "";
  lastOptions: GenerationOptions | undefined;
  unloadCalls: number = 0;

  isLoaded(): boolean {
    return this.loaded;
  }

  async load(): Promise<void> {
    this.loaded = true;
  }

  async generate(_messages: Message[], _options?: GenerationOptions): Promise<string> {
    return "";
  }

  async *stream(_messages: Message[], _options?: GenerationOptions): AsyncIterable<TokenChunk> {
    yield { text: "", index: 0, done: true };
  }

  async complete(prompt: string, options?: GenerationOptions): Promise<string> {
    this.lastPrompt = prompt;
    this.lastOptions = options;
    return `${prompt}::continued`;
  }

  async *streamCompletion(prompt: string, options?: GenerationOptions): AsyncIterable<TokenChunk> {
    this.lastPrompt = prompt;
    this.lastOptions = options;
    const reply = `${prompt}::continued`;
    let index: number = 0;
    for (const ch of reply) {
      yield { text: ch, index, done: false };
      index += 1;
    }
    yield { text: "", index, done: true };
  }

  async unload(): Promise<void> {
    this.unloadCalls += 1;
    this.loaded = false;
  }
}

describe("Completion", () => {
  it("create() resolves the preset and yields a ready instance", async () => {
    const engine = new FakeEngine();
    const comp = await Completion.create("qwen2.5-1.5b-int4", { engine });
    expect(comp.preset.id).toBe("qwen2.5-1.5b-int4");
    expect(comp.isLoaded()).toBe(true);
  });

  it("predict() returns a CompletionResult with prompt and continuation", async () => {
    const engine = new FakeEngine();
    const comp = await Completion.create("qwen2.5-1.5b-int4", { engine });
    const result = await comp.predict("Once upon a time");
    expect(result.prompt).toBe("Once upon a time");
    expect(result.text).toBe("Once upon a time::continued");
    expect(result.finishReason).toBe("stop");
  });

  it("predict() forwards generation options to the engine", async () => {
    const engine = new FakeEngine();
    const comp = await Completion.create("qwen2.5-1.5b-int4", { engine });
    await comp.predict("hi", { maxTokens: 42, temperature: 0.7 });
    expect(engine.lastOptions).toEqual({ maxTokens: 42, temperature: 0.7 });
  });

  it("predict() does not maintain history across calls", async () => {
    const engine = new FakeEngine();
    const comp = await Completion.create("qwen2.5-1.5b-int4", { engine });
    await comp.predict("first");
    await comp.predict("second");
    expect(engine.lastPrompt).toBe("second");
  });

  it("stream() yields chunks that reconstruct the full continuation", async () => {
    const engine = new FakeEngine();
    const comp = await Completion.create("qwen2.5-1.5b-int4", { engine });
    const collected = await collectStream(comp.stream("def fib(n):"));
    expect(collected).toBe("def fib(n):::continued");
  });

  it("unload() delegates to the engine", async () => {
    const engine = new FakeEngine();
    const comp = await Completion.create("qwen2.5-1.5b-int4", { engine });
    await comp.unload();
    expect(engine.unloadCalls).toBe(1);
    expect(comp.isLoaded()).toBe(false);
  });
});
