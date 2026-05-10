/**
 * JSON Schema helpers for structured output.
 *
 * The SDK delegates the actual constrained decoding to the underlying
 * runtime (xgrammar inside WebLLM today, ORT-Web equivalent later). These
 * helpers normalize user input — turning a JS object schema into the
 * JSON-string shape that WebLLM's `response_format.schema` expects — and
 * parse the runtime's textual output back into typed JSON.
 */

import { StructuredOutputError } from "../core/exceptions";

/**
 * Minimal structural sanity check for a JSON Schema.
 *
 * Does not validate the schema against the JSON Schema meta-schema. The goal
 * is to fail fast on obvious mistakes (passing a string, an array, `null`)
 * before handing the value off to the runtime, where errors surface much
 * later and with much worse messages.
 *
 * @param schema - Candidate JSON Schema object.
 * @throws StructuredOutputError when `schema` is not a plain object or has
 *   no recognizable schema shape (`type`, `$ref`, `oneOf`, `anyOf`, `allOf`,
 *   `enum`).
 */
export function assertJsonSchema(schema: unknown): asserts schema is object {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    throw new StructuredOutputError(
      "jsonSchema must be a plain object describing a JSON Schema."
    );
  }
  const keys: string[] = Object.keys(schema);
  const recognized: readonly string[] = [
    "type",
    "$ref",
    "oneOf",
    "anyOf",
    "allOf",
    "enum",
    "const",
    "properties",
  ];
  if (!keys.some((key) => recognized.includes(key))) {
    throw new StructuredOutputError(
      "jsonSchema does not look like a JSON Schema (missing type/$ref/oneOf/anyOf/allOf/enum/const/properties)."
    );
  }
}

/**
 * Serialize a JSON Schema object for the WebLLM `response_format.schema`
 * field.
 *
 * WebLLM expects the schema as a JSON-encoded string (xgrammar parses it
 * server-side). Validates the shape via {@link assertJsonSchema} first.
 *
 * @param schema - JSON Schema object.
 * @returns The schema serialized as a JSON string.
 * @throws StructuredOutputError when `schema` is not a recognizable JSON
 *   Schema shape.
 */
export function serializeJsonSchema(schema: unknown): string {
  assertJsonSchema(schema);
  return JSON.stringify(schema);
}

/**
 * Parse the textual output of a structured-decoding generation as JSON.
 *
 * @typeParam T - The expected parsed shape. The function does not validate
 *   the parsed value against `T`; that is the caller's responsibility.
 * @param text - Raw text returned by the engine.
 * @returns The parsed JSON value cast to `T`.
 * @throws StructuredOutputError when the text is not valid JSON.
 */
export function parseStructuredOutput<T = unknown>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new StructuredOutputError(
      "Engine output is not valid JSON. The model may have ignored the constrained decoding directive.",
      err
    );
  }
}
