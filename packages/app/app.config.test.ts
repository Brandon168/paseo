import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

// Load the copies the Expo CLI uses for prebuild, not older hoisted ones.
const requireFromExpo = createRequire(require.resolve("expo/package.json"));
const requireFromExpoCli = createRequire(requireFromExpo.resolve("@expo/cli/package.json"));
const { getPrebuildConfigAsync } = requireFromExpoCli("@expo/prebuild-config");
const { compileModsAsync } = requireFromExpoCli(
  "@expo/config-plugins/build/plugins/mod-compiler.js",
);

interface ManifestEntry {
  $: Record<string, string>;
}

const originalFdroidFlag = process.env.PASEO_FDROID_BUILD;

async function resolveAndroidManifest() {
  const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
  await compileModsAsync(exp, {
    projectRoot: __dirname,
    introspect: true,
    platforms: ["android"],
    assertMissingModProviders: false,
  });
  return exp._internal.modResults.android.manifest.manifest;
}

describe("Android app config", () => {
  afterEach(() => {
    if (originalFdroidFlag === undefined) {
      delete process.env.PASEO_FDROID_BUILD;
    } else {
      process.env.PASEO_FDROID_BUILD = originalFdroidFlag;
    }
  });

  it.each([
    ["Google Play", "0"],
    ["F-Droid", "1"],
  ])(
    "%s build installs on devices without a camera",
    async (_build, fdroidFlag) => {
      process.env.PASEO_FDROID_BUILD = fdroidFlag;
      const manifest = await resolveAndroidManifest();
      const permissions = (manifest["uses-permission"] ?? []).map(
        (entry: ManifestEntry) => entry.$["android:name"],
      );
      const features = (manifest["uses-feature"] ?? []).map((entry: ManifestEntry) => entry.$);

      expect(permissions).toContain("android.permission.CAMERA");
      expect(features).toEqual(
        expect.arrayContaining([
          { "android:name": "android.hardware.camera", "android:required": "false" },
          { "android:name": "android.hardware.camera.autofocus", "android:required": "false" },
        ]),
      );
    },
    30_000,
  );
});

it("follows system rotation on Android", async () => {
  const manifest = await resolveAndroidManifest();
  const activity = manifest.application[0].activity.find(
    (entry: ManifestEntry) => entry.$["android:name"] === ".MainActivity",
  );
  expect(activity.$["android:screenOrientation"]).toBe("unspecified");
}, 30_000);

it("allows all orientations on iPhone and iPad", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "paseo-ios-config-"));
  try {
    const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["ios"] });
    await compileModsAsync(exp, {
      projectRoot: root,
      introspect: true,
      platforms: ["ios"],
      assertMissingModProviders: false,
    });
    const plist = exp._internal.modResults.ios.infoPlist;
    const orientations = [
      "UIInterfaceOrientationPortrait",
      "UIInterfaceOrientationPortraitUpsideDown",
      "UIInterfaceOrientationLandscapeLeft",
      "UIInterfaceOrientationLandscapeRight",
    ];
    expect(plist.UISupportedInterfaceOrientations).toEqual(orientations);
    expect(plist["UISupportedInterfaceOrientations~ipad"]).toEqual(orientations);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

