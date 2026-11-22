import type { AgentModelDefinition } from "@getpaseo/protocol/agent-types";
import { compareMatchScores, scoreTextFields } from "@getpaseo/protocol/search/text-match";
import { getModelRoute } from "@/provider-selection/model-route-groups";

export type ModelVisibilityFilter = "all" | "enabled" | "disabled";

const MODEL_SEARCH_OPTIONS = { subsequence: false } as const;

/** Distinct `route/model` prefixes across a model list, sorted for stable menu order. */
export function listModelRoutes(models: readonly Pick<AgentModelDefinition, "id">[]): string[] {
  const routes = new Set<string>();
  for (const model of models) {
    const route = getModelRoute(model.id);
    if (route) routes.add(route);
  }
  return [...routes].sort((a, b) => a.localeCompare(b));
}

export function rankCustomModels<T extends { id: string; label: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const q = query.trim();
  if (!q) return [...items];
  const scored = items
    .map((item) => ({
      item,
      score: scoreTextFields(q, [item.label, item.id], MODEL_SEARCH_OPTIONS),
    }))
    .filter(
      (entry): entry is { item: T; score: NonNullable<typeof entry.score> } => entry.score !== null,
    );
  scored.sort((a, b) => compareMatchScores(a.score, b.score));
  return scored.map((entry) => entry.item);
}

export function filterAndRankModelEntries<T>(
  items: readonly T[],
  options: {
    query: string;
    visibility: ModelVisibilityFilter;
    route?: string | null;
    getModel: (item: T) => Pick<AgentModelDefinition, "id" | "label" | "description">;
    getHidden: (item: T) => boolean;
    getExtraFields?: (item: T) => readonly string[];
  },
): T[] {
  const { query, visibility, route = null, getModel, getHidden, getExtraFields } = options;
  const routeScoped = route
    ? items.filter((item) => getModelRoute(getModel(item).id) === route)
    : items;

  const q = query.trim();
  let matched: readonly T[];
  if (!q) {
    matched = routeScoped;
  } else {
    const scored = routeScoped
      .map((item) => {
        const model = getModel(item);
        const fields = [
          model.label,
          model.id,
          model.description ?? "",
          ...(getExtraFields?.(item) ?? []),
        ];
        return { item, score: scoreTextFields(q, fields, MODEL_SEARCH_OPTIONS) };
      })
      .filter(
        (entry): entry is { item: T; score: NonNullable<typeof entry.score> } =>
          entry.score !== null,
      );
    scored.sort((a, b) => compareMatchScores(a.score, b.score));
    matched = scored.map((entry) => entry.item);
  }

  if (visibility === "all") return [...matched];
  const showHidden = visibility === "disabled";
  return matched.filter((item) => getHidden(item) === showHidden);
}
