#!/usr/bin/env node
// Checks FORK.md against the commits in this repo, the real state of pull requests and tracked
// upstream issues/replacement PRs on getpaseo/paseo, and (with --check-invariants) verifies that
// critical fork features and manifest invariants are still intact in the working tree.
//
// Usage: node scripts/fork-status.mjs [--file FORK.md] [--repo getpaseo/paseo] [--upstream origin/main]
//                                    [--offline] [--check-invariants] [--json]
//
// Exit codes: 0 clean, 1 FORK.md or invariants need attention, 2 the check itself could not run.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./is-main-module.mjs";

// The fork this script ships in, so it works from any directory (the weekly review runs it from ~/assistant).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STATUSES = new Set(["fork-only", "pr-open", "upstream", "dropped"]);
const STATUSES_WITH_PR = new Set(["pr-open", "upstream"]);
const ACTIVE_STATUSES = new Set(["fork-only", "pr-open"]);

const FIELD_RE = /^\s*-\s*\*\*([A-Za-z]+):\*\*\s*(.*?)\s*$/;
const HEADING_RE = /^(#{2,6})\s+(.*?)\s*$/;
const SHA_RE = /\b([0-9a-f]{7,40})\b/g;
const PR_RE = /#(\d+)/;
const TRACKED_RE = /(?:\b(discussion)#(\d+)|(?<![A-Za-z0-9_])#(\d+))/gi;

// Fork-critical files and markers checked by --check-invariants so an upstream merge can never
// silently drop a fork feature or break workspace manifest/lockfile pins.
export const FORK_CODE_INVARIANTS = [
  {
    name: "Plugin HtmlFrame + baseUrl",
    path: "packages/app/src/html-frame/index.tsx",
    contains: "baseUrl",
  },
  {
    name: "Plugin UI HtmlFrame export",
    path: "packages/plugin/src/client/ui.ts",
    contains: "HtmlFrame",
  },
  {
    name: "Folded turns keep plugin tool-call views",
    path: "packages/app/src/agent-stream/turn-collapse/model.ts",
    contains: "isPluginToolView",
  },
  {
    name: "Provider hiddenModels schema",
    path: "packages/protocol/src/provider-config.ts",
    contains: "hiddenModels",
  },
  {
    name: "Provider hiddenModels UI filters",
    path: "packages/app/src/provider-settings/internal/provider-models.tsx",
    contains: "hiddenModels",
  },
  {
    name: "Wider desktop model picker route grouping",
    path: "packages/app/src/provider-selection/model-route-groups.ts",
  },
  {
    name: "Per-turn answering model footer",
    path: "packages/app/src/agent-stream/turn-model-label.ts",
  },
  {
    name: "Context card cache & plan insights",
    path: "packages/app/src/components/context-window-insights.ts",
  },
  {
    name: "OpenCode v2 shared helper for BB_THREAD_STORAGE",
    path: "packages/server/src/server/agent/providers/opencode/v2/configuration.ts",
    contains: "BB_THREAD_STORAGE",
  },
  {
    name: "Keep opened chats loaded across idle sweeps",
    path: "packages/server/src/server/agent/agent-manager.ts",
    contains: "markRuntimeAccessed",
  },
  {
    name: "OpenCode diagnostic no-spawn guard (AI-0064)",
    path: "packages/server/src/server/agent/providers/opencode-agent.ts",
    contains: "checkAuth",
  },
  {
    name: "OpenCode v2 default model inheritance",
    path: "packages/server/src/server/agent/providers/opencode/v2/agent.ts",
    contains: "model.default",
  },
  {
    name: "Workspace list query pre-filter",
    path: "packages/server/src/server/workspace-directory.ts",
    contains: "workspaceIdsMatchingQuery",
  },
  {
    name: "Event-loop delay 100 ms monitor",
    path: "packages/server/src/server/websocket/event-loop-delay.ts",
  },
  {
    name: "Voice chat shortcut (/new?voice=1)",
    path: "packages/app/src/screens/new-workspace/voice-chat-start.ts",
  },
  {
    name: "Voice VAD worker retire-on-reconfigure (AI-0075)",
    path: "packages/server/src/server/speech/providers/local/worker-client.ts",
    contains: "retire(",
  },
  {
    name: "Voice transcript barge-in (#9438)",
    path: "packages/server/src/server/session/voice/voice-session.ts",
    contains: "bargeIn",
  },
  {
    name: "iOS home screen quick actions module",
    path: "packages/app/modules/paseo-quick-actions/ios/PaseoQuickActionsModule.swift",
  },
  {
    name: "iOS paste-input patch (#7286)",
    path: "patches/@mattermost+react-native-paste-input+2.0.1.patch",
  },
  {
    name: "iOS native status ring driver (#8382)",
    path: "packages/app/src/components/status-ring/clock.native.ts",
  },
  {
    name: "Phone photo JPEG normalizer (#9328)",
    path: "packages/app/src/hooks/picked-image-normalizer.ts",
  },
];

function usage() {
  return [
    "Usage: node scripts/fork-status.mjs [options]",
    "",
    "Options:",
    "  --file <path>         Changelog to check (default: FORK.md at the repo root)",
    "  --repo <owner/name>   Upstream repo on GitHub (default: getpaseo/paseo)",
    "  --upstream <ref>      Upstream ref to compare with (default: origin/main)",
    "  --offline             Skip GitHub; only check commits, file, and invariants",
    "  --check-invariants    Verify fork manifest/lockfile pins and required code markers",
    "  --json                Print machine-readable output",
    "  -h, --help            Show this help",
    "",
    "Exit codes: 0 clean, 1 FORK.md or invariants need attention, 2 the check itself could not run.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    file: "",
    repo: "getpaseo/paseo",
    upstream: "origin/main",
    offline: false,
    checkInvariants: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1] ?? "";
      index += 1;
      return value;
    };

    if (arg === "--file") options.file = next();
    else if (arg === "--repo") options.repo = next();
    else if (arg === "--upstream") options.upstream = next();
    else if (arg === "--offline") options.offline = true;
    else if (arg === "--check-invariants") options.checkInvariants = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n\n${usage()}\n`);
      process.exit(2);
    }
  }

  if (!options.file) {
    options.file = path.join(REPO_ROOT, "FORK.md");
  }

  return options;
}

export function parseTrackedRefs(value) {
  const refs = [];
  const seen = new Set();
  for (const match of value.matchAll(TRACKED_RE)) {
    const kind = match[1] ? "discussion" : "item";
    const number = match[2] ?? match[3];
    const key = `${kind}:${number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ kind, number });
  }
  return refs;
}