describe("home screen quick actions", () => {
  const quickActions = require("./plugins/with-android-quick-actions");

  it("writes a New Workspace shortcut that opens the app's paseo:// link", () => {
    const xml = quickActions.buildShortcutsXml("sh.paseo");
    expect(xml).toContain('android:shortcutId="new-workspace"');
    expect(xml).toContain('android:shortcutShortLabel="New Workspace"');
    expect(xml).toContain('android:action="android.intent.action.VIEW"');
    expect(xml).toContain('android:data="paseo://new"');
    expect(xml).toContain('android:targetClass="sh.paseo.MainActivity"');
  });

  it("writes a Voice chat shortcut that opens the New Workspace link with voice on", () => {
    const xml = quickActions.buildShortcutsXml("sh.paseo");
    expect(xml).toContain('android:shortcutId="voice-chat"');
    expect(xml).toContain('android:shortcutShortLabel="Voice chat"');
    expect(xml).toContain('android:data="paseo://new?voice=1"');
    expect(xml.match(/<shortcut\b/g)).toHaveLength(2);
  });

  it("targets the package it is built for, so the debug build opens its own activity", () => {
    const xml = quickActions.buildShortcutsXml("sh.paseo.debug");
    expect(xml).toContain('android:targetPackage="sh.paseo.debug"');
    expect(xml).toContain('android:targetClass="sh.paseo.debug.MainActivity"');
  });

  it("declares the shortcuts resource on the launcher activity once", () => {
    interface ActivityEntry {
      $: Record<string, string>;
      "meta-data"?: ManifestEntry[];
    }
    const manifest: { manifest: { application: { activity: ActivityEntry[] }[] } } = {
      manifest: {
        application: [
          {
            activity: [
              { $: { "android:name": ".OtherActivity" } },
              { $: { "android:name": ".MainActivity" } },
            ],
          },
        ],
      },
    };
    quickActions.addShortcutsMetaData(manifest);
    quickActions.addShortcutsMetaData(manifest);
    const [other, launcher] = manifest.manifest.application[0].activity;
    expect(launcher["meta-data"]).toEqual([
      { $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/shortcuts" } },
    ]);
    expect(other["meta-data"]).toBeUndefined();
  });

  it("fails loudly when the launcher activity is missing", () => {
    expect(() =>
      quickActions.addShortcutsMetaData({ manifest: { application: [{ activity: [] }] } }),
    ).toThrow(/launcher activity/);
  });

  it("offers New Workspace from the Android launcher icon and opens the paseo:// link", async () => {
    const manifest = await resolveAndroidManifest();
    const launcher = manifest.application[0].activity.find(
      (entry: ManifestEntry) => entry.$["android:name"] === ".MainActivity",
    );
    expect(launcher["meta-data"]).toEqual(
      expect.arrayContaining([
        { $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/shortcuts" } },
      ]),
    );
    const schemes = (launcher["intent-filter"] ?? [])
      .flatMap((filter: { data?: ManifestEntry[] }) => filter.data ?? [])
      .map((data: ManifestEntry) => data.$["android:scheme"]);
    expect(schemes).toContain("paseo");
  }, 30_000);

  it("offers New Workspace and Voice chat from the iPhone app icon", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "paseo-ios-quick-actions-"));
    try {
      const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["ios"] });
      await compileModsAsync(exp, {
        projectRoot: root,
        introspect: true,
        platforms: ["ios"],
        assertMissingModProviders: false,
      });
      const plist = exp._internal.modResults.ios.infoPlist;
      expect(plist.UIApplicationShortcutItems).toEqual([
        {
          UIApplicationShortcutItemType: "new-workspace",
          UIApplicationShortcutItemTitle: "New Workspace",
          UIApplicationShortcutItemIconSymbolName: "plus",
        },
        {
          UIApplicationShortcutItemType: "voice-chat",
          UIApplicationShortcutItemTitle: "Voice chat",
          UIApplicationShortcutItemIconSymbolName: "mic.fill",
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});

// Scene startup is the integration boundary for the iOS keyboard window.
describe("hardware keyboard scene integration", () => {
  it("installs observation after Expo creates the scene window and is idempotent", () => {
    const {
      configureHardwareKeyboardAppDelegate,
    } = require("./modules/paseo-hardware-keyboard/app.plugin.js");
    const source =
      "import Expo\nclass Scene {\n  super.scene(scene, willConnectTo: session, options: connectionOptions)\n}\n";
    const configured = configureHardwareKeyboardAppDelegate(source);
    expect(configured).toContain("import PaseoHardwareKeyboard");
    expect(configured).toContain("PaseoHardwareKeyboardWindow.observing(window)");
    expect(configured.indexOf("super.scene")).toBeLessThan(
      configured.indexOf(".observing(window)"),
    );
    expect(configureHardwareKeyboardAppDelegate(configured)).toBe(configured);
  });
});
