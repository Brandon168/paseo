import type { Page } from "@playwright/test";
import { daemonWsRoutePattern } from "./daemon-port";

type WebSocketMessage = string | Buffer;

export const VOICE_MODE = "Enable Voice mode";
export const STOP_VOICE = "Stop realtime voice and interrupt turn";

function parseEnvelope(message: WebSocketMessage): {
  type?: unknown;
  message?: Record<string, unknown>;
} | null {
  if (typeof message !== "string") return null;
  try {
    return JSON.parse(message) as { type?: unknown; message?: Record<string, unknown> };
  } catch {
    return null;
  }
}

function sendSessionMessage(
  ws: { send(message: string): void },
  message: Record<string, unknown>,
): void {
  ws.send(JSON.stringify({ type: "session", message }));
}

// The E2E daemon runs without speech providers, so the harness reports voice mode as
// available and answers the daemon's side of turning it on.
function enableVoiceCapability(message: WebSocketMessage): WebSocketMessage {
  const envelope = parseEnvelope(message);
  const payload = envelope?.message?.payload as Record<string, unknown> | undefined;
  if (envelope?.message?.type !== "status" || payload?.status !== "server_info") {
    return message;
  }
  payload.capabilities = {
    voice: {
      dictation: { enabled: true, reason: "" },
      voice: { enabled: true, reason: "" },
    },
  };
  return JSON.stringify(envelope);
}

export async function installSyntheticMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const destination = context.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        return destination.stream;
      },
    });
  });
}

export async function installVoiceModeHarness(
  page: Page,
  failures: { createAgent?: string; startVoice?: string } = {},
) {
  const enabledAgentIds: string[] = [];
  let resolveFirstEnable!: (agentId: string) => void;
  const firstEnable = new Promise<string>((resolve) => {
    resolveFirstEnable = resolve;
  });

  await page.routeWebSocket(daemonWsRoutePattern(), (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      const request = parseEnvelope(message)?.message;
      if (
        failures.createAgent &&
        request?.type === "agent.create.request" &&
        typeof request.requestId === "string"
      ) {
        sendSessionMessage(ws, {
          type: "agent.create.response",
          payload: { requestId: request.requestId, agent: null, error: failures.createAgent },
        });
        return;
      }
      if (request?.type === "set_voice_mode" && typeof request.requestId === "string") {
        const agentId = typeof request.agentId === "string" ? request.agentId : null;
        if (request.enabled === true && agentId) {
          enabledAgentIds.push(agentId);
          resolveFirstEnable(agentId);
        }
        sendSessionMessage(ws, {
          type: "set_voice_mode_response",
          payload: {
            requestId: request.requestId,
            enabled: request.enabled === true,
            agentId,
            accepted: !failures.startVoice,
            error: failures.startVoice ?? null,
          },
        });
        return;
      }
      // Microphone audio has no voice session to go to on this daemon.
      if (typeof message !== "string" || request?.type === "voice_audio_chunk") return;
      server.send(message);
    });
    server.onMessage((message) => ws.send(enableVoiceCapability(message)));
  });

  return { enabledAgentIds, waitForFirstEnable: () => firstEnable };
}

/** The new-chat form starts on the mock provider instead of whatever the host last used. */
export async function preferMockAgent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "@paseo:create-agent-preferences",
      JSON.stringify({
        provider: "mock",
        providerPreferences: { mock: { mode: "load-test" } },
      }),
    );
  });
}
