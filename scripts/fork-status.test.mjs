import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEntries, parseForkDocument } from "./fork-status.mjs";

const DOCUMENT = `# What this fork changes

Some prose.

## Entry format

\`\`\`md
### An example, not an entry
- **Status:** fork-only
- **Commits:** \`abc123456\`
\`\`\`

## Fork-only changes

### Hide models per provider
- **Status:** fork-only
- **Commits:** \`e54de8dae\`, \`c9dc18fac\`
- **Why:** The picker only needs the models I use.

### Notes in the middle
- **Status:** pr-open
- **PR:** #9438
- **Commits:** none on \`main\` (branch \`fix/voice\`)
- **Why:** The transcript decides what interrupts.
- **Notes:** Large change.

## Reverted or dropped

### Bun runtime support
- **Status:** dropped
- **Why:** Upstream declined it.
`;

function check(entries, { prStates = new Map(), existing = new Set(), upstream = new Set() } = {}) {
  return evaluateEntries(entries, {
    prStates,
    commitExists: (sha) => existing.has(sha) || sha.length === 9,
    commitInUpstream: (sha) => upstream.has(sha),
  });
}

test("parses entries, and ignores the format example in a code fence", () => {
  const entries = parseForkDocument(DOCUMENT);

  assert.deepEqual(
    entries.map((entry) => [entry.section, entry.title, entry.status, entry.pr]),
    [
      ["Fork-only changes", "Hide models per provider", "fork-only", ""],
      ["Fork-only changes", "Notes in the middle", "pr-open", "9438"],
      ["Reverted or dropped", "Bun runtime support", "dropped", ""],
    ],
  );
  assert.deepEqual(entries[0].commits, ["e54de8dae", "c9dc18fac"]);
  assert.deepEqual(entries[1].commits, []);
  assert.equal(entries[1].notes, "Large change.");
  assert.equal(entries[1].line, 20);
});

test("a clean document has no issues", () => {
  const entries = parseForkDocument(DOCUMENT);
  const issues = check(entries, { prStates: new Map([["9438", { state: "OPEN" }]]) });

  assert.deepEqual(issues, []);
});

test("reports a missing or unknown status", () => {
  const entries = [
    {
      title: "No status",
      line: 1,
      status: "",
      commits: [],
      pr: "",
      why: "x",
    },
    { title: "Typo", line: 2, status: "fork_only", commits: [], pr: "", why: "x" },
  ];

  const messages = check(entries).map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("Missing **Status:**")));
  assert.ok(messages.some((message) => message.includes('Unknown status "fork_only"')));
});

test("a pr-open entry whose PR merged asks for the upstream status", () => {
  const entries = [
    { title: "Voice", line: 1, status: "pr-open", commits: [], pr: "9438", why: "x" },
  ];
  const issues = check(entries, { prStates: new Map([["9438", { state: "MERGED" }]]) });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, "error");
  assert.match(issues[0].message, /merged; set \*\*Status:\*\* upstream/);
});

test("a closed PR is not treated as open", () => {
  const entries = [
    { title: "Voice", line: 1, status: "pr-open", commits: [], pr: "9438", why: "x" },
  ];
  const issues = check(entries, { prStates: new Map([["9438", { state: "CLOSED" }]]) });

  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /decide fork-only or dropped/);
});

test("an upstream entry whose PR is still open is an error", () => {
  const entries = [
    { title: "Plugin cleanup", line: 1, status: "upstream", commits: [], pr: "9285", why: "x" },
  ];
  const issues = check(entries, { prStates: new Map([["9285", { state: "OPEN" }]]) });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, "error");
});

test("a fork-only commit that upstream already contains is an error", () => {
  const entries = [
    { title: "Sampling", line: 1, status: "fork-only", commits: ["970d46bd0"], pr: "", why: "x" },
  ];
  const issues = check(entries, { upstream: new Set(["970d46bd0"]) });

  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /already in the upstream ref/);
});

test("a commit that does not exist is an error", () => {
  const entries = [
    {
      title: "Gone",
      line: 1,
      status: "fork-only",
      commits: ["deadbeef"],
      pr: "",
      why: "x",
    },
  ];
  const issues = check(entries, { existing: new Set(["1234567"]) });

  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /does not exist/);
});

test("pr-open and upstream statuses require a PR number", () => {
  const entries = [
    { title: "Open", line: 1, status: "pr-open", commits: [], pr: "", why: "x" },
    { title: "Merged", line: 2, status: "upstream", commits: [], pr: "", why: "x" },
  ];

  const messages = check(entries).map((issue) => issue.message);
  assert.equal(messages.filter((message) => message.includes("needs a **PR:**")).length, 2);
});

test("an entry without a Why line warns but does not fail", () => {
  const entries = [{ title: "Quiet", line: 1, status: "fork-only", commits: [], pr: "", why: "" }];
  const issues = check(entries);

  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, "warn");
});

test("offline (no pull request states) skips PR checks instead of reporting every PR missing", () => {
  const entries = [
    { title: "Voice", line: 1, status: "pr-open", commits: [], pr: "9438", why: "x" },
  ];

  assert.deepEqual(check(entries, { prStates: null }), []);
});
