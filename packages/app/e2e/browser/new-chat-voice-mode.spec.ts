import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { composerLocator, expectComposerVisible } from "../support/helpers/composer";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";
import { clickNewChat, gotoWorkspace } from "../support/helpers/launcher";
import { openNewWorkspaceComposer } from "../support/helpers/new-workspace";
import { seedWorkspace } from "../support/helpers/seed-client";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";

type WebSocketMessage = string | Buffer;

const VOICE_MODE = "Enable Voice mode";
const STOP_VOICE = "Stop realtime voice and interrupt turn";

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

async function installSyntheticMicrophone(page: Page): Promise<void> {
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

async function installVoiceModeHarness(
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

async function openNewMockChat(page: Page, workspaceId: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "@paseo:create-agent-preferences",
      JSON.stringify({
        provider: "mock",
        providerPreferences: { mock: { mode: "load-test" } },
      }),
    );
  });
  await gotoWorkspace(page, workspaceId);
  await clickNewChat(page);
  await expectComposerVisible(page);
  await expect(composerLocator(page)).toHaveValue("");
}

test.describe("Voice mode in a new chat", () => {
  test.describe.configure({ timeout: 180_000 });

  test("starts voice mode on the agent the tap creates, with no first message", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "new-chat-voice-" });
    await installSyntheticMicrophone(page);
    const harness = await installVoiceModeHarness(page);
    try {
      await openNewMockChat(page, workspace.workspaceId);
      expect((await workspace.client.fetchAgents()).entries).toHaveLength(0);

      await page.getByRole("button", { name: VOICE_MODE, exact: true }).click();
      const agentId = await harness.waitForFirstEnable();

      const agents = (await workspace.client.fetchAgents()).entries;
      expect(agents.map((entry) => entry.agent.id)).toEqual([agentId]);
      await expect(
        page.getByTestId(`workspace-tab-agent_${agentId}`).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: STOP_VOICE })).toBeVisible();
      expect(harness.enabledAgentIds).toEqual([agentId]);
    } finally {
      await workspace.cleanup();
    }
  });

  test("a failed create keeps the new chat and its voice button", async ({ page }) => {
    const workspace = await seedWorkspace({ repoPrefix: "new-chat-voice-create-fail-" });
    await installSyntheticMicrophone(page);
    const harness = await installVoiceModeHarness(page, {
      createAgent: "Synthetic agent creation failure",
    });
    try {
      await openNewMockChat(page, workspace.workspaceId);

      await page.getByRole("button", { name: VOICE_MODE, exact: true }).click();

      await expect(page.getByText("Synthetic agent creation failure")).toBeVisible();
      await expect(page.getByRole("button", { name: VOICE_MODE, exact: true })).toBeVisible();
      expect(harness.enabledAgentIds).toEqual([]);
    } finally {
      await workspace.cleanup();
    }
  });

  test("a failed voice start leaves the created chat ready to retry", async ({ page }) => {
    const workspace = await seedWorkspace({ repoPrefix: "new-chat-voice-start-fail-" });
    await installSyntheticMicrophone(page);
    const harness = await installVoiceModeHarness(page, {
      startVoice: "Synthetic voice start failure",
    });
    try {
      await openNewMockChat(page, workspace.workspaceId);

      await page.getByRole("button", { name: VOICE_MODE, exact: true }).click();
      const agentId = await harness.waitForFirstEnable();

      await expect(page.getByText("Synthetic voice start failure")).toBeVisible();
      await expect(
        page.getByTestId(`workspace-tab-agent_${agentId}`).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: VOICE_MODE, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: STOP_VOICE })).toHaveCount(0);
    } finally {
      await workspace.cleanup();
    }
  });

  test("the new-workspace screen offers no voice mode, by button or shortcut", async ({ page }) => {
    const workspace = await seedWorkspace({ repoPrefix: "new-workspace-voice-" });
    await installSyntheticMicrophone(page);
    const harness = await installVoiceModeHarness(page);
    try {
      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await openNewWorkspaceComposer(page, {
        projectKey: workspace.projectKey,
        projectDisplayName: workspace.projectDisplayName,
      });
      const composer = page.getByRole("textbox", { name: "Message agent..." });
      await expect(composer).toBeVisible();
      await expect(page.getByRole("button", { name: VOICE_MODE, exact: true })).toHaveCount(0);

      await composer.focus();
      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      await page.waitForTimeout(1_000);
      expect(harness.enabledAgentIds).toEqual([]);
    } finally {
      await workspace.cleanup();
    }
  });
});
