import { serializeForPage } from "./messages";

const MAX_QUEUED = 50;

/**
 * Host → page messages. Posts made before the page finished loading wait for it, because a message
 * delivered earlier would arrive before the page can have a listener.
 */
export class PageOutbox {
  private queue: string[] = [];
  private ready = false;

  constructor(
    private readonly deliver: (text: string) => void,
    private readonly onError: (message: string) => void,
  ) {}

  post(value: unknown): void {
    const serialized = serializeForPage(value);
    if (!serialized.ok) {
      this.onError(`postMessage: ${serialized.reason}`);
      return;
    }
    if (this.ready) {
      this.deliver(serialized.text);
      return;
    }
    if (this.queue.length >= MAX_QUEUED) {
      this.onError("postMessage: too many messages before the page loaded");
      return;
    }
    this.queue.push(serialized.text);
  }

  /** The page loaded: flush what is waiting. */
  loaded(): void {
    this.ready = true;
    const waiting = this.queue;
    this.queue = [];
    for (const text of waiting) this.deliver(text);
  }

  /** A new document is loading (or the view went away): hold messages again. */
  reset(): void {
    this.ready = false;
  }
}
