import { expect, test, type Page } from "../support/fixtures";
import { seedModelProvider } from "../support/helpers/agent-profiles";
import { gotoAppShell } from "../support/helpers/app";
import { expectComposerVisible } from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { getServerId } from "../support/helpers/server-id";
import { expectProviderPageLoaded, gotoProviderPage } from "../support/helpers/settings";

async function openModelSelector(page: Page) {
  await page.getByRole("button", { name: /Select model/ }).click();
  const selector = page.getByTestId("combobox-desktop-container");
  await expect(selector).toBeVisible({ timeout: 10_000 });
  return selector;
}

async function expectSwitchesInsideRows(page: Page) {
  // Desktop shows a dialog, phone widths a bottom sheet: look for the rows on the page.
  const rows = page.locator('[data-testid^="provider-model-row-"]:visible');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const rowId = (await row.getAttribute("data-testid")) ?? "";
    const modelId = rowId.replace("provider-model-row-", "");
    const rowBox = await row.boundingBox();
    const switchBox = await row.getByTestId(`provider-model-visible-${modelId}`).boundingBox();
    expect(rowBox, `row ${modelId} has a box`).not.toBeNull();
    expect(switchBox, `switch ${modelId} has a box`).not.toBeNull();
    // A long model name or id must not push the switch past the row's right edge.
    expect(switchBox!.x + switchBox!.width, `switch ${modelId} right edge`).toBeLessThanOrEqual(
      rowBox!.x + rowBox!.width + 0.5,
    );
    expect(switchBox!.width, `switch ${modelId} keeps its width`).toBeGreaterThan(24);
  }
}

