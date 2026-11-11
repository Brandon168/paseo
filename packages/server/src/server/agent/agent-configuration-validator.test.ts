import { describe, expect, test } from "vitest";

import type { ProviderSnapshotEntry } from "./agent-sdk-types.js";
import { validateAgentConfigurationAgainstProvider } from "./agent-configuration-validator.js";

function provider(models: ProviderSnapshotEntry["models"]): ProviderSnapshotEntry {
  return { provider: "claude", status: "ready", enabled: true, models };
}

describe("validateAgentConfigurationAgainstProvider", () => {
  const entry = provider([
    { provider: "claude", id: "visible", label: "Visible", isDefault: true },
    { provider: "claude", id: "hidden", label: "Hidden", hidden: true, isSelectable: false },
    { provider: "claude", id: "compat", label: "Compat", isSelectable: false },
  ]);

  test("a model hidden from the picker can still be requested by name", () => {
    expect(
      validateAgentConfigurationAgainstProvider({
        input: { provider: "claude", model: "hidden" },
        provider: entry,
      }),
    ).toEqual([]);
  });

  test("unselectable compatibility models are still rejected", () => {
    expect(
      validateAgentConfigurationAgainstProvider({
        input: { provider: "claude", model: "compat" },
        provider: entry,
      }),
    ).toEqual([
      { path: ["model"], message: "Model 'compat' is not available for provider 'claude'" },
    ]);
  });

  test("unknown models are rejected", () => {
    expect(
      validateAgentConfigurationAgainstProvider({
        input: { provider: "claude", model: "missing" },
        provider: entry,
      }),
    ).toHaveLength(1);
  });
});
