/** Home screen quick actions the app handles, keyed by the id the native shortcut carries. */
export type QuickAction = "new-workspace";

export function resolveQuickAction(id: string | null | undefined): QuickAction | null {
  return id === "new-workspace" ? "new-workspace" : null;
}

/**
 * Holds the most recent quick action until the app can navigate, then opens it once.
 * Startup redirects would otherwise replace a navigation made before the shell settles.
 */
export function createQuickActionQueue(open: (action: QuickAction) => void) {
  let queued: QuickAction | null = null;
  let ready = false;

  function flush() {
    if (!ready || queued === null) return;
    const action = queued;
    queued = null;
    open(action);
  }

  return {
    receive(id: string | null | undefined) {
      const action = resolveQuickAction(id);
      if (action === null) return;
      queued = action;
      flush();
    },
    setReady(next: boolean) {
      ready = next;
      flush();
    },
    /** Drops a held action that can no longer be served, so it never fires later by surprise. */
    discard() {
      queued = null;
    },
  };
}
