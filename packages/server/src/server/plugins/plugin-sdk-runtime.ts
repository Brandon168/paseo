import { createRequire } from "node:module";
import type * as PluginSharedRuntime from "@getpaseo/plugin";
import type * as PluginServerRuntime from "@getpaseo/plugin/server";
import type * as PluginProviderRuntime from "@getpaseo/plugin/server/provider";
import type * as PluginAcpRuntime from "@getpaseo/plugin/server/acp";
import type * as PluginUsageRuntime from "@getpaseo/plugin/server/usage";

// The SDK entry points a plugin's server bundle can require. Each is loaded the first time a
// plugin (or the host, for provider plugins) asks for it: most plugins use none of the provider,
// ACP and usage runtimes, and loading them all cost every plugin process ~45 MB (Node) up front.
// require() of these ES modules is synchronous (Node 22+, Bun) and shares the instance `import`
// would load.
const nodeRequire = createRequire(import.meta.url);

interface PluginSdkRuntimes {
  "@getpaseo/plugin": typeof PluginSharedRuntime;
  "@getpaseo/plugin/server": typeof PluginServerRuntime;
  "@getpaseo/plugin/server/provider": typeof PluginProviderRuntime;
  "@getpaseo/plugin/server/acp": typeof PluginAcpRuntime;
  "@getpaseo/plugin/server/usage": typeof PluginUsageRuntime;
}

export type PluginSdkRuntimeName = keyof PluginSdkRuntimes;

const PLUGIN_SDK_RUNTIME_NAMES = new Set<string>([
  "@getpaseo/plugin",
  "@getpaseo/plugin/server",
  "@getpaseo/plugin/server/provider",
  "@getpaseo/plugin/server/acp",
  "@getpaseo/plugin/server/usage",
]);

const loaded = new Map<PluginSdkRuntimeName, unknown>();

export function isPluginSdkRuntimeName(name: string): name is PluginSdkRuntimeName {
  return PLUGIN_SDK_RUNTIME_NAMES.has(name);
}

export function pluginSdkRuntime<Name extends PluginSdkRuntimeName>(
  name: Name,
): PluginSdkRuntimes[Name] {
  let runtime = loaded.get(name);
  if (runtime === undefined) {
    runtime = nodeRequire(name);
    loaded.set(name, runtime);
  }
  return runtime as PluginSdkRuntimes[Name];
}
