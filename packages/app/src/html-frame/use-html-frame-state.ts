import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HtmlFramePlatform } from "./bootstrap";
import { buildHtmlFrameDocument } from "./document";
import type { Routed } from "./messages";
import { resolveSizing } from "./sizing";
import type { HtmlFrameProps } from "./types";

// The page can report any height; keep the number sane before it reaches layout.
const MAX_REPORTED_HEIGHT = 100_000;

/** Everything the web and native frames share: the document, sizing, and message callbacks. */
export function useHtmlFrameState(props: HtmlFrameProps, platform: HtmlFramePlatform) {
  const { html, csp, autoHeight, height, fill, scrollEnabled } = props;
  const [measured, setMeasured] = useState<number | null>(null);

  const callbacks = useRef(props);
  callbacks.current = props;

  // `csp` is usually a fresh object each render; its content decides when the document rebuilds.
  const cspKey = JSON.stringify(csp ?? null);
  const built = useMemo(
    () => buildHtmlFrameDocument({ html, csp: JSON.parse(cspKey) ?? undefined, platform }),
    [html, cspKey, platform],
  );

  useEffect(() => {
    for (const line of built.dropped) callbacks.current.onError?.(line);
  }, [built]);

  const handleRouted = useCallback((routed: Routed) => {
    if (routed.kind === "dropped") {
      callbacks.current.onError?.(routed.reason);
      return;
    }
    if (routed.kind === "page") {
      callbacks.current.onMessage?.(routed.value);
      return;
    }
    if (routed.message.type === "error") {
      callbacks.current.onError?.(routed.message.message);
      return;
    }
    const reported = Math.min(routed.message.height, MAX_REPORTED_HEIGHT);
    setMeasured(reported);
    callbacks.current.onContentHeight?.(reported);
  }, []);

  const sizing = useMemo(
    () => resolveSizing({ autoHeight, height, fill, scrollEnabled }, measured),
    [autoHeight, height, fill, scrollEnabled, measured],
  );

  return { document: built.document, sizing, handleRouted, callbacks };
}
