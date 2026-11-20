import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import {
  ComposerEditingScope,
  WorkspaceComposerEditingSessionsProvider,
} from "@/composer/editing-session";
import { NewWorkspaceScreen } from "@/screens/new-workspace-screen";
import { useAppSettings } from "@/hooks/use-settings";
import { buildNewWorkspaceDraftKey } from "@/stores/draft-keys";
import { resolveVoiceChatParams } from "@/voice-chat/model";

/** New workspace drafts share one editing-session home, keyed like a tab by draft. */
const NEW_WORKSPACE_SESSIONS_KEY = "new-workspace";

export default function NewWorkspaceRoute() {
  const params = useLocalSearchParams<{
    serverId?: string;
    dir?: string;
    name?: string;
    projectId?: string;
    draftId?: string;
    voice?: string;
    profile?: string;
  }>();
  const startVoice = params.voice === "1" || params.voice === "true";
  const { settings: appSettings, isLoading: appSettingsLoading } = useAppSettings();
  // A voice chat starts where the device setting says, unless the link names its own project.
  const resolved = resolveVoiceChatParams(
    {
      serverId: typeof params.serverId === "string" ? params.serverId : "",
      sourceDirectory: typeof params.dir === "string" ? params.dir : undefined,
      displayName: typeof params.name === "string" ? params.name : undefined,
      projectId: typeof params.projectId === "string" ? params.projectId : undefined,
      profile: typeof params.profile === "string" ? params.profile : undefined,
    },
    startVoice ? appSettings.voiceChat : { project: null, profileId: null },
  );
  const { serverId, sourceDirectory, displayName, projectId } = resolved;
  const voiceProfile = startVoice ? resolved.profile : undefined;
  const draftId = typeof params.draftId === "string" ? params.draftId : undefined;
  const screenKey = JSON.stringify([
    serverId,
    sourceDirectory ?? null,
    displayName ?? null,
    projectId ?? null,
    draftId ?? null,
    startVoice,
    voiceProfile ?? null,
  ]);

  // The shell remounts this route when the viewport crosses the compact breakpoint;
  // the draft's editing session (fullscreen, retained caret) lives above the shell.
  const draftKey = buildNewWorkspaceDraftKey(draftId);
  const sessionTabIds = useMemo(() => [draftKey], [draftKey]);

  // The setting decides the project, so a voice chat waits for it rather than opening on the
  // default project and remounting.
  if (startVoice && appSettingsLoading) return null;

  return (
    <HostRouteBootstrapBoundary>
      <WorkspaceComposerEditingSessionsProvider
        workspaceKey={NEW_WORKSPACE_SESSIONS_KEY}
        tabIds={sessionTabIds}
      >
        <ComposerEditingScope tabId={draftKey} targetKey={draftKey}>
          <NewWorkspaceScreen
            key={screenKey}
            serverId={serverId}
            sourceDirectory={sourceDirectory}
            displayName={displayName}
            projectId={projectId}
            draftId={draftId}
            startVoice={startVoice}
            voiceProfile={voiceProfile}
          />
        </ComposerEditingScope>
      </WorkspaceComposerEditingSessionsProvider>
    </HostRouteBootstrapBoundary>
  );
}
