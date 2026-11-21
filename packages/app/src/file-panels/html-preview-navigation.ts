import { useCallback, useEffect, useRef } from "react";
import { useRetainedPanelActive } from "@/components/retained-panel";

export type HtmlPreviewNavigationKind = "initialDocument" | "fragment" | "blocked";

const INITIAL_DOCUMENT_URLS = new Set(["about:blank", "about:srcdoc", ""]);

/** `baseUrl` with one trailing slash, or null when the caller did not set one. */
function baseDocumentUrl(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function withoutHash(url: string): string {
  const at = url.indexOf("#");
  return at === -1 ? url : url.slice(0, at);
}

/**
 * `baseUrl` (a trusted HTTPS origin) makes the WebView's initial document URL that origin instead
 * of an inert about: URL, so a page can have a secure context. Only that exact origin document is
 * the initial load; every other URL is still refused, and a later load of the same base is a
 * repeat, not a new document.
 */
export function htmlPreviewNavigationKind(
  url: string,
  baseUrl?: string,
): HtmlPreviewNavigationKind {
  if (INITIAL_DOCUMENT_URLS.has(url)) return "initialDocument";
  const base = baseDocumentUrl(baseUrl);
  if (base && (url === base || url === base.slice(0, -1))) return "initialDocument";
  if (url.startsWith("about:blank#") || url.startsWith("about:srcdoc#")) return "fragment";
  if (base && withoutHash(url) === base) return "fragment";
  return "blocked";
}

/**
 * Decides each navigation the native WebView asks about: the document loads once, a fragment
 * moves within it, and anything else is refused.
 */
export function useHtmlPreviewNavigationGuard(
  document: string,
  baseUrl?: string,
): (request: { url: string }) => boolean {
  // Latched per document rather than once for the lifetime of the WebView: the
  // file pane re-renders with new content on every live-file refresh, and each of
  // those is a fresh initial load that has to be allowed through.
  const loadedDocumentRef = useRef<string | null>(null);
  // The latch belongs to one native WebView, not to this component. iOS destroys the WebView of a
  // hidden retained panel and makes a new one when the panel shows, and that one loads the
  // document again. Releasing the latch while hidden lets that load through; a page on a kept
  // WebView gains at most a load of an inert initial URL.
  const active = useRetainedPanelActive();
  useEffect(() => {
    if (!active) loadedDocumentRef.current = null;
  }, [active]);
  return useCallback(
    ({ url }: { url: string }) => {
      const navigationKind = htmlPreviewNavigationKind(url, baseUrl);
      if (navigationKind === "fragment") return true;
      if (navigationKind === "blocked") return false;
      if (loadedDocumentRef.current === document) return false;
      loadedDocumentRef.current = document;
      return true;
    },
    [baseUrl, document],
  );
}
