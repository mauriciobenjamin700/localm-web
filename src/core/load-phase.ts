import type { ModelLoadPhase } from "../types";

const DOWNLOAD_PATTERN: RegExp = /\b(fetch|download|loading from cache|cache hit|param)/i;
const COMPILE_PATTERN: RegExp = /\b(compil|shader|kernel|tensor|init|allocat|warm)/i;

/**
 * Classify a runtime status text into a {@link ModelLoadPhase}.
 *
 * Heuristic: match download-related verbs first (network or cache hits are
 * treated as `downloading`), then compile-related verbs. Anything else falls
 * back to the generic `loading` bucket. The `ready` phase is never returned
 * here — callers emit it explicitly when the load resolves.
 *
 * @param text - The raw status string from the runtime.
 * @returns The classified phase.
 */
export function classifyLoadPhase(text: string): ModelLoadPhase {
  if (DOWNLOAD_PATTERN.test(text)) return "downloading";
  if (COMPILE_PATTERN.test(text)) return "compiling";
  return "loading";
}
