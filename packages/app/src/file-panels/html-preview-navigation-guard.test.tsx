// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { RetainedPanelActivity } from "@/components/retained-panel";
import { useHtmlPreviewNavigationGuard } from "./html-preview-navigation";

const DOCUMENT = "<html><body>report</body></html>";

function renderGuard(initialActive: boolean, baseUrl?: string) {
  let active = initialActive;
  const view = renderHook(() => useHtmlPreviewNavigationGuard(DOCUMENT, baseUrl), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <RetainedPanelActivity active={active}>{children}</RetainedPanelActivity>
    ),
  });
  return {
    navigate: (url: string) => view.result.current({ url }),
    setActive(next: boolean) {
      active = next;
      view.rerender();
    },
  };
}

describe("useHtmlPreviewNavigationGuard", () => {
  it("loads the document once and refuses the page loading it again", () => {
    const guard = renderGuard(true);

    expect(guard.navigate("about:blank")).toBe(true);
    expect(guard.navigate("about:blank")).toBe(false);
    expect(guard.navigate("https://example.com/leak")).toBe(false);
    expect(guard.navigate("about:blank#section")).toBe(true);
  });

  it("loads a trusted base URL once and still refuses navigation away", () => {
    const guard = renderGuard(true, "https://screen.7ven.org/");
    expect(guard.navigate("https://screen.7ven.org/")).toBe(true);
    expect(guard.navigate("https://screen.7ven.org/")).toBe(false);
    expect(guard.navigate("https://screen.7ven.org/other")).toBe(false);
    expect(guard.navigate("https://screen.7ven.org/#anchor")).toBe(true);
  });

  it("loads the document again in the WebView that shows after the panel was hidden", () => {
    const guard = renderGuard(true);
    expect(guard.navigate("about:blank")).toBe(true);

    // iOS destroys the native WebView of a hidden panel and makes a new one when it shows.
    guard.setActive(false);
    guard.setActive(true);

    expect(guard.navigate("about:blank")).toBe(true);
    expect(guard.navigate("about:blank")).toBe(false);
  });
});
