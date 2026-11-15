import { describe, expect, it } from "vitest";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import { formatTurnModelLabel, resolveTurnModelLabel } from "./turn-model-label";

const entries: ProviderSnapshotEntry[] = [
  {
    provider: "opencode",
    status: "ready",
    enabled: true,
    models: [
      {
        provider: "opencode",
        id: "claude-agent/opus",
        label: "Opus 5.5",
        thinkingOptions: [
          { id: "medium", label: "Medium" },
          { id: "high", label: "High" },
        ],
      },
      {
        provider: "opencode",
        id: "deepseek/deepseek-v4.1-flash",
        aliases: ["deepseek-v4.1-flash"],
        label: "DS V4.1 Flash · Direct",
        thinkingOptions: [{ id: "high", label: "high" }],
      },
    ],
  },
];

describe("formatTurnModelLabel", () => {
  it("uses the picker's display name and the thinking option's label", () => {
    expect(
      formatTurnModelLabel(
        { provider: "opencode", modelId: "claude-agent/opus", thinkingOptionId: "medium" },
        entries,
      ),
    ).toBe("Opus 5.5 · Medium");
  });

  it("keeps a route-bearing custom name whole", () => {
    expect(
      formatTurnModelLabel(
        {
          provider: "opencode",
          modelId: "deepseek/deepseek-v4.1-flash",
          thinkingOptionId: "high",
        },
        entries,
      ),
    ).toBe("DS V4.1 Flash · Direct · high");
  });

  it("finds a model by alias", () => {
    expect(
      formatTurnModelLabel({ provider: "opencode", modelId: "deepseek-v4.1-flash" }, entries),
    ).toBe("DS V4.1 Flash · Direct");
  });

  it("omits the thinking level when none was set", () => {
    expect(
      formatTurnModelLabel(
        { provider: "opencode", modelId: "claude-agent/opus", thinkingOptionId: null },
        entries,
      ),
    ).toBe("Opus 5.5");
  });

  it("falls back to raw ids for a model or level the catalog no longer lists", () => {
    expect(
      formatTurnModelLabel(
        { provider: "opencode", modelId: "gone/model-x", thinkingOptionId: "xhigh" },
        entries,
      ),
    ).toBe("gone/model-x · xhigh");
    expect(
      formatTurnModelLabel(
        { provider: "opencode", modelId: "claude-agent/opus", thinkingOptionId: "xhigh" },
        entries,
      ),
    ).toBe("Opus 5.5 · xhigh");
  });

  it("uses raw ids while the catalog is still loading or the provider is unknown", () => {
    const model = { provider: "opencode", modelId: "claude-agent/opus", thinkingOptionId: "high" };
    expect(formatTurnModelLabel(model, undefined)).toBe("claude-agent/opus · high");
    expect(formatTurnModelLabel({ ...model, provider: "other" }, entries)).toBe(
      "claude-agent/opus · high",
    );
  });
});

describe("resolveTurnModelLabel", () => {
  const model = { provider: "opencode", modelId: "claude-agent/opus", thinkingOptionId: "high" };

  it("shows nothing when the setting is off", () => {
    expect(resolveTurnModelLabel({ enabled: false, model, entries })).toBeNull();
  });

  it("shows nothing for a turn recorded before the daemon stamped models", () => {
    expect(resolveTurnModelLabel({ enabled: true, model: undefined, entries })).toBeNull();
  });

  it("labels a stamped turn when the setting is on", () => {
    expect(resolveTurnModelLabel({ enabled: true, model, entries })).toBe("Opus 5.5 · High");
  });
});