export function parseForkDocument(markdown) {
  const entries = [];
  let section = "";
  let current = null;
  let inFence = false;

  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    // Entries are headings, so the format example in the file's own code fence must not count as one.
    if (lines[index].trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = HEADING_RE.exec(lines[index]);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2];

      if (level === 2) {
        section = title;
        current = null;
        continue;
      }

      if (level === 3) {
        current = {
          section,
          title,
          line: index + 1,
          status: "",
          commits: [],
          pr: "",
          tracks: [],
          upstream: "",
          why: "",
          notes: "",
        };
        entries.push(current);
        continue;
      }
    }

    if (!current) continue;

    const field = FIELD_RE.exec(lines[index]);
    if (!field) continue;

    const key = field[1].toLowerCase();
    const value = field[2];

    if (key === "commits") {
      current.commits = [...new Set([...value.matchAll(SHA_RE)].map((match) => match[1]))];
      current.commitsText = value;
      continue;
    }

    if (key === "pr") {
      const match = PR_RE.exec(value);
      current.pr = match ? match[1] : value.trim();
      continue;
    }

    if (key === "tracks") {
      current.tracks = parseTrackedRefs(value);
      continue;
    }

    if (key in current) current[key] = value;
  }

  return entries;
}

export function evaluateEntries(
  entries,
  { prStates, trackedStates = null, commitExists, commitInUpstream },
) {
  const issues = [];
  const report = (level, entry, message) => {
    issues.push({ level, title: entry.title, line: entry.line, message });
  };
  const seenTitles = new Set();

  for (const entry of entries) {
    if (seenTitles.has(entry.title)) report("warn", entry, "Duplicate entry title");
    seenTitles.add(entry.title);

    checkStatusField(entry, report);
    checkCommits(entry, report, { commitExists, commitInUpstream });
    checkPullRequest(entry, report, prStates);
    checkTrackedItems(entry, report, trackedStates);
  }

  return issues;
}

