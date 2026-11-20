import { describe, expect, it } from "vitest";
import type { AgentModelDefinition } from "@getpaseo/protocol/agent-types";
import {
  rankProviderModels,
  resolveProviderDiscoveredModels,
  type ProviderDiscoveredModelsCache,
} from "./provider-diagnostic-models";

const piModel: AgentModelDefinition = {
  provider: "pi",
  id: "pi/model",
  label: "Pi Model",
};

const grokModel: AgentModelDefinition = {
  provider: "grok",
  id: "grok-build",
  label: "Grok Build",
};

function resolveModels(input: {
  serverId?: string;
  provider: string;
  currentModels?: AgentModelDefinition[];
  loading?: boolean;
  cache?: ProviderDiscoveredModelsCache | null;
}) {
  return resolveProviderDiscoveredModels({
    serverId: input.serverId ?? "local",
    provider: input.provider,
    currentModels: input.currentModels,
    providerSnapshotRefreshing: input.loading === true,
    previousCache: input.cache ?? null,
  });
}

describe("resolveProviderDiscoveredModels", () => {
  it("keeps a provider's cached discovered models visible while that provider refreshes", () => {
    const ready = resolveModels({ provider: "grok", currentModels: [grokModel] });

    const refreshing = resolveModels({ provider: "grok", loading: true, cache: ready.cache });

    expect(refreshing.models).toEqual([grokModel]);
  });

  it("keeps models the user hid so they can be shown again", () => {
    const hiddenModel: AgentModelDefinition = {
      ...piModel,
      id: "pi/model-old",
      label: "Pi Model old",
      hidden: true,
      isSelectable: false,
    };

    const result = resolveModels({ provider: "pi", currentModels: [piModel, hiddenModel] });

    expect(result.models).toEqual([piModel, hiddenModel]);
  });

  it("excludes compatibility-only models from display and cache", () => {
    const compatibilityModel: AgentModelDefinition = {
      ...piModel,
      id: "pi/model-legacy",
      label: "Pi Model legacy",
      isSelectable: false,
    };

    const result = resolveModels({
      provider: "pi",
      currentModels: [piModel, compatibilityModel],
    });

    expect(result.models).toEqual([piModel]);
    expect(result.cache?.models).toEqual([piModel]);
  });

  it("does not show one provider's cached models while another provider loads", () => {
    const ready = resolveModels({ provider: "pi", currentModels: [piModel] });

    const refreshing = resolveModels({ provider: "grok", loading: true, cache: ready.cache });

    expect(refreshing.models).toEqual([]);
  });

  it("does not show another server's cached models while the same provider loads", () => {
    const ready = resolveModels({
      serverId: "server-a",
      provider: "grok",
      currentModels: [grokModel],
    });

    const refreshing = resolveModels({
      serverId: "server-b",
      provider: "grok",
      loading: true,
      cache: ready.cache,
    });

    expect(refreshing.models).toEqual([]);
  });
});

describe("rankProviderModels", () => {
  const models = [
    { id: "opencode/deepseek-v4.1-flash-free", label: "DeepSeek V4.1 Flash Free" },
    { id: "vercel-brandon-pro/fireworks/ember-1", label: "Ember-1" },
    { id: "nvidia/stepfun-ai/step-5-preview", label: "Step 5 Preview" },
    { id: "vercel-brandon-pro/inference-net/schematron-v2-turbo", label: "Schematron V2 Turbo" },
    {
      id: "vercel-brandon-pro/nvidia/nemotron-3.5-lightning-free",
      label: "Nemotron 3.5 Lightning Free",
    },
  ];
  const fields = (model: (typeof models)[number]) => [model.label, model.id];

  it("keeps catalog order for an empty query", () => {
    expect(rankProviderModels(models, "  ", fields)).toEqual(models);
  });

  it("matches case-insensitive tokens across the displayed fields", () => {
    expect(rankProviderModels(models, " NVIDIA lightning ", fields)).toEqual([models[4]]);
    expect(rankProviderModels(models, "no-such-model", fields)).toEqual([]);
  });

  it("searching free excludes scattered letter matches in backend model ids", () => {
    expect(rankProviderModels(models, "free", fields)).toEqual([models[0], models[4]]);
  });
});
