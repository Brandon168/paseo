// Agent and workspace creation request schemas, kept apart from messages.ts so code that only
// validates creation requests (plugin before-hooks) does not build the protocol's ~560 other
// schemas. messages.ts re-exports everything it exported before.
import { z } from "zod";
import { MAX_EXPLICIT_AGENT_TITLE_CHARS } from "./agent-title-limits.js";
import { AgentProviderSchema } from "./provider-manifest.js";
import type { JsonValue } from "./agent-types.js";

// WebSocket payloads have already crossed JSON serialization. Keeping this as
// unknown avoids zod-aot's recursive z.json() object-codegen regression.
export const JsonWireValueSchema = z.unknown() as z.ZodType<JsonValue>;

/** Plugin-owned data on an agent or workspace. Paseo stores it and never reads a key. */
export const EntityMetadataSchema = z.record(z.string(), JsonWireValueSchema);

type AgentAttachment = z.infer<typeof AgentAttachmentSchema>;

const McpStdioServerConfigSchema = z.object({
  type: z.literal("stdio"),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  alwaysLoad: z.boolean().optional(),
});

const McpHttpServerConfigSchema = z.object({
  type: z.literal("http"),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  alwaysLoad: z.boolean().optional(),
});

const McpSseServerConfigSchema = z.object({
  type: z.literal("sse"),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  alwaysLoad: z.boolean().optional(),
});

export const McpServerConfigSchema = z.discriminatedUnion("type", [
  McpStdioServerConfigSchema,
  McpHttpServerConfigSchema,
  McpSseServerConfigSchema,
]);

export const ProviderOptionsSchema = z.record(z.string(), z.unknown());

const McpToolRefSchema = z
  .object({
    kind: z.literal("mcp"),
    server: z.string().trim().min(1),
    tool: z.string().trim().min(1),
  })
  .strict();

export const ToolPolicySchema = z
  .object({
    preapproved: z.array(McpToolRefSchema),
  })
  .strict();

export const AgentSessionConfigSchema = z.object({
  provider: AgentProviderSchema,
  cwd: z.string(),
  modeId: z.string().optional(),
  model: z.string().optional(),
  thinkingOptionId: z.string().optional(),
  // COMPAT(featureValues): added in v0.15.0, remove after 2027-05-01. Folded into providerOptions.
  featureValues: z.record(z.string(), z.unknown()).optional(),
  title: z.string().trim().min(1).max(MAX_EXPLICIT_AGENT_TITLE_CHARS).optional().nullable(),
  providerOptions: ProviderOptionsSchema.optional(),
  toolPolicy: ToolPolicySchema.optional(),
  systemPrompt: z.string().optional(),
  mcpServers: z.record(z.string(), McpServerConfigSchema).optional(),
});

// COMPAT(githubAttachmentKinds): legacy wire attachment retained when
// forge-neutral attachments shipped in v0.2.0-beta.1. Stop emitting it after
// 2027-01-17 once supported client and daemon floors are >= v0.2.0.
export const GitHubPrAttachmentSchema = z.object({
  type: z.literal("github_pr"),
  mimeType: z.literal("application/github-pr"),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  body: z.string().nullable().optional(),
  baseRefName: z.string().nullable().optional(),
  headRefName: z.string().nullable().optional(),
});

export const ForgeChangeRequestAttachmentSchema = z.object({
  type: z.literal("forge_change_request"),
  mimeType: z.literal("application/paseo-forge-change-request"),
  forge: z.string().optional().default("github"),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  body: z.string().nullable().optional(),
  projectPath: z.string().optional(),
  baseRefName: z.string().nullable().optional(),
  headRefName: z.string().nullable().optional(),
});

// COMPAT(githubAttachmentKinds): legacy wire attachment retained when
// forge-neutral attachments shipped in v0.2.0-beta.1. Stop emitting it after
// 2027-01-17 once supported client and daemon floors are >= v0.2.0.
export const GitHubIssueAttachmentSchema = z.object({
  type: z.literal("github_issue"),
  mimeType: z.literal("application/github-issue"),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  body: z.string().nullable().optional(),
});

export const ForgeIssueAttachmentSchema = z.object({
  type: z.literal("forge_issue"),
  mimeType: z.literal("application/paseo-forge-issue"),
  forge: z.string().optional().default("github"),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  body: z.string().nullable().optional(),
  projectPath: z.string().optional(),
});

