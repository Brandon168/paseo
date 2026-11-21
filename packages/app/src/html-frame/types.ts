// Mirrors packages/plugin/src/client/ui.ts, which is the published contract.

export interface HtmlFrameCsp {
  resourceDomains?: readonly string[];
  connectDomains?: readonly string[];
}

export interface HtmlFrameHandle {
  postMessage(message: unknown): void;
}

export interface HtmlFrameProps {
  html: string;
  csp?: HtmlFrameCsp;
  /**
   * A trusted HTTPS origin to load the document from on native (default `about:blank`). A real
   * origin gives the page a secure context, which APIs such as WebCodecs require; relative URLs
   * resolve there. Ignored on web, where the frame stays a sandboxed `srcdoc` with an opaque
   * origin. Navigation away is still refused.
   */
  baseUrl?: string;
  autoHeight?: { min?: number; max?: number } | false;
  height?: number;
  fill?: boolean;
  scrollEnabled?: boolean;
  active?: boolean;
  onContentHeight?(height: number): void;
  onMessage?(message: unknown): void;
  onError?(message: string): void;
  onLoad?(): void;
  testID?: string;
}