test.describe("provider model visibility", () => {
  test("hiding a model removes it from the picker, and Show all brings it back", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const session = await seedMockAgentWorkspace({
      repoPrefix: "provider-model-visibility-",
      title: "Provider model visibility e2e",
    });

    try {
      await openAgentRoute(page, session);
      await expectComposerVisible(page);

      const selector = await openModelSelector(page);
      await expect(selector.getByText("One minute stream", { exact: true })).toBeVisible();

      await page.getByTestId("selector-header-settings-mock").click();
      const settings = page.getByTestId("provider-settings-sheet");
      await expect(settings).toBeVisible({ timeout: 10_000 });

      const toggle = settings.getByTestId("provider-model-visible-one-minute-stream");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });
      await expect(settings.getByText("1 hidden", { exact: true })).toBeVisible({
        timeout: 10_000,
      });

      await page.keyboard.press("Escape");
      await expect(settings).not.toBeVisible({ timeout: 10_000 });
      await expect(selector.getByText("One minute stream", { exact: true })).not.toBeVisible({
        timeout: 30_000,
      });
      await expect(selector.getByText("Ten second stream", { exact: true })).toBeVisible();

      await page.getByTestId("selector-header-settings-mock").click();
      await expect(settings).toBeVisible({ timeout: 10_000 });
      // The hidden model stays listed in settings so it can be shown again.
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await settings.getByTestId("provider-models-show-all").click();
      await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });

      await page.keyboard.press("Escape");
      await expect(settings).not.toBeVisible({ timeout: 10_000 });
      await expect(selector.getByText("One minute stream", { exact: true })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await session.cleanup();
    }
  });

  test("filters by enabled state and scopes search and bulk actions to the listed models", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const provider = await seedModelProvider({
      id: "visibility-filter-provider",
      label: "Visibility filter provider",
      models: [
        { id: "alpha", label: "Alpha", description: "Enabled model" },
        { id: "beta", label: "Beta", description: "Model hidden through a filtered bulk action" },
        { id: "gamma", label: "Gamma", description: "Initially disabled model" },
      ],
    });

    try {
      await gotoAppShell(page);
      await gotoProviderPage(page, getServerId(), "visibility-filter-provider");
      await expectProviderPageLoaded(page, "Visibility filter provider");
      const models = page.getByTestId("provider-models");
      const gammaToggle = models.getByTestId("provider-model-visible-gamma");
      await gammaToggle.click();
      await expect(gammaToggle).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });

      await models.getByTestId("provider-models-filter-enabled").click();
      await expect(models.getByTestId("provider-model-row-alpha")).toBeVisible();
      await expect(models.getByTestId("provider-model-row-beta")).toBeVisible();
      await expect(models.getByTestId("provider-model-row-gamma")).toHaveCount(0);

      await models.getByTestId("provider-settings-search").fill("beta");
      await expect(models.getByTestId("provider-model-row-alpha")).toHaveCount(0);
      await expect(models.getByTestId("provider-model-row-beta")).toBeVisible();
      await models.getByTestId("provider-models-hide-all").click();
      await expect(models.getByTestId("provider-model-row-beta")).toHaveCount(0, {
        timeout: 10_000,
      });

      await models.getByTestId("provider-settings-search").fill("");
      await expect(models.getByTestId("provider-model-row-alpha")).toBeVisible();
      await models.getByTestId("provider-models-filter-disabled").click();
      await expect(models.getByTestId("provider-model-row-alpha")).toHaveCount(0);
      await expect(models.getByTestId("provider-model-row-beta")).toBeVisible();
      await expect(models.getByTestId("provider-model-row-gamma")).toBeVisible();

      await models.getByTestId("provider-models-show-all").click();
      await expect(models.getByTestId("provider-model-row-beta")).toHaveCount(0, {
        timeout: 10_000,
      });
      await expect(models.getByTestId("provider-model-row-gamma")).toHaveCount(0);
      await models.getByTestId("provider-models-filter-all").click();
      await expect(models.getByTestId("provider-model-visible-alpha")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(models.getByTestId("provider-model-visible-beta")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(models.getByTestId("provider-model-visible-gamma")).toHaveAttribute(
        "aria-checked",
        "true",
      );
    } finally {
      await provider.restore();
    }
  });

  test("a long model name and id keep the switch inside its row at phone width", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const providerId = "long-model-provider";
    const provider = await seedModelProvider({
      id: providerId,
      label: "Long model provider",
      models: [
        {
          id: "vercel-brandon-pro/zai/glm-5.3-flashx-with-an-intentionally-long-route",
          label: "GLM 5.3 FlashX Legal with an intentionally long model name",
          description: "Regression fixture for the provider model row layout",
        },
      ],
    });

    try {
      await gotoAppShell(page);
      await gotoProviderPage(page, getServerId(), providerId);
      await expectProviderPageLoaded(page, "Long model provider");
      await expectSwitchesInsideRows(page);

      await page.setViewportSize({ width: 360, height: 800 });
      await expectSwitchesInsideRows(page);
    } finally {
      await provider.restore();
    }
  });

  test("filters models by route, drops scattered subsequence matches, and searches globally from Providers", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const providerId = "routed-search-provider";
    const provider = await seedModelProvider({
      id: providerId,
      label: "Routed search provider",
      models: [
        {
          id: "vercel-brandon-pro/google/gemini-4-neon",
          label: "Gemini 4 Neon",
          description: "Vercel route neon model",
        },
        {
          id: "venice/aion-labs-aion-3-5",
          label: "Aion 3.5",
          description: "Venice route model",
        },
        {
          id: "claude-agent/claude-sonnet-5",
          label: "Sonnet 5",
          description: "Claude agent route model",
        },
      ],
    });

    try {
      await gotoAppShell(page);
      await page.goto(`/settings/hosts/${encodeURIComponent(getServerId())}/providers`);
      await expect(page.getByTestId("provider-list")).toBeVisible({ timeout: 30_000 });

      await test.step("global search on Providers matches across providers without scattered subsequences", async () => {
        await page.getByTestId("providers-global-search").fill("neon");
        const results = page.getByTestId("providers-global-model-results");
        await expect(
          results.getByTestId(
            `providers-global-model-row-${providerId}-vercel-brandon-pro/google/gemini-4-neon`,
          ),
        ).toBeVisible();
        await expect(
          results.getByTestId(`providers-global-model-row-${providerId}-venice/aion-labs-aion-3-5`),
        ).toHaveCount(0);
        await expect(
          results.getByTestId(
            `providers-global-model-row-${providerId}-claude-agent/claude-sonnet-5`,
          ),
        ).toHaveCount(0);

        await page.getByTestId("providers-global-search").fill("stream");
        await expect(
          results.getByTestId("providers-global-model-row-mock-one-minute-stream"),
        ).toBeVisible();
      });

      await test.step("global visibility filter toggles and reflects across providers", async () => {
        await page.getByTestId("providers-global-search").fill("aion");
        const aionSwitch = page.getByTestId(
          `providers-global-model-visible-${providerId}-venice/aion-labs-aion-3-5`,
        );
        await aionSwitch.click();
        await expect(aionSwitch).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });

        await page.getByTestId("providers-global-search").fill("");
        await page.getByTestId("providers-models-filter-disabled").click();
        await expect(
          page.getByTestId(`providers-global-model-row-${providerId}-venice/aion-labs-aion-3-5`),
        ).toBeVisible();

        await page.getByTestId("providers-models-show-all").click();
        await expect(
          page.getByTestId(`providers-global-model-row-${providerId}-venice/aion-labs-aion-3-5`),
        ).toHaveCount(0, { timeout: 10_000 });
        await page.getByTestId("providers-models-filter-all").click();
        await expect(page.getByTestId("provider-list")).toBeVisible();
      });

      await test.step("clicking a global result opens that provider, where route filter and back work", async () => {
        await page.getByTestId("providers-global-search").fill("neon");
        await page
          .getByTestId("providers-global-model-results")
          .getByRole("button", { name: "Open Routed search provider for Gemini 4 Neon" })
          .click();
        await expectProviderPageLoaded(page, "Routed search provider");

        const models = page.getByTestId("provider-models");
        await models.getByTestId("provider-settings-search").fill("neon");
        await expect(
          models.getByTestId("provider-model-row-vercel-brandon-pro/google/gemini-4-neon"),
        ).toBeVisible();
        await expect(
          models.getByTestId("provider-model-row-venice/aion-labs-aion-3-5"),
        ).toHaveCount(0);

        await models.getByTestId("provider-settings-search").fill("");
        await models.getByTestId("provider-models-route-filter").click();
        await page.getByRole("menuitem", { name: "venice", exact: true }).click();
        await expect(
          models.getByTestId("provider-model-row-venice/aion-labs-aion-3-5"),
        ).toBeVisible();
        await expect(
          models.getByTestId("provider-model-row-vercel-brandon-pro/google/gemini-4-neon"),
        ).toHaveCount(0);

        await page.getByTestId("provider-detail-back").click();
        await expect(page.getByTestId("providers-global-model-results")).toBeVisible();
        await page.getByRole("button", { name: "Clear search" }).click();
        await expect(page.getByTestId("provider-list")).toBeVisible();
      });
    } finally {
      await provider.restore();
    }
  });
});
