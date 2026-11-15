import {
  buildProviderQualifiedDescription,
  type ProviderSelectionModelRow,
} from "./provider-selection";

/**
 * Optional grouping for the model picker (the "Group models by route" chat setting).
 *
 * Some providers expose models from several upstream routes under one Paseo provider:
 * OpenCode's ids are `route/model` (`deepseek/deepseek-flash`,
 * `vercel-brandon-pro/deepseek/deepseek-v4.1-flash-1017`). Two routes can serve a model
 * with the same display name, and the id that tells them apart is what truncates first.
 * Grouped, each route gets a heading and the rows drop the repeated route prefix.
 */

export interface ModelListHeaderItem {
  kind: "header";
  key: string;
  label: string;
}

export interface ModelListRowItem {
  kind: "row";
  key: string;
  row: ProviderSelectionModelRow;
  /** Secondary text for the row, already qualified or shortened for this layout. */
  description: string | undefined;
}

export type ModelListItem = ModelListHeaderItem | ModelListRowItem;

/** The upstream route of a `route/model` id, or null for ids without one. */
export function getModelRoute(modelId: string): string | null {
  const slash = modelId.indexOf("/");
  if (slash < 1 || slash === modelId.length - 1) return null;
  return modelId.slice(0, slash);
}

function stripRoutePrefix(description: string | undefined, route: string | null) {
  if (!description || !route) return description;
  const prefix = `${route}/`;
  return description.startsWith(prefix) ? description.slice(prefix.length) : description;
}

function groupLabel(
  row: ProviderSelectionModelRow,
  route: string | null,
  showProviderLabel: boolean,
): string {
  if (!route) return row.providerLabel;
  return showProviderLabel ? `${row.providerLabel} · ${route}` : route;
}

function ungroupedItems(
  rows: ProviderSelectionModelRow[],
  showProviderLabel: boolean,
): ModelListItem[] {
  return rows.map((row) => ({
    kind: "row",
    key: row.favoriteKey,
    row,
    description: showProviderLabel ? buildProviderQualifiedDescription(row) : row.description,
  }));
}

export function buildModelListItems(
  rows: ProviderSelectionModelRow[],
  options: { grouped: boolean; showProviderLabel: boolean },
): ModelListItem[] {
  const { grouped, showProviderLabel } = options;
  if (!grouped) return ungroupedItems(rows, showProviderLabel);

  // Groups keep the order in which they first appear, so a ranked search keeps its best
  // match's group on top; rows keep their order inside a group.
  const groups = new Map<
    string,
    { label: string; route: string | null; rows: ProviderSelectionModelRow[] }
  >();
  for (const row of rows) {
    const route = getModelRoute(row.modelId);
    const key = `${row.provider}\u0000${route ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = { label: groupLabel(row, route, showProviderLabel), route, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  // One group needs no heading: the picker header already names the provider.
  if (groups.size < 2) return ungroupedItems(rows, showProviderLabel);

  const items: ModelListItem[] = [];
  for (const [key, group] of groups) {
    items.push({ kind: "header", key: `group:${key}`, label: group.label });
    for (const row of group.rows) {
      items.push({
        kind: "row",
        key: row.favoriteKey,
        row,
        description: stripRoutePrefix(row.description, group.route),
      });
    }
  }
  return items;
}
