// Lean service entry (`paseo-daemon`): runs the daemon supervisor in this process.
//
// `paseo daemon run` spawns the supervisor and stays resident only to wait for it, keeping the
// whole CLI loaded (~70-120 MB). A service unit can run this instead; the runtime is whichever
// binary runs it, e.g. `ExecStart=/usr/bin/bun …/paseo-daemon --home ~/.paseo`. It applies the
// same deployment environment as `paseo daemon run` and imports nothing but the supervisor.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function resolveSupervisorEntry(): string {
  const require = createRequire(import.meta.url);
  let directory = path.dirname(require.resolve("@getpaseo/server"));
  for (;;) {
    const manifest = path.join(directory, "package.json");
    if (
      existsSync(manifest) &&
      JSON.parse(readFileSync(manifest, "utf8")).name === "@getpaseo/server"
    ) {
      return path.join(directory, "dist", "scripts", "supervisor-entrypoint.js");
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error("Unable to locate @getpaseo/server for paseo-daemon");
    directory = parent;
  }
}

const passthrough: string[] = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const arg = args[index]!;
  if (arg === "--home") {
    const value = args[++index];
    if (!value) {
      process.stderr.write("paseo-daemon: --home needs a directory\n");
      process.exit(2);
    }
    process.env.PASEO_HOME = value;
  } else if (arg.startsWith("--home=")) process.env.PASEO_HOME = arg.slice("--home=".length);
  else passthrough.push(arg);
}
const home = process.env.PASEO_HOME;
if (home) process.env.PASEO_HOME = path.resolve(home.replace(/^~(?=$|\/)/, homedir()));
// Same as daemonLaunchEnvironment(mode: "deployment"): a daemon never targets another host and
// is not desktop-managed.
delete process.env.PASEO_HOST;
delete process.env.PASEO_DESKTOP_MANAGED;

const entry = resolveSupervisorEntry();
process.argv = [process.argv[0]!, entry, ...passthrough];
await import(pathToFileURL(entry).href);
