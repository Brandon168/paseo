import type * as ProtocolMessages from "@getpaseo/protocol/messages";

/**
 * The protocol's message schemas: ~560 zod schemas that cost a process ~60 MB (Bun) to ~100 MB
 * (Node) to build. The client loads them once per process, on demand, so a client that trusts
 * its daemon (a plugin's IPC session) only pays for them if it uses an operation that parses a
 * reply.
 */
export type ProtocolSchemas = typeof ProtocolMessages;

let schemas: ProtocolSchemas | null = null;
let schemasLoad: Promise<ProtocolSchemas> | null = null;

/** Supplies already-imported schemas, so no client in this process waits for them. */
export function registerProtocolSchemas(module: ProtocolSchemas): void {
  schemas ??= module;
  schemasLoad ??= Promise.resolve(schemas);
}

export function loadProtocolSchemas(): Promise<ProtocolSchemas> {
  schemasLoad ??= import("@getpaseo/protocol/messages").then(
    (module) => (schemas = module),
    (error: unknown) => {
      // Forget the failure so a later call tries again.
      schemasLoad = null;
      throw error;
    },
  );
  return schemasLoad;
}

/** The schemas if they have finished loading, else null. */
export function loadedProtocolSchemas(): ProtocolSchemas | null {
  return schemas;
}
