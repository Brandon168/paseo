import type { AgentInfo, ModelInfo, SessionInfo } from "@opencode/client";
import { expect, test } from "vitest";
import { modelsFromV2, modesFromV2, usageFromV2 } from "./mapping.js";

test("normalizes v2 model capabilities, variants, and visible primary modes", () => {
  const model: ModelInfo = {
    id: "model",
    modelID: "native-model",
    providerID: "provider",
    name: "Model",
    capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
    variants: [{ id: "high" }],
    time: { released: 1 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: 200000, output: 10000 },
  };
  expect(modelsFromV2([model, { ...model, id: "disabled", enabled: false }])).toEqual([
    {
      provider: "opencode",
      id: "provider/model",
      label: "Model",
      contextWindowMaxTokens: 200000,
      metadata: {
        providerId: "provider",
        modelId: "model",
        supportsAttachments: true,
        supportsToolCall: true,
        contextWindowMaxTokens: 200000,
      },
      thinkingOptions: [{ id: "high", label: "high" }],
    },
  ]);
  const agent: AgentInfo = {
    id: "build",
    name: "Build",
    mode: "primary",
    hidden: false,
    request: { settings: {}, headers: {}, body: {} },
    permissions: [],
  };
  expect(
    modesFromV2([
      agent,
      { ...agent, id: "hidden", hidden: true },
      { ...agent, id: "child", mode: "subagent" },
    ]),
  ).toEqual([{ id: "build", label: "Build", description: undefined }]);
});

test("usageFromV2 keeps cache writes and reasoning so a cache hit rate has its whole denominator", () => {
  const session = {
    tokens: {
      input: 56,
      output: 9_000,
      reasoning: 1_200,
      cache: { read: 1_760_000, write: 4_000 },
    },
    cost: 0,
  } as SessionInfo;
  expect(usageFromV2(session)).toEqual({
    inputTokens: 56,
    outputTokens: 9_000,
    cachedInputTokens: 1_760_000,
    cacheWriteTokens: 4_000,
    reasoningTokens: 1_200,
    totalCostUsd: 0,
  });
});
