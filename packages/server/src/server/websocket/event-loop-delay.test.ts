import { expect, test } from "vitest";
import {
  AdaptiveEventLoopDelayMonitor,
  BUSY_EVENT_LOOP_DELAY_RESOLUTION_MS,
  IDLE_EVENT_LOOP_DELAY_RESOLUTION_MS,
  type EventLoopDelaySources,
} from "./event-loop-delay.js";

class FakeRuntime implements EventLoopDelaySources {
  created: number[] = [];
  recordsInterval = false;
  enabled = new Set<number>();
  private loop = { idle: 0, active: 0 };
  private cpu = 0;
  private now = 0;
  constructor(private readonly reportsLoopUtilization: boolean) {}

  createMonitor(resolutionMs: number) {
    const id = this.created.push(resolutionMs) - 1;
    // Like Node when recordsInterval: each sample is the interval plus its lateness.
    const base = this.recordsInterval ? resolutionMs * 1e6 : 0;
    return {
      enable: () => (this.enabled.add(id), true),
      disable: () => this.enabled.delete(id),
      reset: () => {},
      percentile: () => base + 2e6,
      max: base + 5e6,
    };
  }
  loopUtilization() {
    return this.reportsLoopUtilization ? { ...this.loop } : { idle: 0, active: 0 };
  }
  cpuMicros() {
    return this.cpu;
  }
  nowMs() {
    return this.now;
  }
  /** Advances one 30 s metrics window in which the loop ran for activeMs. */
  window(activeMs: number) {
    this.now += 30_000;
    this.loop = { idle: this.loop.idle + 30_000 - activeMs, active: this.loop.active + activeMs };
    this.cpu += activeMs * 1000;
  }
}

test.each([true, false])(
  "samples coarsely after an idle window and finely again after a busy one (loop utilization reported: %s)",
  (reportsLoopUtilization) => {
    const runtime = new FakeRuntime(reportsLoopUtilization);
    const monitor = new AdaptiveEventLoopDelayMonitor(runtime);
    expect(monitor.resolutionMs).toBe(BUSY_EVENT_LOOP_DELAY_RESOLUTION_MS);

    runtime.window(20);
    expect(monitor.snapshot()).toEqual({ p50Ms: 2, p99Ms: 2, maxMs: 5 });
    expect(monitor.resolutionMs).toBe(IDLE_EVENT_LOOP_DELAY_RESOLUTION_MS);

    runtime.window(20);
    monitor.snapshot();
    expect(runtime.created).toEqual([100, 1000]);

    // A 400 ms stall makes its window busy.
    runtime.window(400);
    monitor.snapshot();
    expect(monitor.resolutionMs).toBe(BUSY_EVENT_LOOP_DELAY_RESOLUTION_MS);
    expect(runtime.created).toEqual([100, 1000, 100]);
    expect([...runtime.enabled]).toEqual([2]);

    monitor.stop();
    expect(runtime.enabled.size).toBe(0);
  },
);

test.each([true, false])(
  "reports lateness, not the sampling interval, at either resolution (interval recorded: %s)",
  (recordsInterval) => {
    const runtime = new FakeRuntime(true);
    runtime.recordsInterval = recordsInterval;
    const monitor = new AdaptiveEventLoopDelayMonitor(runtime);
    runtime.window(20);
    expect(monitor.snapshot()).toEqual({ p50Ms: 2, p99Ms: 2, maxMs: 5 });
    expect(monitor.resolutionMs).toBe(IDLE_EVENT_LOOP_DELAY_RESOLUTION_MS);
    runtime.window(20);
    expect(monitor.snapshot()).toEqual({ p50Ms: 2, p99Ms: 2, maxMs: 5 });
  },
);

test("an idle loop reports near-zero delay with the real monitor", async () => {
  const monitor = new AdaptiveEventLoopDelayMonitor();
  try {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const snapshot = monitor.snapshot();
    // Counting the 100 ms sampling interval would put the median near 100 ms.
    expect(snapshot.p50Ms).toBeLessThan(30);
  } finally {
    monitor.stop();
  }
});
