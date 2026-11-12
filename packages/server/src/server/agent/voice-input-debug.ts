import type pino from "pino";
import { createWriteStream, type WriteStream } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";
import { sanitizeForFilename } from "./audio-utils.js";
import { resolveRecordingsDebugDir } from "./recordings-debug.js";

const debugDir = resolveRecordingsDebugDir("VOICE_INPUT_DEBUG_AUDIO_DIR");

export interface VoiceInputDebugRecorder {
  append(pcm16: Buffer, format: string): void;
  close(): void;
}

/**
 * Record a voice-mode session's whole microphone stream, not only the clips the detector
 * picks out, so echo and noise can be measured against what the detector and
 * speech-to-text made of them. Writes raw PCM as received plus an index of
 * `{ t, bytes, format }` lines that maps byte offsets to arrival times, which line up
 * with the daemon log. Off unless VOICE_INPUT_DEBUG_AUDIO_DIR is set.
 */
export async function createVoiceInputDebugRecorder(
  sessionId: string,
  logger: pino.Logger,
): Promise<VoiceInputDebugRecorder | null> {
  if (!debugDir) {
    return null;
  }

  const folder = join(debugDir, sanitizeForFilename(sessionId, "session"));
  const base = join(folder, `${new Date().toISOString().replace(/[:.]/g, "-")}_voice-input`);
  let audio: WriteStream;
  let index: WriteStream;
  try {
    await mkdir(folder, { recursive: true });
    audio = createWriteStream(`${base}.pcm`);
    index = createWriteStream(`${base}.jsonl`);
  } catch (err) {
    logger.warn({ err, debugDir }, "Voice input capture could not start");
    return null;
  }
  const onError = (err: Error) => logger.warn({ err }, "Voice input capture write failed");
  audio.on("error", onError);
  index.on("error", onError);
  logger.info({ path: `${base}.pcm` }, "Voice input capture enabled");

  let bytes = 0;
  return {
    append(pcm16, format) {
      index.write(`${JSON.stringify({ t: Date.now(), bytes, format })}\n`);
      audio.write(pcm16);
      bytes += pcm16.length;
    },
    close() {
      audio.end();
      index.end();
    },
  };
}
