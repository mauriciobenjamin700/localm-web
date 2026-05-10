import { describe, it, expect } from "vitest";
import { ChatReply } from "../src/results";
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
