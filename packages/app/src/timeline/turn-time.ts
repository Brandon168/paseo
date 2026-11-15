import type { AssistantMessageModel } from "@getpaseo/protocol/agent-types";
import type { StreamItem } from "@/types/stream";
import { startsNewTurn, isTurnTrigger } from "@/agent-stream/turn-membership";

export interface TurnTiming {
  completedAt: Date;
  durationMs: number | null;
  /** Model of the turn's last assistant message, when the daemon stamped one. */
  model?: AssistantMessageModel;
}

export interface StreamTurnTiming {
  byItemId: Map<string, TurnTiming>;
  runningStartedAt: Date | null;
}

interface OpenTurn {
  userAt: Date | null;
  lastItemAt: Date | null;
  assistantIds: readonly string[];
  model: AssistantMessageModel | null;
  previousItem: StreamItem | null;
}

interface HeadTurnTiming {
  additions: Map<string, TurnTiming>;
  byItemId: Map<string, TurnTiming>;
}

interface TailTurnTiming {
  completed: Map<string, TurnTiming>;
  openTurn: OpenTurn;
  lastHead: HeadTurnTiming | null;
}

const EMPTY_OPEN_TURN: OpenTurn = {
  userAt: null,
  lastItemAt: null,
  assistantIds: [],
  model: null,
  previousItem: null,
};

function closeTurn(turn: OpenTurn, into: Map<string, TurnTiming>): void {
  if (!turn.lastItemAt) {
    return;
  }
  const timing: TurnTiming = {
    completedAt: turn.lastItemAt,
    durationMs: turn.userAt ? Math.max(0, turn.lastItemAt.getTime() - turn.userAt.getTime()) : null,
    ...(turn.model ? { model: turn.model } : {}),
  };
  let footerIds = turn.assistantIds;
  if (footerIds.length === 0 && turn.previousItem?.kind === "tool_call") {
    footerIds = [turn.previousItem.id];
  }
  for (const id of footerIds) {
    into.set(id, timing);
  }
}

function walkTurns(
  items: readonly StreamItem[],
  from: OpenTurn,
  into: Map<string, TurnTiming>,
): OpenTurn {
  let userAt = from.userAt;
  let lastItemAt = from.lastItemAt;
  let assistantIds = [...from.assistantIds];
  let model = from.model;
  let previousItem = from.previousItem;
  for (const item of items) {
    if (startsNewTurn(item, previousItem)) {
      closeTurn({ userAt, lastItemAt, assistantIds, model, previousItem }, into);
      userAt = isTurnTrigger(item) ? item.timestamp : null;
      lastItemAt = null;
      assistantIds = [];
      model = null;
    }
    lastItemAt = item.timestamp;
    if (item.kind === "assistant_message") {
      assistantIds.push(item.id);
      // The last stamped message names the model that finished the turn.
      model = item.model ?? model;
    }
    previousItem = item;
  }
  return { userAt, lastItemAt, assistantIds, model, previousItem };
}

function isSameModel(
  a: AssistantMessageModel | undefined,
  b: AssistantMessageModel | undefined,
): boolean {
  if (a === b) {
    return true;
  }
  return (
    a !== undefined &&
    b !== undefined &&
    a.provider === b.provider &&
    a.modelId === b.modelId &&
    a.thinkingOptionId === b.thinkingOptionId
  );
}

function areTimingsEqual(a: Map<string, TurnTiming>, b: Map<string, TurnTiming>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [id, timing] of a) {
    const other = b.get(id);
    if (
      !other ||
      other.completedAt.getTime() !== timing.completedAt.getTime() ||
      other.durationMs !== timing.durationMs ||
      !isSameModel(other.model, timing.model)
    ) {
      return false;
    }
  }
  return true;
}

// The tail walk is cached by array identity so a streamed delta, which only replaces the
// head, walks the head from the carried open turn. The returned Map keeps its identity
// while the head adds no completed turn, so memos keyed on it do not miss per tick.
const tailTurnTimingCache = new WeakMap<StreamItem[], TailTurnTiming>();

function getTailTurnTiming(tail: StreamItem[]): TailTurnTiming {
  const cached = tailTurnTimingCache.get(tail);
  if (cached) {
    return cached;
  }
  const completed = new Map<string, TurnTiming>();
  const openTurn = walkTurns(tail, EMPTY_OPEN_TURN, completed);
  const timing: TailTurnTiming = { completed, openTurn, lastHead: null };
  tailTurnTimingCache.set(tail, timing);
  return timing;
}

function resolveByItemId(
  tail: TailTurnTiming,
  additions: Map<string, TurnTiming>,
): Map<string, TurnTiming> {
  if (additions.size === 0) {
    return tail.completed;
  }
  if (tail.lastHead && areTimingsEqual(tail.lastHead.additions, additions)) {
    return tail.lastHead.byItemId;
  }
  const byItemId = new Map(tail.completed);
  for (const [id, timing] of additions) {
    byItemId.set(id, timing);
  }
  tail.lastHead = { additions, byItemId };
  return byItemId;
}

export function deriveStreamTurnTiming(params: {
  isTurnActive: boolean;
  activeTurnStartedAt: Date | null;
  tail: StreamItem[];
  head: StreamItem[];
}): StreamTurnTiming {
  const tail = getTailTurnTiming(params.tail);
  const additions = new Map<string, TurnTiming>();
  const openTurn = walkTurns(params.head, tail.openTurn, additions);
  if (!params.isTurnActive) {
    closeTurn(openTurn, additions);
  }
  return {
    byItemId: resolveByItemId(tail, additions),
    runningStartedAt: params.isTurnActive ? params.activeTurnStartedAt : null,
  };
}
