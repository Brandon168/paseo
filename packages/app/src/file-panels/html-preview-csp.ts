// A preview renders a self-contained document and nothing else. Inline styles and
// scripts run so a plan page keeps its layout and its diagrams; fetch, XHR,
// WebSocket, beacon, remote script, remote font, remote image, and form posts are
// all refused. Agent-written HTML is not trusted markup.
//
// What this does NOT stop: the document navigating itself. No CSP directive
// available in current browsers prevents it — `navigate-to` was dropped from CSP3
// and is unenforced, and `<meta http-equiv="refresh">` needs no script at all
// (both verified against the Chromium this app ships against). So a hostile page
// can still reach a server by navigating, carrying data available inside the
// preview. The opaque origin is what bounds the damage: the frame has no storage,
// no parent access, and no way to read any file but itself. Native narrows it
// further in html-preview.tsx, because a WebView can refuse navigation outside CSP — see the
// caveat there on why that is a mitigation rather than a guarantee.
/** Extra origins a caller may open on top of the preview policy. Already validated by the caller. */
export interface PreviewCspOrigins {
  /** Added to script-src, style-src, img-src, font-src and media-src. */
  resourceSources?: readonly string[];
  /** Replaces `connect-src 'none'`. */
  connectSources?: readonly string[];
}

function withSources(base: string, sources: readonly string[] | undefined): string {
  return sources && sources.length > 0 ? `${base} ${sources.join(" ")}` : base;
}

export function buildPreviewPolicy(origins: PreviewCspOrigins = {}): string {
  const { resourceSources, connectSources } = origins;
  return [
    "default-src 'none'",
    withSources("script-src 'unsafe-inline' 'unsafe-eval' blob:", resourceSources),
    withSources("style-src 'unsafe-inline'", resourceSources),
    withSources("img-src data: blob:", resourceSources),
    withSources("font-src data:", resourceSources),
    withSources("media-src data: blob:", resourceSources),
    connectSources && connectSources.length > 0
      ? `connect-src ${connectSources.join(" ")}`
      : "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "object-src 'none'",
  ].join("; ");
}

function policyMeta(origins?: PreviewCspOrigins): string {
  return `<meta http-equiv="Content-Security-Policy" content="${buildPreviewPolicy(origins)}">`;
}

// The policy must reach the parser before any markup the document declares, and it
// only counts if it lands in `<head>` — once the parser has moved on to `<body>`, a
// meta http-equiv CSP is ignored outright.
//
// Locating the document's own doctype to insert after it means reimplementing the
// tokenizer's initial insertion mode: its exact whitespace set (JS `\s` matches
// characters HTML does not, and one stray NBSP is enough to push the policy into
// the body where it stops applying), every comment ending including `--!>`, `<!-->`
// and `<!--->`, bogus-comment tokens like `<?xml …?>` and `<![CDATA[…]]>`, and the
// rule that a doctype closes at the first `>` in every state. Each of those rules
// cost a bug before it was right.
//
// So the prologue isn't found, it's supplied: our doctype, then the policy, then
// the file verbatim. The file's own doctype becomes a stray DOCTYPE token, which
// the parser ignores wherever it appears. Standards mode is guaranteed, the policy
// is always the first element and therefore always in the head, and no part of the
// document has to be parsed to place it.

// Left where it is, a BOM would sit mid-document and render as a zero-width space.
const BOM = "\uFEFF";

/**
 * `head` is host-authored markup (never page content) placed right after the policy, so the policy
 * stays the first element. `origins` come from a validator, never straight from a page.
 */
export function withPreviewCsp(
  html: string,
  options: { origins?: PreviewCspOrigins; head?: string } = {},
): string {
  const prologue = `<!doctype html>${policyMeta(options.origins)}${options.head ?? ""}`;
  return prologue + (html.startsWith(BOM) ? html.slice(BOM.length) : html);
}
