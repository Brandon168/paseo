import { describe, expect, it } from "vitest";
import { PageOutbox } from "./outbox";

function setup() {
  const delivered: string[] = [];
  const errors: string[] = [];
  const outbox = new PageOutbox(
    (text) => delivered.push(text),
    (message) => errors.push(message),
  );
  return { outbox, delivered, errors };
}

describe("PageOutbox", () => {
  it("holds messages until the page loaded, then delivers them in order", () => {
    const { outbox, delivered } = setup();
    outbox.post({ n: 1 });
    outbox.post({ n: 2 });
    expect(delivered).toEqual([]);
    outbox.loaded();
    expect(delivered).toEqual(['{"n":1}', '{"n":2}']);
    outbox.post({ n: 3 });
    expect(delivered).toHaveLength(3);
  });

  it("holds messages again after reset", () => {
    const { outbox, delivered } = setup();
    outbox.loaded();
    outbox.reset();
    outbox.post("a");
    expect(delivered).toEqual([]);
    outbox.loaded();
    expect(delivered).toEqual(['"a"']);
  });

  it("reports what cannot be sent and never delivers it", () => {
    const { outbox, delivered, errors } = setup();
    outbox.loaded();
    outbox.post(undefined);
    outbox.post("x".repeat(5 * 1024 * 1024));
    expect(delivered).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  it("caps the queue", () => {
    const { outbox, errors } = setup();
    for (let index = 0; index < 60; index += 1) outbox.post(index);
    expect(errors).toHaveLength(10);
  });
});
