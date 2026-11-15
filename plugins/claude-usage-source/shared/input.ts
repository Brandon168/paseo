import { z } from "zod";

export const routeSchema = z.discriminatedUnion("store", [
  z.object({ store: z.enum(["claude", "pi"]), path: z.string().min(1) }).strict(),
  // OpenCode keeps one login per provider route: `integration` is the route's provider id.
  z
    .object({
      store: z.literal("opencode"),
      path: z.string().min(1),
      integration: z.string().min(1),
    })
    .strict(),
  z
    .object({
      store: z.literal("omp"),
      path: z.string().min(1),
      credentialId: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      store: z.literal("keychain"),
      service: z.string().optional(),
      account: z.string().optional(),
    })
    .strict(),
]);
export const inputSchema = z.object({ route: routeSchema }).strict();
export type UsageInput = z.infer<typeof inputSchema>;
