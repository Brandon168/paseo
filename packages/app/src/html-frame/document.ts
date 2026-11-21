import { withPreviewCsp } from "@/file-panels/html-preview-csp";
import { htmlFrameBootstrap, type HtmlFramePlatform } from "./bootstrap";
import { validateHtmlFrameCsp } from "./domains";

const VIEWPORT =
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">';
const BASE_STYLE = "<style>html{-webkit-text-size-adjust:100%}</style>";

export interface HtmlFrameDocumentInput {
  html: string;
  csp?: { resourceDomains?: readonly string[]; connectDomains?: readonly string[] };
  platform: HtmlFramePlatform;
}

export interface HtmlFrameDocument {
  document: string;
  /** CSP entries that were refused. */
  dropped: string[];
}

/**
 * doctype, CSP meta (first element), viewport, base style, host bootstrap, then the page verbatim.
 * See html-preview-csp.ts for why the page's own doctype is left in place.
 */
export function buildHtmlFrameDocument(input: HtmlFrameDocumentInput): HtmlFrameDocument {
  const domains = validateHtmlFrameCsp(input.csp);
  const document = withPreviewCsp(input.html, {
    origins: {
      resourceSources: domains.resourceDomains,
      connectSources: domains.connectDomains,
    },
    head: VIEWPORT + BASE_STYLE + htmlFrameBootstrap(input.platform),
  });
  return { document, dropped: domains.dropped };
}
