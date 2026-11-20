import { describe, expect, it } from "vitest";
import type { AgentProfile } from "@getpaseo/protocol/messages";
import type { HostProjectListItem } from "@/projects/host-project-model";
import {
  DEFAULT_VOICE_CHAT_SETTINGS,
  buildVoiceChatProjectChoices,
  resolveVoiceChatParams,
  resolveVoiceChatProfile,
  type VoiceChatSettings,
} from "./model";

function profile(id: string, name: string): AgentProfile {
  return { id, name, provider: "opencode" };
}

const configured: VoiceChatSettings = {
  project: {
    serverId: "srv",
    projectId: "proj-a",
    sourceDirectory: "/work/a",
    displayName: "A",
  },
  profileId: "p-fast",
};

describe("resolveVoiceChatParams", () => {
  it("leaves the route alone when nothing is configured", () => {
    expect(resolveVoiceChatParams({ serverId: "srv" }, DEFAULT_VOICE_CHAT_SETTINGS)).toEqual({
      serverId: "srv",
      sourceDirectory: undefined,
      displayName: undefined,
      projectId: undefined,
      profile: undefined,
    });
  });

  it("fills in the project and profile from the device setting", () => {
    expect(resolveVoiceChatParams({ serverId: "" }, configured)).toEqual({
      serverId: "srv",
      sourceDirectory: "/work/a",
      displayName: "A",
      projectId: "proj-a",
      profile: "p-fast",
    });
  });

  it("keeps a project the route names, and still applies the setting's profile", () => {
    const resolved = resolveVoiceChatParams(
      { serverId: "other", projectId: "proj-b", sourceDirectory: "/work/b", displayName: "B" },
      configured,
    );
    expect(resolved).toMatchObject({
      serverId: "other",
      projectId: "proj-b",
      sourceDirectory: "/work/b",
      displayName: "B",
      profile: "p-fast",
    });
  });

  it("lets the route name its own profile", () => {
    expect(resolveVoiceChatParams({ serverId: "", profile: "Deep" }, configured).profile).toBe(
      "Deep",
    );
  });
});

describe("resolveVoiceChatProfile", () => {
  const profiles = [profile("p1", "Opus"), profile("p-fast", "Quick"), profile("p3", "voice")];

  it("finds a profile by id", () => {
    expect(resolveVoiceChatProfile(profiles, "p-fast")?.name).toBe("Quick");
  });

  it("finds a profile by name, ignoring case", () => {
    expect(resolveVoiceChatProfile(profiles, "OPUS")?.id).toBe("p1");
  });

  it("falls back to the profile named Voice when nothing is requested", () => {
    expect(resolveVoiceChatProfile(profiles, undefined)?.id).toBe("p3");
  });

  it("falls back to the profile named Voice when the requested one no longer exists", () => {
    expect(resolveVoiceChatProfile(profiles, "gone")?.id).toBe("p3");
  });

  it("returns null when the host has no Voice profile and none was requested", () => {
    expect(resolveVoiceChatProfile(profiles.slice(0, 2), undefined)).toBeNull();
  });
});

describe("buildVoiceChatProjectChoices", () => {
  const project = (
    name: string,
    placements: { serverId: string; projectId: string; dir: string }[],
  ) =>
    ({
      viewKey: name,
      projectKey: null,
      projectName: name,
      projectKind: "git",
      iconWorkingDir: placements[0]?.dir ?? "",
      hosts: placements.map((placement) => ({
        serverId: placement.serverId,
        projectId: placement.projectId,
        iconWorkingDir: placement.dir,
        worktreeSupport: "supported",
      })),
      workspaceKeys: [],
    }) as unknown as HostProjectListItem;

  it("lists a project once per host that has it, naming the host only when there are several", () => {
    const projects = [
      project("A", [
        { serverId: "s1", projectId: "a1", dir: "/a" },
        { serverId: "s2", projectId: "a2", dir: "/a2" },
      ]),
    ];
    const choices = buildVoiceChatProjectChoices(
      projects,
      new Map([
        ["s1", "Home"],
        ["s2", "Work"],
      ]),
    );
    expect(choices.map((choice) => choice.label)).toEqual(["A · Home", "A · Work"]);
    expect(choices[1]?.project).toEqual({
      serverId: "s2",
      projectId: "a2",
      sourceDirectory: "/a2",
      displayName: "A",
    });

    const single = buildVoiceChatProjectChoices(projects, new Map([["s1", "Home"]]));
    expect(single.map((choice) => choice.label)).toEqual(["A"]);
  });

  it("skips hosts that are not registered or have no directory", () => {
    const projects = [
      project("A", [{ serverId: "gone", projectId: "a", dir: "/a" }]),
      project("B", [{ serverId: "s1", projectId: "b", dir: " " }]),
    ];
    expect(buildVoiceChatProjectChoices(projects, new Map([["s1", "Home"]]))).toEqual([]);
  });
});
