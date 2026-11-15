import { describe, expect, it } from "vitest";
import { buildContextWindowInsights, cacheHitRate } from "./context-window-insights";

describe("cacheHitRate", () => {
  it("counts cache writes in the denominator", () => {
    expect(cacheHitRate(56, 1_760_000, 0)).toBeCloseTo(99.997, 2);
    expect(cacheHitRate(0, 0, 10_000)).toBe(0);
    expect(cacheHitRate(100, 300, 600)).toBe(30);
  });

  it("has no rate before anything was taken in", () => {
    expect(cacheHitRate(0, 0, 0)).toBeNull();
  });
});

describe("buildContextWindowInsights", () => {
  it("is empty for providers that report no cache write count", () => {
    expect(buildContextWindowInsights(undefined)).toBeNull();
    expect(buildContextWindowInsights({})).toBeNull();
    // Codex and Claude turn totals: uncached input and reads alone say nothing about a session.
    expect(
      buildContextWindowInsights({ inputTokens: 100, cachedInputTokens: 50, outputTokens: 10 }),
    ).toBeNull();
  });

  it("scores the session and the last call, and lists the session's tokens", () => {
    const insights = buildContextWindowInsights({
      inputTokens: 56,
      cachedInputTokens: 1_760_000,
      cacheWriteTokens: 4_000,
      outputTokens: 9_000,
      reasoningTokens: 0,
      lastCallInputTokens: 3,
      lastCallCachedInputTokens: 90_000,
      lastCallCacheWriteTokens: 500,
    });
    expect(insights?.sessionHitRate).toBeCloseTo(99.8, 1);
    expect(insights?.lastCallHitRate).toBeCloseTo(99.4, 1);
    expect(insights?.lastCallMissed).toBe(false);
    expect(insights?.tokens).toEqual([
      { key: "cacheRead", value: 1_760_000 },
      { key: "cacheWrite", value: 4_000 },
      { key: "input", value: 56 },
      { key: "output", value: 9_000 },
    ]);
  });

  it("adds reasoning tokens only when there are some", () => {
    const insights = buildContextWindowInsights({
      inputTokens: 1,
      cachedInputTokens: 1,
      cacheWriteTokens: 1,
      outputTokens: 1,
      reasoningTokens: 700,
    });
    expect(insights?.tokens.at(-1)).toEqual({ key: "reasoning", value: 700 });
  });

  it("flags a last call that missed a cache earlier calls had filled", () => {
    const insights = buildContextWindowInsights({
      inputTokens: 120_000,
      cachedInputTokens: 800_000,
      cacheWriteTokens: 10_000,
      outputTokens: 5_000,
      lastCallInputTokens: 100_000,
      lastCallCachedInputTokens: 2_000,
      lastCallCacheWriteTokens: 8_000,
    });
    expect(insights?.lastCallHitRate).toBeCloseTo(1.8, 1);
    expect(insights?.lastCallMissed).toBe(true);
  });

  it("does not flag the first call, which has nothing to read yet", () => {
    const insights = buildContextWindowInsights({
      inputTokens: 40,
      cachedInputTokens: 0,
      cacheWriteTokens: 30_000,
      outputTokens: 200,
      lastCallInputTokens: 40,
      lastCallCachedInputTokens: 0,
      lastCallCacheWriteTokens: 30_000,
    });
    expect(insights?.lastCallHitRate).toBe(0);
    expect(insights?.lastCallMissed).toBe(false);
  });

  it("scores the last call alone when only per-call figures exist", () => {
    const insights = buildContextWindowInsights({
      lastCallInputTokens: 100,
      lastCallCachedInputTokens: 300,
      lastCallCacheWriteTokens: 100,
    });
    expect(insights).toMatchObject({ sessionHitRate: null, lastCallHitRate: 60, tokens: [] });
    // Without totals there is no telling a first call from a later one.
    expect(insights?.lastCallMissed).toBe(false);
  });

  it("ignores a last call with nothing taken in", () => {
    expect(
      buildContextWindowInsights({
        lastCallInputTokens: 0,
        lastCallCachedInputTokens: 0,
        lastCallCacheWriteTokens: 0,
      }),
    ).toBeNull();
  });
});
