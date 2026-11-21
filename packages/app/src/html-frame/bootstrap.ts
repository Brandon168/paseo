import { INTERNAL_MARKER } from "./messages";

export type HtmlFramePlatform = "ios" | "android" | "web";

// Runs first in the page, on every platform. Written as ES5-ish text because it is inlined into the
// document the page loads, not bundled. It must never contain a closing script tag.
//
// Native: a WebView page is the top window, so `window.parent` is itself. The shim replaces
// `parent` with an object whose postMessage reaches `ReactNativeWebView.postMessage`, and
// `__paseoHtmlFrameReceive` turns host text into a `message` event whose `source` is that same
// object. That makes `event.source === window.parent` true, which the MCP Apps SDK transport checks.
const SOURCE = `(function () {
  var MARKER = __MARKER__;
  var PLATFORM = __PLATFORM__;
  var root = document.documentElement;
  root.dataset.paseoPlatform = PLATFORM;

  var send;
  if (PLATFORM === "web") {
    send = function (value) { window.parent.postMessage(value, "*"); };
  } else {
    var hostParent = {
      postMessage: function (value) {
        var text;
        try { text = JSON.stringify(value); } catch (e) { return; }
        if (typeof text !== "string") return;
        var bridge = window.ReactNativeWebView;
        if (bridge && typeof bridge.postMessage === "function") bridge.postMessage(text);
      }
    };
    try {
      Object.defineProperty(window, "parent", { value: hostParent, configurable: true });
    } catch (e) {}
    try {
      Object.defineProperty(window, "__paseoHtmlFrameReceive", {
        configurable: true,
        value: function (text) {
          var data;
          try { data = JSON.parse(text); } catch (e) { return; }
          var event = new MessageEvent("message", { data: data });
          try { Object.defineProperty(event, "source", { value: hostParent }); } catch (e) {}
          window.dispatchEvent(event);
        }
      });
    } catch (e) {}
    send = function (value) { hostParent.postMessage(value); };
  }

  function internal(message) {
    var envelope = {};
    envelope[MARKER] = message;
    send(envelope);
  }

  try { window.open = function () { return null; }; } catch (e) {}

  // The host refuses every navigation after the first load; swallowing the click here also keeps
  // an in-page "#anchor" from resolving against the embedding page's URL on web.
  document.addEventListener("click", function (event) {
    var node = event.target;
    while (node && node.nodeType === 1 && !(node.tagName === "A" && node.hasAttribute("href"))) {
      node = node.parentNode;
    }
    if (!node || node.nodeType !== 1) return;
    event.preventDefault();
    var href = node.getAttribute("href") || "";
    if (href.charAt(0) !== "#" || href.length < 2) return;
    var id = href.slice(1);
    try { id = decodeURIComponent(id); } catch (e) {}
    var target = document.getElementById(id) || document.getElementsByName(id)[0];
    if (target && target.scrollIntoView) target.scrollIntoView();
  }, true);

  var errors = 0;
  function reportError(message) {
    if (errors >= 20) return;
    errors += 1;
    internal({ type: "error", message: String(message).slice(0, 500) });
  }
  window.addEventListener("error", function (event) {
    var where = event.filename ? " (" + event.lineno + ":" + event.colno + ")" : "";
    reportError(event.message ? event.message + where : "Script error");
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    reportError("Unhandled rejection: " + (reason && reason.message ? reason.message : reason));
  });

  var last = -1;
  var pending = false;
  function measure() {
    pending = false;
    var body = document.body;
    var height = Math.ceil(Math.max(
      root.getBoundingClientRect().height,
      body ? body.scrollHeight : 0
    ));
    if (height === last) return;
    last = height;
    internal({ type: "height", height: height });
  }
  function schedule() {
    if (pending) return;
    pending = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(measure);
    else setTimeout(measure, 16);
  }
  function observe() {
    if (typeof ResizeObserver === "function") {
      var observer = new ResizeObserver(schedule);
      observer.observe(root);
      if (document.body) observer.observe(document.body);
    }
    schedule();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observe);
  else observe();
  window.addEventListener("load", schedule);
})();`;

export function htmlFrameBootstrap(platform: HtmlFramePlatform): string {
  const script = SOURCE.replace("__MARKER__", JSON.stringify(INTERNAL_MARKER)).replace(
    "__PLATFORM__",
    JSON.stringify(platform),
  );
  return `<script>${script}</script>`;
}

/** The script body alone, for tests that evaluate it in a DOM. */
export function htmlFrameBootstrapSource(platform: HtmlFramePlatform): string {
  return htmlFrameBootstrap(platform).slice("<script>".length, -"</script>".length);
}
