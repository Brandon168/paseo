import type { ModelInfo, TokenUsageInfo } from "@opencode/client";
import { describe, expect, test } from "vitest";
import { OpenCodeV2AgentClient } from "./agent.js";
import { V2Harness } from "../test-utils/v2-harness.js";
import { createTestLogger } from "../../../../../test-utils/test-logger.js";
import type { AgentUsage } from "../../../agent-sdk-types.js";

function model(context: number): ModelInfo {
  return {
    id: "model",
    modelID: "model",
    providerID: "test",
    name: "Model",
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    variants: [],
    time: { released: 1 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context, output: 10_000 },
  };
}

function stepEnded(harness: V2Harness, id: string, tokens: TokenUsageInfo) {
  harness.push({
    id,
    created: 2,
    type: "session.step.ended",
    durable: { aggregateID: "session", seq: 1, version: 1 },
    data: {
      sessionID: "session",
      assistantMessageID: "answer",
      finish: "tool-calls",
      cost: 0.1,
      tokens,
    },
  });
}

describe("OpenCode v2 context usage", () => {
  test("reports each step's context against the model limit, in step order", async () => {
    const harness = new V2Harness();
    harness.info.model = { providerID: "test", id: "model" };
    harness.info.tokens = {
      input: 900,
      output: 90,
      reasoning: 0,
      cache: { read: 40, write: 0 },
    };
    harness.info.cost = 0.5;
    // Each lookup answers faster than the one before it, so a lookup per step would
    // deliver step 1's usage after step 2's.
    const lookupDelays = [50, 0];
    harness.api.model.list = async (input) => {
      await new Promise((resolve) => setTimeout(resolve, lookupDelays.shift() ?? 0));
      return {
        location: { directory: input.location.directory },
        data: [model(200_000)],
      };
    };
    const client = new OpenCodeV2AgentClient({
      logger: createTestLogger(),
      runtime: harness.runtime,
    });
    const session = await client.createSession({
      provider: "opencode",
      cwd: "/tmp/project",
    });
    const usage: AgentUsage[] = [];
    session.subscribe((event) => {
      if (event.type === "usage_updated") usage.push(event.usage);
    });
    try {
      stepEnded(harness, "step-1", {
        input: 100,
        output: 10,
        reasoning: 5,
        cache: { read: 1_000, write: 20 },
      });
      stepEnded(harness, "step-2", {
        input: 300,
        output: 10,
        reasoning: 5,
        cache: { read: 1_000, write: 20 },
      });
      await expect.poll(() => usage.length).toBe(2);
      expect(usage.map((entry) => entry.contextWindowUsedTokens)).toEqual([1_135, 1_335]);
      expect(usage[1]).toEqual({
        inputTokens: 900,
        outputTokens: 90,
        cachedInputTokens: 40,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        totalCostUsd: 0.5,
        contextWindowUsedTokens: 1_335,
        contextWindowMaxTokens: 200_000,
        // The last model call alone: what a cache miss would show up in.
        lastCallInputTokens: 300,
        lastCallCachedInputTokens: 1_000,
        lastCallCacheWriteTokens: 20,
      });
    } finally {
      await session.close();
    }
  });

  test("names the model route and server environment for account usage lookups", async () => {
    const harness = new V2Harness();
    harness.info.model = { providerID: "claude-agent", id: "opus" };
    const client = new OpenCodeV2AgentClient({
      logger: createTestLogger(),
      runtime: harness.runtime,
      settings: { env: { XDG_DATA_HOME: "/data/opencode-home" } },
    });
    const session = await client.createSession({ provider: "opencode", cwd: "/tmp/project" });
    try {
      const scope = session.usageSession?.();
      expect(scope).toMatchObject({
        provider: "opencode",
        model: "claude-agent/opus",
        env: { XDG_DATA_HOME: "/data/opencode-home" },
      });
      expect(session.usageSession?.()?.sessionKey).toBe(scope?.sessionKey);
      await session.close();
      expect(session.usageSession?.()).toBeNull();
    } finally {
      await session.close();
    }
  });
});
