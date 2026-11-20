import { useEffect } from "react";
import { router, usePathname, useRootNavigationState, type Href } from "expo-router";
import { useHostRegistryStatus, useHosts } from "@/runtime/host-runtime";
import { useIsLastWorkspaceSelectionHydrated } from "@/stores/navigation-active-workspace-store";
import { usePanelStore } from "@/stores/panel-store";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { createQuickActionQueue, type QuickAction } from "./model";
import { subscribeQuickAction, takePendingQuickAction } from "./source";

// On a phone the sessions drawer is transient state that survives backgrounding. Left open, it
// covers the new screen, so the shortcut looks like it only reopened the drawer.
function openNewWorkspaceRoute(route: Href) {
  usePanelStore.getState().showMobileAgent();
  router.navigate(route);
}

const openers: Record<QuickAction, () => void> = {
  "new-workspace": () => openNewWorkspaceRoute(buildNewWorkspaceRoute() as Href),
  // The route reads the device's Voice chat setting for the project and profile.
  "voice-chat": () => openNewWorkspaceRoute(buildNewWorkspaceRoute({ voice: true }) as Href),
};

const queue = createQuickActionQueue((action) => openers[action]());

/** Opens the action a home screen shortcut started, once the app has settled. */
export function QuickActionRouter({ startupBlocked }: { startupBlocked: boolean }) {
  const root = useRootNavigationState();
  const pathname = usePathname();
  const hosts = useHosts();
  const registryStatus = useHostRegistryStatus();
  const selectionHydrated = useIsLastWorkspaceSelectionHydrated();
  // Same gate as notification taps: index routes redirect during startup.
  const atStartupIndex = pathname === "/" || /^\/h\/[^/]+\/?$/.test(pathname);
  const canNavigate = Boolean(
    root?.key &&
    hosts.length > 0 &&
    registryStatus === "ready" &&
    selectionHydrated &&
    !startupBlocked &&
    !atStartupIndex,
  );

  useEffect(() => {
    // With no host there is nothing to open into. Drop the action rather than fire it after setup.
    if (registryStatus === "ready" && hosts.length === 0) queue.discard();
  }, [registryStatus, hosts.length]);

  useEffect(() => {
    queue.setReady(canNavigate);
  }, [canNavigate]);

  useEffect(() => {
    queue.receive(takePendingQuickAction());
    return subscribeQuickAction((id) => queue.receive(id));
  }, []);

  return null;
}
