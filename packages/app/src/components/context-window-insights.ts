import type { AgentUsage } from "@getpaseo/protocol/agent-types";

/** Below this share of a call's input served from the cache, the call counts as a cache miss. */
export const LOW_CACHE_HIT_PERCENTAGE = 50;

export type ContextUsageFields = Pick<
  AgentUsage,
  | "inputTokens"
  | "cachedInputTokens"
  | "cacheWriteTokens"
  | "outputTokens"
  | "reasoningTokens"
  | "lastCallInputTokens"
  | "lastCallCachedInputTokens"
  | "lastCallCacheWriteTokens"
>;

export interface ContextWindowInsights {
  /** Percent of the session's input served from the cache. Null when the provider reports no totals. */
  sessionHitRate: number | null;
  /** The same for the latest model call alone. */
  lastCallHitRate: number | null;
  /** The latest call read little from a cache that earlier calls had filled. */
  lastCallMissed: boolean;
  tokens: Array<{ key: TokenRowKey; value: number }>;
}

export type TokenRowKey = "cacheRead" | "cacheWrite" | "input" | "output" | "reasoning";

function isCount(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Cache reads over everything the model took in. Providers count uncached input apart from cache
 * reads and writes, so leaving the writes out would score a cache that is still filling as perfect.
 */
export function cacheHitRate(input: number, read: number, write: number): number | null {
  const total = input + read + write;
  return total > 0 ? (read / total) * 100 : null;
}

function lastCallFigures(usage: ContextUsageFields) {
  const { lastCallInputTokens: input, lastCallCachedInputTokens: read } = usage;
  const write = usage.lastCallCacheWriteTokens;
  if (!isCount(input) || !isCount(read) || !isCount(write)) return null;
  return { input, read, write, total: input + read + write };
}

function sessionTokenRows(usage: ContextUsageFields, cacheWriteTokens: number) {
  const { inputTokens, cachedInputTokens, outputTokens, reasoningTokens } = usage;
  const rows: ContextWindowInsights["tokens"] = [];
  if (isCount(cachedInputTokens)) rows.push({ key: "cacheRead", value: cachedInputTokens });
  rows.push({ key: "cacheWrite", value: cacheWriteTokens });
  if (isCount(inputTokens)) rows.push({ key: "input", value: inputTokens });
  if (isCount(outputTokens)) rows.push({ key: "output", value: outputTokens });
  if (isCount(reasoningTokens) && reasoningTokens > 0) {
    rows.push({ key: "reasoning", value: reasoningTokens });
  }
  return rows;
}

/**
 * Cache and token figures for the context window details, or null when the provider reports none.
 * The totals need the cache-write count to mean anything, so providers that only report a
 * turn's input and cache reads show nothing here.
 */
export function buildContextWindowInsights(
  usage: ContextUsageFields | null | undefined,
): ContextWindowInsights | null {
  if (!usage) return null;
  const { inputTokens, cachedInputTokens, cacheWriteTokens } = usage;
  const read = isCount(cachedInputTokens) ? cachedInputTokens : 0;
  const input = isCount(inputTokens) ? inputTokens : 0;
  const totals = isCount(cacheWriteTokens)
    ? { rate: cacheHitRate(input, read, cacheWriteTokens), total: input + read + cacheWriteTokens }
    : null;
  const lastCall = lastCallFigures(usage);
  const lastCallHitRate = lastCall
    ? cacheHitRate(lastCall.input, lastCall.read, lastCall.write)
    : null;
  // The first call of a session has nothing to read, so it only counts as a miss when earlier
  // calls were already part of the totals.
  const hasEarlierCalls = totals !== null && lastCall !== null && totals.total > lastCall.total;
  const lastCallMissed =
    lastCallHitRate !== null && lastCallHitRate < LOW_CACHE_HIT_PERCENTAGE && hasEarlierCalls;
  const tokens = isCount(cacheWriteTokens) ? sessionTokenRows(usage, cacheWriteTokens) : [];
  const sessionHitRate = totals?.rate ?? null;

  if (sessionHitRate === null && lastCallHitRate === null && tokens.length === 0) return null;
  return { sessionHitRate, lastCallHitRate, lastCallMissed, tokens };
}
