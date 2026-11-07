import { afterEach, describe, expect, test } from "vitest";
import { constants } from "node:os";
import { spawnPty } from "./pty-backend.js";

type DataCallback = (terminal: unknown, data: Uint8Array) => void;

function installFakeBun() {
  const calls: Array<{ command: string[]; options: Record<string, unknown> }> = [];
  const writes: string[] = [];
  const resizes: Array<[number, number]> = [];
  const kills: Array<string | number | undefined> = [];
  let emit!: DataCallback;
  let finish!: (outcome: { exitCode: number | null; signalCode: string | null }) => void;
  const subprocess = {
    pid: 4242,
    exitCode: null as number | null,
    signalCode: null as string | null,
    exited: undefined as unknown as Promise<number>,
    terminal: {
      write: (data: string) => (writes.push(data), data.length),
      resize: (cols: number, rows: number) => void resizes.push([cols, rows]),
      close: () => {},
    },
    kill: (signal?: string | number) => void kills.push(signal),
  };
  subprocess.exited = new Promise<number>((resolve) => {
    finish = (outcome) => {
      subprocess.exitCode = outcome.exitCode;
      subprocess.signalCode = outcome.signalCode;
      resolve(outcome.exitCode ?? 0);
    };
  });
  (globalThis as { Bun?: unknown }).Bun = {
    spawn(
      command: string[],
      options: { terminal: { data: DataCallback } } & Record<string, unknown>,
    ) {
      calls.push({ command, options });
      emit = options.terminal.data;
      return subprocess;
    },
  };
  return {
    calls,
    writes,
    resizes,
    kills,
    emit: (bytes: number[]) => emit(null, Uint8Array.from(bytes)),
    finish,
  };
}

const options = { name: "xterm-256color", cols: 80, rows: 24, cwd: "/tmp", env: { PATH: "/bin" } };

describe.skipIf(process.platform === "win32")("spawnPty under Bun", () => {
  afterEach(() => {
    delete (globalThis as { Bun?: unknown }).Bun;
  });

  test("uses Bun's PTY and keeps a character split across reads intact", async () => {
    const bun = installFakeBun();
    const pty = spawnPty("/bin/sh", ["-l"], options);
    const output: string[] = [];
    pty.onData((data) => output.push(data));
    // "é" is 0xC3 0xA9; the PTY can hand it over in two reads.
    bun.emit([0x61, 0xc3]);
    bun.emit([0xa9, 0x62]);
    pty.write("ls\r");
    pty.resize(100, 30);
    expect(output.join("")).toBe("aéb");
    expect(bun.calls).toEqual([
      {
        command: ["/bin/sh", "-l"],
        options: expect.objectContaining({
          cwd: "/tmp",
          env: { PATH: "/bin", TERM: "xterm-256color" },
          terminal: expect.objectContaining({ cols: 80, rows: 24, name: "xterm-256color" }),
        }),
      },
    ]);
    expect(bun.writes).toEqual(["ls\r"]);
    expect(bun.resizes).toEqual([[100, 30]]);
    expect(pty.pid).toBe(4242);
  });

  test("reports a signal exit with node-pty's numeric signal and defaults kill to SIGHUP", async () => {
    const bun = installFakeBun();
    const pty = spawnPty("/bin/sh", [], options);
    const exits: Array<{ exitCode: number; signal?: number }> = [];
    pty.onExit((event) => exits.push(event));
    pty.kill();
    pty.kill("SIGTERM");
    bun.finish({ exitCode: null, signalCode: "SIGTERM" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bun.kills).toEqual(["SIGHUP", "SIGTERM"]);
    expect(exits).toEqual([{ exitCode: 0, signal: constants.signals.SIGTERM }]);
  });

  test("reports a normal exit code without a signal", async () => {
    const bun = installFakeBun();
    const pty = spawnPty("/bin/sh", [], options);
    const exits: Array<{ exitCode: number; signal?: number }> = [];
    pty.onExit((event) => exits.push(event));
    bun.finish({ exitCode: 3, signalCode: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(exits).toEqual([{ exitCode: 3 }]);
  });
});

test("spawnPty uses node-pty when Bun is absent", async () => {
  delete (globalThis as { Bun?: unknown }).Bun;
  const pty = spawnPty("/bin/sh", ["-c", "printf node-pty-ok"], options);
  const output: string[] = [];
  pty.onData((data) => output.push(data));
  const exit = await new Promise<{ exitCode: number }>((resolve) => pty.onExit(resolve));
  expect(exit.exitCode).toBe(0);
  expect(output.join("")).toContain("node-pty-ok");
});
