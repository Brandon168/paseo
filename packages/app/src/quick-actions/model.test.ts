import { describe, expect, it } from "vitest";
import { createQuickActionQueue, resolveQuickAction, type QuickAction } from "./model";

function setup() {
  const opened: QuickAction[] = [];
  const queue = createQuickActionQueue((action) => {
    opened.push(action);
  });
  return { opened, queue };
}

describe("resolveQuickAction", () => {
  it.each([
    [undefined, null],
    [null, null],
    ["", null],
    ["unknown", null],
    ["new-workspace", "new-workspace"],
  ])("maps %j to %j", (id, expected) => {
    expect(resolveQuickAction(id)).toBe(expected);
  });
});

describe("createQuickActionQueue", () => {
  it("opens an action immediately when the app is ready", () => {
    const { opened, queue } = setup();
    queue.setReady(true);
    queue.receive("new-workspace");
    expect(opened).toEqual(["new-workspace"]);
  });

  it("holds an action until the app becomes ready", () => {
    const { opened, queue } = setup();
    queue.receive("new-workspace");
    expect(opened).toEqual([]);
    queue.setReady(true);
    expect(opened).toEqual(["new-workspace"]);
  });

  it("opens a held action once, even across repeated readiness updates", () => {
    const { opened, queue } = setup();
    queue.receive("new-workspace");
    queue.setReady(true);
    queue.setReady(false);
    queue.setReady(true);
    expect(opened).toEqual(["new-workspace"]);
  });

  it("ignores unknown ids and never opens them", () => {
    const { opened, queue } = setup();
    queue.setReady(true);
    queue.receive("unknown");
    queue.receive(null);
    expect(opened).toEqual([]);
  });

  it("drops a held action when discarded, so it does not open later", () => {
    const { opened, queue } = setup();
    queue.receive("new-workspace");
    queue.discard();
    queue.setReady(true);
    expect(opened).toEqual([]);
  });

  it("does not open an unknown id that arrives after a valid one was held", () => {
    const { opened, queue } = setup();
    queue.receive("new-workspace");
    queue.receive("unknown");
    queue.setReady(true);
    expect(opened).toEqual(["new-workspace"]);
  });
});
