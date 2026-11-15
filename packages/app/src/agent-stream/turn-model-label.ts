import type {
  AgentModelDefinition,
  AssistantMessageModel,
  ProviderSnapshotEntry,
} from "@getpaseo/protocol/agent-types";

const LABEL_SEPARATOR = " · ";

function findModelDefinition(
  models: readonly AgentModelDefinition[] | undefined,
  modelId: string,
): AgentModelDefinition | undefined {
  return (
    models?.find((candidate) => candidate.id === modelId) ??
    models?.find((candidate) => candidate.aliases?.includes(modelId))
  );
}

/**
 * The footer label for the model that answered a turn: the picker's display name (which carries
 * the user's custom names) plus the thinking level. A model or option the catalog no longer
 * lists falls back to its raw id, so an old turn still says something true.
 */
export function formatTurnModelLabel(
  model: AssistantMessageModel,
  entries: readonly ProviderSnapshotEntry[] | undefined,
): string {
  const entry = entries?.find((candidate) => candidate.provider === model.provider);
  const definition = findModelDefinition(entry?.models, model.modelId);
  const parts = [definition?.label.trim() || model.modelId];
  const thinkingOptionId = model.thinkingOptionId;
  if (thinkingOptionId) {
    const option = definition?.thinkingOptions?.find(
      (candidate) => candidate.id === thinkingOptionId,
    );
    parts.push(option?.label.trim() || thinkingOptionId);
  }
  return parts.join(LABEL_SEPARATOR);
}

/** Null when the setting is off or the turn has no stamped model (turns from before stamping). */
export function resolveTurnModelLabel(input: {
  enabled: boolean;
  model: AssistantMessageModel | undefined;
  entries: readonly ProviderSnapshotEntry[] | undefined;
}): string | null {
  if (!input.enabled || !input.model) {
    return null;
  }
  return formatTurnModelLabel(input.model, input.entries);
}
