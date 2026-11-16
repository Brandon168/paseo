import { createHash } from "node:crypto";
import type { AgentUsageSession } from "../../agent/agent-sdk-types.js";
import type { UsageScope } from "@getpaseo/plugin/server/usage";
import { z } from "zod";
import type { Logger } from "pino";
import {
  UsageReportSchema,
  type ProviderUsage,
  type UsageReportEntry,
  type UsageProblem,
  type UsageReport,
} from "@getpaseo/protocol/messages";

export interface UsageSource {
  id: string;
  label: string;
  icon?: string;
  discover(scope: UsageScope): Promise<unknown>;
  fetch(input: unknown): Promise<unknown>;
}

interface Login {
  input: unknown;
  harness: string;
}

interface KnownReport {
  source: UsageSource;
  logins: [Login, ...Login[]];
  label?: string;
}

export interface AgentUsageLookup {
  hasAgent(id: string): boolean;
  usageSession(id: string): AgentUsageSession | null;
}

export interface ListUsageReportsOptions {
  forceRefresh?: boolean;
  reportIds?: string[];
  agentId?: string;
  onReport?: (report: UsageReportEntry) => void;
}

/** When a finished turn refreshes its agent's reports. */
export interface TurnRefreshTiming {
  /** Wait after a turn ends, so back-to-back turns share one fetch. */
  debounceMs: number;
  /** Never fetch one report more often than this, however many turns end. */
  minIntervalMs: number;
}

interface PendingTurnRefresh {
  timer: ReturnType<typeof setTimeout>;
  /** The last turn this refresh has to cover. */
  endedAt: number;
}

interface AgentReports {
  provider: string;
  model?: string;
  sessionKey: string;
  reports: Map<string, KnownReport>;
}

