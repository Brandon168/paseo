// Terminal screen-state schemas. They live apart from messages.ts so binary terminal frames can
// validate snapshots without loading every protocol schema; messages.ts re-exports them.
import { z } from "zod";

export const TerminalCellSchema = z.object({
  char: z.string(),
  fg: z.number().optional(),
  bg: z.number().optional(),
  fgMode: z.number().optional(),
  bgMode: z.number().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  dim: z.boolean().optional(),
  inverse: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
});

export const TerminalCursorStyleSchema = z.enum(["block", "underline", "bar"]);

export const TerminalCursorSchema = z.object({
  row: z.number(),
  col: z.number(),
  hidden: z.boolean().optional(),
  style: TerminalCursorStyleSchema.optional(),
  blink: z.boolean().optional(),
});

export const TerminalStateSchema = z.object({
  rows: z.number(),
  cols: z.number(),
  grid: z.array(z.array(TerminalCellSchema)),
  scrollback: z.array(z.array(TerminalCellSchema)),
  cursor: TerminalCursorSchema,
  title: z.string().optional(),
  // Per-row soft-wrap flags aligned 1:1 with `grid` / `scrollback`. `true` means
  // the row continued onto the next row (xterm's GRID_LINE_WRAPPED equivalent),
  // so the client can re-wrap the logical line on resize instead of freezing it
  // at the snapshot width. Optional: only sent to clients that advertise the
  // `terminalReflowableSnapshot` capability, so old daemons/clients are unaffected.
  gridWrapped: z.array(z.boolean()).optional(),
  scrollbackWrapped: z.array(z.boolean()).optional(),
});