function checkStatusField(entry, report) {
  const status = entry.status.trim().toLowerCase();
  if (!status) {
    report("error", entry, "Missing **Status:**");
  } else if (!STATUSES.has(status)) {
    report(
      "error",
      entry,
      `Unknown status "${entry.status}" (expected ${[...STATUSES].join(", ")})`,
    );
  }

  if (!entry.why) report("warn", entry, "Missing **Why:**");
  if (STATUSES_WITH_PR.has(status) && !entry.pr)
    report("error", entry, `Status ${status} needs a **PR:**`);
}

function checkCommits(entry, report, { commitExists, commitInUpstream }) {
  const status = entry.status.trim().toLowerCase();

  for (const sha of entry.commits) {
    if (!commitExists(sha)) {
      report("error", entry, `Commit ${sha} does not exist in this repo`);
      continue;
    }
    if (status === "fork-only" && commitInUpstream(sha)) {
      report(
        "error",
        entry,
        `Commit ${sha} is already in the upstream ref; move the entry to upstream`,
      );
    }
  }
}

function checkPullRequest(entry, report, prStates) {
  // A null map means pull requests were not checked (--offline); the rest of the file still counts.
  if (!entry.pr || !prStates) return;

  const status = entry.status.trim().toLowerCase();
  const pr = prStates.get(entry.pr);
  if (!pr) {
    report("warn", entry, `PR #${entry.pr} not found in the upstream repo`);
    return;
  }

  const state = pr.state.toUpperCase();
  const isOpen = state === "OPEN";
  const isMerged = state === "MERGED";

  if (status === "pr-open" && isMerged) {
    report("error", entry, `PR #${entry.pr} merged; set **Status:** upstream`);
    return;
  }
  if (status === "pr-open" && !isOpen) {
    report(
      "error",
      entry,
      `PR #${entry.pr} is ${state.toLowerCase()}; decide fork-only or dropped`,
    );
    return;
  }
  if (status === "upstream" && !isMerged) {
    report(
      "error",
      entry,
      `PR #${entry.pr} is ${state.toLowerCase()}, not merged; move the entry out of upstream`,
    );
    return;
  }
  if (status === "fork-only" && isMerged) {
    report("error", entry, `PR #${entry.pr} merged; move the entry to upstream`);
    return;
  }
  if (status === "fork-only" && isOpen) {
    report("warn", entry, `PR #${entry.pr} is open; set **Status:** pr-open`);
    return;
  }
  if (status === "dropped" && isOpen) {
    report("warn", entry, `PR #${entry.pr} is still open; close it or restore the entry`);
  }
}

function checkTrackedItems(entry, report, trackedStates) {
  if (!trackedStates || !entry.tracks?.length) return;
  const status = entry.status.trim().toLowerCase();
  if (!ACTIVE_STATUSES.has(status)) return;

  for (const ref of entry.tracks) {
    if (ref.kind === "discussion") continue;
    const item = trackedStates.get(ref.number);
    if (!item) {
      report("warn", entry, `Tracked #${ref.number} not found in the upstream repo`);
      continue;
    }

    const state = String(item.state ?? "").toUpperCase();
    const stateReason = String(item.stateReason ?? "").toUpperCase();

    if (item.kind === "pr" && state === "MERGED") {
      report(
        "error",
        entry,
        `Tracked PR #${ref.number} merged upstream; verify upstream covers this feature and retire the fork patch`,
      );
      continue;
    }

    if (item.kind === "issue" && state === "CLOSED" && stateReason === "COMPLETED") {
      report(
        "error",
        entry,
        `Tracked issue #${ref.number} closed as completed upstream; verify upstream covers this feature and retire the fork patch`,
      );
    }
  }
}

