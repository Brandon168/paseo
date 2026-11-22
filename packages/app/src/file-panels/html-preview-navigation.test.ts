import { describe, expect, it } from "vitest";
import { htmlPreviewNavigationKind } from "./html-preview-navigation";

describe("htmlPreviewNavigationKind", () => {
  it("allows the WebView's initial document URLs", () => {
    expect(htmlPreviewNavigationKind("about:blank")).toBe("initialDocument");
    expect(htmlPreviewNavigationKind("about:srcdoc")).toBe("initialDocument");
    expect(htmlPreviewNavigationKind("")).toBe("initialDocument");
  });

  it("allows same-document fragment navigation", () => {
    expect(htmlPreviewNavigationKind("about:blank#decision-table")).toBe("fragment");
    expect(htmlPreviewNavigationKind("about:srcdoc#decision-table")).toBe("fragment");
  });

  it("allows one trusted base URL as the initial document, and only it", () => {
    const base = "https://screen.7ven.org/";
    expect(htmlPreviewNavigationKind("https://screen.7ven.org/", base)).toBe("initialDocument");
    expect(htmlPreviewNavigationKind("https://screen.7ven.org", base)).toBe("initialDocument");
    expect(htmlPreviewNavigationKind("https://screen.7ven.org/#section", base)).toBe("fragment");
    expect(htmlPreviewNavigationKind("https://screen.7ven.org/other", base)).toBe("blocked");
    expect(htmlPreviewNavigationKind("https://example.com/", base)).toBe("blocked");
    expect(htmlPreviewNavigationKind("https://screen.7ven.org/")).toBe("blocked");
  });

  it("blocks documents that could escape the injected policy", () => {
    expect(htmlPreviewNavigationKind("https://example.com/leak")).toBe("blocked");
    expect(
      htmlPreviewNavigationKind("data:text/html,<script>location='https://example.com'</script>"),
    ).toBe("blocked");
    expect(htmlPreviewNavigationKind("blob:https://example.com/document-id")).toBe("blocked");
  });
});
