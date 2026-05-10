import { LMTask, type LMTaskCreateOptions } from "./lm-task";
import type { Engine } from "../core/engine";
import { ChatReply } from "../results";
import type {
  GenerationOptions,
  Message,
  ModelPreset,
  TokenChunk,
} from "../types";

/**
 * Multi-turn chat task.
 *
 * Maintains an in-memory conversation history and applies the chat template
 * configured for the loaded model. Use {@link Chat.create} to construct an
 * instance — the constructor is private.
 *
 * @example
 * ```ts
 * const chat = await Chat.create("phi-3.5-mini-int4");
 * const reply = await chat.send("Explain ONNX in one sentence.");
 * console.log(reply.text);
 * ```
 *
 * @example Streaming
 * ```ts
 * const controller = new AbortController();
 * for await (const token of chat.stream("Explain ONNX.", { signal: controller.signal })) {
 *   process.stdout.write(token.text);
 * }
 * ```
 */
export class Chat extends LMTask {
  private readonly history: Message[] = [];
  private systemPrompt: string | null = null;

  private constructor(engine: Engine, preset: ModelPreset) {
    super(engine, preset);
  }

  /**
   * Create and load a `Chat` task for the given model.
   *
   * @param modelId - Friendly model id from the registry (e.g. `"phi-3.5-mini-int4"`).
   * @param options - Optional creation options (progress callback, engine override).
   */
  static async create(
    modelId: string,
    options: LMTaskCreateOptions = {}
  ): Promise<Chat> {
    const { engine, preset } = await LMTask.createEngine(modelId, options);
    return new Chat(engine, preset);
  }

  /** Set or replace the system prompt prepended to every conversation. */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /** Clear the system prompt. */
  clearSystemPrompt(): void {
    this.systemPrompt = null;
  }

  /** Reset the conversation history. The system prompt is preserved. */
  resetHistory(): void {
    this.history.length = 0;
  }

  /** A read-only snapshot of the conversation history. */
  getHistory(): readonly Message[] {
    return this.history.slice();
  }

  /**
   * Send a user message and await the full assistant reply.
   *
   * The user message and the assistant reply are appended to the history.
   *
   * @param message - The user-facing message text.
   * @param options - Generation options.
   * @returns A {@link ChatReply} with the assistant's reply.
   */
  async send(
    message: string,
    options: GenerationOptions = {}
  ): Promise<ChatReply> {
    const messages = this.buildMessages(message);
    const text = await this.engine.generate(messages, options);
    const userMsg: Message = { role: "user", content: message };
    const assistantMsg: Message = { role: "assistant", content: text };
    this.history.push(userMsg, assistantMsg);
    return new ChatReply(text, assistantMsg, 0, "stop");
  }

  /**
   * Stream the assistant reply token-by-token as an async iterable.
   *
   * The full reply is appended to the history when the stream completes
   * normally. If the stream is aborted, neither message is appended.
   *
   * @param message - The user-facing message text.
   * @param options - Generation options including an optional `signal`.
   */
  async *stream(
    message: string,
    options: GenerationOptions = {}
  ): AsyncIterable<TokenChunk> {
    const messages = this.buildMessages(message);
    const userMsg: Message = { role: "user", content: message };
    let acc: string = "";
    for await (const chunk of this.engine.stream(messages, options)) {
      acc += chunk.text;
      yield chunk;
    }
    const assistantMsg: Message = { role: "assistant", content: acc };
    this.history.push(userMsg, assistantMsg);
  }

  private buildMessages(userMessage: string): Message[] {
    const messages: Message[] = [];
    if (this.systemPrompt) {
      messages.push({ role: "system", content: this.systemPrompt });
    }
    messages.push(...this.history);
    messages.push({ role: "user", content: userMessage });
    return messages;
  }
}