function readJsonInvariant(repoRoot, relPath, fail) {
  const abs = path.join(repoRoot, relPath);
  if (!existsSync(abs)) {
    fail(`Invariant: ${relPath}`, `Missing required file ${relPath}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch (error) {
    fail(`Invariant: ${relPath}`, `Invalid JSON in ${relPath}: ${String(error)}`);
    return null;
  }
}

function checkLockfileInvariants(repoRoot, fail) {
  const rootPkg = readJsonInvariant(repoRoot, "package.json", fail);
  const lock = readJsonInvariant(repoRoot, "package-lock.json", fail);
  if (!rootPkg || !lock) return;

  const expectedVersion = rootPkg.version;
  if (lock.version !== expectedVersion) {
    fail(
      "Invariant: package-lock.json version",
      `Top-level lock.version is "${lock.version}", expected "${expectedVersion}"`,
    );
  }
  const rootLockPkg = lock.packages?.[""];
  if (rootLockPkg?.version !== expectedVersion) {
    fail(
      "Invariant: package-lock.json root workspace",
      `packages[""].version is "${rootLockPkg?.version}", expected "${expectedVersion}"`,
    );
  }
  for (const ws of rootPkg.workspaces ?? []) {
    const wsPkg = readJsonInvariant(repoRoot, path.join(ws, "package.json"), fail);
    if (wsPkg && wsPkg.version !== expectedVersion) {
      fail(
        `Invariant: ${ws}/package.json`,
        `Workspace version is "${wsPkg.version}", expected "${expectedVersion}"`,
      );
    }
    const wsLock = lock.packages?.[ws];
    if (wsLock && wsLock.version !== expectedVersion) {
      fail(
        `Invariant: package-lock.json ${ws}`,
        `Lockfile version for ${ws} is "${wsLock.version}", expected "${expectedVersion}"`,
      );
    }
  }
  const lockedZod = lock.packages?.["node_modules/zod"]?.version;
  if (lockedZod !== "4.6.7") {
    fail(
      "Invariant: zod lockfile pin",
      `packages["node_modules/zod"].version is "${lockedZod}", expected "4.6.7"`,
    );
  }
}

function checkManifestPins(repoRoot, fail) {
  const cliPkg = readJsonInvariant(repoRoot, "packages/cli/package.json", fail);
  if (cliPkg && cliPkg.bin?.["paseo-daemon"] !== "bin/paseo-daemon") {
    fail(
      "Invariant: paseo-daemon bin",
      'packages/cli/package.json is missing bin["paseo-daemon"] = "bin/paseo-daemon"',
    );
  }
  if (!existsSync(path.join(repoRoot, "packages/cli/bin/paseo-daemon"))) {
    fail("Invariant: paseo-daemon bin", "Missing packages/cli/bin/paseo-daemon executable");
  }

  const clientPkg = readJsonInvariant(repoRoot, "packages/client/package.json", fail);
  if (clientPkg && !clientPkg.exports?.["./eager-validation"]) {
    fail(
      "Invariant: eager-validation export",
      'packages/client/package.json is missing exports["./eager-validation"]',
    );
  }
  if (!existsSync(path.join(repoRoot, "packages/client/src/eager-validation.ts"))) {
    fail("Invariant: eager-validation export", "Missing packages/client/src/eager-validation.ts");
  }

  for (const ws of ["packages/app", "packages/cli", "packages/protocol", "packages/server"]) {
    const pkg = readJsonInvariant(repoRoot, `${ws}/package.json`, fail);
    if (pkg && pkg.dependencies?.zod !== "^4.6.7") {
      fail(
        `Invariant: ${ws} zod pin`,
        `${ws}/package.json dependencies.zod is "${pkg.dependencies?.zod}", expected "^4.6.7"`,
      );
    }
  }
}

function checkCodeInvariants(repoRoot, codeInvariants, fail) {
  for (const check of codeInvariants) {
    const abs = path.join(repoRoot, check.path);
    if (!existsSync(abs)) {
      fail(`Invariant: ${check.name}`, `Missing expected fork file ${check.path}`);
      continue;
    }
    if (check.contains) {
      const content = readFileSync(abs, "utf8");
      if (!content.includes(check.contains)) {
        fail(
          `Invariant: ${check.name}`,
          `${check.path} is missing expected fork marker "${check.contains}"`,
        );
      }
    }
  }
}

export function checkForkInvariants(repoRoot = REPO_ROOT, codeInvariants = FORK_CODE_INVARIANTS) {
  const issues = [];
  const fail = (title, message) => issues.push({ level: "error", title, line: 0, message });

  checkLockfileInvariants(repoRoot, fail);
  checkManifestPins(repoRoot, fail);
  checkCodeInvariants(repoRoot, codeInvariants, fail);

  return issues;
}

function git(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isGitCheckout() {
  try {
    return git(["rev-parse", "--is-inside-work-tree"]).trim() === "true";
  } catch {
    return false;
  }
}

function gitCommitExists(sha) {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function upstreamContainsCommit(upstream) {
  return (sha) => {
    try {
      git(["merge-base", "--is-ancestor", sha, upstream]);
      return true;
    } catch {
      return false;
    }
  };
}

function countCommits(range) {
  try {
    return Number(git(["rev-list", "--count", range]).trim());
  } catch {
    return null;
  }
}

function fetchPullRequests(repo, wanted) {
  const output = execFileSync(
    "gh",
    [
      "pr",
      "list",
      "--repo",
      repo,
      "--state",
      "all",
      "--limit",
      "1000",
      "--json",
      "number,state,title,url",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  const states = new Map();
  for (const pr of JSON.parse(output)) states.set(String(pr.number), pr);
  // The list holds only the newest 1000 pull requests; look up older ones one by one.
  for (const number of new Set(wanted)) {
    if (states.has(number) || !/^\d+$/.test(number)) continue;
    try {
      const pr = execFileSync(
        "gh",
        ["pr", "view", number, "--repo", repo, "--json", "number,state,title,url"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      states.set(number, JSON.parse(pr));
    } catch {
      // Not a pull request in this repo; checkPullRequest reports it.
    }
  }
  return states;
}

function fetchTrackedItems(repo, prStates, wantedNumbers) {
  const tracked = new Map();
  for (const number of new Set(wantedNumbers)) {
    if (!/^\d+$/.test(number)) continue;
    if (prStates?.has(number)) {
      const pr = prStates.get(number);
      tracked.set(number, {
        kind: "pr",
        state: String(pr.state ?? "").toUpperCase(),
        stateReason: null,
        title: pr.title ?? "",
      });
      continue;
    }
    try {
      const raw = execFileSync("gh", ["api", `repos/${repo}/issues/${number}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const data = JSON.parse(raw);
      if (data.pull_request) {
        const merged = Boolean(data.pull_request.merged_at);
        tracked.set(number, {
          kind: "pr",
          state: merged ? "MERGED" : String(data.state ?? "").toUpperCase(),
          stateReason: null,
          title: data.title ?? "",
        });
      } else {
        tracked.set(number, {
          kind: "issue",
          state: String(data.state ?? "").toUpperCase(),
          stateReason: data.state_reason ? String(data.state_reason).toUpperCase() : null,
          title: data.title ?? "",
        });
      }
    } catch {
      // Missing or inaccessible issue/PR; checkTrackedItems warns.
    }
  }
  return tracked;
}

