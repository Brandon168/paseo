import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { routePageMessage } from "./messages";
import { PageOutbox } from "./outbox";
import type { HtmlFrameHandle, HtmlFrameProps } from "./types";
import { useHtmlFrameState } from "./use-html-frame-state";

// `allow-scripts` alone: an opaque origin, so the page cannot reach Paseo's DOM, cookies or
// storage, and none of popups, forms, downloads or top navigation. Same token set as
// file-panels/html-preview.web.tsx and the Mermaid runtime.
const SANDBOX = "allow-scripts";

// An iframe that navigates itself fires `load` again. Only the first load is the document we built;
// after a second one the frame is replaced with an empty page instead of showing wherever it went.
const BLANK_DOCUMENT = "<!doctype html><title></title>";

export const HtmlFrame = forwardRef<HtmlFrameHandle, HtmlFrameProps>(
  function HtmlFrame(props, ref) {
    const { t } = useTranslation();
    const { document, sizing, handleRouted, callbacks } = useHtmlFrameState(props, "web");
    const iframe = useRef<HTMLIFrameElement | null>(null);
    const [navigated, setNavigated] = useState<string | null>(null);
    const loads = useRef(0);
    const lastHeight = useRef(sizing.height);
    if (sizing.height !== null) lastHeight.current = sizing.height;

    const outbox = useRef<PageOutbox | null>(null);
    if (outbox.current === null) {
      outbox.current = new PageOutbox(
        (text) => iframe.current?.contentWindow?.postMessage(JSON.parse(text), "*"),
        (message) => callbacks.current.onError?.(message),
      );
    }
    useImperativeHandle(
      ref,
      () => ({ postMessage: (message) => outbox.current?.post(message) }),
      [],
    );

    const active = props.active !== false;
    const refused = navigated === document;

    useEffect(() => {
      loads.current = 0;
      outbox.current?.reset();
    }, [document, active]);

    useEffect(() => {
      if (!active) return;
      function receive(event: MessageEvent): void {
        if (event.source === null || event.source !== iframe.current?.contentWindow) return;
        handleRouted(routePageMessage(event.data));
      }
      window.addEventListener("message", receive);
      return () => window.removeEventListener("message", receive);
    }, [active, handleRouted]);

    const onLoad = useCallback(() => {
      loads.current += 1;
      if (loads.current > 1) {
        setNavigated(document);
        callbacks.current.onError?.("The page tried to navigate and was stopped");
        return;
      }
      outbox.current?.loaded();
      callbacks.current.onLoad?.();
    }, [document, callbacks]);

    const style = useMemo(
      () => ({
        display: "block",
        border: 0,
        width: "100%",
        colorScheme: "normal",
        background: "transparent",
        ...(sizing.fill
          ? { flex: 1, minHeight: 0, height: "100%" }
          : { height: sizing.height ?? 0 }),
      }),
      [sizing.fill, sizing.height],
    );

    const placeholderHeight = lastHeight.current ?? 0;
    const placeholderStyle = useMemo(
      () => (sizing.fill ? { flex: 1 } : { height: placeholderHeight }),
      [sizing.fill, placeholderHeight],
    );

    if (!active) {
      return <div data-testid={props.testID} style={placeholderStyle} />;
    }
    return (
      // Keyed by document so a changed page loads in a fresh frame (see html-preview.web.tsx).
      <iframe
        key={`${document}${refused ? "#blank" : ""}`}
        ref={iframe}
        data-testid={props.testID}
        title={t("panels.file.filePanels.builtin.html")}
        srcDoc={refused ? BLANK_DOCUMENT : document}
        sandbox={SANDBOX}
        referrerPolicy="no-referrer"
        scrolling={sizing.scrollEnabled ? "yes" : "no"}
        onLoad={refused ? undefined : onLoad}
        style={style}
      />
    );
  },
);
