/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import type { AgentMetric, AgentUsage } from "@getpaseo/protocol/agent-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextWindowDetails } from "@/components/context-window-details";

const { theme, usageView } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 1.5: 6, 2: 8, 3: 12 },
    fontSize: { sm: 13, base: 15 },
    colors: {
      foreground: "#fff",
      foregroundMuted: "#aaa",
      borderAccent: "#555",
      palette: { amber: { 500: "#f59e0b" } },
    },
  },
  usageView: { kind: "none" as "none" | "ready" },
}));

vi.hoisted(() => {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
});

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
}));

vi.mock("react-i18next", async () => {
  const { en } = await import("@/i18n/resources/en");
  const lookup = (key: string) =>
    key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en);
  return {
    useTranslation: () => ({
      t: (key: string, values?: Record<string, string | number>) =>
        Object.entries(values ?? {}).reduce(
          (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
          lookup(key) as string,
        ),
    }),
  };
});

vi.mock("@/usage", () => ({
  AgentUsage: () => null,
  useAgentUsage: () => usageView,
}));

const CONTEXT = { percentage: 44, usedTokens: 439_000, maxTokens: 1_000_000 };

function renderDetails(
  usage: AgentUsage | null,
  sessionCost: string | null = null,
  sessionMetrics: AgentMetric[] = [],
) {
  return render(
    <ContextWindowDetails
      serverId="host"
      agentId="agent"
      context={CONTEXT}
      sessionCost={sessionCost}
      usage={usage}
      sessionMetrics={sessionMetrics}
      showTitle
      refreshable={false}
    />,
  );
}

const OPENCODE_USAGE: AgentUsage = {
  inputTokens: 56,
  cachedInputTokens: 1_760_000,
  cacheWriteTokens: 4_000,
  outputTokens: 9_000,
  reasoningTokens: 1_200,
  totalCostUsd: 0,
  lastCallInputTokens: 3,
  lastCallCachedInputTokens: 90_000,
  lastCallCacheWriteTokens: 500,
};

describe("ContextWindowDetails", () => {
  afterEach(() => {
    cleanup();
    usageView.kind = "none";
  });

  it("shows hit rates and session tokens below the context lines", () => {
    renderDetails(OPENCODE_USAGE);
    expect(screen.getByText("44% used")).toBeTruthy();
    expect(screen.getByText("Cache")).toBeTruthy();
    expect(screen.getByText("Last call 99% cached")).toBeTruthy();
    expect(screen.getByText("Session 100% cached")).toBeTruthy();
    expect(screen.getByText("Session tokens")).toBeTruthy();
    for (const [label, value] of [
      ["Cache read", "1.8m"],
      ["Cache write", "4k"],
      ["Uncached input", "56"],
      ["Output", "9k"],
      ["Reasoning", "1k"],
    ]) {
      expect(screen.getByText(label!).nextSibling?.textContent).toBe(value);
    }
  });

  it("warns when the last call missed a cache that was filled before", () => {
    renderDetails({
      ...OPENCODE_USAGE,
      lastCallInputTokens: 100_000,
      lastCallCachedInputTokens: 2_000,
      lastCallCacheWriteTokens: 8_000,
    });
    expect(screen.getByText("Last call missed the cache (2% cached)")).toBeTruthy();
    expect(screen.queryByText(/^Last call \d+% cached$/)).toBeNull();
  });

  it("hides cache and token sections for providers that report no cache figures", () => {
    renderDetails({ inputTokens: 10, cachedInputTokens: 5, outputTokens: 2 });
    expect(screen.queryByText("Cache")).toBeNull();
    expect(screen.queryByText("Session tokens")).toBeNull();
    expect(screen.queryByTestId("context-window-insights")).toBeNull();
  });

  it("keeps the session cache rate but drops what the provider's own rows already say", () => {
    renderDetails(OPENCODE_USAGE, null, [
      { label: "Tokens", value: "56 ↑ · 10K ↓" },
      { label: "Cache (last reply)", value: "99%", tone: "ok" },
    ]);
    expect(screen.getByText("Tokens")).toBeTruthy();
    expect(screen.getByText("Cache (last reply)")).toBeTruthy();
    expect(screen.queryByText("Last call 99% cached")).toBeNull();
    expect(screen.queryByText("Session tokens")).toBeNull();
    expect(screen.queryByText("Cache read")).toBeNull();
    expect(screen.getByText("Session 100% cached")).toBeTruthy();
  });

  it("shows the whole insights block beside provider rows that say nothing about cache or tokens", () => {
    renderDetails(OPENCODE_USAGE, null, [{ label: "Model", value: "opus" }]);
    expect(screen.getByText("Last call 99% cached")).toBeTruthy();
    expect(screen.getByText("Session tokens")).toBeTruthy();
  });

  it("does not call a session included in the plan when the provider reports its cost", () => {
    usageView.kind = "ready";
    renderDetails(OPENCODE_USAGE, null, [{ label: "Cost", value: "$0.42" }]);
    expect(screen.queryByText("Included in plan")).toBeNull();
  });

  it("says the plan covers a zero-cost session only when a plan account resolves", () => {
    renderDetails(OPENCODE_USAGE);
    expect(screen.queryByText("Included in plan")).toBeNull();
    cleanup();

    usageView.kind = "ready";
    renderDetails(OPENCODE_USAGE);
    expect(screen.getByText("Included in plan")).toBeTruthy();
    cleanup();

    renderDetails(OPENCODE_USAGE, "$0.42");
    expect(screen.getByText("Session cost $0.42")).toBeTruthy();
    expect(screen.queryByText("Included in plan")).toBeNull();
  });
});
