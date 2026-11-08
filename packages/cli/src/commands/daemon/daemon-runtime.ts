import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** Oldest Bun the daemon is tested on (native PTY, Bun-to-Bun advanced IPC). */
export const MIN_BUN_VERSION = [1, 4, 0] as const;

export interface DaemonRuntime {
  engine: "node" | "bun";
  command: string;
  version: string;
}

interface ResolveOptions {
  requested?: string;
  env?: NodeJS.ProcessEnv;
  /** The binary running this CLI, used when the request matches its own engine. */
  execPath?: string;
  currentEngine?: "node" | "bun";
  probe?: (command: string) => string | null;
}

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(name: string, env: NodeJS.ProcessEnv): string | null {
  // Windows finds `bun` as bun.exe through PATHEXT; access(X_OK) only checks existence there.
  const extensions =
    process.platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD").split(";").filter(Boolean) : [""];
  for (const directory of (env.PATH ?? env.Path ?? "").split(path.delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, name + extension.toLowerCase());
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

function probeVersion(command: string): string | null {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 10_000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

function parseVersion(text: string): number[] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match ? match.slice(1).map(Number) : null;
}

function atLeast(version: number[], minimum: readonly number[]): boolean {
  for (let index = 0; index < minimum.length; index++) {
    if (version[index] !== minimum[index]) return version[index] > minimum[index];
  }
  return true;
}

function locateRuntime(
  requested: string,
  env: NodeJS.ProcessEnv,
  execPath: string,
  currentEngine: "node" | "bun",
): string {
  if (!requested || requested === currentEngine) return execPath;
  if (requested === "bun") {
    const installed = path.join(env.BUN_INSTALL ?? path.join(homedir(), ".bun"), "bin", "bun");
    const found = findOnPath("bun", env) ?? (isExecutable(installed) ? installed : null);
    if (!found) {
      throw new Error(
        "Runtime bun was requested but no bun binary was found on PATH or in ~/.bun/bin",
      );
    }
    return found;
  }
  if (requested === "node") {
    const found = findOnPath("node", env);
    if (!found) throw new Error("Runtime node was requested but no node binary was found on PATH");
    return found;
  }
  if (!path.isAbsolute(requested)) {
    throw new Error(
      `Unknown runtime "${requested}": use node, bun or an absolute path to one of them`,
    );
  }
  if (!isExecutable(requested)) throw new Error(`Runtime ${requested} is not an executable file`);
  return requested;
}

/**
 * Picks the JavaScript runtime the supervisor (and so every daemon process) runs on. The daemon's
 * children start from `process.execPath`, so choosing the supervisor's binary chooses for all of
 * them. Default: the runtime running this CLI. `--runtime` wins over `PASEO_DAEMON_RUNTIME`; each
 * takes `node`, `bun` or a path to either binary.
 */
export function resolveDaemonRuntime(options: ResolveOptions = {}): DaemonRuntime {
  const env = options.env ?? process.env;
  const requested = (options.requested ?? env.PASEO_DAEMON_RUNTIME ?? "").trim();
  const currentEngine = options.currentEngine ?? (process.versions.bun ? "bun" : "node");
  if (!requested) {
    // Nothing requested: the daemon runs on this CLI's own runtime, as it always has; no probe.
    return {
      engine: currentEngine,
      command: options.execPath ?? process.execPath,
      version: currentEngine === "bun" ? (process.versions.bun ?? "") : process.version,
    };
  }
  const command = locateRuntime(
    requested,
    env,
    options.execPath ?? process.execPath,
    currentEngine,
  );
  const version = (options.probe ?? probeVersion)(command);
  if (!version) throw new Error(`Runtime ${command} did not report a version`);
  // Node prints "v24.21.0", Bun "1.4.4".
  const engine = version.startsWith("v") ? "node" : "bun";
  const parsed = parseVersion(version);
  if (engine === "bun" && (!parsed || !atLeast(parsed, MIN_BUN_VERSION))) {
    throw new Error(
      `Bun ${version} is too old for the daemon; ${MIN_BUN_VERSION.join(".")} or newer is required`,
    );
  }
  return { engine, command, version };
}
