import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsSection, SettingsSelect } from "@/components/settings";
import { useAgentProfiles } from "@/agent-profiles";
import { useAppSettings } from "@/hooks/use-settings";
import { useHostProjects } from "@/projects/host-projects";
import { useHosts } from "@/runtime/host-runtime";
import {
  VOICE_CHAT_PROFILE_NAME,
  buildVoiceChatProjectChoices,
  voiceChatProjectKey,
} from "@/voice-chat/model";

/** The select value for "no choice made": the project and profile fall back to their defaults. */
const DEFAULT_CHOICE = "";

/** Where the "Voice chat" app icon shortcut (and `paseo://new?voice=1`) starts. */
export function VoiceChatSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const hosts = useHosts();
  const serverIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const projects = useHostProjects(serverIds);
  const { voiceChat } = settings;

  const choices = useMemo(
    () =>
      buildVoiceChatProjectChoices(
        projects,
        new Map(hosts.map((host) => [host.serverId, host.label])),
      ),
    [hosts, projects],
  );
  const projectOptions = useMemo(
    () => [
      { value: DEFAULT_CHOICE, label: t("settings.general.voiceChat.projectDefault") },
      ...choices.map((choice) => ({ value: choice.key, label: choice.label })),
    ],
    [choices, t],
  );
  const storedProjectKey = voiceChat.project
    ? voiceChatProjectKey(voiceChat.project.serverId, voiceChat.project.projectId)
    : DEFAULT_CHOICE;
  // A project that is gone from the host shows as the default rather than as its raw key.
  const selectedProjectKey = projectOptions.some((option) => option.value === storedProjectKey)
    ? storedProjectKey
    : DEFAULT_CHOICE;
  const changeProject = useCallback(
    (key: string) => {
      const project = choices.find((choice) => choice.key === key)?.project ?? null;
      void updateSettings({ voiceChat: { ...voiceChat, project } });
    },
    [choices, updateSettings, voiceChat],
  );

  // Profiles are host config, so the list comes from the host the project lives on.
  const profileServerId = voiceChat.project?.serverId ?? serverIds[0] ?? null;
  const { profiles, isSupported } = useAgentProfiles(profileServerId);
  const profileOptions = useMemo(
    () => [
      {
        value: DEFAULT_CHOICE,
        label: t("settings.general.voiceChat.profileDefault", { name: VOICE_CHAT_PROFILE_NAME }),
      },
      ...(profiles ?? []).map((profile) => ({ value: profile.id, label: profile.name })),
    ],
    [profiles, t],
  );
  const changeProfile = useCallback(
    (profileId: string) => {
      void updateSettings({
        voiceChat: { ...voiceChat, profileId: profileId === DEFAULT_CHOICE ? null : profileId },
      });
    },
    [updateSettings, voiceChat],
  );

  return (
    <SettingsSection title={t("settings.general.voiceChat.title")}>
      <SettingsCard>
        <SettingsSelect
          label={t("settings.general.voiceChat.project")}
          hint={t("settings.general.voiceChat.projectHint")}
          value={selectedProjectKey}
          options={projectOptions}
          onValueChange={changeProject}
        />
        {isSupported ? (
          <SettingsSelect
            label={t("settings.general.voiceChat.profile")}
            hint={t("settings.general.voiceChat.profileHint")}
            value={voiceChat.profileId ?? DEFAULT_CHOICE}
            options={profileOptions}
            onValueChange={changeProfile}
          />
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
}
