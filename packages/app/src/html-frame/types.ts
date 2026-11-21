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
