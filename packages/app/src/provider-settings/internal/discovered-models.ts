import type { AgentModelDefinition } from "@getpaseo/protocol/agent-types";

export interface ProviderDiscoveredModelsCache {
  serverId: string;
  provider: string;
  models: AgentModelDefinition[];
}

export interface ResolveProviderDiscoveredModelsInput {
  serverId: string;
  provider: string;
  currentModels: AgentModelDefinition[] | undefined;
  providerSnapshotRefreshing: boolean;
  previousCache: ProviderDiscoveredModelsCache | null;
}

export interface ResolveProviderDiscoveredModelsResult {
  models: AgentModelDefinition[];
  cache: ProviderDiscoveredModelsCache | null;
}

export function resolveProviderDiscoveredModels({
  serverId,
  provider,
  currentModels,
  providerSnapshotRefreshing,
  previousCache,
}: ResolveProviderDiscoveredModelsInput): ResolveProviderDiscoveredModelsResult {
  // Models the user hid stay listed here so they can be shown again; other unselectable
  // (compatibility) models stay out.
  const selectableModels = (currentModels ?? []).filter(
    (model) => model.isSelectable !== false || model.hidden === true,
  );
  if (selectableModels.length > 0) {
    const cache = { serverId, provider, models: selectableModels };
    return { models: selectableModels, cache };
  }

  if (
    providerSnapshotRefreshing &&
    previousCache?.serverId === serverId &&
    previousCache.provider === provider
  ) {
    return { models: previousCache.models, cache: previousCache };
  }

  return { models: [], cache: previousCache };
}
