const fs = require("node:fs");
const path = require("node:path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const SHORTCUTS_RESOURCE = "shortcuts";
const SHORTCUTS_META_NAME = "android.app.shortcuts";
const LAUNCHER_ACTIVITY = ".MainActivity";
const SHORTCUTS = [
  { id: "new-workspace", label: "New Workspace", url: "paseo://new" },
  { id: "voice-chat", label: "Voice chat", url: "paseo://new?voice=1" },
];

/**
 * Static launcher shortcuts: long-pressing the app icon offers "New Workspace" and "Voice chat",
 * which open the deep links the app already routes (`paseo://new` → the New Workspace screen,
 * `paseo://new?voice=1` → the same screen starting voice mode).
 */
function buildShortcutXml(packageName, shortcut) {
  return `  <shortcut
    android:shortcutId="${shortcut.id}"
    android:enabled="true"
    android:shortcutShortLabel="${shortcut.label}"
    android:shortcutLongLabel="${shortcut.label}">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="${shortcut.url}"
      android:targetPackage="${packageName}"
      android:targetClass="${packageName}${LAUNCHER_ACTIVITY}" />
  </shortcut>`;
}

function buildShortcutsXml(packageName) {
  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${SHORTCUTS.map((shortcut) => buildShortcutXml(packageName, shortcut)).join("\n")}
</shortcuts>
`;
}

function addShortcutsMetaData(manifest) {
  const application = manifest.manifest.application?.[0];
  const activity = application?.activity?.find(
    (entry) => entry.$?.["android:name"] === LAUNCHER_ACTIVITY,
  );
  if (!activity) {
    throw new Error(
      `Quick actions need the launcher activity ${LAUNCHER_ACTIVITY} in the manifest`,
    );
  }
  activity["meta-data"] = activity["meta-data"] ?? [];
  const alreadyDeclared = activity["meta-data"].some(
    (entry) => entry.$?.["android:name"] === SHORTCUTS_META_NAME,
  );
  if (!alreadyDeclared) {
    activity["meta-data"].push({
      $: { "android:name": SHORTCUTS_META_NAME, "android:resource": `@xml/${SHORTCUTS_RESOURCE}` },
    });
  }
  return manifest;
}

function withAndroidQuickActions(config) {
  const packageName = config.android?.package;
  if (!packageName) {
    throw new Error("Quick actions need android.package in the app config");
  }

  const withManifest = withAndroidManifest(config, (modConfig) => {
    addShortcutsMetaData(modConfig.modResults);
    return modConfig;
  });

  return withDangerousMod(withManifest, [
    "android",
    async (modConfig) => {
      const xmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(xmlDir, `${SHORTCUTS_RESOURCE}.xml`),
        buildShortcutsXml(packageName),
      );
      return modConfig;
    },
  ]);
}

module.exports = withAndroidQuickActions;
module.exports.buildShortcutsXml = buildShortcutsXml;
module.exports.addShortcutsMetaData = addShortcutsMetaData;
