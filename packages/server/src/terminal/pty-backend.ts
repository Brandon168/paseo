import * as nodePty from "node-pty";
import { constants } from "node:os";

/** The node-pty surface terminal.ts uses. Both backends implement exactly this. */
export interface PtyProcess {
  readonly pid: number;
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface PtySpawnOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string | undefined>;
}

interface BunTerminal {
  write(data: string): number;
  resize(cols: number, rows: number): void;
  close(): void;
}
interface BunSubprocess {
  readonly pid: number;
  readonly exited: Promise<number>;
  readonly exitCode: number | null;
  readonly signalCode: string | null;
  readonly terminal: BunTerminal | undefined;
  kill(signal?: string | number): void;
}
interface BunRuntime {
  spawn(
    command: string[],
    options: {
      cwd: string;
      env: Record<string, string | undefined>;
      terminal: {
        cols: number;
        rows: number;
        name?: string;
        data(terminal: unknown, data: Uint8Array): void;
      };
    },
  ): BunSubprocess;
}

function bunRuntime(): BunRuntime | null {
  const runtime = (globalThis as { Bun?: BunRuntime }).Bun;
  return runtime && typeof runtime.spawn === "function" ? runtime : null;
}

/**
 * Under Bun, node-pty's reader stops at the first EAGAIN from an idle PTY and node-pty then
 * closes the terminal, so the shell gets SIGHUP (oven-sh/bun#25822). Bun ships its own PTY, so
 * use it there on POSIX; Node and Windows keep node-pty.
 */
export function spawnPty(
  command: string,
  args: string[] | string,
  options: PtySpawnOptions,
): PtyProcess {
  const bun = process.platform !== "win32" ? bunRuntime() : null;
  if (!bun || typeof args === "string") return nodePty.spawn(command, args, options);
  return spawnBunPty(bun, command, args, options);
}

function spawnBunPty(
  bun: BunRuntime,
  command: string,
  args: string[],
  options: PtySpawnOptions,
): PtyProcess {
  const dataListeners: Array<(data: string) => void> = [];
  const exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  // PTY reads split multi-byte characters; a streaming decoder carries the partial bytes over.
  const decoder = new TextDecoder("utf-8");
  const subprocess = bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: { ...options.env, TERM: options.env.TERM ?? options.name },
    terminal: {
      cols: options.cols,
      rows: options.rows,
      name: options.name,
      data(_terminal, bytes) {
        const text = decoder.decode(bytes, { stream: true });
        if (text) for (const listener of dataListeners) listener(text);
      },
    },
  });
  void subprocess.exited.then(() => {
    const tail = decoder.decode();
    if (tail) for (const listener of dataListeners) listener(tail);
    const signalName = subprocess.signalCode as keyof typeof constants.signals | null;
    const signal = signalName ? constants.signals[signalName] : undefined;
    const exitCode = subprocess.exitCode ?? 0;
    for (const listener of exitListeners) listener(signal ? { exitCode, signal } : { exitCode });
    subprocess.terminal?.close();
    return;
  });
  return {
    pid: subprocess.pid,
    onData: (listener) => void dataListeners.push(listener),
    onExit: (listener) => void exitListeners.push(listener),
    write: (data) => void subprocess.terminal?.write(data),
    resize: (cols, rows) => subprocess.terminal?.resize(cols, rows),
    // node-pty's kill() defaults to SIGHUP on POSIX; keep that.
    kill: (signal) => subprocess.kill(signal ?? "SIGHUP"),
  };
}
