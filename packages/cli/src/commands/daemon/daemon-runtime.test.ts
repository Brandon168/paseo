import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolveDaemonRuntime } from "./daemon-runtime.js";

let bin: string;
const versions: Record<string, string> = {};
const probe = (command: string) => versions[command] ?? null;

function fakeBinary(name: string, version: string): string {
  const file = path.join(bin, name);
  writeFileSync(file, "#!/bin/sh\n");
  chmodSync(file, 0o755);
  versions[file] = version;
  return file;
}

beforeEach(() => {
  bin = mkdtempSync(path.join(tmpdir(), "paseo-runtime-"));
});
afterEach(() => {
  rmSync(bin, { recursive: true, force: true });
  for (const key of Object.keys(versions)) delete versions[key];
});

describe.skipIf(process.platform === "win32")("resolveDaemonRuntime", () => {
  test("defaults to the runtime running the CLI", () => {
    const node = fakeBinary("current-node", "v24.21.0");
    expect(
      resolveDaemonRuntime({ env: { PATH: "" }, execPath: node, currentEngine: "node", probe }),
    ).toEqual({
      engine: "node",
      command: node,
      version: "v24.21.0",
    });
  });

  test("finds bun on PATH for --runtime bun, and the flag wins over the environment", () => {
    const bun = fakeBinary("bun", "1.4.4");
    const node = fakeBinary("node", "v24.21.0");
    expect(
      resolveDaemonRuntime({
        requested: "bun",
        env: { PATH: bin, PASEO_DAEMON_RUNTIME: "node" },
        execPath: node,
        currentEngine: "node",
        probe,
      }),
    ).toEqual({ engine: "bun", command: bun, version: "1.4.4" });
  });

  test("reads PASEO_DAEMON_RUNTIME when no flag is given", () => {
    const bun = fakeBinary("bun", "1.4.4");
    expect(
      resolveDaemonRuntime({
        env: { PATH: bin, PASEO_DAEMON_RUNTIME: "bun" },
        execPath: "/x/node",
        currentEngine: "node",
        probe,
      }).command,
    ).toBe(bun);
  });

  test("accepts an absolute path and detects its engine from the version", () => {
    const custom = fakeBinary("custom-runtime", "1.5.0");
    expect(resolveDaemonRuntime({ requested: custom, env: { PATH: "" }, probe }).engine).toBe(
      "bun",
    );
  });

  test("rejects a Bun older than the tested minimum", () => {
    fakeBinary("bun", "1.3.9");
    expect(() =>
      resolveDaemonRuntime({
        requested: "bun",
        env: { PATH: bin, BUN_INSTALL: bin },
        execPath: "/x/node",
        currentEngine: "node",
        probe,
      }),
    ).toThrow("Bun 1.3.9 is too old for the daemon; 1.4.0 or newer is required");
  });

  test("rejects an unknown runtime name and a missing bun", () => {
    expect(() => resolveDaemonRuntime({ requested: "deno", env: { PATH: "" }, probe })).toThrow(
      'Unknown runtime "deno": use node, bun or an absolute path to one of them',
    );
    expect(() =>
      resolveDaemonRuntime({
        requested: "bun",
        env: { PATH: bin, BUN_INSTALL: bin },
        execPath: "/x/node",
        currentEngine: "node",
        probe,
      }),
    ).toThrow("Runtime bun was requested but no bun binary was found on PATH or in ~/.bun/bin");
  });
});

test("uses this CLI's runtime without probing it when no runtime is requested", () => {
  const runtime = resolveDaemonRuntime({
    env: {},
    execPath: "/opt/node/bin/node",
    currentEngine: "node",
    probe: () => {
      throw new Error("probed");
    },
  });
  expect(runtime).toEqual({
    engine: "node",
    command: "/opt/node/bin/node",
    version: process.version,
  });
});
