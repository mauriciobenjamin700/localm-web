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
}
