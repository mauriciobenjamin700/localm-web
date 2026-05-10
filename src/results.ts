import { parseStructuredOutput } from "./structured/json-schema";
import type { FinishReason, Message } from "./types";

/**
 * Result returned by `Chat.send()`.
 *
 * Holds the assistant's textual reply, the structured assistant message
 * (already appended to the chat history), and metadata about the generation.
 */
export class ChatReply {
  constructor(
    /** The assistant's reply text. */
    public readonly text: string,
    /** The structured assistant message (already appended to chat history). */
    public readonly message: Message,
    /** Number of tokens generated. 0 when the engine does not report it. */
    public readonly tokensGenerated: number,
    /** Why the generation loop stopped. */
    public readonly finishReason: FinishReason
  ) {}

  /**
   * Parse {@link ChatReply.text} as JSON.
   *
   * Intended for replies generated with `json: true` or `jsonSchema`.
   * The result is cast to `T` without runtime validation; pair with Zod /
   * Ajv on the call site if you need to verify the schema.
   *
   * @typeParam T - Expected parsed shape.
   * @returns The parsed JSON value.
   * @throws StructuredOutputError if the text is not valid JSON.
   */
  json<T = unknown>(): T {
    return parseStructuredOutput<T>(this.text);
  }
}

/**
 * Result returned by `Completion.predict()`.
 *
 * Holds the generated continuation text (the prompt itself is not included)
 * plus metadata about the generation loop.
 */
export class CompletionResult {
  constructor(
    /** The generated text (continuation only, prompt excluded). */
    public readonly text: string,
    /** The original prompt that was fed to the model. */
    public readonly prompt: string,
    /** Number of tokens generated. 0 when the engine does not report it. */
    public readonly tokensGenerated: number,
    /** Why the generation loop stopped. */
    public readonly finishReason: FinishReason
  ) {}

  /**
   * Parse {@link CompletionResult.text} as JSON.
   *
   * Intended for completions generated with `json: true` or `jsonSchema`.
   * The result is cast to `T` without runtime validation.
   *
   * @typeParam T - Expected parsed shape.
   * @returns The parsed JSON value.
   * @throws StructuredOutputError if the text is not valid JSON.
   */
  json<T = unknown>(): T {
    return parseStructuredOutput<T>(this.text);
  }
}
