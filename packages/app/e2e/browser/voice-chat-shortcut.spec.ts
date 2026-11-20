import { expect, test } from "../support/fixtures";
import { seedAgentProfiles } from "../support/helpers/agent-profiles";
import { expectComposerVisible } from "../support/helpers/composer";
import { seedWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";
import {
  STOP_VOICE,
  installSyntheticMicrophone,
  installVoiceModeHarness,
  preferMockAgent,
} from "../support/helpers/voice-mode";

const VOICE_PROFILE = {
  id: "agent_profile_e2e_voice",
  name: "Voice",
  provider: "mock",
  model: "one-minute-stream",
  modeId: "approval-test",
};

test.describe("Voice chat shortcut (/new?voice=1)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("starts voice mode on a new agent in the project the setting names, with the Voice profile", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "voice-chat-shortcut-" });
    const profiles = await seedAgentProfiles([VOICE_PROFILE]);
    await preferMockAgent(page);
    await installSyntheticMicrophone(page);
    const serverId = getServerId();
    await page.addInitScript(
      ({ voiceChat }) => {
        localStorage.setItem("@paseo:app-settings", JSON.stringify({ voiceChat }));
      },
      {
        voiceChat: {
          project: {
            serverId,
            projectId: workspace.projectId,
            sourceDirectory: workspace.repoPath,
            displayName: workspace.projectDisplayName,
          },
          profileId: null,
        },
      },
    );
    const harness = await installVoiceModeHarness(page);
    try {
      await page.goto("/new?voice=1");
      const agentId = await harness.waitForFirstEnable();

      const agents = (await workspace.client.fetchAgents()).entries;
      expect(agents.map((entry) => entry.agent.id)).toEqual([agentId]);
      expect(agents[0]?.agent.cwd).toBe(workspace.repoPath);
      expect(agents[0]?.agent.model).toBe(VOICE_PROFILE.model);
      expect(agents[0]?.agent.currentModeId).toBe(VOICE_PROFILE.modeId);
      await expect(page.getByRole("button", { name: STOP_VOICE })).toBeVisible({
        timeout: 30_000,
      });
      expect(harness.enabledAgentIds).toEqual([agentId]);
    } finally {
      await profiles.restore();
      await workspace.cleanup();
    }
  });

  test("a link that names its own project and profile wins over the setting", async ({ page }) => {
    const workspace = await seedWorkspace({ repoPrefix: "voice-chat-link-" });
    const profiles = await seedAgentProfiles([VOICE_PROFILE]);
    await preferMockAgent(page);
    await installSyntheticMicrophone(page);
    const harness = await installVoiceModeHarness(page);
    try {
      const query = new URLSearchParams({
        voice: "1",
        serverId: getServerId(),
        projectId: workspace.projectId,
        dir: workspace.repoPath,
        name: workspace.projectDisplayName,
        profile: "voice",
      });
      await page.goto(`/new?${query.toString()}`);
      const agentId = await harness.waitForFirstEnable();

      const agents = (await workspace.client.fetchAgents()).entries;
      expect(agents.map((entry) => entry.agent.id)).toEqual([agentId]);
      expect(agents[0]?.agent.cwd).toBe(workspace.repoPath);
      expect(agents[0]?.agent.model).toBe(VOICE_PROFILE.model);
    } finally {
      await profiles.restore();
      await workspace.cleanup();
    }
  });

  test("the plain /new route stays on the new-chat screen and starts nothing", async ({ page }) => {
    const workspace = await seedWorkspace({ repoPrefix: "voice-chat-plain-" });
    const profiles = await seedAgentProfiles([VOICE_PROFILE]);
    await preferMockAgent(page);
    await installSyntheticMicrophone(page);
    const harness = await installVoiceModeHarness(page);
    try {
      const query = new URLSearchParams({
        serverId: getServerId(),
        projectId: workspace.projectId,
        dir: workspace.repoPath,
        name: workspace.projectDisplayName,
      });
      await page.goto(`/new?${query.toString()}`);
      await expectComposerVisible(page);
      await page.waitForTimeout(3_000);

      expect(harness.enabledAgentIds).toEqual([]);
      expect((await workspace.client.fetchAgents()).entries).toHaveLength(0);
      await expect(page.getByRole("button", { name: STOP_VOICE })).toHaveCount(0);
    } finally {
      await profiles.restore();
      await workspace.cleanup();
    }
  });
});

test.describe("Voice chat shortcut on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.describe.configure({ timeout: 180_000 });

  test("the model picker stays one tap away while listening, and a profile switch keeps voice on", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "voice-chat-phone-" });
    const profiles = await seedAgentProfiles([
      VOICE_PROFILE,
      { ...VOICE_PROFILE, id: "agent_profile_e2e_deep", name: "Deep", model: "ten-second-stream" },
    ]);
    await preferMockAgent(page);
    await installSyntheticMicrophone(page);
    const harness = await installVoiceModeHarness(page);
    try {
      const query = new URLSearchParams({
        voice: "1",
        serverId: getServerId(),
        projectId: workspace.projectId,
        dir: workspace.repoPath,
        name: workspace.projectDisplayName,
      });
      await page.goto(`/new?${query.toString()}`);
      await harness.waitForFirstEnable();
      await expect(page.getByRole("button", { name: STOP_VOICE })).toBeVisible({
        timeout: 30_000,
      });

      // A real tap: it fails if voice mode covers the control or turns off its pointer events.
      const modelControl = page.getByTestId("combined-model-selector").filter({ visible: true });
      await expect(modelControl.first()).toHaveAttribute(
        "aria-label",
        "Select model (One minute stream)",
      );
      await modelControl.first().click();
      await page.getByText("Deep", { exact: true }).first().click();

      await expect(modelControl.first()).toHaveAttribute(
        "aria-label",
        "Select model (Ten second stream)",
        {
          timeout: 30_000,
        },
      );
      await expect(page.getByRole("button", { name: STOP_VOICE })).toBeVisible();
      expect(harness.enabledAgentIds).toHaveLength(1);
    } finally {
      await profiles.restore();
      await workspace.cleanup();
    }
  });
});
