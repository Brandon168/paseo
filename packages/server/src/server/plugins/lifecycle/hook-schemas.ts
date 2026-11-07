// Payload schemas for "before" hooks. Two derive from the protocol's message schemas, so importing
// this module loads @getpaseo/protocol/messages (~60-100 MB per process). index.ts loads it on
// first use, which keeps it out of plugin processes whose hooks never run.
import { validateBranchSlug } from "@getpaseo/protocol/branch-slug";
import {
  CreateAgentRequestMessageSchema,
  WorkspaceCreateRequestSchema,
} from "@getpaseo/protocol/messages";
import { z } from "zod";
import type { JsonValue } from "@getpaseo/protocol/agent-types";
import type { AgentToolDefinition } from "@getpaseo/plugin/server";
import { agentToolMetadataSchema } from "../agent-tools.js";

const worktreeRequestFields = {
  repoRoot: z.string(),
  sourceCheckout: z.string(),
  branch: z.string().min(1),
  slug: z.string().refine((value) => validateBranchSlug(value).valid, "Invalid worktree slug"),
  path: z.string().min(1),
};
const changeRequestFields = {
  headRef: z.string().min(1),
  headRepositoryOwner: z.string().optional(),
  checkoutRefs: z
    .array(z.object({ remoteName: z.string().optional(), remoteRef: z.string() }))
    .optional(),
  pushRemoteUrl: z.string().optional(),
  trackOriginHead: z.boolean().optional(),
};
const worktreeRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({ ...worktreeRequestFields, kind: z.literal("branch-off"), baseRef: z.string().min(1) })
    .strict(),
  z
    .object({
      ...worktreeRequestFields,
      kind: z.literal("checkout-branch"),
    })
    .strict(),
  z
    .object({
      ...worktreeRequestFields,
      ...changeRequestFields,
      kind: z.literal("checkout-change-request"),
      baseRef: z.string().min(1),
      forge: z.string(),
      changeRequestNumber: z.number().int().positive(),
      headRepository: z.string().optional(),
    })
    .strict(),
  z
    .object({
      ...worktreeRequestFields,
      ...changeRequestFields,
      kind: z.literal("checkout-github-pr"),
      baseRef: z.string().min(1),
      githubPrNumber: z.number().int().positive(),
    })
    .strict(),
]);

export const beforeSchemas = {
  "worktree.create.before": worktreeRequestSchema,
  "agent.create.before": CreateAgentRequestMessageSchema.pick({
    config: true,
    env: true,
    metadata: true,
  }).strict(),
  "agent.open.before": z
    .object({
      agentId: z.string(),
      workspaceId: z.string().nullable(),
      provider: z.string(),
      cwd: z.string(),
      reason: z.enum(["create", "resume", "refresh", "import"]),
      purpose: z.enum(["interactive", "history"]),
      title: z.string().nullable(),
      labels: z.record(z.string(), z.string()),
      // Optional so a plugin that returns its own object keeps working; omitted means unchanged.
      metadata: z.record(z.string(), z.custom<JsonValue>()).optional(),
      tools: z.array(agentToolMetadataSchema),
      env: z.record(z.string(), z.string()),
      mcpServers: CreateAgentRequestMessageSchema.shape.config.shape.mcpServers.unwrap(),
    })
    .strict(),
  "workspace.create.before": WorkspaceCreateRequestSchema.omit({
    type: true,
    requestId: true,
  }).strict(),
};

export const sessionOpenLocalResultSchema = beforeSchemas["agent.open.before"].extend({
  tools: z.array(
    z.custom<AgentToolDefinition>(
      (tool) =>
        typeof tool === "object" &&
        tool !== null &&
        "input" in tool &&
        "execute" in tool &&
        typeof tool.execute === "function",
    ),
  ),
});