function colorize(text, code, enabled) {
  return enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function entryMarker(entryIssues) {
  if (entryIssues.some((issue) => issue.level === "error")) return "FAIL";
  if (entryIssues.length > 0) return "WARN";
  return " ok ";
}

function formatReport({
  file,
  upstream,
  entries,
  issues,
  ahead,
  behind,
  prsChecked,
  invariantsChecked,
}) {
  const lines = [];
  lines.push(`${path.basename(file)}  (${entries.length} entries)`);
  if (ahead !== null && behind !== null) {
    lines.push(`fork is ${ahead} commits ahead of ${upstream}, ${behind} behind`);
  }
  lines.push("");

  let section = "";
  for (const entry of entries) {
    if (entry.section !== section) {
      section = entry.section;
      lines.push(section);
    }
    const entryIssues = issues.filter((issue) => issue.line === entry.line);
    const marker = entryMarker(entryIssues);
    const status = entry.status || "missing";
    const pr = entry.pr ? ` #${entry.pr}` : "";
    const tracked = entry.tracks?.length
      ? ` tracks:${entry.tracks.map((t) => (t.kind === "discussion" ? `d#${t.number}` : `#${t.number}`)).join(",")}`
      : "";
    lines.push(`  ${marker} ${entry.title}  [${status}${pr}${tracked}]`);
  }

  lines.push("");
  if (issues.length === 0) {
    const suffix = invariantsChecked ? " and all fork invariants passed" : "";
    lines.push(
      prsChecked
        ? `No drift found${suffix}.`
        : `No commit or file problems found (pull requests not checked)${suffix}.`,
    );
  } else {
    lines.push("Issues:");
    for (const issue of issues) {
      const loc = issue.line > 0 ? ` (${path.basename(file)}:${issue.line})` : "";
      lines.push(
        `  ${issue.level === "error" ? "error" : "warn "}  ${issue.title}${loc}: ${issue.message}`,
      );
    }
  }

  return lines.join("\n");
}

function main(argv) {
  const options = parseArgs(argv);
  const colors = process.stdout.isTTY && !options.json;
  const paint = (text, code) => colorize(text, code, colors);

  if (!existsSync(options.file)) {
    process.stderr.write(`No ${options.file}. Point at the changelog with --file.\n`);
    process.exit(2);
  }

  if (!isGitCheckout()) {
    process.stderr.write(`${REPO_ROOT} is not a git checkout; pull the fork first.\n`);
    process.exit(2);
  }

  const entries = parseForkDocument(readFileSync(options.file, "utf8"));

  let prStates = null;
  let trackedStates = null;
  let prProblem = "";
  if (options.offline) {
    prProblem = "skipped with --offline";
  } else {
    try {
      prStates = fetchPullRequests(options.repo, entries.map((entry) => entry.pr).filter(Boolean));
      const trackedNumbers = entries.flatMap((entry) =>
        (entry.tracks ?? []).filter((t) => t.kind === "item").map((t) => t.number),
      );
      trackedStates = fetchTrackedItems(options.repo, prStates, trackedNumbers);
    } catch (error) {
      prProblem = error instanceof Error ? error.message.split("\n")[0] : String(error);
    }
  }

  const issues = evaluateEntries(entries, {
    prStates,
    trackedStates,
    commitExists: gitCommitExists,
    commitInUpstream: upstreamContainsCommit(options.upstream),
  });

  if (options.checkInvariants) {
    issues.push(...checkForkInvariants(REPO_ROOT));
  }

  if (!options.offline && !prStates) {
    // Without PR states the pr-open/upstream checks are meaningless; say so instead of reporting clean.
    issues.push({
      level: "warn",
      title: "Pull request check",
      line: 0,
      message: `Could not read PRs from ${options.repo}: ${prProblem}`,
    });
  }

  const ahead = countCommits(`${options.upstream}..HEAD`);
  const behind = countCommits(`HEAD..${options.upstream}`);
  const errors = issues.filter((issue) => issue.level === "error").length;
  const warnings = issues.filter((issue) => issue.level === "warn").length;
  const prsChecked = Boolean(prStates);

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          file: options.file,
          repo: options.repo,
          upstream: options.upstream,
          ahead,
          behind,
          prsChecked,
          invariantsChecked: options.checkInvariants,
          prProblem,
          entries,
          issues,
          summary: { entries: entries.length, errors, warnings },
        },
        null,
        2,
      )}\n`,
    );
  } else {
    const report = formatReport({
      file: options.file,
      upstream: options.upstream,
      entries,
      issues,
      ahead,
      behind,
      prsChecked,
      invariantsChecked: options.checkInvariants,
    });
    process.stdout.write(`${report}\n`);
  }

  let exitCode = 0;
  if (errors > 0) exitCode = 1;
  else if (!options.offline && !prsChecked) exitCode = 2;

  if (options.json) {
    process.stderr.write(`Exit ${exitCode}: ${errors} error(s), ${warnings} warning(s)\n`);
  } else if (exitCode !== 0) {
    process.stdout.write(
      `\n${paint(`${errors} error(s), ${warnings} warning(s)`, exitCode === 1 ? "31" : "33")}\n`,
    );
  }

  process.exit(exitCode);
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2));
}
