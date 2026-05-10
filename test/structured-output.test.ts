import { describe, it, expect } from "vitest";
import {
  assertJsonSchema,
  serializeJsonSchema,
  parseStructuredOutput,
} from "../src/structured/json-schema";
import { StructuredOutputError } from "../src/core/exceptions";
import { ChatReply, CompletionResult } from "../src/results";
import type { Message } from "../src/types";

describe("assertJsonSchema", () => {
  it("accepts a minimal type-only schema", () => {
    expect(() => assertJsonSchema({ type: "object" })).not.toThrow();
  });

  it("accepts schemas with $ref / oneOf / anyOf / allOf / enum / const / properties", () => {
    expect(() => assertJsonSchema({ $ref: "#/defs/Foo" })).not.toThrow();
    expect(() => assertJsonSchema({ oneOf: [{ type: "string" }] })).not.toThrow();
    expect(() => assertJsonSchema({ anyOf: [{ type: "string" }] })).not.toThrow();
    expect(() => assertJsonSchema({ allOf: [{ type: "string" }] })).not.toThrow();
    expect(() => assertJsonSchema({ enum: ["a", "b"] })).not.toThrow();
    expect(() => assertJsonSchema({ const: 42 })).not.toThrow();
    expect(() => assertJsonSchema({ properties: { name: { type: "string" } } })).not.toThrow();
  });

  it("rejects non-object inputs", () => {
    expect(() => assertJsonSchema("string" as unknown)).toThrow(StructuredOutputError);
    expect(() => assertJsonSchema(42 as unknown)).toThrow(StructuredOutputError);
    expect(() => assertJsonSchema(null as unknown)).toThrow(StructuredOutputError);
    expect(() => assertJsonSchema([] as unknown)).toThrow(StructuredOutputError);
  });

  it("rejects objects with no recognizable schema keys", () => {
    expect(() => assertJsonSchema({ foo: 1 })).toThrow(StructuredOutputError);
    expect(() => assertJsonSchema({})).toThrow(StructuredOutputError);
  });
});

describe("serializeJsonSchema", () => {
  it("returns the schema as a JSON string", () => {
    const schema = { type: "object", properties: { name: { type: "string" } } };
    const out = serializeJsonSchema(schema);
    expect(typeof out).toBe("string");
    expect(JSON.parse(out)).toEqual(schema);
  });

  it("propagates StructuredOutputError when the input fails assertion", () => {
    expect(() => serializeJsonSchema("not a schema" as unknown)).toThrow(StructuredOutputError);
  });
});

describe("parseStructuredOutput", () => {
  it("parses a JSON object", () => {
    expect(parseStructuredOutput<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses a JSON array", () => {
    expect(parseStructuredOutput<number[]>("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("parses a JSON primitive", () => {
    expect(parseStructuredOutput<number>("42")).toBe(42);
    expect(parseStructuredOutput<string>('"hi"')).toBe("hi");
    expect(parseStructuredOutput<null>("null")).toBeNull();
  });

  it("throws StructuredOutputError on invalid JSON", () => {
    expect(() => parseStructuredOutput("{not json}")).toThrow(StructuredOutputError);
  });

  it("preserves the underlying SyntaxError as cause", () => {
    try {
      parseStructuredOutput("{nope}");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(StructuredOutputError);
      expect((err as StructuredOutputError).cause).toBeInstanceOf(SyntaxError);
    }
  });
});

describe("ChatReply.json()", () => {
  it("parses the reply text as JSON", () => {
    const msg: Message = { role: "assistant", content: '{"name":"Ada"}' };
    const reply = new ChatReply('{"name":"Ada"}', msg, 4, "stop");
    expect(reply.json<{ name: string }>()).toEqual({ name: "Ada" });
  });

  it("throws StructuredOutputError when the text is not JSON", () => {
    const msg: Message = { role: "assistant", content: "plain text" };
    const reply = new ChatReply("plain text", msg, 1, "stop");
    expect(() => reply.json()).toThrow(StructuredOutputError);
  });
});

describe("CompletionResult.json()", () => {
  it("parses the generated text as JSON", () => {
    const result = new CompletionResult("[1,2,3]", "list:", 3, "stop");
    expect(result.json<number[]>()).toEqual([1, 2, 3]);
  });

  it("throws StructuredOutputError when the text is not JSON", () => {
    const result = new CompletionResult("not json", "x", 1, "stop");
    expect(() => result.json()).toThrow(StructuredOutputError);
  });
});
