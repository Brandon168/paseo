import { describe, expect, it } from "vitest";
import { parseHtmlFrameDomain, validateHtmlFrameCsp } from "./domains";

const resource = (entry: string) => parseHtmlFrameDomain(entry, "resourceDomains");
const connect = (entry: string) => parseHtmlFrameDomain(entry, "connectDomains");

describe("parseHtmlFrameDomain", () => {
  it("accepts https origins, ports, wildcard subdomains and path prefixes", () => {
    expect(resource("https://cdnjs.cloudflare.com")).toEqual({
      ok: true,
      source: "https://cdnjs.cloudflare.com",
    });
    expect(resource("https://*.example.com")).toEqual({
      ok: true,
      source: "https://*.example.com",
    });
    expect(resource("https://cdn.jsdelivr.net/npm/")).toEqual({
      ok: true,
      source: "https://cdn.jsdelivr.net/npm/",
    });
    expect(resource("https://example.com:8443/a/b/")).toEqual({
      ok: true,
      source: "https://example.com:8443/a/b/",
    });
  });

  it("lowercases scheme and host but keeps the path", () => {
    expect(resource("HTTPS://CDN.Example.COM/Lib/")).toEqual({
      ok: true,
      source: "https://cdn.example.com/Lib/",
    });
  });

  it("accepts wss only for connect domains", () => {
    expect(connect("wss://live.example.com")).toEqual({
      ok: true,
      source: "wss://live.example.com",
    });
    expect(resource("wss://live.example.com").ok).toBe(false);
  });

  it.each([
    ["http scheme", "http://example.com"],
    ["ws scheme", "ws://example.com"],
    ["bare wildcard", "*"],
    ["scheme only", "https:"],
    ["scheme wildcard", "https://*"],
    ["wildcard top-level domain", "https://*.com"],
    ["single label", "https://localhost"],
    ["IPv4 address", "https://192.168.1.1"],
    ["IPv4 with port", "https://10.0.0.1:8443"],
    ["no scheme", "example.com"],
    ["missing trailing slash on path", "https://example.com/npm"],
    ["file extension path", "https://example.com/a.js"],
    ["dot segment", "https://example.com/a/../"],
    ["double slash", "https://example.com//"],
    ["query", "https://example.com/?a=b"],
    ["fragment", "https://example.com/#a"],
    ["user info", "https://user@example.com"],
    ["space", "https://example.com evil.com"],
    ["semicolon", "https://example.com; script-src *"],
    ["single quote", "https://example.com'"],
    ["double quote", 'https://example.com"'],
    ["comma", "https://example.com,https://evil.com"],
    ["newline", "https://example.com\nhttps://evil.com"],
    ["port zero", "https://example.com:0"],
    ["port too large", "https://example.com:70000"],
    ["wildcard in the middle", "https://cdn.*.example.com"],
    ["wildcard without dot", "https://*example.com"],
    ["keyword", "'unsafe-eval'"],
    ["data scheme", "data:"],
    ["too long", `https://${"a".repeat(300)}.com`],
  ])("rejects %s", (_name, entry) => {
    expect(resource(entry).ok).toBe(false);
    expect(connect(entry).ok).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(resource(42 as unknown as string).ok).toBe(false);
    expect(resource(null as unknown as string).ok).toBe(false);
  });
});

describe("validateHtmlFrameCsp", () => {
  it("returns canonical lists, drops bad entries and says why", () => {
    const result = validateHtmlFrameCsp({
      resourceDomains: ["https://a.example.com", "https://a.example.com", "http://b.example.com"],
      connectDomains: ["wss://c.example.com", "*"],
    });
    expect(result.resourceDomains).toEqual(["https://a.example.com"]);
    expect(result.connectDomains).toEqual(["wss://c.example.com"]);
    expect(result.dropped).toHaveLength(2);
    expect(result.dropped[0]).toContain("http://b.example.com");
    expect(result.dropped[1]).toContain('"*"');
  });

  it("returns empty lists for no csp", () => {
    expect(validateHtmlFrameCsp(undefined)).toEqual({
      resourceDomains: [],
      connectDomains: [],
      dropped: [],
    });
  });

  it("caps each list and truncates long entries in reports", () => {
    const many = Array.from({ length: 40 }, (_, index) => `https://h${index}.example.com`);
    const result = validateHtmlFrameCsp({ connectDomains: many });
    expect(result.connectDomains).toHaveLength(32);
    expect(result.dropped).toHaveLength(8);

    const long = validateHtmlFrameCsp({ resourceDomains: [`https://${"a".repeat(200)}.com`] });
    expect(long.dropped[0].length).toBeLessThan(200);
  });

  it("refuses a list that is not an array", () => {
    const result = validateHtmlFrameCsp({
      resourceDomains: "https://example.com" as unknown as string[],
    });
    expect(result.resourceDomains).toEqual([]);
    expect(result.dropped).toHaveLength(1);
  });
});
