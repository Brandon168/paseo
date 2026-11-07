import { monitorEventLoopDelay, performance } from "node:perf_hooks";

/** Resolution while the loop is doing work: catches any stall longer than 100 ms. */
export const BUSY_EVENT_LOOP_DELAY_RESOLUTION_MS = 100;
/** Resolution while the daemon is idle, when there is nothing to stall. */
export const IDLE_EVENT_LOOP_DELAY_RESOLUTION_MS = 1000;
// A window is idle below these shares of its length: under 0.5 % of the loop's time spent running
// (150 ms in a 30 s window), or, where the runtime does not report loop utilization (Bun), under
// 1 % of one core of process CPU, which also counts GC and allocator threads.
const IDLE_LOOP_UTILIZATION = 0.005;
const IDLE_CPU_SHARE = 0.01;

export interface EventLoopDelaySnapshot {
  p50Ms: number;
  p99Ms: number;
  maxMs: number;
}

interface DelayHistogram {
  enable(): boolean;
  disable(): boolean;
  reset(): void;
  percentile(percentile: number): number;
  readonly max: number;
}

interface LoopUtilization {
  idle: number;
  active: number;
}

export interface EventLoopDelaySources {
  createMonitor(resolutionMs: number): DelayHistogram;
  /** Cumulative loop idle/active milliseconds, as performance.eventLoopUtilization() reports. */
  loopUtilization(): LoopUtilization;
  /** Cumulative process CPU time in microseconds. */
  cpuMicros(): number;
  nowMs(): number;
}

const defaultSources: EventLoopDelaySources = {
  createMonitor: (resolution) => monitorEventLoopDelay({ resolution }),
  loopUtilization: () => performance.eventLoopUtilization(),
  cpuMicros: () => {
    const usage = process.cpuUsage();
    return usage.user + usage.system;
  },
  nowMs: () => performance.now(),
};

/**
 * Event-loop delay percentiles for the runtime metrics line. The underlying monitor arms a timer
 * every `resolution` ms for the daemon's whole life, which is most of an idle daemon's wakeups.
 * So it samples every 100 ms while the loop is busy and every 1000 ms while a whole window was
 * idle. A stall makes its window busy, so the next window is sampled finely again.
 */
export class AdaptiveEventLoopDelayMonitor {
  private monitor: DelayHistogram;
  private resolution = BUSY_EVENT_LOOP_DELAY_RESOLUTION_MS;
  private windowStart: { loop: LoopUtilization; cpuMicros: number; atMs: number };

  constructor(private readonly sources: EventLoopDelaySources = defaultSources) {
    this.monitor = sources.createMonitor(this.resolution);
    this.monitor.enable();
    this.windowStart = this.readWindowStart();
  }

  get resolutionMs(): number {
    return this.resolution;
  }

  /** Percentiles since the last snapshot; then picks the resolution for the next window. */
  snapshot(): EventLoopDelaySnapshot {
    const toMs = (nanoseconds: number): number => Math.round(nanoseconds / 1e5) / 10;
    const snapshot = {
      p50Ms: toMs(this.monitor.percentile(50)),
      p99Ms: toMs(this.monitor.percentile(99)),
      maxMs: toMs(this.monitor.max),
    };
    const next = this.windowWasIdle()
      ? IDLE_EVENT_LOOP_DELAY_RESOLUTION_MS
      : BUSY_EVENT_LOOP_DELAY_RESOLUTION_MS;
    if (next === this.resolution) {
      this.monitor.reset();
    } else {
      this.monitor.disable();
      this.resolution = next;
      this.monitor = this.sources.createMonitor(next);
      this.monitor.enable();
    }
    this.windowStart = this.readWindowStart();
    return snapshot;
  }

  stop(): void {
    this.monitor.disable();
  }

  private readWindowStart() {
    return {
      loop: this.sources.loopUtilization(),
      cpuMicros: this.sources.cpuMicros(),
      atMs: this.sources.nowMs(),
    };
  }

  private windowWasIdle(): boolean {
    const loop = this.sources.loopUtilization();
    const idle = loop.idle - this.windowStart.loop.idle;
    const active = loop.active - this.windowStart.loop.active;
    if (idle + active > 0) {
      return active / (idle + active) < IDLE_LOOP_UTILIZATION;
    }
    const elapsedMs = this.sources.nowMs() - this.windowStart.atMs;
    if (elapsedMs <= 0) return false;
    const cpuMs = (this.sources.cpuMicros() - this.windowStart.cpuMicros) / 1000;
    return cpuMs / elapsedMs < IDLE_CPU_SHARE;
  }
}
