// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { htmlFrameBootstrapSource } from "./bootstrap";
import { INTERNAL_MARKER } from "./messages";

// jsdom has no WebView. A fake `ReactNativeWebView` records what the page posts, and the shim's
// receive function stands in for the host's injectJavaScript call.
interface Receiver {
  __paseoHtmlFrameReceive(text: string): void;
}

function load(platform: "ios" | "android") {
  const posted: string[] = [];
  const win = window as unknown as Record<string, unknown>;
  win.ReactNativeWebView = { postMessage: (text: string) => posted.push(text) };
  // eslint-disable-next-line no-new-func
  new Function(htmlFrameBootstrapSource(platform)).call(window);
  return { posted, win };
}

// Every load() adds listeners to the shared jsdom window and document; take them off again.
const added: Array<() => void> = [];
function trackListeners(target: EventTarget) {
  const original = target.addEventListener.bind(target);
  vi.spyOn(target, "addEventListener").mockImplementation(
    (type: string, listener: EventListenerOrEventListenerObject | null, options?: unknown) => {
      if (listener) {
        added.push(() => target.removeEventListener(type, listener, options as boolean));
      }
      original(type, listener, options as boolean);
    },
  );
}

afterEach(async () => {
  // A load schedules a measure on the next frame; let it fire into this test's fake bridge.
  await new Promise((resolve) => setTimeout(resolve, 40));
  for (const remove of added.splice(0)) remove();
});

beforeEach(() => {
  vi.restoreAllMocks();
  trackListeners(window);
  trackListeners(document);
  // The shim redefines window.parent; put the jsdom default back between tests.
  Reflect.deleteProperty(window, "parent");
  Reflect.deleteProperty(window, "__paseoHtmlFrameReceive");
  Reflect.deleteProperty(window, "ReactNativeWebView");
  delete document.documentElement.dataset.paseoPlatform;
});

describe("native bootstrap shim", () => {
  it.each(["ios", "android"] as const)("sets the platform attribute: %s", (platform) => {
    load(platform);
    expect(document.documentElement.dataset.paseoPlatform).toBe(platform);
  });

  it("routes window.parent.postMessage to ReactNativeWebView as JSON", () => {
    const { posted } = load("ios");
    window.parent.postMessage({ hello: "host", n: [1, 2] }, "*");
    window.parent.postMessage("plain", "*");
    expect(posted).toEqual(['{"hello":"host","n":[1,2]}', '"plain"']);
  });

  it("makes window.parent something other than the window itself", () => {
    load("android");
    expect(window.parent).not.toBe(window);
  });

  it("ignores values that cannot be serialized", () => {
    const { posted } = load("ios");
    window.parent.postMessage(undefined, "*");
    window.parent.postMessage(() => 1, "*");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    window.parent.postMessage(cyclic, "*");
    expect(posted).toEqual([]);
  });

  it("delivers host messages as message events whose source is window.parent", () => {
    load("ios");
    const received: MessageEvent[] = [];
    window.addEventListener("message", (event) => received.push(event));
    (window as unknown as Receiver).__paseoHtmlFrameReceive('{"jsonrpc":"2.0","id":1}');
    expect(received).toHaveLength(1);
    expect(received[0].data).toEqual({ jsonrpc: "2.0", id: 1 });
    expect(received[0].source).toBe(window.parent);
  });

  it("drops host text that is not JSON", () => {
    load("ios");
    const listener = vi.fn();
    window.addEventListener("message", listener);
    (window as unknown as Receiver).__paseoHtmlFrameReceive("{nope");
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("message", listener);
  });

  it("reports script errors to the host through the private envelope", () => {
    const { posted } = load("ios");
    window.dispatchEvent(
      new ErrorEvent("error", { message: "boom", filename: "x", lineno: 3, colno: 4 }),
    );
    const message = JSON.parse(posted[0]);
    expect(message[INTERNAL_MARKER]).toEqual({ type: "error", message: "boom (3:4)" });
  });

  it("measures the page and posts the height once per change", async () => {
    const { posted } = load("ios");
    Object.defineProperty(document.body, "scrollHeight", { value: 321, configurable: true });
    window.dispatchEvent(new Event("load"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const heights = posted
      .map((text) => JSON.parse(text)[INTERNAL_MARKER])
      .filter((message) => message?.type === "height");
    expect(heights).toEqual([{ type: "height", height: 321 }]);
  });

  it("swallows link clicks and scrolls to in-page anchors", () => {
    load("ios");
    document.body.innerHTML =
      '<a id="out" href="https://example.com">x</a><a id="in" href="#sec">y</a><div id="sec"></div>';
    const section = document.getElementById("sec") as HTMLElement;
    const scroll = vi.fn();
    section.scrollIntoView = scroll;

    const outside = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.getElementById("out")?.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(true);
    expect(scroll).not.toHaveBeenCalled();

    const inside = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.getElementById("in")?.dispatchEvent(inside);
    expect(inside.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("makes window.open do nothing", () => {
    load("android");
    expect(window.open("https://example.com")).toBeNull();
  });
});
