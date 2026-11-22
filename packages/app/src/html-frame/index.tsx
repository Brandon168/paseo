import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useHtmlPreviewNavigationGuard } from "@/file-panels/html-preview-navigation";
import { routeNativePageText } from "./messages";
import { PageOutbox } from "./outbox";
import type { HtmlFramePlatform } from "./bootstrap";
import type { HtmlFrameHandle, HtmlFrameProps } from "./types";
import { useHtmlFrameState } from "./use-html-frame-state";

// Same reasoning as file-panels/html-preview.tsx: the whitelist must match every scheme so the
// navigation guard sees each request, and an inert base URL keeps "initial document" meaning only
// inert URLs. A plugin may name one trusted HTTPS origin instead (baseUrl), which gives the page a
// secure context; the guard still allows only that origin's initial document.
const ORIGIN_WHITELIST = ["*"];
const BASE_URL = "about:blank";
const NATIVE_PLATFORM: HtmlFramePlatform = Platform.OS === "android" ? "android" : "ios";

/** The base URL a plugin may set: one https origin, no credentials, no path. */
function trustedBaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return `${url.origin}/`;
  } catch {
    return null;
  }
}

export const HtmlFrame = forwardRef<HtmlFrameHandle, HtmlFrameProps>(
  function HtmlFrame(props, ref) {
    const state = useHtmlFrameState(props, NATIVE_PLATFORM);
    const { sizing } = state;
    const baseUrl = useMemo(() => trustedBaseUrl(props.baseUrl), [props.baseUrl]);
    const lastHeight = useRef(sizing.height);
    if (sizing.height !== null) lastHeight.current = sizing.height;

    const outbox = useRef<PageOutbox | null>(null);
    const webView = useRef<WebView | null>(null);
    if (outbox.current === null) {
      outbox.current = new PageOutbox(
        (text) => {
          webView.current?.injectJavaScript(
            `window.__paseoHtmlFrameReceive&&window.__paseoHtmlFrameReceive(${JSON.stringify(text)});true;`,
          );
        },
        (message) => state.callbacks.current.onError?.(message),
      );
    }
    useImperativeHandle(
      ref,
      () => ({ postMessage: (message) => outbox.current?.post(message) }),
      [],
    );

    const placeholderHeight = lastHeight.current ?? undefined;
    const placeholderStyle = useMemo(
      () => (sizing.fill ? fillStyle : { height: placeholderHeight }),
      [sizing.fill, placeholderHeight],
    );

    const active = props.active !== false;
    useEffect(() => {
      if (!active) outbox.current?.reset();
    }, [active]);

    if (!active) {
      return <View testID={props.testID} style={placeholderStyle} />;
    }
    return (
      <HtmlFrameWebView
        state={state}
        webView={webView}
        outbox={outbox.current}
        baseUrl={baseUrl}
        testID={props.testID}
      />
    );
  },
);

function HtmlFrameWebView({
  state,
  webView,
  outbox,
  baseUrl,
  testID,
}: {
  state: ReturnType<typeof useHtmlFrameState>;
  webView: React.RefObject<WebView | null>;
  outbox: PageOutbox;
  baseUrl: string | null;
  testID?: string;
}) {
  const { document, sizing, handleRouted, callbacks } = state;
  const source = useMemo(
    () => ({ html: document, baseUrl: baseUrl ?? BASE_URL }),
    [baseUrl, document],
  );
  // One guard per mounted WebView: an `active` toggle remounts it, and that load must pass again.
  const allowOnlyInitialDocument = useHtmlPreviewNavigationGuard(document, baseUrl ?? undefined);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => handleRouted(routeNativePageText(event.nativeEvent.data)),
    [handleRouted],
  );
  const onLoadStart = useCallback(() => outbox.reset(), [outbox]);
  const onLoadEnd = useCallback(() => {
    outbox.loaded();
    callbacks.current.onLoad?.();
  }, [outbox, callbacks]);
  const onError = useCallback(
    () => callbacks.current.onError?.("The page failed to load"),
    [callbacks],
  );
  const style = useMemo(
    () => [sizing.fill ? fillStyle : { height: sizing.height ?? undefined }, transparent],
    [sizing.fill, sizing.height],
  );

  return (
    <WebView
      ref={webView}
      testID={testID}
      style={style}
      source={source}
      originWhitelist={ORIGIN_WHITELIST}
      onShouldStartLoadWithRequest={allowOnlyInitialDocument}
      onMessage={onMessage}
      onLoadStart={onLoadStart}
      onLoadEnd={onLoadEnd}
      onError={onError}
      javaScriptEnabled
      scrollEnabled={sizing.scrollEnabled}
      bounces={false}
      scalesPageToFit={false}
      setBuiltInZoomControls={false}
      setDisplayZoomControls={false}
      textZoom={100}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      overScrollMode="never"
      allowsLinkPreview={false}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction
      allowsFullscreenVideo={false}
      allowFileAccess={false}
      geolocationEnabled={false}
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      domStorageEnabled={false}
      thirdPartyCookiesEnabled={false}
      cacheEnabled={false}
      incognito
    />
  );
}

const fillStyle = { flex: 1 } as const;
const transparent = { backgroundColor: "transparent" } as const;
