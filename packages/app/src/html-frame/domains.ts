// One tested place that decides which origins a page may reach. Plugins hand us strings and the
// strings are placed inside a CSP header, so anything that is not a plain https/wss origin is
// dropped rather than repaired. A dropped entry is reported to the host, never silently widened.

const MAX_ENTRIES = 32;
const MAX_ENTRY_LENGTH = 256;

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOST = `(?:\\*\\.)?${LABEL}(?:\\.${LABEL})+`;
const ENTRY = new RegExp(
  `^(https|wss)://(${HOST})(?::([0-9]{1,5}))?((?:/[A-Za-z0-9._~-]+)*/)?$`,
  "i",
);

export interface HtmlFrameDomains {
  resourceDomains: string[];
  connectDomains: string[];
  /** One human-readable line per entry that was refused. */
  dropped: string[];
}

type ListKind = "resourceDomains" | "connectDomains";

function describe(entry: unknown): string {
  if (typeof entry !== "string") return `a ${typeof entry} value`;
  const shown = entry.length > 80 ? `${entry.slice(0, 80)}…` : entry;
  return JSON.stringify(shown);
}

/** Returns the canonical CSP source expression, or why the entry was refused. */
export function parseHtmlFrameDomain(
  entry: unknown,
  kind: ListKind,
): { ok: true; source: string } | { ok: false; reason: string } {
  if (typeof entry !== "string") return { ok: false, reason: "not a string" };
  if (entry.length > MAX_ENTRY_LENGTH) return { ok: false, reason: "too long" };
  const match = ENTRY.exec(entry);
  if (!match) {
    return { ok: false, reason: 'expected "https://host[:port][/path/]" with no other characters' };
  }
  const [, rawScheme, rawHost, rawPort, path] = match;
  const scheme = rawScheme.toLowerCase();
  if (scheme === "wss" && kind === "resourceDomains") {
    return { ok: false, reason: "resources load over https only" };
  }
  const host = rawHost.toLowerCase();
  const labels = host.replace(/^\*\./, "").split(".");
  if (/^[0-9]+$/.test(labels[labels.length - 1])) {
    return { ok: false, reason: "IP addresses are not allowed" };
  }
  if (rawPort !== undefined) {
    const port = Number(rawPort);
    if (port < 1 || port > 65535) return { ok: false, reason: "invalid port" };
  }
  if (path && path.split("/").some((segment) => segment === "." || segment === "..")) {
    return { ok: false, reason: "path segments must not be . or .." };
  }
  return {
    ok: true,
    source: `${scheme}://${host}${rawPort ? `:${Number(rawPort)}` : ""}${path ?? ""}`,
  };
}

function parseList(
  entries: readonly unknown[] | undefined,
  kind: ListKind,
  dropped: string[],
): string[] {
  const accepted: string[] = [];
  if (entries === undefined) return accepted;
  if (!Array.isArray(entries)) {
    dropped.push(`${kind}: expected an array`);
    return accepted;
  }
  for (const entry of entries) {
    const parsed = parseHtmlFrameDomain(entry, kind);
    if (!parsed.ok) {
      dropped.push(`${kind}: dropped ${describe(entry)} (${parsed.reason})`);
      continue;
    }
    if (accepted.includes(parsed.source)) continue;
    if (accepted.length >= MAX_ENTRIES) {
      dropped.push(`${kind}: dropped ${describe(entry)} (more than ${MAX_ENTRIES} entries)`);
      continue;
    }
    accepted.push(parsed.source);
  }
  return accepted;
}

export function validateHtmlFrameCsp(
  csp:
    | {
        resourceDomains?: readonly unknown[];
        connectDomains?: readonly unknown[];
      }
    | undefined,
): HtmlFrameDomains {
  const dropped: string[] = [];
  return {
    resourceDomains: parseList(csp?.resourceDomains, "resourceDomains", dropped),
    connectDomains: parseList(csp?.connectDomains, "connectDomains", dropped),
    dropped,
  };
}
