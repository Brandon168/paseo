import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

interface PaseoQuickActionsModule {
  takePendingAction(): string | null;
  addListener(
    eventName: "onQuickAction",
    handler: (event: { id: string }) => void,
  ): EventSubscription;
}

// Only iOS has the native module. Android opens New Workspace through its static shortcut's link.
const nativeModule = requireOptionalNativeModule<PaseoQuickActionsModule>("PaseoQuickActions");

/** The quick action chosen before JavaScript started, if any. Reading it clears it. */
export function takePendingQuickAction(): string | null {
  return nativeModule?.takePendingAction() ?? null;
}

export function subscribeQuickAction(handler: (id: string) => void): () => void {
  if (!nativeModule) return () => {};
  const subscription = nativeModule.addListener("onQuickAction", (event) => handler(event.id));
  return () => subscription.remove();
}
