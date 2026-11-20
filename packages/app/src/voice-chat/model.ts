import type { AgentProfile } from "@getpaseo/protocol/messages";
import type { HostProjectListItem } from "@/projects/host-project-model";

/** The profile a voice chat uses when the device setting names none and the host has this one. */
export const VOICE_CHAT_PROFILE_NAME = "Voice";

/**
 * Where "Voice chat" starts. The project is stored the way the New workspace route carries it, so
 * the route can open it without looking the project up. A null field means "what New workspace
 * would pick" for the project, and "the host's profile named Voice, else the default" for the
 * profile.
 */
export interface VoiceChatSettings {
  project: {
    serverId: string;
    projectId: string;
    sourceDirectory: string;
    displayName: string;
  } | null;
  profileId: string | null;
}

export const DEFAULT_VOICE_CHAT_SETTINGS: VoiceChatSettings = {
  project: null,
  profileId: null,
};

export interface VoiceChatRouteParams {
  serverId: string;
  sourceDirectory?: string;
  displayName?: string;
  projectId?: string;
  /** An agent profile id, or a profile name. */
  profile?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The route's own project wins. Without one, the device setting fills in the project, and the
 * profile from the setting applies unless the route names another.
 */
export function resolveVoiceChatParams(
  route: VoiceChatRouteParams,
  settings: VoiceChatSettings,
): VoiceChatRouteParams {
  const routeHasProject = nonEmpty(route.projectId) !== undefined;
  const project = routeHasProject ? null : settings.project;
  return {
    serverId: project ? project.serverId : route.serverId,
    sourceDirectory: project ? project.sourceDirectory : route.sourceDirectory,
    displayName: project ? project.displayName : route.displayName,
    projectId: project ? project.projectId : route.projectId,
    profile: nonEmpty(route.profile) ?? settings.profileId ?? undefined,
  };
}

/**
 * The profile a voice chat applies: the one asked for by id or name, else the host's profile named
 * Voice. Null means "leave the draft's normal default alone".
 */
export function resolveVoiceChatProfile(
  profiles: readonly AgentProfile[],
  requested: string | undefined,
): AgentProfile | null {
  const wanted = nonEmpty(requested);
  if (wanted) {
    const byId = profiles.find((profile) => profile.id === wanted);
    if (byId) return byId;
    const byName = profiles.find((profile) => profile.name.toLowerCase() === wanted.toLowerCase());
    if (byName) return byName;
  }
  return (
    profiles.find(
      (profile) => profile.name.trim().toLowerCase() === VOICE_CHAT_PROFILE_NAME.toLowerCase(),
    ) ?? null
  );
}

export type VoiceChatProject = NonNullable<VoiceChatSettings["project"]>;

export interface VoiceChatProjectChoice {
  key: string;
  label: string;
  project: VoiceChatProject;
}

/** One choice per project on each host that has it; the host's name is added when there are several. */
export function buildVoiceChatProjectChoices(
  projects: readonly HostProjectListItem[],
  hostLabels: ReadonlyMap<string, string>,
): VoiceChatProjectChoice[] {
  const several = hostLabels.size > 1;
  return projects.flatMap((item) =>
    item.hosts.flatMap((host) => {
      if (!hostLabels.has(host.serverId) || host.iconWorkingDir.trim().length === 0) return [];
      const hostLabel = hostLabels.get(host.serverId);
      return [
        {
          key: voiceChatProjectKey(host.serverId, host.projectId),
          label: several && hostLabel ? `${item.projectName} · ${hostLabel}` : item.projectName,
          project: {
            serverId: host.serverId,
            projectId: host.projectId,
            sourceDirectory: host.iconWorkingDir,
            displayName: item.projectName,
          },
        },
      ];
    }),
  );
}

export function voiceChatProjectKey(serverId: string, projectId: string): string {
  return JSON.stringify([serverId, projectId]);
}