export const ExternalResourceAttachmentMetadataSchema = z.object({
  provider: z.string(),
  providerLabel: z.string(),
  resourceType: z.string(),
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  url: z.string(),
});

export const TextAttachmentSchema = z
  .object({
    type: z.literal("text"),
    mimeType: z.literal("text/plain"),
    contextKind: z.string().optional(),
    title: z.string().nullable().optional(),
    text: z.string(),
    externalResource: ExternalResourceAttachmentMetadataSchema.optional(),
  })
  .transform(({ contextKind, ...attachment }) => ({
    ...attachment,
    ...(contextKind === "chat_history" ? { contextKind } : {}),
  }));

export const ReviewAttachmentContextLineSchema = z.object({
  oldLineNumber: z.number().int().positive().nullable(),
  newLineNumber: z.number().int().positive().nullable(),
  type: z.enum(["add", "remove", "context"]),
  content: z.string(),
});

export const ReviewAttachmentCommentSchema = z.object({
  filePath: z.string(),
  side: z.enum(["old", "new"]),
  lineNumber: z.number().int().positive(),
  body: z.string(),
  context: z.object({
    hunkHeader: z.string(),
    targetLine: ReviewAttachmentContextLineSchema,
    lines: z.array(ReviewAttachmentContextLineSchema),
  }),
});

export const ReviewAttachmentSchema = z.object({
  type: z.literal("review"),
  mimeType: z.literal("application/paseo-review"),
  cwd: z.string(),
  mode: z.enum(["uncommitted", "base", "all"]),
  baseRef: z.string().nullable().optional(),
  comments: z.array(ReviewAttachmentCommentSchema),
});

export const UploadedFileAttachmentSchema = z.object({
  type: z.literal("uploaded_file"),
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  path: z.string(),
});

export const AgentAttachmentSchema = z.discriminatedUnion("type", [
  ForgeChangeRequestAttachmentSchema,
  ForgeIssueAttachmentSchema,
  GitHubPrAttachmentSchema,
  GitHubIssueAttachmentSchema,
  TextAttachmentSchema,
  ReviewAttachmentSchema,
  UploadedFileAttachmentSchema,
]);

function normalizeAgentAttachments(input: unknown): AgentAttachment[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const normalized: AgentAttachment[] = [];
  for (const item of input) {
    const parsed = AgentAttachmentSchema.safeParse(item);
    if (parsed.success) {
      normalized.push(parsed.data);
    }
  }
  return normalized;
}

export const AgentAttachmentsSchema = z.unknown().transform(normalizeAgentAttachments).optional();

export const ChangeRequestCheckoutSourceSchema = z.object({
  kind: z.literal("change_request"),
  forge: z.string().optional(),
  number: z.number().int().positive(),
  projectPath: z.string().optional(),
});

export const ImageAttachmentSchema = z.object({
  data: z.string(), // base64 encoded image
  mimeType: z.string(), // e.g., "image/jpeg", "image/png"
});

export const GitSetupOptionsSchema = z.object({
  baseBranch: z.string().optional(),
  createNewBranch: z.boolean().optional(),
  newBranchName: z.string().optional(),
  createWorktree: z.boolean().optional(),
  worktreeSlug: z.string().optional(),
  refName: z.string().min(1).optional(),
  action: z.enum(["branch-off", "checkout"]).optional(),
  checkoutSource: ChangeRequestCheckoutSourceSchema.optional(),
  // COMPAT(githubPrNumber): legacy GitHub checkout input retained when
  // checkoutSource shipped in v0.2.0-beta.1. Remove after 2027-01-17 once the
  // supported client floor is >= v0.2.0.
  githubPrNumber: z.number().int().positive().optional(),
});

export const CreateAgentWorktreeTargetSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("branch-off"),
    newBranch: z.string().min(1),
    base: z.string().min(1).optional(),
  }),
  z.object({
    mode: z.literal("checkout-branch"),
    branch: z.string().min(1),
  }),
  z.object({
    mode: z.literal("checkout-pr"),
    prNumber: z.number().int().positive(),
  }),
]);

