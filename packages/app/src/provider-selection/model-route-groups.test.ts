import { describe, expect, it } from "vitest";
import { buildModelListItems, getModelRoute } from "./model-route-groups";
import type { ProviderSelectionModelRow } from "./provider-selection";

function row(provider: string, providerLabel: string, modelId: string, modelLabel: string) {
  const result: ProviderSelectionModelRow = {
    favoriteKey: `${provider}:${modelId}`,
    provider,
    providerLabel,
    modelId,
    modelLabel,
    description: modelId,
  };
  return result;
}

const direct = row(
  "opencode",
  "OpenCode",
  "deepseek/deepseek-flash",
  "DS V4.1 Flash 1017 · Direct",
);
const gateway = row(
  "opencode",
  "OpenCode",
  "vercel-brandon-pro/deepseek/deepseek-v4.1-flash-1017",
  "DS V4.1 Flash 1017 · Gateway",
);
const pro = row("opencode", "OpenCode", "deepseek/deepseek-v4-pro", "DS V4 Pro · Direct");
const opus = row("claude", "Claude", "claude-opus-5-5", "Opus 5.5");

function summarize(items: ReturnType<typeof buildModelListItems>) {
  return items.map((item) =>
    item.kind === "header" ? `# ${item.label}` : `${item.row.modelLabel} | ${item.description}`,
  );
}

describe("getModelRoute", () => {
  it("returns the first id segment of a route/model id", () => {
    expect(getModelRoute("vercel-brandon-pro/deepseek/deepseek-v4.1-flash-1017")).toBe(
      "vercel-brandon-pro",
    );
    expect(getModelRoute("deepseek/deepseek-flash")).toBe("deepseek");
  });

  it("returns null for ids without a route", () => {
    expect(getModelRoute("claude-opus-5-5")).toBeNull();
    expect(getModelRoute("/leading")).toBeNull();
    expect(getModelRoute("trailing/")).toBeNull();
  });
});

describe("buildModelListItems", () => {
  it("keeps the flat list unchanged when grouping is off", () => {
    expect(
      summarize(
        buildModelListItems([direct, gateway], { grouped: false, showProviderLabel: false }),
      ),
    ).toEqual([
      "DS V4.1 Flash 1017 · Direct | deepseek/deepseek-flash",
      "DS V4.1 Flash 1017 · Gateway | vercel-brandon-pro/deepseek/deepseek-v4.1-flash-1017",
    ]);
  });

  it("qualifies descriptions with the provider when ungrouped in all-provider search", () => {
    expect(
      summarize(buildModelListItems([opus], { grouped: false, showProviderLabel: true })),
    ).toEqual(["Opus 5.5 | Claude · claude-opus-5-5"]);
  });

  it("groups a provider's models under route headings in first-seen order", () => {
    expect(
      summarize(
        buildModelListItems([direct, gateway, pro], { grouped: true, showProviderLabel: false }),
      ),
    ).toEqual([
      "# deepseek",
      "DS V4.1 Flash 1017 · Direct | deepseek-flash",
      "DS V4 Pro · Direct | deepseek-v4-pro",
      "# vercel-brandon-pro",
      "DS V4.1 Flash 1017 · Gateway | deepseek/deepseek-v4.1-flash-1017",
    ]);
  });

  it("adds no heading when every row shares one group", () => {
    expect(
      summarize(buildModelListItems([direct, pro], { grouped: true, showProviderLabel: false })),
    ).toEqual([
      "DS V4.1 Flash 1017 · Direct | deepseek/deepseek-flash",
      "DS V4 Pro · Direct | deepseek/deepseek-v4-pro",
    ]);
  });

  it("names the provider in headings for all-provider search", () => {
    expect(
      summarize(
        buildModelListItems([opus, gateway, direct], { grouped: true, showProviderLabel: true }),
      ),
    ).toEqual([
      "# Claude",
      "Opus 5.5 | claude-opus-5-5",
      "# OpenCode · vercel-brandon-pro",
      "DS V4.1 Flash 1017 · Gateway | deepseek/deepseek-v4.1-flash-1017",
      "# OpenCode · deepseek",
      "DS V4.1 Flash 1017 · Direct | deepseek-flash",
    ]);
  });

  it("gives headings keys that cannot collide with row keys", () => {
    const items = buildModelListItems([direct, gateway], {
      grouped: true,
      showProviderLabel: false,
    });
    const keys = items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
