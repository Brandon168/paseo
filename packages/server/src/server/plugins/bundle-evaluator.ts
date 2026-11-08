import { createRequire } from "node:module";
import * as pluginSharedRuntime from "@getpaseo/plugin";
import * as pluginProviderRuntime from "@getpaseo/plugin/server/provider";
import type * as PluginAcpRuntime from "@getpaseo/plugin/server/acp";
import * as pluginUsageRuntime from "@getpaseo/plugin/server/usage";
import * as pluginServerRuntime from "@getpaseo/plugin/server";
import type { PluginServerContribution } from "@getpaseo/plugin/server";
import * as zod from "zod";
import { isPluginClientOnlySdkSpecifier } from "./plugin-sdk-specifiers.js";

const nodeRequire = createRequire(import.meta.url);

// The ACP runtime costs a plugin process ~23 MB on Node and only plugins that host ACP agents use
// it, so it loads for bundles that name it (prepareBundleRuntime) rather than for every plugin.
const ACP_RUNTIME = "@getpaseo/plugin/server/acp";
let pluginAcpRuntime: typeof PluginAcpRuntime | null = null;

/** Loads the runtimes a bundle requires that are not imported up front. Await before evaluating. */
export async function prepareBundleRuntime(bundle: string): Promise<void> {
  if (!pluginAcpRuntime && bundle.includes(ACP_RUNTIME)) {
    pluginAcpRuntime = (await import(ACP_RUNTIME)) as typeof PluginAcpRuntime;
  }
}

function runtimeRequire(name: string): unknown {
  if (isPluginClientOnlySdkSpecifier(name)) {
    throw new Error(`${name} is available only in plugin client code`);
  }
  if (name === "@getpaseo/plugin") return pluginSharedRuntime;
  if (name === "@getpaseo/plugin/server") return pluginServerRuntime;
  if (name === "@getpaseo/plugin/server/provider") return pluginProviderRuntime;
  if (name === ACP_RUNTIME) {
    // A bundle that computes the specifier was not prepared; require() works on Node 22.12+ and Bun.
    pluginAcpRuntime ??= nodeRequire(ACP_RUNTIME) as typeof PluginAcpRuntime;
    return pluginAcpRuntime;
  }
  if (name === "@getpaseo/plugin/server/usage") return pluginUsageRuntime;
  if (name === "zod") return zod;
  if (name === "@getpaseo/plugin/client/host")
    throw new Error(`${name} is private to the app host`);
  return nodeRequire(name);
}

export function evaluateBundle(bundle: string): PluginServerContribution {
  const evaluate: (source: string) => unknown = globalThis.eval;
  const factory = evaluate(bundle);
  if (typeof factory !== "function") throw new Error("Plugin server bundle is not executable");
  const exports = factory(runtimeRequire);
  const setup =
    exports !== null && typeof exports === "object" ? Reflect.get(exports, "default") : undefined;
  if (typeof setup !== "function") {
    throw new Error("Plugin server bundle must default export a function");
  }
  return setup as PluginServerContribution;
}
