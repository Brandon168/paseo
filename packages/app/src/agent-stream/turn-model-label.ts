import type {
  AgentModelDefinition,
  AssistantMessageModel,
  ProviderSnapshotEntry,
} from "@getpaseo/protocol/agent-types";
import { getModelRoute } from "@/provider-selection/model-route-groups";

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
 * Whether a display name already says which route serves it. Custom names that carry their own
 * route use the picker's " · " convention (`DS V4.1 Flash · Direct`); adding the id's route
 * again would only repeat it.
 */
function nameCarriesRoute(name: string): boolean {
  return name.includes(LABEL_SEPARATOR);
}

/**
 * The footer label for the model that answered a turn: the picker's display name (which carries
 * the user's custom names), the route for `route/model` ids so the same model on two routes reads
 * differently (`Opus 5.5 · claude-agent` vs `Claude Opus 5.5 · vercel-brandon-pro`), and the
 * thinking level. Names that already carry a route are left as they are. A model or option the catalog no longer
 * lists falls back to its raw id, so an old turn still says something true.
 */
export function formatTurnModelLabel(
  model: AssistantMessageModel,
  entries: readonly ProviderSnapshotEntry[] | undefined,
): string {
  const entry = entries?.find((candidate) => candidate.provider === model.provider);
  const definition = findModelDefinition(entry?.models, model.modelId);
  const name = definition?.label.trim();
  const parts = [name || model.modelId];
  const route = name ? getModelRoute(model.modelId) : null;
  if (route && name && !nameCarriesRoute(name)) {
    parts.push(route);
  }
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
