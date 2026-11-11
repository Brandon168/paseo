import { expect, test, type Page } from "../support/fixtures";
import { expectComposerVisible } from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

async function openModelSelector(page: Page) {
  await page.getByRole("button", { name: /Select model/ }).click();
  const selector = page.getByTestId("combobox-desktop-container");
  await expect(selector).toBeVisible({ timeout: 10_000 });
  return selector;
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
});
