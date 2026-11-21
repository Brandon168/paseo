import { describe, expect, it } from "vitest";
import { resolveSizing } from "./sizing";

describe("resolveSizing", () => {
  it("auto-sizes by default, clamped to 80..1400", () => {
    expect(resolveSizing({}, null)).toMatchObject({
      height: 80,
      autoSize: true,
      scrollEnabled: false,
    });
    expect(resolveSizing({}, 300).height).toBe(300);
    expect(resolveSizing({}, 20).height).toBe(80);
    expect(resolveSizing({}, 5000).height).toBe(1400);
  });

  it("uses `height` as the starting height until the first measure", () => {
    expect(resolveSizing({ height: 200 }, null).height).toBe(200);
    expect(resolveSizing({ height: 200 }, 300).height).toBe(300);
  });

  it("honours custom bounds and repairs inverted ones", () => {
    expect(resolveSizing({ autoHeight: { min: 100, max: 200 } }, 900).height).toBe(200);
    expect(resolveSizing({ autoHeight: { max: 50 } }, 10).height).toBe(80);
    expect(resolveSizing({ autoHeight: { min: 300, max: 200 } }, 10).height).toBe(300);
  });

  it("scrolls inside an auto-sized frame only once content outgrows the cap", () => {
    expect(resolveSizing({}, 1400).scrollEnabled).toBe(false);
    expect(resolveSizing({}, 1401).scrollEnabled).toBe(true);
    expect(resolveSizing({ scrollEnabled: false }, 5000).scrollEnabled).toBe(false);
  });

  it("uses the fixed height and scrolls when auto-height is off", () => {
    expect(resolveSizing({ autoHeight: false, height: 320 }, 900)).toMatchObject({
      height: 320,
      autoSize: false,
      scrollEnabled: true,
    });
    expect(resolveSizing({ autoHeight: false }, null).height).toBe(240);
  });

  it("fills the parent and scrolls, ignoring the measure", () => {
    expect(resolveSizing({ fill: true, height: 100, autoHeight: { min: 1 } }, 500)).toEqual({
      fill: true,
      height: null,
      scrollEnabled: true,
      autoSize: false,
    });
    expect(resolveSizing({ fill: true, scrollEnabled: false }, null).scrollEnabled).toBe(false);
  });

  it("ignores non-finite inputs", () => {
    expect(resolveSizing({ height: Number.NaN, autoHeight: false }, null).height).toBe(240);
    expect(resolveSizing({ autoHeight: { min: Number.NaN } }, null).height).toBe(80);
  });
});
