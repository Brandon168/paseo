// Messages between the host and the page. Everything the page sends is untrusted: it can forge the
// private marker too, so internal messages only ever carry values the host clamps or truncates.

/** Cap per message, in each direction. */
export const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

/** Key of the private envelope the bootstrap uses. Pages that post it get it treated as internal. */
export const INTERNAL_MARKER = "__paseoHtmlFrame";

const MAX_ERROR_LENGTH = 500;

export type InternalMessage =
  | { type: "height"; height: number }
  | { type: "error"; message: string };

export function utf8Length(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

export type Serialized = { ok: true; text: string } | { ok: false; reason: string };

/** JSON text of a value bound for the page, or why it cannot be sent. */
export function serializeForPage(value: unknown): Serialized {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    return { ok: false, reason: "message is not JSON-serializable" };
  }
  if (text === undefined) return { ok: false, reason: "message is not JSON-serializable" };
  if (utf8Length(text) > MAX_MESSAGE_BYTES) {
    return { ok: false, reason: "message is larger than 4 MB" };
  }
  return { ok: true, text };
}

export type Routed =
  | { kind: "internal"; message: InternalMessage }
  | { kind: "page"; value: unknown }
  | { kind: "dropped"; reason: string };

function parseInternal(value: Record<string, unknown>): InternalMessage | null {
  if (value.type === "height") {
    const height = value.height;
    if (typeof height !== "number" || !Number.isFinite(height) || height < 0) return null;
    return { type: "height", height: Math.ceil(height) };
  }
  if (value.type === "error") {
    if (typeof value.message !== "string") return null;
    return { type: "error", message: value.message.slice(0, MAX_ERROR_LENGTH) };
  }
  return null;
}

/**
 * Classifies a value the page posted. `value` is the already-parsed message (native: after
 * JSON.parse; web: the structured-clone result, re-measured through JSON here).
 */
export function routePageMessage(value: unknown): Routed {
  const serialized = serializeForPage(value);
  if (!serialized.ok) return { kind: "dropped", reason: `page ${serialized.reason}` };
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (INTERNAL_MARKER in record) {
      const inner = record[INTERNAL_MARKER];
      const message =
        typeof inner === "object" && inner !== null
          ? parseInternal(inner as Record<string, unknown>)
          : null;
      // A malformed internal envelope is dropped, never forwarded to onMessage.
      return message
        ? { kind: "internal", message }
        : { kind: "dropped", reason: "malformed internal message" };
    }
  }
  return { kind: "page", value };
}

/** Routes the text a native WebView delivered. Size is checked before parsing. */
export function routeNativePageText(text: unknown): Routed {
  if (typeof text !== "string") return { kind: "dropped", reason: "page message is not text" };
  if (utf8Length(text) > MAX_MESSAGE_BYTES) {
    return { kind: "dropped", reason: "page message is larger than 4 MB" };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: "dropped", reason: "page message is not JSON" };
  }
  return routePageMessage(value);
}
