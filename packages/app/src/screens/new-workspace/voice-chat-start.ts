import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { materializeAgentProfile, useAgentProfiles } from "@/agent-profiles";
import type { UseAgentFormStateResult } from "@/hooks/use-agent-form-state";
import type { FormPreferences } from "@/hooks/use-form-preferences";
import { resolveVoiceChatProfile } from "@/voice-chat/model";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";

interface UseVoiceChatStartInput {
  startVoice: boolean | undefined;
  /** An agent profile id or name; the host's "Voice" profile when absent. */
  voiceProfile: string | undefined;
  serverId: string;
  composerState: UseAgentFormStateResult | null | undefined;
  formPreferences: FormPreferences;
  formPreferencesLoading: boolean;
  /** The screen can create an agent when a project is picked, the host is connected and nothing is in flight. */
  hasProject: boolean;
  clientReady: boolean;
  isPending: boolean;
  isTerminalLaunch: boolean;
  setErrorMessage: (message: string) => void;
}

/**
 * A voice chat applies its profile to the draft once the host's providers are known, then tells
 * the Composer to start voice mode once the project and model are settled. The profile's model is
 * borrowed: the user's remembered New workspace defaults come back after the agent exists.
 */
export function useVoiceChatStart(input: UseVoiceChatStartInput) {
  const {
    startVoice,
    voiceProfile,
    serverId,
    composerState,
    formPreferences,
    formPreferencesLoading,
    hasProject,
    clientReady,
    isPending,
    isTerminalLaunch,
    setErrorMessage,
  } = input;
  const { t } = useTranslation();
  const toast = useToast();
  const { profiles, isSupported } = useAgentProfiles(serverId);
  const profileRecord = useMemo(
    () => (profiles ? resolveVoiceChatProfile(profiles, voiceProfile) : null),
    [profiles, voiceProfile],
  );
  const profilesSettled = !isSupported || profiles !== null;
  const [state, setState] = useState<"pending" | "applied" | "failed">("pending");
  const preferencesToRestoreRef = useRef<FormPreferences | null>(null);

  const providersReady =
    composerState != null &&
    !composerState.isAllModelsLoading &&
    composerState.providerDefinitions.length > 0;

  useEffect(() => {
    if (startVoice !== true || state !== "pending") return;
    if (!profilesSettled || !providersReady || !composerState || formPreferencesLoading) return;
    if (!profileRecord) {
      // No profile to apply: the draft's normal default model stays.
      setState("applied");
      return;
    }
    const materialized = materializeAgentProfile(profileRecord);
    if (!composerState.providerDefinitionMap.has(materialized.provider as AgentProvider)) {
      setState("failed");
      const message = t("newWorkspace.errors.voiceProfileUnavailable", {
        name: profileRecord.name,
      });
      setErrorMessage(message);
      toast.error(message);
      return;
    }
    preferencesToRestoreRef.current = formPreferences;
    composerState.applyProfileFromUser(materialized);
    setState("applied");
  }, [
    composerState,
    formPreferences,
    formPreferencesLoading,
    profileRecord,
    profilesSettled,
    providersReady,
    setErrorMessage,
    startVoice,
    state,
    t,
    toast,
  ]);

  const takeVoicePreferencesToRestore = useCallback(() => {
    const remembered = preferencesToRestoreRef.current;
    preferencesToRestoreRef.current = null;
    return remembered;
  }, []);

  const canCreate = hasProject && clientReady && !isPending && !isTerminalLaunch;
  const autoStartVoice =
    startVoice === true &&
    state === "applied" &&
    canCreate &&
    composerState != null &&
    composerState.selectedModel.length > 0 &&
    !composerState.isModelLoading;

  return { autoStartVoice, takeVoicePreferencesToRestore };
}
