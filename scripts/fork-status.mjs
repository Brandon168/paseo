#!/usr/bin/env node
// Checks FORK.md against the commits in this repo and the real state of the pull requests on
// getpaseo/paseo. Flags the drift a hand-kept changelog collects: a PR that merged while its entry
// still says pr-open, a "fork-only" commit upstream already contains, a commit that no longer exists.
//
// Usage: node scripts/fork-status.mjs [--file FORK.md] [--repo getpaseo/paseo] [--upstream origin/main]
//                                    [--offline] [--json]
//
// Exit codes: 0 the file matches, 1 FORK.md needs an edit, 2 the check itself could not run.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./is-main-module.mjs";

// The fork this script ships in, so it works from any directory (the weekly review runs it from ~/assistant).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STATUSES = new Set(["fork-only", "pr-open", "upstream", "dropped"]);
const STATUSES_WITH_PR = new Set(["pr-open", "upstream"]);

const FIELD_RE = /^\s*-\s*\*\*([A-Za-z]+):\*\*\s*(.*?)\s*$/;
const HEADING_RE = /^(#{2,6})\s+(.*?)\s*$/;
const SHA_RE = /\b([0-9a-f]{7,40})\b/g;
const PR_RE = /#(\d+)/;

function usage() {
  return [
    "Usage: node scripts/fork-status.mjs [options]",
    "",
    "Options:",
    "  --file <path>      Changelog to check (default: FORK.md at the repo root)",
    "  --repo <owner/name>  Upstream repo on GitHub (default: getpaseo/paseo)",
    "  --upstream <ref>   Upstream ref to compare with (default: origin/main)",
    "  --offline          Skip GitHub; only check commits and the file itself",
    "  --json             Print machine-readable output",
    "  -h, --help         Show this help",
    "",
    "Exit codes: 0 clean, 1 FORK.md needs an edit, 2 the check could not run.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    file: "",
    repo: "getpaseo/paseo",
    upstream: "origin/main",
    offline: false,
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

    if (key in current) current[key] = value;
  }

  return entries;
}

export function evaluateEntries(entries, { prStates, commitExists, commitInUpstream }) {
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

function colorize(text, code, enabled) {
  return enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function entryMarker(entryIssues) {
  if (entryIssues.some((issue) => issue.level === "error")) return "FAIL";
  if (entryIssues.length > 0) return "WARN";
  return " ok ";
}

function formatReport({ file, upstream, entries, issues, ahead, behind, prsChecked }) {
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
    lines.push(`  ${marker} ${entry.title}  [${status}${pr}]`);
  }

  lines.push("");
  if (issues.length === 0) {
    lines.push(
      prsChecked
        ? "No drift found."
        : "No commit or file problems found (pull requests not checked).",
    );
  } else {
    lines.push("Issues:");
    for (const issue of issues) {
      lines.push(
        `  ${issue.level === "error" ? "error" : "warn "}  ${issue.title} (${path.basename(file)}:${issue.line}): ${issue.message}`,
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
  let prProblem = "";
  if (options.offline) {
    prProblem = "skipped with --offline";
  } else {
    try {
      prStates = fetchPullRequests(options.repo, entries.map((entry) => entry.pr).filter(Boolean));
    } catch (error) {
      prProblem = error instanceof Error ? error.message.split("\n")[0] : String(error);
    }
  }

  const issues = evaluateEntries(entries, {
    prStates,
    commitExists: gitCommitExists,
    commitInUpstream: upstreamContainsCommit(options.upstream),
  });

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
