import { useMemo } from "react";
import type { AssistantMessageModel } from "@getpaseo/protocol/agent-types";
import { useAppSettings } from "@/hooks/use-settings";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { resolveTurnModelLabel } from "./turn-model-label";

/**
 * The label for the model that answered a turn, or null when the user turned it off. The
 * catalog read is shared (one query per host) and only enabled while the label is shown.
 */
export function useTurnModelLabel(
  serverId: string,
  model: AssistantMessageModel | undefined,
): string | null {
  const { settings } = useAppSettings();
  const enabled = settings.showModelOnTurns && model !== undefined;
  const snapshot = useProvidersSnapshot(serverId, { enabled });
  const entries = snapshot.entries;
  return useMemo(
    () => resolveTurnModelLabel({ enabled, model, entries }),
    [enabled, model, entries],
  );
}
