import { describe, it, expect } from "vitest";
import { ChatReply, CompletionResult } from "../src/results";
import type { Message } from "../src/types";

describe("ChatReply", () => {
  it("stores all constructor arguments verbatim", () => {
    const message: Message = { role: "assistant", content: "hi" };
    const reply = new ChatReply("hi", message, 5, "stop");
    expect(reply.text).toBe("hi");
    expect(reply.message).toBe(message);
    expect(reply.tokensGenerated).toBe(5);
    expect(reply.finishReason).toBe("stop");
  });

  it("supports every finishReason variant", () => {
    const msg: Message = { role: "assistant", content: "" };
    for (const reason of ["stop", "length", "abort"] as const) {
      const reply = new ChatReply("", msg, 0, reason);
      expect(reply.finishReason).toBe(reason);
    }
  });
});

describe("CompletionResult", () => {
  it("stores all constructor arguments verbatim", () => {
    const result = new CompletionResult("continued", "Once upon a time", 12, "length");
    expect(result.text).toBe("continued");
    expect(result.prompt).toBe("Once upon a time");
    expect(result.tokensGenerated).toBe(12);
    expect(result.finishReason).toBe("length");
  });

  it("supports every finishReason variant", () => {
    for (const reason of ["stop", "length", "abort"] as const) {
      const result = new CompletionResult("", "", 0, reason);
      expect(result.finishReason).toBe(reason);
    }
  });
});