export const CreateAgentRequestMessageSchema = z.object({
  type: z.literal("create_agent_request"),
  // Legacy create_agent_request uses a separate initial-message receipt when keyed.
  idempotencyKey: z.string().min(1).max(512).optional(),
  config: AgentSessionConfigSchema,
  env: z.record(z.string(), z.string()).optional(),
  workspaceId: z.string().optional(),
  // Optional caller context lets managed CLI invocations use the same daemon-owned
  // workspace and parentage policy as agent-scoped MCP creation.
  callerAgentId: z.string().optional(),
  worktreeName: z.string().optional(),
  initialPrompt: z.string().optional(),
  clientMessageId: z.string().optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  images: z.array(ImageAttachmentSchema).optional(),
  attachments: AgentAttachmentsSchema,
  git: GitSetupOptionsSchema.optional(),
  worktree: CreateAgentWorktreeTargetSchema.optional(),
  autoArchive: z.boolean().optional(),
  // An ephemeral helper: the daemon never persists, lists, flags or announces
  // it, and plugin lifecycle hooks skip it. Lives on the request rather than
  // in the config schema, which is reused for updates. Retained for wire parsing;
  // public internal creation is no longer supported.
  internal: z.boolean().optional(),
  // The created agent is a background agent. A workspace this request creates inherits it.
  // Omitted on agent-scoped creation, the caller agent's own value applies.
  background: z.boolean().optional(),
  labels: z.record(z.string(), z.string()).default({}),
  metadata: EntityMetadataSchema.optional(),
  requestId: z.string(),
});

/** Resource IDs are optional on creation; supplied IDs retain their identity on replay. */
export const AgentCreateRequestSchema = CreateAgentRequestMessageSchema.extend({
  type: z.literal("agent.create.request"),
  agentId: z.uuid().optional(),
  attachments: z.array(AgentAttachmentSchema).optional(),
  subscribe: z.boolean().optional(),
});

export const WorkspaceInitialAgentSchema = AgentCreateRequestSchema.omit({
  type: true,
  requestId: true,
  idempotencyKey: true,
  subscribe: true,
  workspaceId: true,
  worktree: true,
  worktreeName: true,
  git: true,
});

export const FirstAgentContextSchema = z.object({
  prompt: z.string().optional(),
  attachments: AgentAttachmentsSchema,
});

// Create a new workspace record. Unlike open_project, this never deduplicates by
// directory: it always produces a fresh workspace. The source discriminates
// between an existing local directory and a newly created paseo worktree.
export const WorkspaceCreateRequestSchema = z.object({
  type: z.literal("workspace.create.request"),
  workspaceId: z
    .string()
    .regex(/^wks_[a-f0-9]{16}$/)
    .optional(),
  agent: WorkspaceInitialAgentSchema.optional(),
  subscribe: z.boolean().optional(),
  requestId: z.string(),
  idempotencyKey: z.string().min(1).max(512).optional(),
  // Optional user-set title applied to the created workspace.
  title: z.string().optional(),
  metadata: EntityMetadataSchema.optional(),
  // Optional prompt context for workspace-level name/branch generation.
  firstAgentContext: FirstAgentContextSchema.optional(),
  // Retained for wire parsing; public internal creation is no longer supported.
  internal: z.boolean().optional(),
  background: z.boolean().optional(),
  callerAgentId: z.string().optional(),
  source: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("directory"),
      // Path of the existing checkout/directory to back the workspace.
      path: z.string(),
      projectId: z.string().optional(),
    }),
    z.object({
      kind: z.literal("worktree"),
      // The project whose repo the worktree is cut from.
      cwd: z.string().optional(),
      projectId: z.string().optional(),
      action: z.enum(["branch-off", "checkout"]).optional(),
      // Target branch for checkout, or base ref for branch-off.
      refName: z.string().min(1).optional(),
      baseBranch: z.string().optional(),
      // New branch name for branch-off. The worktree path may use a different slug.
      branchName: z.string().min(1).optional(),
      checkoutSource: ChangeRequestCheckoutSourceSchema.optional(),
      // COMPAT(githubPrNumber): legacy GitHub checkout input retained when
      // checkoutSource shipped in v0.2.0-beta.1. Remove after 2027-01-17 once
      // the supported client floor is >= v0.2.0.
      githubPrNumber: z.number().int().positive().optional(),
      worktreeSlug: z.string().optional(),
    }),
  ]),
});