/** Owns account identity, ordered logins for each account, and the five-minute fetch cache. */
export class UsageSourceRegistry {
  private readonly sources = new Map<string, UsageSource>();
  private readonly known = new Map<string, KnownReport>();
  private defaults = new Map<string, KnownReport>();
  private readonly byAgent = new Map<string, AgentReports>();
  private readonly cache = new Map<string, { at: number; entry: UsageReportEntry }>();
  private readonly successful = new Map<string, NonNullable<UsageReportEntry["lastSuccessful"]>>();
  private readonly pending = new Map<string, Promise<UsageReportEntry>>();
  private readonly reportListeners = new Set<(entry: UsageReportEntry) => void>();
  private readonly turnRefreshes = new Map<string, PendingTurnRefresh>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 300_000,
    private readonly logger: Pick<Logger, "warn"> = { warn: console.warn },
    private readonly agents: AgentUsageLookup = { hasAgent: () => false, usageSession: () => null },
    private readonly deadlineMs = 20_000,
    private readonly turnRefresh: TurnRefreshTiming = { debounceMs: 5_000, minIntervalMs: 90_000 },
  ) {}

  /** Reports refreshed because an agent's turn ended. */
  subscribeReports(listener: (entry: UsageReportEntry) => void): () => void {
    this.reportListeners.add(listener);
    return () => {
      this.reportListeners.delete(listener);
      if (this.reportListeners.size > 0) return;
      for (const pending of this.turnRefreshes.values()) clearTimeout(pending.timer);
      this.turnRefreshes.clear();
    };
  }

  /**
   * Refreshes the reports an agent runs under after its turn ends, and publishes them. Usage only
   * moves while agents work, so this replaces polling. Vendors rate-limit their usage endpoints
   * (Claude answers 429 with a Retry-After of tens of minutes), so turns are debounced and each
   * report is fetched at most once per `minIntervalMs`; a turn inside that interval moves the
   * fetch to its end instead of dropping it. Nothing is fetched while no one listens.
   */
  refreshAfterTurn(agentId: string): void {
    if (this.reportListeners.size === 0) return;
    const endedAt = this.now();
    void this.discoverAgent(agentId)
      .then((ids) => {
        for (const id of new Set(ids)) this.scheduleTurnRefresh(id, endedAt);
        return undefined;
      })
      .catch((error: unknown) => {
        this.logger.warn({ agentId, err: error }, "Usage refresh after turn failed");
      });
  }

  private scheduleTurnRefresh(id: string, endedAt: number): void {
    if (this.reportListeners.size === 0) return;
    const pending = this.turnRefreshes.get(id);
    if (pending) {
      pending.endedAt = Math.max(pending.endedAt, endedAt);
      return;
    }
    const known = this.known.get(id);
    if (!known) return;
    const lastFetch = this.cache.get(cacheIdentity(id, known))?.at;
    const earliest = lastFetch === undefined ? 0 : lastFetch + this.turnRefresh.minIntervalMs;
    const delay = Math.max(this.turnRefresh.debounceMs, earliest - this.now());
    const timer = setTimeout(() => this.runTurnRefresh(id), delay);
    timer.unref?.();
    this.turnRefreshes.set(id, { timer, endedAt });
  }

  private runTurnRefresh(id: string): void {
    const pending = this.turnRefreshes.get(id);
    this.turnRefreshes.delete(id);
    // The host list fetches the merged login set, so refresh that identity: it is what the
    // sidebar shows, and its cache answers the next poll.
    const known = this.known.get(id);
    if (!pending || !known || this.reportListeners.size === 0) return;
    const cached = this.cache.get(cacheIdentity(id, known));
    // A Refresh or poll since the last turn ended already has its usage.
    const forceRefresh = !cached || cached.at < pending.endedAt;
    void this.fetchId(id, known, forceRefresh).then((entry) => {
      for (const listener of this.reportListeners) listener(entry);
      return undefined;
    });
  }

  register(source: UsageSource): void {
    if (this.sources.has(source.id)) throw new Error(`Duplicate usage source: ${source.id}`);
    this.sources.set(source.id, source);
  }

  unregister(id: string): void {
    this.sources.delete(id);
    for (const key of this.defaults.keys()) if (key.startsWith(`${id}:`)) this.defaults.delete(key);
    // Re-discover on the next session query when a source is replaced.
    for (const [agentId, mapping] of this.byAgent) {
      if ([...mapping.reports.values()].some((report) => report.source.id === id))
        this.byAgent.delete(agentId);
    }
    for (const key of this.known.keys()) if (key.startsWith(`${id}:`)) this.known.delete(key);
    for (const key of this.cache.keys()) if (key.startsWith(`${id}:`)) this.cache.delete(key);
    for (const key of this.successful.keys())
      if (key.startsWith(`${id}:`)) this.successful.delete(key);
    for (const key of this.pending.keys()) if (key.startsWith(`${id}:`)) this.pending.delete(key);
    for (const [key, pending] of this.turnRefreshes) {
      if (!key.startsWith(`${id}:`)) continue;
      clearTimeout(pending.timer);
      this.turnRefreshes.delete(key);
    }
  }

  async listReports(options: ListUsageReportsOptions = {}): Promise<UsageReportEntry[]> {
    if (options.agentId !== undefined && options.reportIds !== undefined)
      throw new Error("agentId and reportIds cannot be combined");
    this.pruneAgents();
    let ids: string[];
    let reports = this.known;
    if (options.agentId !== undefined) {
      ids = await this.discoverAgent(options.agentId);
      reports = this.byAgent.get(options.agentId)?.reports ?? new Map();
    } else if (options.reportIds !== undefined) {
      ids = options.reportIds;
    } else {
      this.defaults = await this.discover({ kind: "global" }, this.defaults);
      this.mergeKnown();
      ids = [...this.known.keys()];
    }
    return Promise.all(
      [...new Set(ids)].flatMap((id) => {
        const known = reports.get(id);
        if (!known) return [];
        return [
          this.fetchId(id, known, options.forceRefresh).then((entry) => {
            options.onReport?.(entry);
            return entry;
          }),
        ];
      }),
    );
  }

  private pruneAgents(): void {
    for (const id of this.byAgent.keys()) {
      if (!this.agents.hasAgent(id)) this.byAgent.delete(id);
    }
    this.mergeKnown();
  }

  private async discoverAgent(agentId: string): Promise<string[]> {
    if (!this.agents.hasAgent(agentId)) throw new Error(`Unknown agent: ${agentId}`);
    const session = this.agents.usageSession(agentId);
    if (!session) {
      this.byAgent.delete(agentId);
      this.mergeKnown();
      return [];
    }
    const previous = this.byAgent.get(agentId);
    const sameScope =
      previous?.sessionKey === session.sessionKey &&
      previous.provider === session.provider &&
      previous.model === session.model;
    if (sameScope) return [...previous.reports.keys()];
    const reports = await this.discover({
      kind: "session",
      provider: session.provider,
      model: session.model,
      env: session.env,
    });
    // A query that finishes after a resume must not publish the previous launch's mapping.
    if (this.agents.usageSession(agentId)?.sessionKey !== session.sessionKey) return [];
    this.byAgent.set(agentId, {
      sessionKey: session.sessionKey,
      provider: session.provider,
      model: session.model,
      reports,
    });
    this.mergeKnown();
    return [...reports.keys()];
  }

  private mergeKnown(): void {
    this.known.clear();
    for (const reports of [
      this.defaults,
      ...[...this.byAgent.values()].map((agent) => agent.reports),
    ]) {
      for (const [id, report] of reports) {
        if (this.sources.get(report.source.id) !== report.source) continue;
        const known = this.known.get(id);
        if (!known) {
          this.known.set(id, { ...report, logins: [...report.logins] });
          continue;
        }
        for (const login of report.logins) {
          if (!known.logins.some((existing) => loginKey(existing) === loginKey(login)))
            known.logins.push(login);
        }
      }
    }
    // Fetch freshness expires independently of successful snapshots. Retain only live identities.
    const active = this.activeCacheKeys();
    for (const key of this.successful.keys()) if (!active.has(key)) this.successful.delete(key);
    for (const key of this.cache.keys()) if (!active.has(key)) this.cache.delete(key);
  }

  private activeCacheKeys(): Set<string> {
    return new Set(
      [
        this.known,
        this.defaults,
        ...[...this.byAgent.values()].map((agent) => agent.reports),
      ].flatMap((reports) => [...reports].map(([id, report]) => cacheIdentity(id, report))),
    );
  }

  private async discover(
    scope: UsageScope,
    previous: ReadonlyMap<string, KnownReport> = new Map(),
  ): Promise<Map<string, KnownReport>> {
    const discovered = await Promise.all(
      [...this.sources.values()].map(async (source) => {
        const reports = new Map<string, KnownReport>();
        try {
          const accounts = z
            .array(
              z.object({
                key: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
                label: z.string().optional(),
                harness: z.string().min(1).optional(),
                input: z.json(),
              }),
            )
            .parse(await source.discover(scope));
          for (const account of accounts) {
            const id = `${source.id}:${account.key}`;
            const known = reports.get(id);
            // COMPAT(usageLoginHarness): added in v0.11.0, remove after 2027-04-05 once plugin floor >= v0.11.0.
            const login = { input: account.input, harness: account.harness ?? source.label };
            if (known) {
              if (!known.logins.some((existing) => loginKey(existing) === loginKey(login)))
                known.logins.push(login);
            } else reports.set(id, { source, logins: [login], label: account.label });
          }
        } catch (error) {
          this.logger.warn({ sourceId: source.id, err: error }, "Usage source discovery failed");
          // A failed store read does not confirm removal. Session discovery has no previous
          // mapping because a resumed agent may use a different launch environment.
          for (const [id, report] of previous) {
            if (report.source === source) reports.set(id, report);
          }
        }
        return reports;
      }),
    );
    const merged = new Map<string, KnownReport>();
    for (const reports of discovered) {
      for (const [id, report] of reports) merged.set(id, report);
    }
    return merged;
  }

  // COMPAT(providerUsageList): added in v0.1.98, remove after 2027-03-26.
  async listLegacyUsage(): Promise<{ fetchedAt: string; providers: ProviderUsage[] }> {
    const reports = await this.listReports();
    return {
      fetchedAt: reports.length
        ? reports.reduce(
            (oldest, entry) => (entry.fetchedAt < oldest ? entry.fetchedAt : oldest),
            reports[0]!.fetchedAt,
          )
        : new Date(this.now()).toISOString(),
      providers: reports.map((entry) => ({
        providerId: entry.sourceId,
        displayName: entry.account.label
          ? `${entry.sourceLabel} (${entry.account.label})`
          : entry.sourceLabel,
        status: entry.report.status,
        planLabel: entry.report.status === "available" ? (entry.report.planLabel ?? null) : null,
        windows: entry.report.status === "available" ? entry.report.windows : [],
        balances: entry.report.status === "available" ? (entry.report.balances ?? []) : [],
        details: entry.report.status === "available" ? (entry.report.details ?? []) : [],
        error: legacyError(entry.report, this.now()),
      })),
    };
  }

  private fetchId(id: string, known: KnownReport, forceRefresh = false): Promise<UsageReportEntry> {
    // Account identity groups cards; the ordered login set identifies a fetch result.
    const cacheKey = cacheIdentity(id, known);
    const cached = this.cache.get(cacheKey);
    if (!forceRefresh && cached && this.now() - cached.at < this.ttlMs)
      return Promise.resolve(cached.entry);
    const pending = this.pending.get(cacheKey);
    if (pending) return pending;
    const request = (async () => {
      const fetchedAt = new Date(this.now()).toISOString();
      const outcome = await this.fetchWithFallback(known);
      const completedAt = new Date(this.now()).toISOString();
      const entry: UsageReportEntry = {
        id,
        sourceId: known.source.id,
        sourceLabel: known.source.label,
        icon: known.source.icon,
        account: { label: known.label },
        fetchedAt,
        ...outcome,
      };
      if (entry.report.status === "available") {
        entry.successfulAt = completedAt;
      } else {
        entry.lastSuccessful = this.successful.get(cacheKey);
      }
      if (
        this.sources.get(known.source.id) === known.source &&
        this.activeCacheKeys().has(cacheKey)
      ) {
        if (entry.report.status === "available") {
          this.successful.set(cacheKey, {
            fetchedAt: completedAt,
            report: entry.report,
          });
        }
        this.writeCache(cacheKey, entry);
      }
      return entry;
    })();
    this.pending.set(cacheKey, request);
    void request.finally(() => {
      if (this.pending.get(cacheKey) === request) this.pending.delete(cacheKey);
    });
    return request;
  }

  private writeCache(id: string, entry: UsageReportEntry): void {
    const at = this.now();
    for (const [cachedId, cached] of this.cache) {
      if (at - cached.at >= this.ttlMs) this.cache.delete(cachedId);
    }
    this.cache.set(id, { at, entry });
  }

  private async fetchBeforeDeadline(source: UsageSource, input: unknown): Promise<UsageReport> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<UsageReport>((resolve) => {
      timer = setTimeout(
        () => resolve({ status: "error", error: "Usage fetch timed out" }),
        this.deadlineMs,
      );
    });
    try {
      return await Promise.race([this.fetchLogin(source, input), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchWithFallback(
    known: KnownReport,
  ): Promise<Pick<UsageReportEntry, "report" | "loginErrors">> {
    // Start each login within the same deadline window, then prefer discovery order.
    // Sequential deadlines can exceed the client's RPC timeout before all errors arrive.
    const attempts = known.logins.map((login) =>
      this.fetchBeforeDeadline(known.source, login.input),
    );
    const loginErrors: NonNullable<UsageReportEntry["loginErrors"]> = [];
    for (const [index, login] of known.logins.entries()) {
      const report = await attempts[index]!;
      if (report.status === "available") return { report };
      loginErrors.push({ harness: login.harness, report });
    }
    // COMPAT(usageLoginErrors): added in v0.11.0, remove after 2027-04-05 once app floor >= v0.11.0.
    // Keep the final single report so older apps still parse and display failed accounts.
    return { report: loginErrors[loginErrors.length - 1]!.report, loginErrors };
  }

  private async fetchLogin(source: UsageSource, input: unknown): Promise<UsageReport> {
    try {
      return UsageReportSchema.parse(await source.fetch(input));
    } catch (error) {
      this.logger.warn({ sourceId: source.id, err: error }, "Usage fetch failed");
      return { status: "error", error: error instanceof Error ? error.message : String(error) };
    }
  }
}

// The legacy RPC has only an error string; the current app owns its own presentation.
// COMPAT(providerUsageList): added in v0.1.98, remove after 2027-03-26.
function legacyProblem(problem: UsageProblem, now: number): string {
  if (problem.kind === "no_quota") return problem.detail;
  const remedy = problem.refreshedBy
    ? `Run ${problem.refreshedBy} to refresh it.`
    : "Sign in again.";
  if (problem.kind === "rejected") return `Login rejected (HTTP ${problem.status}). ${remedy}`;
  const elapsed = Math.max(0, now - Date.parse(problem.expiresAt));
  let ago = "just now";
  if (elapsed >= 86_400_000) ago = `${Math.floor(elapsed / 86_400_000)}d ago`;
  else if (elapsed >= 3_600_000) ago = `${Math.floor(elapsed / 3_600_000)}h ago`;
  else if (elapsed >= 60_000) ago = `${Math.floor(elapsed / 60_000)}m ago`;
  return `Login expired ${ago}. ${remedy}`;
}

// COMPAT(providerUsageList): added in v0.1.98, remove after 2027-03-26.
function legacyError(report: UsageReport, now: number): string | null {
  if (report.status === "error") return report.error;
  if (report.status === "unavailable") return legacyProblem(report.problem, now);
  return null;
}

// Inputs are opaque JSON locators. Canonical equality deduplicates discovery across scopes.
function loginKey(login: Login): string {
  return JSON.stringify(login, (_key, value) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

function cacheIdentity(id: string, known: KnownReport): string {
  return `${id}:${createHash("sha256")
    .update(JSON.stringify([known.label, known.logins.map(loginKey)]))
    .digest("hex")}`;
}
