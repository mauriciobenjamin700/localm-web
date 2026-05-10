import { describe, it, expect } from "vitest";
import { Chat } from "../src/tasks/chat";
import { collectStream } from "../src/streaming/token-stream";
import type { Engine } from "../src/core/engine";
import type {
  GenerationOptions,
  Message,
  TokenChunk,
} from "../src/types";

class FakeEngine implements Engine {
  loaded: boolean = true;
  lastMessages: Message[] = [];
  lastOptions: GenerationOptions | undefined;
  unloadCalls: number = 0;

  isLoaded(): boolean {
    return this.loaded;
  }

  async load(): Promise<void> {
    this.loaded = true;
  }

  async generate(messages: Message[], options?: GenerationOptions): Promise<string> {
    this.lastMessages = messages;
    this.lastOptions = options;
    return `echo:${messages[messages.length - 1]?.content ?? ""}`;
  }

  async *stream(
    messages: Message[],
    options?: GenerationOptions
  ): AsyncIterable<TokenChunk> {
    this.lastMessages = messages;
    this.lastOptions = options;
    const reply = `echo:${messages[messages.length - 1]?.content ?? ""}`;
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

describe("Chat", () => {
  it("create() resolves the preset and yields a ready instance", async () => {
    const engine = new FakeEngine();
    const chat = await Chat.create("phi-3.5-mini-int4", { engine });
    expect(chat.preset.id).toBe("phi-3.5-mini-int4");
    expect(chat.isLoaded()).toBe(true);
  });

  it("send() appends user and assistant messages to history", async () => {
    const engine = new FakeEngine();
    const chat = await Chat.create("phi-3.5-mini-int4", { engine });
    const reply = await chat.send("hello");
    expect(reply.text).toBe("echo:hello");
    expect(reply.message.role).toBe("assistant");
    const history = chat.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", content: "hello" });
    expect(history[1]).toEqual({ role: "assistant", content: "echo:hello" });
  });

  it("send() forwards subsequent turns with full history", async () => {
    const engine = new FakeEngine();
    const chat = await Chat.create("phi-3.5-mini-int4", { engine });
    await chat.send("first");
    await chat.send("second");
    expect(engine.lastMessages.map((m) => m.content)).toEqual([
      "first",
      "echo:first",
      "second",
    ]);
  });

  it("setSystemPrompt() prepends a system message", async () => {
    const engine = new FakeEngine();
    const chat = await Chat.create("phi-3.5-mini-int4", { engine });
    chat.setSystemPrompt("you are terse");
    await chat.send("hi");
    expect(engine.lastMessages[0]).toEqual({
      role: "system",
      content: "you are terse",
    });
  });

  it("resetHistory() clears messages but preserves system prompt", async () => {
    const engine = new FakeEngine();
    const chat = await Chat.create("phi-3.5-mini-int4", { engine });
    chat.setSystemPrompt("sys");
    await chat.send("x");
    chat.resetHistory();
    expect(chat.getHistory()).toHaveLength(0);
    await chat.send("y");
    expect(engine.lastMessages[0]?.role).toBe("system");
    expect(engine.lastMessages[1]?.content).toBe("y");
  });

  it("stream() yields chunks and updates history once drained", async () => {
    const engine = new FakeEngine();
    const chat = await Chat.create("phi-3.5-mini-int4", { engine });
    const collected = await collectStream(chat.stream("ping"));
    expect(collected).toBe("echo:ping");
    expect(chat.getHistory().at(-1)).toEqual({
      role: "assistant",
      content: "echo:ping",
    });
  });

  it("unload() delegates to the engine", async () => {
    const engine = new FakeEngine();
    const chat = await Chat.create("phi-3.5-mini-int4", { engine });
    await chat.unload();
    expect(engine.unloadCalls).toBe(1);
    expect(chat.isLoaded()).toBe(false);
  });
});
