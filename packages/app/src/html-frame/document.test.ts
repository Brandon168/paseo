import { describe, expect, it } from "vitest";
import { buildHtmlFrameDocument } from "./document";

const build = (html: string, platform: "ios" | "android" | "web" = "web", csp?: object) =>
  buildHtmlFrameDocument({ html, platform, csp });

describe("buildHtmlFrameDocument", () => {
  it("puts doctype, then the policy, then viewport, style and bootstrap, then the page", () => {
    const { document } = build("<h1>hi</h1>");
    const order = [
      "<!doctype html>",
      '<meta http-equiv="Content-Security-Policy"',
      '<meta name="viewport"',
      "<style>html{-webkit-text-size-adjust:100%}</style>",
      "<script>",
      "<h1>hi</h1>",
    ].map((part) => document.indexOf(part));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(document.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"')).toBe(
      true,
    );
    expect(document.endsWith("<h1>hi</h1>")).toBe(true);
  });

  it("keeps a page's own markup, doctype included, verbatim after the prologue", () => {
    const page = "<!doctype html><html><body><p>x</p></body></html>";
    expect(build(page).document.endsWith(page)).toBe(true);
  });

  it("drops a leading BOM", () => {
    const { document } = build("﻿<p>x</p>");
    expect(document.includes("﻿")).toBe(false);
    expect(document.endsWith("<p>x</p>")).toBe(true);
  });

  it("bakes the platform into the bootstrap", () => {
    expect(build("", "ios").document).toContain('var PLATFORM = "ios"');
    expect(build("", "android").document).toContain('var PLATFORM = "android"');
    expect(build("", "web").document).toContain('var PLATFORM = "web"');
  });

  it("starts from the closed preview policy", () => {
    const { document } = build("");
    expect(document).toContain("default-src 'none'");
    expect(document).toContain("connect-src 'none'");
    expect(document).toContain("form-action 'none'");
    expect(document).toContain("frame-src 'none'");
  });

  it("appends resource domains to every resource directive and replaces connect-src", () => {
    const { document, dropped } = build("", "web", {
      resourceDomains: ["https://cdn.jsdelivr.net/npm/"],
      connectDomains: ["https://api.example.com", "wss://live.example.com"],
    });
    expect(dropped).toEqual([]);
    expect(document).toContain(
      "script-src 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net/npm/;",
    );
    expect(document).toContain("style-src 'unsafe-inline' https://cdn.jsdelivr.net/npm/;");
    expect(document).toContain("img-src data: blob: https://cdn.jsdelivr.net/npm/;");
    expect(document).toContain("font-src data: https://cdn.jsdelivr.net/npm/;");
    expect(document).toContain("media-src data: blob: https://cdn.jsdelivr.net/npm/;");
    expect(document).toContain("connect-src https://api.example.com wss://live.example.com;");
    expect(document).not.toContain("connect-src 'none'");
  });

  it("never lets an invalid entry reach the policy", () => {
    const { document, dropped } = build("", "web", {
      resourceDomains: ["*", "https://ok.example.com", "https://x.com; script-src *"],
      connectDomains: ["http://insecure.example.com"],
    });
    expect(dropped).toHaveLength(3);
    expect(document).not.toContain("script-src *");
    expect(document).not.toContain("insecure.example.com");
    expect(document).toContain("connect-src 'none'");
    expect(document).toContain("https://ok.example.com");
  });

  it("keeps the host's policy first even when the page declares its own", () => {
    const { document } = build(
      '<meta http-equiv="Content-Security-Policy" content="default-src *">',
    );
    expect(document.indexOf("default-src 'none'")).toBeLessThan(document.indexOf("default-src *"));
    expect(document.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"')).toBe(
      true,
    );
  });
});
