import { describe, expect, it } from "vitest";
import { formatContextPercentage, formatTokenCount } from "./context-window-meter.utils";

describe("context window meter formatting", () => {
  it("localizes percentages without hiding context overflow", () => {
    expect(formatContextPercentage(125, "en")).toBe("125%");
    expect(formatContextPercentage(42, "fr")).toBe("42 %");
  });

  it("keeps one decimal for single-digit millions", () => {
    expect(formatTokenCount(1_764_314)).toBe("1.8m");
    expect(formatTokenCount(1_000_000)).toBe("1m");
    expect(formatTokenCount(12_400_000)).toBe("12m");
    expect(formatTokenCount(439_200)).toBe("439k");
    expect(formatTokenCount(56)).toBe("56");
  });
});
