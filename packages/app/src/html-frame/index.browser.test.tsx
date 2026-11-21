import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import { HtmlFrame } from "./index.web";
import type { HtmlFrameHandle, HtmlFrameProps } from "./types";

// Real Chromium: the iframe is sandboxed the way it ships, so these tests run the page's scripts,
// its postMessage round trips and its refused navigations rather than reading attributes.

const CAPPED = { min: 80, max: 500 };
const mentions = (lines: string[], text: string) => lines.some((line) => line.includes(text));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function mount(props: HtmlFrameProps, ref?: React.Ref<HtmlFrameHandle>) {
  await i18n.changeLanguage("en");
  container = document.createElement("div");
  container.style.width = "360px";
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<HtmlFrame ref={ref} {...props} />));
  return container.querySelector("iframe") as HTMLIFrameElement | null;
}

function until<T>(read: () => T | undefined | false, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const value = read();
      if (value) return resolve(value);
      if (Date.now() - started > 5000) return reject(new Error(`Timed out waiting for ${what}`));
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe("HtmlFrame on web", () => {
  it("sandboxes the frame with scripts only and an opaque origin", async () => {
    const frame = await mount({ html: "<p>hi</p>" });
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(() => frame?.contentWindow?.document).toThrow();
  });

  it("runs page scripts, tags the platform and delivers page messages without the internal ones", async () => {
    const messages: unknown[] = [];
    await mount({
      html: `<p id="p">hi</p><script>
        window.parent.postMessage({ platform: document.documentElement.dataset.paseoPlatform }, "*");
        window.parent.postMessage([1, 2, 3], "*");
      </script>`,
      onMessage: (message) => messages.push(message),
    });
    await until(() => messages.length >= 2, "page messages");
    expect(messages).toEqual([{ platform: "web" }, [1, 2, 3]]);
  });

  it("auto-sizes to the content within the clamp and reports the measured height", async () => {
    const heights: number[] = [];
    const frame = await mount({
      html: '<div style="height:300px;margin:0"></div><style>body{margin:0}</style>',
      onContentHeight: (height) => heights.push(height),
    });
    await until(() => heights.includes(300), "measured height");
    await until(() => frame?.style.height === "300px", "frame resize");

    await act(async () =>
      root?.render(
        <HtmlFrame
          html='<style>body{margin:0}</style><div style="height:3000px"></div>'
          autoHeight={CAPPED}
        />,
      ),
    );
    const resized = container?.querySelector("iframe");
    await until(() => resized?.style.height === "500px", "clamped frame");
    expect(resized?.getAttribute("scrolling")).toBe("yes");
  });

  it("delivers ref.postMessage to the page as a message event from window.parent", async () => {
    const ref = createRef<HtmlFrameHandle>();
    const echoes: unknown[] = [];
    await mount(
      {
        html: `<script>
          window.addEventListener("message", function (event) {
            window.parent.postMessage({ echo: event.data, fromParent: event.source === window.parent }, "*");
          });
          window.parent.postMessage("ready", "*");
        </script>`,
        onMessage: (message) => echoes.push(message),
      },
      ref,
    );
    await until(() => echoes.includes("ready"), "page ready");
    // Posted before load would queue; after load it goes straight through.
    ref.current?.postMessage({ hello: "page" });
    await until(() => echoes.length >= 2, "echo");
    expect(echoes[1]).toEqual({ echo: { hello: "page" }, fromParent: true });
  });

  it("reports script errors and dropped csp entries", async () => {
    const errors: string[] = [];
    await mount({
      html: '<script>throw new Error("kaboom")</script>',
      csp: { resourceDomains: ["http://insecure.example.com", "https://ok.example.com"] },
      onError: (message) => errors.push(message),
    });
    await until(() => mentions(errors, "kaboom"), "script error");
    expect(mentions(errors, "insecure.example.com")).toBe(true);
  });

  it("blocks network the policy does not allow", async () => {
    const messages: unknown[] = [];
    await mount({
      html: `<script>
        fetch("https://example.com/").then(
          function () { window.parent.postMessage("fetched", "*"); },
          function () { window.parent.postMessage("blocked", "*"); }
        );
      </script>`,
      onMessage: (message) => messages.push(message),
    });
    await until(() => messages.length > 0, "fetch result");
    expect(messages).toEqual(["blocked"]);
  });

  it("refuses a page that navigates itself and replaces it with an empty page", async () => {
    const errors: string[] = [];
    const frame = await mount({
      html: '<script>setTimeout(function () { location.href = "about:blank#x"; location.replace("data:text/html,<p>away</p>"); }, 50)</script>',
      onError: (message) => errors.push(message),
    });
    await until(() => mentions(errors, "navigate"), "navigation refusal");
    const blank = await until(() => {
      const current = container?.querySelector("iframe");
      return current && current !== frame ? current : undefined;
    }, "replacement frame");
    expect(blank.getAttribute("srcdoc")).not.toContain("<script>");
  });

  it("does not follow link clicks", async () => {
    const messages: unknown[] = [];
    const frame = await mount({
      html: '<a id="a" href="https://example.com/">x</a><script>document.getElementById("a").click(); setTimeout(function(){window.parent.postMessage("still here","*")}, 100)</script>',
      onMessage: (message) => messages.push(message),
    });
    await until(() => messages.includes("still here"), "page after click");
    expect(container?.querySelector("iframe")).toBe(frame);
  });

  it("keeps a placeholder of the last height when inactive and loads again when active", async () => {
    const heights: number[] = [];
    await mount({
      html: '<style>body{margin:0}</style><div style="height:200px"></div>',
      onContentHeight: (height) => heights.push(height),
    });
    await until(() => heights.includes(200), "height");
    await act(async () =>
      root?.render(
        <HtmlFrame html="<div style='height:200px'></div>" active={false} testID="gone" />,
      ),
    );
    expect(container?.querySelector("iframe")).toBeNull();
    const placeholder = container?.querySelector('[data-testid="gone"]') as HTMLElement;
    expect(placeholder.style.height).toBe("200px");
  });
});
