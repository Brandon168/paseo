import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { composerLocator, expectComposerVisible } from "../support/helpers/composer";
import { clickNewChat, gotoWorkspace } from "../support/helpers/launcher";
import {
  openNewWorkspaceComposer,
  selectWorkspaceIsolation,
} from "../support/helpers/new-workspace";
import { seedWorkspace } from "../support/helpers/seed-client";
import {
  STOP_VOICE,
  VOICE_MODE,
  installSyntheticMicrophone,
  installVoiceModeHarness,
  preferMockAgent,
} from "../support/helpers/voice-mode";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";

async function openNewWorkspaceWithMockAgent(
  page: Page,
  workspace: { projectKey: string; projectDisplayName: string },
): Promise<void> {
  await preferMockAgent(page);
  await gotoAppShell(page);
  await waitForSidebarHydration(page);
  await openNewWorkspaceComposer(page, {
    projectKey: workspace.projectKey,
    projectDisplayName: workspace.projectDisplayName,
  });
  await selectWorkspaceIsolation(page, "local");
}

async function openNewMockChat(page: Page, workspaceId: string): Promise<void> {
  await preferMockAgent(page);
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

  test("New workspace starts voice mode on the workspace and agent the tap creates", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "new-workspace-voice-" });
    await installSyntheticMicrophone(page);
    const harness = await installVoiceModeHarness(page);
    try {
      await openNewWorkspaceWithMockAgent(page, workspace);
      const composer = page.getByRole("textbox", { name: "Message agent..." });
      const voiceMode = page.getByRole("button", { name: VOICE_MODE, exact: true });
      await expect(voiceMode).toBeVisible();
      await expect(page.getByTestId("workspace-create-submit")).toBeVisible();

      await composer.fill("x");
      await expect(voiceMode).toHaveCount(0);
      await composer.fill("");
      await expect(voiceMode).toBeVisible();

      await voiceMode.click();
      const agentId = await harness.waitForFirstEnable();

      const agents = (await workspace.client.fetchAgents()).entries;
      expect(agents.map((entry) => entry.agent.id)).toEqual([agentId]);
      expect(agents[0]?.agent.workspaceId).not.toBe(workspace.workspaceId);
      await expect(
        page.getByTestId(`workspace-tab-agent_${agentId}`).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: STOP_VOICE })).toBeVisible();
      expect(harness.enabledAgentIds).toEqual([agentId]);
    } finally {
      await workspace.cleanup();
    }
  });

  test("the voice shortcut on New workspace targets the created agent, never a placeholder", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "new-workspace-voice-shortcut-" });
    await installSyntheticMicrophone(page);
    const harness = await installVoiceModeHarness(page);
    try {
      await openNewWorkspaceWithMockAgent(page, workspace);
      const composer = page.getByRole("textbox", { name: "Message agent..." });
      await composer.focus();
      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      const agentId = await harness.waitForFirstEnable();

      const agents = (await workspace.client.fetchAgents()).entries;
      expect(agents.map((entry) => entry.agent.id)).toEqual([agentId]);
      expect(harness.enabledAgentIds).toEqual([agentId]);
    } finally {
      await workspace.cleanup();
    }
  });
});
