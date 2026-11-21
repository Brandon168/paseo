import { describe, expect, it } from "vitest";
import {
  INTERNAL_MARKER,
  MAX_MESSAGE_BYTES,
  routeNativePageText,
  routePageMessage,
  serializeForPage,
  utf8Length,
} from "./messages";

describe("utf8Length", () => {
  it("counts bytes, not code units", () => {
    expect(utf8Length("abc")).toBe(3);
    expect(utf8Length("é")).toBe(2);
    expect(utf8Length("€")).toBe(3);
    expect(utf8Length("😀")).toBe(4);
  });
});

describe("routePageMessage", () => {
  it("passes ordinary JSON values to the host", () => {
    for (const value of [{ a: 1 }, [1, 2], "text", 5, null, true]) {
      expect(routePageMessage(value)).toEqual({ kind: "page", value });
    }
  });

  it("keeps height reports away from onMessage and rounds them up", () => {
    expect(routePageMessage({ [INTERNAL_MARKER]: { type: "height", height: 120.2 } })).toEqual({
      kind: "internal",
      message: { type: "height", height: 121 },
    });
  });

  it("truncates reported script errors", () => {
    const routed = routePageMessage({
      [INTERNAL_MARKER]: { type: "error", message: "x".repeat(2000) },
    });
    expect(routed.kind).toBe("internal");
    if (routed.kind === "internal" && routed.message.type === "error") {
      expect(routed.message.message).toHaveLength(500);
    }
  });

  it.each([
    ["negative height", { type: "height", height: -1 }],
    ["infinite height", { type: "height", height: Infinity }],
    ["string height", { type: "height", height: "9" }],
    ["unknown type", { type: "resize" }],
    ["non-string error", { type: "error", message: 4 }],
    ["not an object", "height"],
  ])("drops a malformed internal envelope: %s", (_name, inner) => {
    expect(routePageMessage({ [INTERNAL_MARKER]: inner }).kind).toBe("dropped");
  });

  it("drops values that are not JSON", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(routePageMessage(cyclic).kind).toBe("dropped");
    expect(routePageMessage(undefined).kind).toBe("dropped");
  });

  it("drops a message over 4 MB", () => {
    expect(routePageMessage("x".repeat(MAX_MESSAGE_BYTES)).kind).toBe("dropped");
    expect(routePageMessage("x".repeat(MAX_MESSAGE_BYTES - 2)).kind).toBe("page");
  });
});

describe("routeNativePageText", () => {
  it("parses JSON text and routes it", () => {
    expect(routeNativePageText('{"hello":"world"}')).toEqual({
      kind: "page",
      value: { hello: "world" },
    });
    expect(
      routeNativePageText(JSON.stringify({ [INTERNAL_MARKER]: { type: "height", height: 10 } }))
        .kind,
    ).toBe("internal");
  });

  it("drops non-text, invalid JSON and oversized text", () => {
    expect(routeNativePageText(5).kind).toBe("dropped");
    expect(routeNativePageText("{nope").kind).toBe("dropped");
    expect(routeNativePageText(`"${"x".repeat(MAX_MESSAGE_BYTES)}"`).kind).toBe("dropped");
  });
});

describe("serializeForPage", () => {
  it("serializes JSON and refuses what cannot be sent", () => {
    expect(serializeForPage({ a: 1 })).toEqual({ ok: true, text: '{"a":1}' });
    expect(serializeForPage(undefined).ok).toBe(false);
    expect(serializeForPage(() => 1).ok).toBe(false);
    expect(serializeForPage(10n).ok).toBe(false);
    expect(serializeForPage("x".repeat(MAX_MESSAGE_BYTES)).ok).toBe(false);
  });
});
